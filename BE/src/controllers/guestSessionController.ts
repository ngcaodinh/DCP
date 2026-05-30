/**
 * Controller xử lý HTTP requests cho guest session endpoints.
 * Nhiệm vụ: parse input → gọi service → trả response.
 * Không chứa business logic.
 */
import { Request, Response } from 'express';
import {
  createNewGuestSession,
  refreshExistingSession,
  getSessionStatus
} from '../services/guestSessionService';
import { sponsorGuestDonation } from '../services/guestPaymasterService';
import { sendErrorResponse, sendSuccessResponse, sendErrorFromUnknown } from '../utils/apiResponse';
import { GuestSessionRequest } from '../middleware/guestAuthMiddleware';
import { getLogger } from '../config/logger';
import { ApplicationError } from '../utils/applicationError';

const logger = getLogger();

/**
 * Hàm extract IP address từ request.
 * Ưu tiên: x-forwarded-for header → request.ip → fallback.
 */
function extractClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return request.ip || 'unknown';
}

/**
 * Hàm extract metadata từ request headers.
 * Mục đích: lấy IP và User-Agent chuẩn hóa.
 */
function extractRequestMetadata(request: Request): { ipAddress: string; userAgent: string } {
  const ipAddress = extractClientIp(request);
  const userAgent =
    typeof request.headers['user-agent'] === 'string'
      ? request.headers['user-agent']
      : 'unknown';
  return { ipAddress, userAgent };
}

/**
 * Hàm validate EIP-55 checksum wallet address.
 * Mục đích: reject địa chỉ không hợp lệ trước khi tạo session.
 */
function isValidEthereumAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Hàm validate SHA-256 hash format.
 * Device fingerprint hash phải là hex string 64 ký tự.
 */
