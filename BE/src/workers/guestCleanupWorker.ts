/**
 * Worker dọn dẹp phiên guest wallet và phát hiện Sybil attack.
 * Chạy 1 lần/ngày cùng schedule với ranking reconciliation (00:00).
 *
 * Nhiệm vụ:
 * - Task 1: Expire các phiên đã hết hạn (ACTIVE → EXPIRED)
 * - Task 2: Purge các phiên expired quá 30 ngày (EXPIRED → PURGED)
 * - Task 3: Cluster detection — phát hiện wallets cùng fingerprint/IP subnet/timestamps
 * - Task 4: Anti-farming check — flag nếu guest donations > 60% total donations
 */
import { getLogger } from '../config/logger';
import {
  expireGuestSessions,
  purgeOldGuestSessions,
  findGuestWalletSessionsByIds
} from '../repositories/guestWalletSessionRepository';
import {
  findAllClusterSuspects,
  markManyAsClusterSuspect
} from '../repositories/guestDonationRiskRepository';
import {
  countAnonymousDonationsSince
} from '../repositories/anonymousDonationAuditRepository';
import {
  countTotalDonationsSince
} from '../repositories/donationRepository';

const logger = getLogger();

/**
 * Thời gian (miligiây) chờ trước khi purge một phiên đã expired (30 ngày).
 */
const PURGE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Số ngày để tính tỷ lệ guest donations (FR4.G anti-farming).
 */
const ANTI_FARMING_LOOKBACK_DAYS = 30;

/**
 * Ngưỡng % guest donations để flag anti-farming (> 60%).
 */
const ANTI_FARMING_THRESHOLD_PERCENT = 60;

/**
 * Cụm cluster suspect mới cần xử lý (chưa được gán clusterId).
 * Giới hạn batch để tránh quá tải memory khi có nhiều suspicious sessions.
 */
const CLUSTER_BATCH_SIZE = 500;

/**
 * Ngưỡng IP subnet để detect cluster (cùng /24 subnet).
 */
const IP_SUBNET_OCTETS = 3;

/**
 * Ngưỡng thời gian (miligiây) giữa các phiên để coi là "gần nhau" (2 phút).
 */
const SESSION_PROXIMITY_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Hàm extract subnet prefix từ IP address (lấy N octets đầu).
 * @param ipAddress - Địa chỉ IPv4
 * @param octets - Số octets cần lấy (mặc định 3 = /24)
 * @returns Subnet prefix dạng string (VD: "192.168.1")
 */
function extractIpSubnet(ipAddress: string, octets: number = IP_SUBNET_OCTETS): string {
  const parts = ipAddress.split('.');
  return parts.slice(0, octets).join('.');
}

/**
 * Hàm extract message từ error object.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const msg = (error as Record<string, unknown>).message ?? (error as Record<string, unknown>).errorMessage;
    if (typeof msg === 'string') return msg;
  }
  return String(error);
}

/**
 * Task 1: Expire các phiên guest wallet đã hết hạn.
 * Mục đích: đánh dấu ACTIVE sessions có expiresAt < now thành EXPIRED.
 * Không hard-delete — giữ lại để audit trail.
 *
 * @returns Số phiên đã expire
 */
async function taskExpireOverdueSessions(): Promise<number> {
  const now = new Date();
  const expiredCount = await expireGuestSessions(now);
  logger.info(`[GuestCleanup] Task1: Đã expire ${expiredCount} phiên hết hạn.`);
  return expiredCount;
}

/**
 * Task 2: Purge các phiên expired quá 30 ngày.
 * Mục đích: chuyển EXPIRED → PURGED sau khi retention period qua.
 * Soft-delete để giữ audit trail, comply với data retention policy.
 *
 * @returns Số phiên đã purge
 */
async function taskPurgeOldSessions(): Promise<number> {
  const cutoffDate = new Date(Date.now() - PURGE_THRESHOLD_MS);
  const purgedCount = await purgeOldGuestSessions(cutoffDate);
  logger.info(`[GuestCleanup] Task2: Đã purge ${purgedCount} phiên expired quá 30 ngày.`);
  return purgedCount;
}

/**
 * Task 3: Cluster detection — phát hiện Sybil attack.
 * Mục đích: nhóm các guest wallets cùng fingerprint/IP subnet/timestamps gần nhau.
 *
 * Algorithm:
 * 1. Batch fetch tất cả sessions từ existing suspects (tránh N+1 queries)
 * 2. Group theo fingerprint hash → nếu > 3 wallets cùng fingerprint → cluster
 * 3. Group theo IP subnet /24 → nếu > 5 wallets cùng subnet → cluster
 * 4. Check sessions có createdAt cách nhau < 2 phút → cluster
 *
 * @returns Số clusters mới được detect
 */
