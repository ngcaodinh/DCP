import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAuthRoutes } from './routes/authRoutes';
import { createHealthRoutes } from './routes/healthRoutes';
import { createDepositRoutes } from './routes/depositRoutes';
import { createProjectRoutes } from './routes/projectRoutes';
import { createDonationRoutes } from './routes/donationRoutes';
import { createRankingRoutes } from './routes/rankingRoutes';

const application = express();

/**
 * Hàm cấu hình middleware chính cho ứng dụng.
 * Mục đích: áp dụng bảo mật và parse JSON cho toàn hệ thống.
 */
function configureMiddlewares(): void {
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:3000';

  application.use(
    cors({
      origin: allowedOrigin,
      credentials: true
    })
  );
  application.use(helmet());

  // Logic này tăng giới hạn body để hỗ trợ upload file minh chứng dạng base64 từ frontend.
  // Ghi chú: base64 làm kích thước payload tăng khoảng 33%, nên cần limit đủ lớn để tránh lỗi 413.
  application.use(express.json({ limit: '25mb' }));
  application.use(express.urlencoded({ extended: true, limit: '25mb' }));
}

/**
 * Hàm khai báo các tuyến chính của ứng dụng.
 * Mục đích: tách riêng các module theo chuẩn MVC.
 */
function registerRoutes(): void {
  application.use('/auth', createAuthRoutes());
  application.use('/health', createHealthRoutes());
  application.use('/api/deposit', createDepositRoutes());
  application.use('/projects', createProjectRoutes());
  application.use('/donations', createDonationRoutes());
  application.use('/rankings', createRankingRoutes());
}

configureMiddlewares();
registerRoutes();

export default application;

