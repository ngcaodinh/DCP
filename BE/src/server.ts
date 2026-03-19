import 'dotenv/config';
import application from './app';
import { connectToMongoDb } from './config/mongodb';

const serverPort = Number(process.env.PORT) || 4000;

/**
 * Hàm khởi động server Node.js.
 * Mục đích: khởi tạo kết nối MongoDB trước khi lắng nghe cổng HTTP.
 */
async function startServer(): Promise<void> {
  await connectToMongoDb();
  application.listen(serverPort, () => {
    console.log(`Server running on port ${serverPort}`);
  });
}

startServer().catch((error: Error) => {
  console.error('Server failed to start.', error.message);
});