function isValidFingerprintHash(hash: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * Hàm xử lý tạo guest session mới.
 * Endpoint: POST /api/guest/session
 */
export async function handleCreateGuestSession(
  request: Request,
  response: Response
): Promise<void> {
  const { walletAddress, deviceFingerprintHash } = request.body as {
    walletAddress?: string;
    deviceFingerprintHash?: string;
  };

  if (!walletAddress || !isValidEthereumAddress(walletAddress)) {
    sendErrorResponse(
      response,
      400,
      'Địa chỉ ví không hợp lệ. Vui lòng cung cấp địa chỉ Ethereum hợp lệ.',
      'INVALID_WALLET_ADDRESS'
    );
    return;
  }

  if (!deviceFingerprintHash || !isValidFingerprintHash(deviceFingerprintHash)) {
    sendErrorResponse(
      response,
      400,
      'Device fingerprint không hợp lệ. Vui lòng kiểm tra trình duyệt của bạn.',
      'INVALID_FINGERPRINT'
    );
    return;
  }

  const { ipAddress, userAgent } = extractRequestMetadata(request);

  try {
    const result = await createNewGuestSession(
      walletAddress,
      deviceFingerprintHash,
      ipAddress,
      userAgent
    );

    logger.info('Guest session created via API.', {
      sessionId: result.sessionId,
      walletAddress
    });

    sendSuccessResponse(response, 201, 'Tạo phiên guest thành công.', result);
  } catch (error: unknown) {
    logger.warn('Guest session creation failed.', {
      errorMessage: error instanceof Error ? error.message : String(error),
      walletAddress
    });

    if (error instanceof Error) {
      if (error.message.includes('giới hạn')) {
        sendErrorResponse(response, 429, error.message, 'GUEST_SESSION_LIMIT_EXCEEDED');
        return;
      }
    }

    sendErrorFromUnknown(response, error, 'Không thể tạo phiên guest. Vui lòng thử lại.');
  }
}

/**
 * Hàm xử lý refresh guest session.
 * Endpoint: POST /api/guest/session/refresh
 * Middleware: guestAuthMiddleware đã verify token và gắn guestSession vào request.
 */
export async function handleRefreshGuestSession(
  request: GuestSessionRequest,
  response: Response
): Promise<void> {
  const guestSession = request.guestSession;
  if (!guestSession) {
    sendErrorResponse(response, 401, 'Vui lòng cung cấp guest session token hợp lệ.', 'GUEST_SESSION_REQUIRED');
    return;
  }

  try {
    const result = await refreshExistingSession(
      guestSession.sessionId,
      guestSession.walletAddress
    );

    logger.info('Guest session refreshed via API.', {
      sessionId: guestSession.sessionId
    });

    sendSuccessResponse(response, 200, 'Làm mới phiên guest thành công.', result);
  } catch (error: unknown) {
    logger.warn('Guest session refresh failed.', {
      errorMessage: error instanceof Error ? error.message : String(error),
      sessionId: guestSession.sessionId
    });

    if (error instanceof Error) {
      if (error.message.includes('giới hạn')) {
        sendErrorResponse(response, 429, error.message, 'GUEST_RENEWAL_LIMIT_EXCEEDED');
        return;
      }
      if (error.message.includes('hết hạn')) {
        sendErrorResponse(response, 401, error.message, 'GUEST_SESSION_EXPIRED');
        return;
      }
    }

    sendErrorFromUnknown(response, error, 'Không thể làm mới phiên guest. Vui lòng thử lại.');
  }
}

/**
 * Hàm xử lý lấy trạng thái guest session.
 * Endpoint: GET /api/guest/session/status
 * Middleware: guestAuthMiddleware đã verify token và gắn guestSession vào request.
 */
export async function handleGetGuestSessionStatus(
  request: GuestSessionRequest,
  response: Response
): Promise<void> {
  const guestSession = request.guestSession;
  if (!guestSession) {
    sendErrorResponse(response, 401, 'Vui lòng cung cấp guest session token hợp lệ.', 'GUEST_SESSION_REQUIRED');
    return;
  }

  try {
    const result = await getSessionStatus(guestSession.sessionId);

    sendSuccessResponse(response, 200, 'Lấy trạng thái phiên guest thành công.', result);
  } catch (error: unknown) {
    logger.warn('Guest session status check failed.', {
      errorMessage: error instanceof Error ? error.message : String(error),
      sessionId: guestSession.sessionId
    });

    sendErrorFromUnknown(response, error, 'Không thể lấy trạng thái phiên guest.');
  }
}

/**
 * Hàm xử lý sponsor Paymaster cho guest donation.
 * Endpoint: POST /api/guest/paymaster/sponsor
 * Middleware: guestAuthMiddleware đã verify token và gắn guestSession vào request.
 *
 * Quy trình:
 * 1. Validate request body
 * 2. Check unsignedUserOp.sender khớp session.walletAddress
 * 3. Gọi sponsorGuestDonation() service
 * 4. Return paymaster sponsorship data
 */
export async function handleSponsorGuestPaymaster(
  request: GuestSessionRequest,
  response: Response
): Promise<void> {
  const guestSession = request.guestSession;
  if (!guestSession) {
    sendErrorResponse(response, 401, 'Vui lòng cung cấp guest session token hợp lệ.', 'GUEST_SESSION_REQUIRED');
    return;
  }

  const { ipAddress, userAgent } = extractRequestMetadata(request);

  const body = request.body as {
    unsignedUserOp?: unknown;
    projectId?: string;
    amount?: number;
    sessionId?: string;
  };

  if (!body.unsignedUserOp || typeof body.unsignedUserOp !== 'object') {
    sendErrorResponse(response, 400, 'unsignedUserOp là bắt buộc.', 'INVALID_REQUEST');
    return;
  }

  if (!body.projectId || typeof body.projectId !== 'string') {
    sendErrorResponse(response, 400, 'projectId là bắt buộc.', 'INVALID_REQUEST');
    return;
  }

  if (typeof body.amount !== 'number' || body.amount <= 0) {
    sendErrorResponse(response, 400, 'amount phải là số lớn hơn 0.', 'INVALID_REQUEST');
    return;
  }

  // Giới hạn amount tối đa được kiểm tra trong service layer
  // (validate calldata + cross-check với body.amount)

  if (!body.sessionId || typeof body.sessionId !== 'string') {
    sendErrorResponse(response, 400, 'sessionId là bắt buộc.', 'INVALID_REQUEST');
    return;
  }

  if (body.sessionId !== guestSession.sessionId) {
    sendErrorResponse(response, 403, 'sessionId không khớp với token.', 'FORBIDDEN');
    return;
  }

  const unsignedUserOp = body.unsignedUserOp as Record<string, unknown>;

  if (!unsignedUserOp.sender || typeof unsignedUserOp.sender !== 'string') {
    sendErrorResponse(response, 400, 'unsignedUserOp.sender là bắt buộc.', 'INVALID_REQUEST');
    return;
  }

  if (unsignedUserOp.sender.toLowerCase() !== guestSession.walletAddress.toLowerCase()) {
    sendErrorResponse(response, 403, 'Sender address không khớp với session wallet.', 'FORBIDDEN');
    return;
  }

  if (!unsignedUserOp.callData || typeof unsignedUserOp.callData !== 'string') {
    sendErrorResponse(response, 400, 'unsignedUserOp.callData là bắt buộc.', 'INVALID_REQUEST');
    return;
  }

  try {
    const result = await sponsorGuestDonation(
      {
        unsignedUserOp: unsignedUserOp as Parameters<typeof sponsorGuestDonation>[0]['unsignedUserOp'],
        projectId: body.projectId,
        amount: body.amount,
        sessionId: body.sessionId
      },
      ipAddress,
      userAgent
    );

    logger.info('Guest paymaster sponsored via API.', {
      sessionId: guestSession.sessionId,
      paymasterType: result.paymasterType,
      riskScore: result.riskScore
    });

    sendSuccessResponse(response, 200, 'Sponsor Paymaster thành công.', result);
  } catch (error: unknown) {
    logger.warn('Guest paymaster sponsorship failed.', {
      errorMessage: error instanceof Error ? error.message : String(error),
      sessionId: guestSession.sessionId
    });

    if (error instanceof ApplicationError) {
      sendErrorResponse(response, error.statusCode, error.message, error.errorCode);
      return;
    }

    sendErrorFromUnknown(response, error, 'Không thể sponsor Paymaster. Vui lòng thử lại.');
  }
}
