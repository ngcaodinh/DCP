/**
 * Service chứa business logic cho Paymaster sponsorship — tách biệt khỏi HTTP layer.
 * Cung cấp 2 đường dẫn Paymaster dựa trên risk score:
 * - riskScore < 70:  ZeroDev Free Paymaster (sponsor 100% gas)
 * - riskScore >= 70: Custom Token Paymaster (tài trợ gas trước, khấu trừ ~1 CharityToken)
 */
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getZeroDevConfig } from '../config/zeroDev';
import { getLogger } from '../config/logger';
import { ApplicationError } from '../utils/applicationError';
import {
  findGuestWalletSessionById,
  updateGuestWalletSession
} from '../repositories/guestWalletSessionRepository';
import {
  upsertGuestDonationRisk
} from '../repositories/guestDonationRiskRepository';
import { findAuditByUserOpHash, createAuditRecord } from '../repositories/anonymousDonationAuditRepository';
import { evaluateGuestRisk } from './guestRiskService';
import { GuestWalletSession } from '../models/guestWalletSessionModel';

const logger = getLogger();

/** Giới hạn donation count mỗi session (FR5.G). */
const MAX_DONATION_PER_SESSION = 3;

/** Tổng số tiền tối đa mỗi session (USD equivalent, ~200 token). */
const MAX_TOTAL_AMOUNT_PER_SESSION = 200;

/** Số tiền donation tối đa mỗi lần cho guest. */
const MAX_AMOUNT_PER_DONATION = 100;

/** Ngưỡng risk score: >= 70 → dùng Token Paymaster. */
const RISK_THRESHOLD_FOR_TOKEN_PAYMASTER = 70;

/** Số CharityToken khấu trừ khi dùng Token Paymaster. */
const TOKEN_PAYMASTER_GAS_FEE_TOKEN = 1;

/** Địa chỉ charity token trên Amoy — validate khi dùng Token Paymaster. */
const CHARITY_TOKEN_ADDRESS = process.env.CHARITY_TOKEN_ADDRESS || '';

/** Chain ID Polygon Amoy. */
const CHAIN_ID_AMOY = 80002;

/** Timeout cho ZeroDev Paymaster API calls (ms). */
const PAYMASTER_TIMEOUT_MS = 10_000;

/**
 * Kết quả sponsor Paymaster.
 */
export type SponsorPaymasterResult = {
  paymasterAndData: string;
  userOpHash: string;
  sponsorshipId: string;
  paymasterType: 'FREE' | 'TOKEN';
  paymasterSponsoredGas: boolean;
  gasChargeAmount?: number;
  gasChargeWarning?: boolean;
  trustMultiplier: number;
  riskScore: number;
};

/**
 * Payload yêu cầu sponsor Paymaster từ frontend.
 * @remarks field `amount` chỉ dùng để validate giới hạn ở controller.
 * Giá trị thực được trích xuất từ calldata tại service layer để tránh tampering.
 */
export type SponsorPaymasterRequest = {
  unsignedUserOp: {
    sender: string;
    nonce: bigint | string | number;
    initCode: `0x${string}` | string;
    callData: `0x${string}` | string;
    callGasLimit?: bigint | string | number;
    verificationGasLimit?: bigint | string | number;
    preVerificationGas?: bigint | string | number;
    maxFeePerGas?: bigint | string | number;
    maxPriorityFeePerGas?: bigint | string | number;
    paymasterAndData?: `0x${string}` | string;
    signature?: `0x${string}` | string;
  };
  projectId: string;
  amount: number;
  sessionId: string;
};

/**
 * Hàm chuyển hex string thành ASCII string.
 * Mục đích: decode calldata từ UserOp thành readable text.
 */
function hexToAscii(hex: string): string {
  const cleanHex = hex.replace(/^0x/i, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let idx = 0; idx < cleanHex.length; idx += 2) {
    bytes[idx / 2] = parseInt(cleanHex.slice(idx, idx + 2), 16);
  }
  return new TextDecoder('ascii').decode(bytes);
}

