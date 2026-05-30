import { getLogger } from '../config/logger';
import { reconcileAllProjectMetrics } from '../services/rankingIncrementalService';
import { runGuestCleanupOnce } from './guestCleanupWorker';

/**
 * Thời điểm chạy reconcile mỗi ngày: 00:00 (nửa đêm).
 * Đặt vào lúc ít người dùng nhất để giảm tải MongoDB khi full recompute.
 */
const RECONCILE_SCHEDULE_HOUR = 0;
const RECONCILE_SCHEDULE_MINUTE = 0;

/**
 * Cửa sổ thời gian tính toán QF (720 giờ = 30 ngày).
 * Dùng cùng giá trị với scheduler cũ để đảm bảo consistency.
 */
const DEFAULT_WINDOW_HOURS = 720;

const logger = getLogger();

/**
 * Hàm kiểm tra xem đã đến thời điểm chạy reconcile chưa.
 * Mục đích: chỉ chạy reconcile vào lúc 00:00 mỗi ngày.
 */
function isReconcileTime(): boolean {
  const now = new Date();
  return now.getHours() === RECONCILE_SCHEDULE_HOUR && now.getMinutes() === RECONCILE_SCHEDULE_MINUTE;
}

/**
 * Hàm chờ đến thời điểm reconcile tiếp theo trong ngày.
 * Mục đích: tính delay (miligiây) để setTimeout tiếp theo rơi vào 00:00.
 */
function calculateDelayUntilReconcileTime(): number {
  const now = new Date();
  const targetTime = new Date(now);
  targetTime.setHours(RECONCILE_SCHEDULE_HOUR, RECONCILE_SCHEDULE_MINUTE, 0, 0);

  // Nếu đã qua thời điểm hôm nay → lên lịch cho ngày mai
  if (targetTime <= now) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  return targetTime.getTime() - now.getTime();
}

/**
 * Hàm khởi động reconcile worker cho bảng xếp hạng QF.
 * Mục đích: chạy full recompute cho TẤT CẢ projects mỗi ngày (00:00) để ngăn drift.
 *
 * So với approach cũ:
 *   - rankingScheduler: chạy mỗi 5 phút, query TOÀN BỘ donations → bottleneck
 *   - rankingReconcileWorker: chạy 1 lần/ngày, query donations THEO TỪNG PROJECT → O(P × D_project)
 *
 * Lưu ý:
 *   - Incremental update xử lý donation mới O(1) — không cần scheduler 5 phút.
 *   - Reconcile worker xử lý drift prevention — chạy 1 lần/ngày là đủ.
 *   - Nếu reconcile worker thất bại, ngày hôm sau sẽ retry — không cần retry trong ngày.
 */
export function startRankingReconcileWorker(): void {
  logger.info('Ranking reconcile worker khởi động (chạy 00:00 mỗi ngày).');

  // Hàm đệ quy để lên lịch reconcile tiếp theo
  const scheduleNextReconcile = (): void => {
    const delay = calculateDelayUntilReconcileTime();

    setTimeout(async () => {
      try {
        if (isReconcileTime()) {
          logger.info('Ranking reconcile worker bắt đầu reconcile ngày.');
          // Reconcile metrics và cleanup guest sessions chạy song song — không phụ thuộc nhau
          await Promise.all([
            reconcileAllProjectMetrics(DEFAULT_WINDOW_HOURS),
            runGuestCleanupOnce()
          ]);
          logger.info('Ranking reconcile worker hoàn tất reconcile ngày.');
        }
      } catch (error) {
        logger.error('Ranking reconcile worker thất bại.', {
          errorMessage: (error as Error).message
        });
      }

      // Lên lịch cho lần tiếp theo
      scheduleNextReconcile();
    }, delay);
  };

  scheduleNextReconcile();
}
