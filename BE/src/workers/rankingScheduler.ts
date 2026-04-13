import { getRankingQueue } from '../queues/rankingQueue';
import { getLogger } from '../config/logger';
import { findCurrentRankingSnapshot } from '../repositories/rankingRepository';

const logger = getLogger();

/**
 * Khoảng thời gian giữa các lần chạy scheduler.
 * Giá trị 5 phút được lấy từ trigger trong UC4.1: "Có donation mới HOẶC mỗi 5 phút".
 */
const SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Ngưỡng thời gian tối đa (miligiây) mà snapshot được coi là "fresh".
 * Nếu snapshot đã cũ hơn ngưỡng này, scheduler sẽ trigger recalculate.
 * Bằng đúng SCHEDULE_INTERVAL_MS để đảm bảo luôn có ít nhất 1 recalculate trong mỗi chu kỳ.
 */
const MAX_SNAPSHOT_AGE_MS = SCHEDULE_INTERVAL_MS;

/**
 * Hàm kiểm tra xem snapshot hiện tại có cần recalculate không.
 * Mục đích: tránh spam Bull queue khi snapshot còn fresh.
 *
 * @returns true nếu cần recalculate (không có snapshot HOẶC snapshot đã cũ).
 */
async function shouldRecalculateRankingSnapshot(): Promise<boolean> {
  const latestSnapshot = await findCurrentRankingSnapshot();

  if (!latestSnapshot) {
    logger.info('Không có snapshot ranking. Scheduler sẽ trigger recalculate.');
    return true;
  }

  const snapshotAge = Date.now() - latestSnapshot.calculatedAt.getTime();
  if (snapshotAge > MAX_SNAPSHOT_AGE_MS) {
    logger.info(`Snapshot ranking đã cũ (age=${Math.round(snapshotAge / 1000)}s). Scheduler sẽ trigger recalculate.`);
    return true;
  }

  logger.info(`Snapshot ranking còn fresh (age=${Math.round(snapshotAge / 1000)}s). Bỏ qua scheduled recalculate.`);
  return false;
}

/**
 * Hàm khởi động scheduler cho bảng xếp hạng QF.
 * Mục đích: đảm bảo ranking được cập nhật định kỳ mỗi 5 phút theo UC4.1,
 * bất kể có donation mới hay không.
 *
 * Flow:
 * 1. Scheduler chạy mỗi 5 phút (setInterval).
 * 2. Kiểm tra xem snapshot hiện tại có còn fresh không.
 * 3. Nếu snapshot cũ hoặc không tồn tại → enqueue job vào Bull queue.
 * 4. Bull queue limiter đảm bảo tối đa 1 job chạy trong 60 giây.
 * 5. Worker thực thi recalculate và invalidate cache.
 */
export function startRankingScheduler(): void {
  setInterval(async () => {
    try {
      const needRecalculate = await shouldRecalculateRankingSnapshot();
      if (!needRecalculate) {
        return;
      }

      const rankingQueue = getRankingQueue();
      if (!rankingQueue) {
        logger.warn('Ranking queue không khả dụng. Scheduler không thể enqueue job.');
        return;
      }

      const scheduledJobId = `scheduled-ranking-${Date.now()}`;
      await rankingQueue.add(
        { windowHours: 720 },
        {
          jobId: scheduledJobId,
          removeOnComplete: 5,
          removeOnFail: 10
        }
      );

      logger.info(`Scheduled ranking recalculate job enqueued (jobId=${scheduledJobId}).`);
    } catch (error) {
      logger.error('Scheduled ranking recalculate job thất bại.', {
        errorMessage: (error as Error).message
      });
    }
  }, SCHEDULE_INTERVAL_MS);

  logger.info(`Ranking scheduler khởi động (interval=${SCHEDULE_INTERVAL_MS / 1000 / 60} phút, maxSnapshotAge=${MAX_SNAPSHOT_AGE_MS / 1000 / 60} phút).`);
}