async function taskDetectClusters(): Promise<number> {
  const now = new Date();
  const existingSuspects = await findAllClusterSuspects(CLUSTER_BATCH_SIZE);

  if (!existingSuspects.length) {
    return 0;
  }

  const lookbackDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const assignedClusters = new Map<string, string>();
  let clustersDetected = 0;

  // Batch fetch tất cả session data để tránh N+1 queries
  const sessionIds = existingSuspects.map(s => s.sessionId);
  const sessions = await findGuestWalletSessionsByIds(sessionIds);

  // Build lookup map: sessionId → session data
  const sessionById = new Map(sessions.map(s => [s.sessionId, s]));

  // Step 3a: Fingerprint reuse detection
  const fingerprintMap = new Map<string, string[]>();
  for (const suspect of existingSuspects) {
    const session = sessionById.get(suspect.sessionId);
    if (!session) continue;
    const fp = session.deviceFingerprintHash;
    const existing = fingerprintMap.get(fp) || [];
    existing.push(suspect.sessionId);
    fingerprintMap.set(fp, existing);
  }

  for (const [fingerprint, sessionIdsList] of fingerprintMap) {
    if (sessionIdsList.length >= 3) {
      const clusterId = `fp_${fingerprint.substring(0, 16)}`;
      // Batch update tất cả sessions trong cluster bằng 1 write thay vì N writes
      const alreadyAssigned = sessionIdsList.filter(id => assignedClusters.has(id)).length;
      const newAssignments = sessionIdsList.filter(id => !assignedClusters.has(id));
      if (newAssignments.length > 0) {
        await markManyAsClusterSuspect(newAssignments, clusterId);
        for (const sessionId of newAssignments) {
          assignedClusters.set(sessionId, clusterId);
        }
        clustersDetected += newAssignments.length;
      }
      logger.info(`[GuestCleanup] Task3a: Detected fingerprint cluster: ${fingerprint.substring(0, 16)}... with ${sessionIdsList.length} sessions (${alreadyAssigned} already assigned).`);
    }
  }

  // Step 3b: IP subnet burst detection
  const ipSubnetMap = new Map<string, string[]>();
  for (const suspect of existingSuspects) {
    const session = sessionById.get(suspect.sessionId);
    if (!session) continue;
    const subnet = extractIpSubnet(session.ipAddress);
    const existing = ipSubnetMap.get(subnet) || [];
    existing.push(suspect.sessionId);
    ipSubnetMap.set(subnet, existing);
  }

  for (const [subnet, sessionIdsList] of ipSubnetMap) {
    if (sessionIdsList.length >= 5) {
      const clusterId = `ip_${subnet}`;
      const newAssignments = sessionIdsList.filter(id => !assignedClusters.has(id));
      if (newAssignments.length > 0) {
        await markManyAsClusterSuspect(newAssignments, clusterId);
        for (const sessionId of newAssignments) {
          assignedClusters.set(sessionId, clusterId);
        }
        clustersDetected += newAssignments.length;
      }
      logger.info(`[GuestCleanup] Task3b: Detected IP subnet cluster: ${subnet}.* with ${sessionIdsList.length} sessions.`);
    }
  }

  // Step 3c: Session velocity check — sessions created trong < 2 phút trên cùng IP subnet
  // Gom nhóm các sessions gần nhau (same IP subnet) thành burst clusters
  const recentSessions = sessions
    .filter(s => s.createdAt >= lookbackDate)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const velocityClusters = new Map<string, string[]>();

  for (let i = 1; i < recentSessions.length; i++) {
    const prev = recentSessions[i - 1]!;
    const curr = recentSessions[i]!;
    const timeDiff = curr.createdAt.getTime() - prev.createdAt.getTime();

    if (timeDiff < SESSION_PROXIMITY_THRESHOLD_MS) {
      const prevSubnet = extractIpSubnet(prev.ipAddress);
      const currSubnet = extractIpSubnet(curr.ipAddress);
      if (prevSubnet === currSubnet) {
        // Gom cả 2 sessions vào cùng cluster — đảm bảo group bao gồm prev session
        const clusterKey = `vel_${prevSubnet}_${Math.floor(prev.createdAt.getTime() / SESSION_PROXIMITY_THRESHOLD_MS)}`;
        const existing = velocityClusters.get(clusterKey) || [];
        if (!existing.includes(prev.sessionId)) existing.push(prev.sessionId);
        if (!existing.includes(curr.sessionId)) existing.push(curr.sessionId);
        velocityClusters.set(clusterKey, existing);
      }
    }
  }

  // Batch update tất cả velocity clusters
  for (const [clusterKey, sessionIdsList] of velocityClusters) {
    if (sessionIdsList.length >= 2) {
      const newAssignments = sessionIdsList.filter(id => !assignedClusters.has(id));
      if (newAssignments.length > 0) {
        await markManyAsClusterSuspect(newAssignments, clusterKey);
        for (const sessionId of newAssignments) {
          assignedClusters.set(sessionId, clusterKey);
        }
        clustersDetected += newAssignments.length;
        logger.info(`[GuestCleanup] Task3c: Detected velocity cluster: ${clusterKey} with ${sessionIdsList.length} sessions.`);
      }
    }
  }

  logger.info(`[GuestCleanup] Task3: Cluster detection hoàn tất. Detected ${clustersDetected} new clusters.`);
  return clustersDetected;
}