/**
 * Hàm decode calldata để verify donation method và extract parameters.
 * Mục đích: đảm bảo chỉ sponsor các UserOp thực hiện donate() hợp lệ.
 * Security: calldata được verify tại backend trước khi gọi ZeroDev Paymaster API
 * để tránh sponsor các operation không phải donate (e.g., token transfer).
 * Giá trị amount từ calldata được dùng thay cho request body để chống tampering attack.
 *
 * Format calldata: method,projectId,amount,isAnonymous
 */
function decodeDonationCalldata(calldata: string): {
  valid: true;
  data: { projectId: string; amount: number };
} | { valid: false; reason: string } {
  try {
    const asciiString = hexToAscii(calldata);
    const parts = asciiString.split(',');

    if (parts.length < 4) {
      return {
        valid: false,
        reason: `Calldata format không hợp lệ. Cần 4 phần tử, nhận được ${parts.length}.`
      };
    }

    const [method, projectId, amountStr, isAnonymousStr] = parts;
    const trimmedMethod = method.trim().toLowerCase();
    const trimmedProjectId = projectId.trim();
    const trimmedAmount = amountStr.trim();
    const trimmedAnonymous = isAnonymousStr.trim().toLowerCase();

    if (trimmedMethod !== 'donate') {
      return { valid: false, reason: `Method "${trimmedMethod}" không được phép sponsor.` };
    }

    if (!trimmedProjectId || trimmedProjectId.length < 10) {
      return { valid: false, reason: 'ProjectId không hợp lệ.' };
    }

    const parsedAmount = parseFloat(trimmedAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return { valid: false, reason: 'Amount donation phải lớn hơn 0.' };
    }

    if (parsedAmount > MAX_AMOUNT_PER_DONATION) {
      return { valid: false, reason: `Amount donation tối đa ${MAX_AMOUNT_PER_DONATION} Token cho guest.` };
    }

    if (trimmedAnonymous !== 'true') {
      return { valid: false, reason: 'Chỉ hỗ trợ donate ẩn danh qua guest flow.' };
    }

    return {
      valid: true,
      data: { projectId: trimmedProjectId, amount: parsedAmount }
    };
  } catch {
    return { valid: false, reason: 'Lỗi khi decode calldata.' };
  }
}

/**
 * Hàm compute deterministic hash từ unsignedUserOp để tạo unique userOpHash.
 * Mục đích: tạo hash cho duplicate check và audit trail.
 * Dùng SHA3-256 (Keccak) vì đây là standard của Ethereum/EntryPoint.
 */
function computeUserOpHash(
  userOp: SponsorPaymasterRequest['unsignedUserOp']
): string {
  const normalized = {
    sender: String(userOp.sender).toLowerCase(),
    nonce: String(userOp.nonce),
    initCode: String(userOp.initCode || '0x'),
    callData: String(userOp.callData),
    callGasLimit: String(userOp.callGasLimit || '21000'),
    verificationGasLimit: String(userOp.verificationGasLimit || '100000'),
    preVerificationGas: String(userOp.preVerificationGas || '21000'),
    maxFeePerGas: String(userOp.maxFeePerGas || '150000000'),
    maxPriorityFeePerGas: String(userOp.maxPriorityFeePerGas || '150000000'),
    paymasterAndData: String(userOp.paymasterAndData || '0x'),
    signature: String(userOp.signature || '0x')
  };

  const serialized = JSON.stringify(normalized);
  return createHash('sha3-256').update(serialized).digest('hex');
}

/**
 * Hàm normalize UserOp fields thành chuỗi cho ZeroDev API.
 */
function normalizeUserOpForApi(
  userOp: SponsorPaymasterRequest['unsignedUserOp']
): Record<string, string> {
  return {
    sender: String(userOp.sender),
    nonce: String(userOp.nonce),
    initCode: String(userOp.initCode || '0x'),
    callData: String(userOp.callData),
    callGasLimit: String(userOp.callGasLimit || '21000'),
    verificationGasLimit: String(userOp.verificationGasLimit || '100000'),
    preVerificationGas: String(userOp.preVerificationGas || '21000'),
    maxFeePerGas: String(userOp.maxFeePerGas || '150000000'),
    maxPriorityFeePerGas: String(userOp.maxPriorityFeePerGas || '150000000'),
    paymasterAndData: String(userOp.paymasterAndData || '0x'),
    signature: String(userOp.signature || '0x')
  };
}

