/**
 * Service chứa business logic cho guest session — tách biệt khỏi HTTP layer.
 * Các hàm trong service không biết gì về Express request/response,
 * chỉ nhận plain data và trả về kết kết quả.
 */
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  createGuestWalletSession,
  findGuestWalletSessionById,
  updateGuestWalletSession,
  countRecentSessionsByFingerprint,
  countRecentSessionsByIp
} from '../repositories/guestWalletSessionRepository';
import { signGuestSessionToken } from '../config/guestJsonWebToken';
import { evaluateAndSaveGuestRisk } from './guestRiskService';
import {
  upsertGuestDonationRisk,
  computeRiskLevelAndMultiplier
} from '../repositories/guestDonationRiskRepository';
import { getLogger } from '../config/logger';

const logger = getLogger();

/** TTL mặc định của guest session: 72 giờ. */
const SESSION_TTL_MS = 72 * 60 * 60 * 1000;

/** Giới hạn tối đa session theo fingerprint (FR5.G). */
const MAX_SESSIONS_PER_FINGERPRINT = 3;

/** Giới hạn tối đa session theo IP trong 1 giờ (anti-burst). */
const MAX_SESSIONS_PER_IP_PER_HOUR = 3;

/** Giới hạn số lần refresh session. */
const MAX_RENEWAL_COUNT = 5;

/** Số bytes của server salt. */
const SERVER_SALT_BYTES = 32;

/** Giới hạn donation per session — dùng chung cho cả service. */
const MAX_DONATIONS_PER_SESSION = 3;

/** Response type cho tạo session thành công. */
export type CreateGuestSessionResult = {
  sessionId: string;
  guestSessionToken: string;
  expiresAt: string;
  serverSalt: string;
  donationQuota: number;
};

/** Response type cho refresh session thành công. */
export type RefreshGuestSessionResult = {
  guestSessionToken: string;
  expiresAt: string;
  renewalCount: number;
};

/** Response type cho session status. */
export type SessionStatusResult = {
  sessionId: string;
  walletAddress: string;
  status: string;
  donationCount: number;
  totalDonatedAmount: number;
  expiresAt: string;
  remainingDonations: number;
};

/**
 * Hàm sinh server salt ngẫu nhiên.
 * Server salt được trả về client để compute encryption key (PBKDF2).
 * Mục đích: mỗi session có salt riêng, tránh rainbow table attack.
 */
function generateServerSalt(): string {
  return crypto.randomBytes(SERVER_SALT_BYTES).toString('hex');
}

/**
 * Hàm tạo phiên guest wallet mới.
 *
 * Quy trình:
 * 1. Validate fingerprint limit (≤3/24h)
 * 2. Validate IP burst (≤3/1h)
 * 3. Generate server salt
 * 4. Create session record in MongoDB
 * 5. Sign JWT token
 * 6. Return response
 *
 * @throws Error nếu vượt giới hạn hoặc tạo session thất bại
 */