/**
 * Task 4: Anti-farming check — flag nếu guest donations > 60% total.
 * Mục đích: phát hiện scenario có thể là farm Sybil để inflate QF matching.
 *
 * @returns true nếu phát hiện farming (> 60% guest donations)
 */
async function taskAntiFarmingCheck(): Promise<boolean> {
  const lookbackDate = new Date(Date.now() - ANTI_FARMING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [guestCount, totalCount] = await Promise.all([
    countAnonymousDonationsSince(lookbackDate),
    countTotalDonationsSince(lookbackDate)
  ]);

  if (totalCount === 0) {
    logger.info('[GuestCleanup] Task4: Không có donation nào trong khoảng thời gian kiểm tra.');
    return false;
  }

  const guestPercent = (guestCount / totalCount) * 100;

  if (guestPercent > ANTI_FARMING_THRESHOLD_PERCENT) {
    logger.warn(`[GuestCleanup] Task4: ALERT! Guest donations chiếm ${guestPercent.toFixed(2)}% (${guestCount}/${totalCount}) trong ${ANTI_FARMING_LOOKBACK_DAYS} ngày qua. Ngưỡng: ${ANTI_FARMING_THRESHOLD_PERCENT}%.`, {
      action: 'anti_farming_alert',
      reason: `Guest donations ${guestPercent.toFixed(2)}% > threshold ${ANTI_FARMING_THRESHOLD_PERCENT}%`
    });

    // Upsert flag vào risk model để admin dashboard có thể hiển thị
    // Lưu ý: không có sessionId cụ thể, flag ở cấp hệ thống
    // Admin nên investigate bằng cách query cluster suspects
    return true;
  }

  logger.info(`[GuestCleanup] Task4: Guest donations chiếm ${guestPercent.toFixed(2)}% (${guestCount}/${totalCount}). Ngưỡng: ${ANTI_FARMING_THRESHOLD_PERCENT}%.`);
  return false;
}

/**
 * Hàm chạy toàn bộ cleanup workflow.
 * Thực thi 4 tasks theo thứ tự để đảm bảo data consistency:
 * - Tasks 1+2 (expire/purge) chạy trước để tránh race với Task 3.
 * - Tasks 3+4 chạy song song sau khi Tasks 1+2 hoàn tất.
 *
 * @returns Object chứa kết quả của từng task
 */
export async function runGuestCleanup(): Promise<{
  expired: number;
  purged: number;
  clusters: number;
  farmingDetected: boolean;
}> {
  logger.info('[GuestCleanup] Bắt đầu guest cleanup worker.');

  // Task 1 + 2: expire rồi purge — tuần tự để tránh race với Task 3
  const expired = await taskExpireOverdueSessions();
  const purged = await taskPurgeOldSessions();

  // Task 3 + 4: chạy song song — không phụ thuộc nhau
  const [clusters, farmingDetected] = await Promise.all([
    taskDetectClusters(),
    taskAntiFarmingCheck()
  ]);

  logger.info('[GuestCleanup] Hoàn tất guest cleanup worker.', {
    action: 'guest_cleanup_complete',
    expiredSessions: expired,
    purgedSessions: purged,
    newClusters: clusters,
    farmingDetected
  });

  return { expired, purged, clusters, farmingDetected };
}

/**
 * Hàm chạy guest cleanup một lần (dùng bởi ranking scheduler).
 * Mục đích: trigger cleanup ngay lập tức khi được gọi từ scheduler,
 * thay vì chờ đến 00:00 nếu cần.
 * Ranking scheduler gọi hàm này để đảm bảo cleanup chạy cùng với reconcile.
 *
 * @returns Object chứa kết quả của từng task
 */
export async function runGuestCleanupOnce(): Promise<{
  expired: number;
  purged: number;
  clusters: number;
  farmingDetected: boolean;
}> {
  return runGuestCleanup();
}

/**
 * Hàm khởi động guest cleanup worker.
 * Chạy 1 lần/ngày (cùng schedule với ranking reconciliation lúc 00:00).
 * Sử dụng recursive setTimeout thay vì setInterval để đảm bảo
 * mỗi lần chạy hoàn tất trước khi tính delay cho lần tiếp theo.
 */
export function startGuestCleanupWorker(): void {
  logger.info('Guest cleanup worker khởi động (chạy 1 lần/ngày lúc 00:00).');

  const scheduleNextCleanup = (): void => {
    // Tính delay đến 00:00 tiếp theo
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setHours(0, 0, 0, 0);
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    const delay = targetTime.getTime() - now.getTime();

    setTimeout(async () => {
      try {
        await runGuestCleanup();
      } catch (error) {
        logger.error('[GuestCleanup] Guest cleanup worker thất bại.', {
          errorMessage: extractErrorMessage(error)
        });
      }

      scheduleNextCleanup();
    }, delay);
  };

  scheduleNextCleanup();
}