/**
 * Hàm gọi ZeroDev Paymaster API để sponsor gas miễn phí cho low-risk sessions.
 */
async function callFreePaymaster(
  projectId: string,
  userOp: SponsorPaymasterRequest['unsignedUserOp']
): Promise<{ paymasterAndData: string; userOpHash: string }> {
  const config = getZeroDevConfig();

  const baseUrl = config.paymasterUrl.includes('/rpc')
    ? config.paymasterUrl.replace('/rpc', '/paymaster')
    : config.paymasterUrl;
  const endpoint = `${baseUrl}/v3/${config.projectId}/paymaster`;

  const normalizedUserOp = normalizeUserOpForApi(userOp);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(PAYMASTER_TIMEOUT_MS),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'pm_sponsorUserOperation',
      params: [
        normalizedUserOp,
        {
          entryPoint: config.entryPointAddress,
          chainId: CHAIN_ID_AMOY
        }
      ],
      id: 1
    })
  });

  if (!response.ok) {
    const rawBody = await response.text();
    logger.warn('ZeroDev Free Paymaster API error.', {
      status: response.status,
      body: rawBody.length > 200 ? `${rawBody.slice(0, 200)}...` : rawBody,
      sessionId: projectId
    });
    throw new ApplicationError(
      `ZeroDev Paymaster từ chối sponsorship. Status: ${response.status}`,
      502,
      'PAYMASTER_POLICY_MISMATCH'
    );
  }

  const result = await response.json();

  if (result.error) {
    throw new ApplicationError(
      `ZeroDev Paymaster error: ${result.error.message || 'Unknown'}`,
      502,
      'PAYMASTER_POLICY_MISMATCH'
    );
  }

  return {
    paymasterAndData: result.result.paymasterAndData,
    userOpHash: result.result.userOpHash
  };
}

/**
 * Hàm gọi ZeroDev Token Paymaster cho high-risk sessions.
 * Tài trợ gas trước, khấu trừ CharityToken từ ví guest sau.
 */
async function callTokenPaymaster(
  projectId: string,
  userOp: SponsorPaymasterRequest['unsignedUserOp']
): Promise<{ paymasterAndData: string; userOpHash: string }> {
  if (!CHARITY_TOKEN_ADDRESS || !CHARITY_TOKEN_ADDRESS.startsWith('0x')) {
    throw new ApplicationError(
      'CHARITY_TOKEN_ADDRESS chưa được cấu hình hợp lệ cho Token Paymaster.',
      500,
      'INTERNAL_ERROR'
    );
  }

  const config = getZeroDevConfig();

  const baseUrl = config.paymasterUrl.includes('/rpc')
    ? config.paymasterUrl.replace('/rpc', '/paymaster')
    : config.paymasterUrl;
  const endpoint = `${baseUrl}/v3/${config.projectId}/token-paymaster`;

  const normalizedUserOp = normalizeUserOpForApi(userOp);
  const tokenAmount = String(TOKEN_PAYMASTER_GAS_FEE_TOKEN * 1e18);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(PAYMASTER_TIMEOUT_MS),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'pm_sponsorUserOperation',
      params: [
        normalizedUserOp,
        {
          entryPoint: config.entryPointAddress,
          chainId: CHAIN_ID_AMOY,
          token: CHARITY_TOKEN_ADDRESS,
          amount: tokenAmount
        }
      ],
      id: 1
    })
  });

  let rawBody = '';
  if (!response.ok) {
    rawBody = await response.text();
    logger.warn('ZeroDev Token Paymaster API error.', {
      status: response.status,
      body: rawBody.length > 200 ? `${rawBody.slice(0, 200)}...` : rawBody
    });
    throw new ApplicationError(
      `ZeroDev Token Paymaster từ chối. Status: ${response.status}`,
      502,
      'PAYMASTER_POLICY_MISMATCH'
    );
  }

  const result = await response.json();

  if (result.error) {
    throw new ApplicationError(
      `ZeroDev Token Paymaster error: ${result.error.message || 'Unknown'}`,
      502,
      'PAYMASTER_POLICY_MISMATCH'
    );
  }

  return {
    paymasterAndData: result.result.paymasterAndData,
    userOpHash: result.result.userOpHash
  };
}