export async function createNewGuestSession(
  walletAddress: string,
  deviceFingerprintHash: string,
  ipAddress: string,
  userAgent: string
): Promise<CreateGuestSessionResult> {
  const normalizedWallet = walletAddress.toLowerCase();

  // Kiểm tra giới hạn fingerprint: ≤3 sessions/24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const fingerprintCount = await countRecentSessionsByFingerprint(deviceFingerprintHash, oneDayAgo);
  if (fingerprintCount >= MAX_SESSIONS_PER_FINGERPRINT) {
    throw new Error(
      `Đã đạt giới hạn tạo phiên. Vui lòng sử dụng trình duyệt khác hoặc đăng nhập để tiếp tục.`
    );
  }

  // Kiểm tra giới hạn IP burst: ≤3 sessions/1h
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const ipCount = await countRecentSessionsByIp(ipAddress, oneHourAgo);
  if (ipCount >= MAX_SESSIONS_PER_IP_PER_HOUR) {
    throw new Error(
      `Phát hiện nhiều phiên từ cùng địa chỉ IP. Vui lòng thử lại sau 1 giờ.`
    );
  }

  const sessionId = uuidv4();
  const serverSalt = generateServerSalt();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await createGuestWalletSession({
    sessionId,
    walletAddress: normalizedWallet,
    deviceFingerprintHash,
    ipAddress,
    userAgent,
    status: 'ACTIVE',
    donationCount: 0,
    totalDonatedAmount: 0,
    totalSponsoredGas: 0,
    renewalCount: 0,
    claimedByUserId: null,
    serverSalt,
    hasPendingDonation: false,
    pendingAlertSentAt: null,
    expiresAt,
    createdAt: now,
    updatedAt: now
  });

  // Initial risk assessment sau khi tạo session (Task 4.2)
  // Đánh giá risk ngay để có risk record sẵn sàng cho Paymaster sponsorship.
  // Nếu risk evaluation thất bại (VD: RPC error, DB upsert failure), dùng fallback
  // risk an toàn (SAFE, score=0, multiplier=1.0) để tránh dangling record.
  try {
    await evaluateAndSaveGuestRisk(
      { sessionId, walletAddress: normalizedWallet, deviceFingerprintHash },
      ipAddress
    );
  } catch (error) {
    // Fallback risk an toàn khi evaluation thất bại — không fail toàn bộ session creation
    const { riskLevel, trustMultiplier } = computeRiskLevelAndMultiplier(0);
    await upsertGuestDonationRisk(sessionId, {
      sessionId,
      walletAddress: normalizedWallet,
      riskScore: 0,
      riskLevel,
      trustMultiplier,
      factors: {
        walletAgeScore: 0,
        ipBurstScore: 0,
        fingerprintReuseScore: 0,
        donationPatternScore: 0,
        sessionVelocityScore: 0
      },
      blocked: false,
      blockedAt: null,
      blockedReason: null
    });
    logger.warn('Risk evaluation failed, using safe fallback.', {
      sessionId,
      walletAddress: normalizedWallet,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  const guestSessionToken = signGuestSessionToken({
    sessionId,
    walletAddress: normalizedWallet
  });

  logger.info('Guest session created.', { sessionId, walletAddress: normalizedWallet });

  return {
    sessionId,
    guestSessionToken,
    expiresAt: expiresAt.toISOString(),
    serverSalt,
    donationQuota: 3
  };
}

/**
 * Hàm refresh guest session token.
 *
 * Quy trình:
 * 1. Verify existing token
 * 2. Fetch session from DB
 * 3. Check renewal count < 5
 * 4. Increment renewal count
 * 5. Issue new token
 *
 * @throws Error nếu session không hợp lệ hoặc vượt giới hạn refresh
 */
export async function refreshExistingSession(
  sessionId: string,
  walletAddress: string
): Promise<RefreshGuestSessionResult> {
  const session = await findGuestWalletSessionById(sessionId);
  if (!session) {
    throw new Error('Guest session không tồn tại.');
  }

  if (session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Wallet address không khớp với session.');
  }

  if (session.status !== 'ACTIVE') {
    throw new Error('Guest session đã hết hạn hoặc bị vô hiệu hóa.');
  }

  if (session.expiresAt < new Date()) {
    throw new Error('Guest session đã hết hạn. Vui lòng tạo phiên mới.');
  }

  if (session.renewalCount >= MAX_RENEWAL_COUNT) {
    throw new Error('Đã đạt giới hạn làm mới phiên. Vui lòng tạo phiên mới.');
  }

  const newExpiry = new Date(Date.now() + SESSION_TTL_MS);

  await updateGuestWalletSession(sessionId, {
    renewalCount: session.renewalCount + 1,
    expiresAt: newExpiry
  });

  const newToken = signGuestSessionToken({
    sessionId,
    walletAddress: session.walletAddress
  });

  logger.info('Guest session refreshed.', { sessionId, newRenewalCount: session.renewalCount + 1 });

  return {
    guestSessionToken: newToken,
    expiresAt: newExpiry.toISOString(),
    renewalCount: session.renewalCount + 1
  };
}

/**
 * Hàm lấy trạng thái hiện tại của guest session.
 * Dùng cho frontend polling để kiểm tra session còn hợp lệ không.
 */
export async function getSessionStatus(sessionId: string): Promise<SessionStatusResult> {
  const session = await findGuestWalletSessionById(sessionId);
  if (!session) {
    throw new Error('Guest session không tồn tại.');
  }

  const remainingDonations = Math.max(0, MAX_DONATIONS_PER_SESSION - session.donationCount);

  return {
    sessionId: session.sessionId,
    walletAddress: session.walletAddress,
    status: session.status,
    donationCount: session.donationCount,
    totalDonatedAmount: session.totalDonatedAmount,
    expiresAt: session.expiresAt.toISOString(),
    remainingDonations
  };
}
