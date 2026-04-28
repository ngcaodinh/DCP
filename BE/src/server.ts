import 'dotenv/config';
import application from './app';
import { connectToMongoDb } from './config/mongodb';
import { connectToRedisSafely } from './config/redis';
import { startRankingWorker } from './workers/rankingWorker';
import { startRankingScheduler } from './workers/rankingScheduler';
import { startRankingReconcileWorker } from './workers/rankingReconcileWorker';
import { startDisbursementTransferStatusSweepPolling } from './services/disbursementService';

const serverPort = Number(process.env.PORT) || 4000;

/**
 * Hàm kiểm tra có bật worker nền hay không.
 * Mục đích: tách process API và worker trong production nhưng vẫn giữ local chạy đủ luồng.
 */
function shouldRunWorkers(): boolean {
  return process.env.RUN_WORKERS !== 'false';
}

/**
 * Hàm khởi động các worker nền của hệ thống.
 * Mục đích: gom scheduler và polling vào một điểm để dễ kiểm soát trong production.
 */
function startBackgroundWorkers(): void {
  startRankingWorker();
  startRankingScheduler();
  // Ghi chú logic phức tạp: khởi động reconcile worker để full recompute tất cả projects
  // mỗi ngày lúc 00:00. Với incremental update, scheduler không còn cần recalc toàn bộ
  // donations mỗi 5 phút — donation mới được cập nhật O(1) ngay khi ghi nhận.
  // Reconcile worker đảm bảo metrics không drift theo thời gian.
  startRankingReconcileWorker();
  startDisbursementTransferStatusSweepPolling();
}

/**
 * Hàm khởi động server Node.js.
 * Mục đích: khởi tạo kết nối MongoDB + Redis trước, sau đó khởi động workers và lắng nghe cổng HTTP.
 */
async function startServer(): Promise<void> {
  await connectToMongoDb();
  await connectToRedisSafely();

  if (shouldRunWorkers()) {
    startBackgroundWorkers();
  }

  application.listen(serverPort, () => {
    console.log(`Server running on port ${serverPort}`);
  });
}

startServer().catch((error: Error) => {
  console.error('Server failed to start.', error.message);
});