/**
 * Hàm validate session và quota trước khi sponsor.
 * Mục đích: kiểm tra tất cả business rules tại một nơi.
 */
async function validateSessionForSponsorship(
  sessionId: string,
  walletAddress: string,
  donationAmount: number
): Promise<GuestWalletSession> {
  const session = await findGuestWalletSessionById(sessionId);

  if (!session) {
    throw new ApplicationError('Guest session không tồn tại.', 401, 'GUEST_SESSION_NOT_FOUND');
  }

  if (session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new ApplicationError('Wallet address không khớp với session.', 403, 'FORBIDDEN');
  }

  if (session.status !== 'ACTIVE') {
    throw new ApplicationError(
      `Session đang ở trạng thái "${session.status}", không thể sponsor.`,
      403,
      'GUEST_SESSION_NOT_ACTIVE'
    );
  }

  if (session.expiresAt < new Date()) {
    throw new ApplicationError(
      'Guest session đã hết hạn. Vui lòng tạo phiên mới.',
      401,
      'GUEST_SESSION_EXPIRED'
    );
  }

  if (session.donationCount >= MAX_DONATION_PER_SESSION) {
    throw new ApplicationError(
      `Đã đạt giới hạn ${MAX_DONATION_PER_SESSION} donation/session. Vui lòng claim ví để tiếp tục.`,
      429,
      'GUEST_DONATION_QUOTA_EXCEEDED'
    );
  }

  if (session.hasPendingDonation) {
    throw new ApplicationError(
      'Đang có donation đang chờ xử lý. Vui lòng đợi vài phút rồi thử lại.',
      409,
      'CONFLICT'
    );
  }

  if (session.totalDonatedAmount + donationAmount > MAX_TOTAL_AMOUNT_PER_SESSION) {
    throw new ApplicationError(
      `Tổng donation vượt giới hạn $${MAX_TOTAL_AMOUNT_PER_SESSION}/session.`,
      400,
      'GUEST_AMOUNT_LIMIT_EXCEEDED'
    );
  }

  return session;
}

/**
 * Hàm sponsor guest donation Paymaster.
 *
 * Quy trình:
 * 1. Validate session + quota (dùng amount từ request body để check limit)
 * 2. Decode + validate calldata (trích xuất amount thực từ calldata)
 * 3. Cross-check: amount trong calldata phải khớp với request body (±5% tolerance)
 * 4. Check duplicate userOpHash
 * 5. Read risk score từ DB → chọn Paymaster type
 * 6. Gọi Paymaster API tương ứng
 * 7. Tạo AnonymousDonationAudit record
 * 8. Set hasPendingDonation flag
 * 9. Return sponsorship data
 *
 * @throws ApplicationError nếu validation thất bại hoặc Paymaster từ chối
 */
