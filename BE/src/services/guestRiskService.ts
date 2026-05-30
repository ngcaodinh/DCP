/**
 * Service đánh giá risk score cho guest wallet sessions — tách biệt khỏi HTTP layer.
 * Được gọi tại thời điểm tạo session (initial assessment) và trước mỗi Paymaster sponsorship.
 *
 * Risk scoring rules (FR5.G):
 * - Wallet Age: counterfactual (not deployed) → +20
 * - IP Burst: ≥3 sessions/IP/1h → +30
 * - Fingerprint Reuse: ≥3 sessions/fingerprint/24h → +25
 * - Donation Pattern: all donations same amount → +15
 * - Session Velocity: session created <60s after previous → +10
 */
import { ethers } from 'ethers';
import { getZeroDevConfig } from '../config/zeroDev';
import { getLogger } from '../config/logger';
import { GuestWalletSession } from '../models/guestWalletSessionModel';
import { GuestDonationRisk, RiskLevel } from '../models/guestDonationRiskModel';
import {
  findGuestDonationRiskBySessionId,
  upsertGuestDonationRisk,
  computeRiskLevelAndMultiplier
} from '../repositories/guestDonationRiskRepository';
import {
  countRecentSessionsByIp,
  countRecentSessionsByFingerprint
} from '../repositories/guestWalletSessionRepository';
import { findAuditsBySessionId } from '../repositories/anonymousDonationAuditRepository';

const logger = getLogger();

/** Singleton lazy-initialized JsonRpcProvider — tái sử dụng provider cho tất cả checkWalletAge calls. */
let sharedRpcProvider: ethers.JsonRpcProvider | null = null;

/**
 * Lấy hoặc khởi tạo singleton JsonRpcProvider dùng chung.
 * Dùng lazy initialization để tránh tạo provider khi module load (config có thể chưa sẵn sàng).
 */
function getSharedRpcProvider(): ethers.JsonRpcProvider {
  if (!sharedRpcProvider) {
    const config = getZeroDevConfig();
    sharedRpcProvider = new ethers.JsonRpcProvider(config.rpcUrl);
  }
  return sharedRpcProvider;
}

/** Ngưỡng IP burst: ≥3 sessions/IP/1h → +30. */
const IP_BURST_THRESHOLD = 3;

/** Ngưỡng fingerprint reuse: ≥3 sessions/fingerprint/24h → +25. */
const FINGERPRINT_REUSE_THRESHOLD = 3;

/** Ngưỡng wallet age: counterfactual (not deployed) → +20. */
const WALLET_AGE_RISK_SCORE = 20;

/** Ngưỡng donation pattern: tất cả donations cùng amount → +15. */
const DONATION_PATTERN_RISK_SCORE = 15;

/** Ngưỡng session velocity: <60s → +10. */
const SESSION_VELOCITY_THRESHOLD_MS = 60_000;

/** Thời gian xem xét IP burst (1 giờ). */
const IP_BURST_WINDOW_MS = 3_600_000;

/** Thời gian xem xét fingerprint reuse (24 giờ). */
const FINGERPRINT_REUSE_WINDOW_MS = 86_400_000;

/**
 * Kết quả đánh giá risk cho một session.
 */
export type RiskEvaluationResult = {
  riskScore: number;
  riskLevel: RiskLevel;
  trustMultiplier: number;
  factors: {
    walletAgeScore: number;
    ipBurstScore: number;
    fingerprintReuseScore: number;
    donationPatternScore: number;
    sessionVelocityScore: number;
  };
  blocked: boolean;
};

/**
 * Hàm kiểm tra wallet age — check xem Smart Account đã deployed on-chain hay chưa.
 * Counterfactual (chưa deployed) → cao risk vì attacker có thể tạo nhiều wallets không tốn chi phí.
 * Deployed wallet → đã tốn gas deploy → lower risk.
 * Dùng singleton provider để tránh tạo provider mới mỗi lần gọi.
 */
