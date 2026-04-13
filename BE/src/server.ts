import 'dotenv/config';
import application from './app';
import { connectToMongoDb } from './config/mongodb';
import { connectToRedisSafely } from './config/redis';
import { startRankingWorker } from './workers/rankingWorker';
import { startRankingScheduler } from './workers/rankingScheduler';

const serverPort = Number(process.env.PORT) || 4000;

/**
 * Hàm khởi động server Node.js.
 * Mục đích: khởi tạo kết nối MongoDB + Redis trước, sau đó khởi động worker và lắng nghe cổng HTTP.
 */
async function startServer(): Promise<void> {
  await connectToMongoDb();
  await connectToRedisSafely();

  startRankingWorker();
  // Ghi chú logic phức tạp: khởi động scheduler định kỳ 5 phút để đảm bảo bảng xếp hạng
  // luôn được cập nhật, bất kể có donation mới hay không (UC4.1 trigger: "mỗi 5 phút").
  startRankingScheduler();

  application.listen(serverPort, () => {
    console.log(`Server running on port ${serverPort}`);
  });
}

startServer().catch((error: Error) => {
  console.error('Server failed to start.', error.message);
});