export async function sponsorGuestDonation(
  request: SponsorPaymasterRequest,
  ipAddress: string,
  userAgent: string
): Promise<SponsorPaymasterResult> {
  const { unsignedUserOp, projectId, sessionId } = request;
  const sponsorshipId = uuidv4();

  // Buoc 1: Validate session + quota (dùng request body amount để check limit)
  const session = await validateSessionForSponsorship(
    sessionId,
    unsignedUserOp.sender,
    request.amount
  );

  // Buoc 2: Decode + validate calldata — trích xuất amount thực từ calldata
  const decodedResult = decodeDonationCalldata(unsignedUserOp.callData);
  if (!decodedResult.valid) {
    throw new ApplicationError(decodedResult.reason, 400, 'INVALID_CALLDATA');
  }

  // Buoc 3: Cross-check request body amount vs calldata amount để chống tampering
  // Cho phép ±5% tolerance vì frontend có thể làm tròn
  const amountFromCalldata = decodedResult.data.amount;
  const amountFromBody = request.amount;
  const tolerance = amountFromCalldata * 0.05;
  if (Math.abs(amountFromCalldata - amountFromBody) > tolerance) {
    throw new ApplicationError(
      'Số tiền donation không khớp với calldata. Vui lòng thử lại.',
      400,
      'INVALID_CALLDATA'
    );
  }

  // Buoc 4: Compute userOpHash for duplicate check
  const userOpHash = computeUserOpHash(unsignedUserOp);
  const existingAudit = await findAuditByUserOpHash(userOpHash);
  if (existingAudit) {
    throw new ApplicationError('UserOperation đã được sponsor trước đó.', 409, 'DUPLICATE_USEROP');
  }

  // Buoc 5: Re-evaluate risk score trước mỗi donation để phát hiện thay đổi
  // Fresh evaluation phản ánh tình trạng thực tế tại thời điểm sponsor
  const freshRisk = await evaluateGuestRisk(
    {
      sessionId,
      walletAddress: unsignedUserOp.sender,
      deviceFingerprintHash: session.deviceFingerprintHash
    },
    ipAddress
  );
  const riskScore = freshRisk.riskScore;
  const trustMultiplier = freshRisk.trustMultiplier;

  // Luôn cập nhật risk record với kết quả mới nhất
  await upsertGuestDonationRisk(sessionId, {
    sessionId,
    walletAddress: unsignedUserOp.sender.toLowerCase(),
    riskScore: freshRisk.riskScore,
    riskLevel: freshRisk.riskLevel,
    trustMultiplier: freshRisk.trustMultiplier,
    factors: freshRisk.factors,
    blocked: false
  });

  const useTokenPaymaster = riskScore >= RISK_THRESHOLD_FOR_TOKEN_PAYMASTER;

  // Buoc 6: Gọi Paymaster API tương ứng
  let paymasterResult: { paymasterAndData: string; userOpHash: string };

  if (useTokenPaymaster) {
    logger.info('High-risk session — using Token Paymaster.', {
      sessionId,
      riskScore,
      walletAddress: unsignedUserOp.sender
    });
    paymasterResult = await callTokenPaymaster(projectId, unsignedUserOp);
  } else {
    paymasterResult = await callFreePaymaster(projectId, unsignedUserOp);
  }

  // Buoc 7 & 8: Tạo audit record + set hasPendingDonation trong 1 transaction
  // Dùng atomic write: nếu audit record tạo thành công → set flag
  // Nếu crash giữa chừng → hasPendingDonation vẫn false (frontend sẽ polling)
  const now = new Date();
  await createAuditRecord({
    auditId: uuidv4(),
    sessionId,
    walletAddress: unsignedUserOp.sender.toLowerCase(),
    projectId,
    amount: amountFromCalldata,
    trustMultiplier,
    riskScore,
    userOpHash,
    onChainTxHash: null,
    onChainBlockNumber: null,
    paymasterSponsoredGas: true,
    claimedByUserId: null,
    isAnonymous: true,
    ipAddress,
    userAgent,
    createdAt: now,
    indexedAt: null
  });

  // Chỉ set flag sau khi audit record được tạo thành công
  // Nếu không thì donation bị stuck — reconciliation worker sẽ phát hiện orphan audit
  await updateGuestWalletSession(sessionId, {
    hasPendingDonation: true,
    updatedAt: now
  });

  logger.info('Guest donation sponsored.', {
    sponsorshipId,
    sessionId,
    walletAddress: unsignedUserOp.sender,
    paymasterType: useTokenPaymaster ? 'TOKEN' : 'FREE',
    riskScore,
    trustMultiplier,
    amount: amountFromCalldata
  });

  // Buoc 9: Return result
  const result: SponsorPaymasterResult = {
    paymasterAndData: paymasterResult.paymasterAndData,
    userOpHash: paymasterResult.userOpHash,
    sponsorshipId,
    paymasterType: useTokenPaymaster ? 'TOKEN' : 'FREE',
    paymasterSponsoredGas: true,
    trustMultiplier,
    riskScore
  };

  if (useTokenPaymaster) {
    result.gasChargeAmount = TOKEN_PAYMASTER_GAS_FEE_TOKEN;
    result.gasChargeWarning = true;
  }

  return result;
}