async function checkWalletAge(walletAddress: string): Promise<number> {
  try {
    const provider = getSharedRpcProvider();
    const code = await provider.getCode(walletAddress);
    // 0x = chưa deployed (counterfactual), >0x = đã deploy
    return code === '0x' ? WALLET_AGE_RISK_SCORE : 0;
  } catch (error) {
    logger.warn('Failed to check wallet age on-chain.', {
      walletAddress,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

/**
 * Hàm kiểm tra IP burst — đếm sessions cùng IP trong 1 giờ.
 * ≥3 sessions → cao risk vì có thể là bot/script tạo nhiều wallets.
 */
async function checkIPBurst(ipAddress: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - IP_BURST_WINDOW_MS);
  const count = await countRecentSessionsByIp(ipAddress, oneHourAgo);
  return count >= IP_BURST_THRESHOLD ? 30 : 0;
}

/**
 * Hàm kiểm tra fingerprint reuse — đếm sessions cùng fingerprint trong 24 giờ.
 * ≥3 sessions → cao risk vì cùng thiết bị tạo nhiều wallets.
 */
async function checkFingerprintReuse(deviceFingerprintHash: string): Promise<number> {
  const oneDayAgo = new Date(Date.now() - FINGERPRINT_REUSE_WINDOW_MS);
  const count = await countRecentSessionsByFingerprint(deviceFingerprintHash, oneDayAgo);
  return count >= FINGERPRINT_REUSE_THRESHOLD ? 25 : 0;
}

/**
 * Hàm kiểm tra donation pattern — tất cả donations trong session có cùng amount.
 * Nếu tất cả donations đều same exact amount → có thể là scripted/farming.
 */
async function checkDonationPattern(sessionId: string): Promise<number> {
  try {
    const audits = await findAuditsBySessionId(sessionId);
    if (audits.length < 2) {
      return 0;
    }
    const amounts = audits.map((a) => a.amount);
    const firstAmount = amounts[0];
    const allSame = amounts.every((amt) => amt === firstAmount);
    return allSame ? DONATION_PATTERN_RISK_SCORE : 0;
  } catch (error) {
    logger.warn('Failed to check donation pattern.', {
      sessionId,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

/**
 * Hàm kiểm tra session velocity — session mới được tạo <60s sau session trước từ cùng IP.
 * Dấu hiệu automated session creation.
 * Dùng countRecentSessionsByIp thay vì findGuestWalletSessionsByIp để tránh load tất cả documents.
 */
async function checkSessionVelocity(ipAddress: string): Promise<number> {
  try {
    const sinceDate = new Date(Date.now() - SESSION_VELOCITY_THRESHOLD_MS);
    const count = await countRecentSessionsByIp(ipAddress, sinceDate);
    // Có session mới được tạo trong vòng 60 giây trước → suspicious
    return count > 0 ? 10 : 0;
  } catch (error) {
    logger.warn('Failed to check session velocity.', {
      ipAddress,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

/**
 * Hàm đánh giá risk cho một guest session.
 * Được gọi tại:
 * 1. POST /api/guest/session (initial assessment sau khi tạo session)
 * 2. POST /api/guest/paymaster/sponsor (re-evaluation trước mỗi donation)
 *
 * @param session - Guest session data
 * @param ipAddress - IP address hiện tại của request
 * @returns RiskEvaluationResult chứa score, level, multiplier, và factors chi tiết
 */
export async function evaluateGuestRisk(
  session: Pick<GuestWalletSession, 'sessionId' | 'walletAddress' | 'deviceFingerprintHash'>,
  ipAddress: string
): Promise<RiskEvaluationResult> {
  // Chạy song song tất cả 5 checks không phụ thuộc nhau để optimize latency
  const [walletAgeScore, ipBurstScore, fingerprintReuseScore, donationPatternScore, sessionVelocityScore] =
    await Promise.all([
      checkWalletAge(session.walletAddress),
      checkIPBurst(ipAddress),
      checkFingerprintReuse(session.deviceFingerprintHash),
      checkDonationPattern(session.sessionId),
      checkSessionVelocity(ipAddress)
    ]);

  const riskScore = Math.min(
    100,
    walletAgeScore + ipBurstScore + fingerprintReuseScore + donationPatternScore + sessionVelocityScore
  );

  // computeRiskLevelAndMultiplier từ repository không trả blocked (luôn false vì risk >= 70 dùng Token Paymaster, không block)
  const { riskLevel, trustMultiplier } = computeRiskLevelAndMultiplier(riskScore);

  const result: RiskEvaluationResult = {
    riskScore,
    riskLevel,
    trustMultiplier,
    factors: {
      walletAgeScore,
      ipBurstScore,
      fingerprintReuseScore,
      donationPatternScore,
      sessionVelocityScore
    },
    blocked: false
  };

  logger.info('Guest risk evaluated.', {
    sessionId: session.sessionId,
    walletAddress: session.walletAddress,
    riskScore,
    riskLevel,
    trustMultiplier,
    factors: result.factors
  });

  return result;
}

/**
 * Hàm đánh giá và lưu risk record vào MongoDB.
 * Dùng cho initial assessment khi tạo session.
 * Tự động upsert để tạo record mới hoặc cập nhật nếu đã tồn tại.
 */
export async function evaluateAndSaveGuestRisk(
  session: Pick<GuestWalletSession, 'sessionId' | 'walletAddress' | 'deviceFingerprintHash'>,
  ipAddress: string
): Promise<GuestDonationRisk> {
  const result = await evaluateGuestRisk(session, ipAddress);

  const upserted = await upsertGuestDonationRisk(session.sessionId, {
    sessionId: session.sessionId,
    walletAddress: session.walletAddress,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    trustMultiplier: result.trustMultiplier,
    factors: result.factors,
    blocked: result.blocked,
    blockedAt: result.blocked ? new Date() : null,
    blockedReason: result.blocked ? 'Risk score exceeds threshold' : null
  });

  return upserted;
}

/**
 * Hàm đánh giá và lưu risk với re-evaluation khi donation thất bại.
 * Dùng để tăng risk score nếu có suspicious activity.
 */
export async function reEvaluateGuestRisk(
  sessionId: string,
  ipAddress: string
): Promise<RiskEvaluationResult> {
  const riskRecord = await findGuestDonationRiskBySessionId(sessionId);

  // Nếu không có record cũ, vẫn evaluate để có baseline risk score
  // deviceFingerprintHash rỗng sẽ cho fingerprintReuseScore = 0 (conservative)
  const sessionData = riskRecord
    ? {
        sessionId: riskRecord.sessionId,
        walletAddress: riskRecord.walletAddress,
        deviceFingerprintHash: ''
      }
    : null;

  if (!sessionData) {
    throw new Error('Không tìm thấy risk record cho phiên này.');
  }

  return evaluateGuestRisk(
    {
      sessionId: sessionData.sessionId,
      walletAddress: sessionData.walletAddress,
      deviceFingerprintHash: sessionData.deviceFingerprintHash
    },
    ipAddress
  );
}
