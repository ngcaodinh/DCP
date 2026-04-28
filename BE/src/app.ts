import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAuthRoutes } from './routes/authRoutes';
import { createHealthRoutes } from './routes/healthRoutes';
import { createDepositRoutes } from './routes/depositRoutes';
import { createProjectRoutes } from './routes/projectRoutes';
import { createDonationRoutes } from './routes/donationRoutes';
import { createRankingRoutes } from './routes/rankingRoutes';
import { createSybilRoutes } from './routes/sybilRoutes';
import { createDisbursementRoutes } from './routes/disbursementRoutes';
import { createAdminDashboardRoutes } from './routes/adminDashboardRoutes';
import { createNotificationRoutes } from './routes/notificationRoutes';

const application = express();

/**
 * Hàm cấu hình middleware chính cho ứng dụng.
 * Mục đích: áp dụng bảo mật và parse JSON cho toàn hệ thống.
 */
function configureMiddlewares(): void {
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:3000';
  const requestBodyLimit = getRequestBodyLimit();

  application.use(
    cors({
      origin: allowedOrigin,
      credentials: true
    })
  );
  application.use(helmet());

  // Logic này giữ giới hạn body thống nhất giữa local và production để tránh OOM trên VPS ít RAM.
  application.use(express.json({ limit: requestBodyLimit }));
  application.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
}

/**
 * Hàm lấy giới hạn body request từ biến môi trường.
 * Mục đích: tách cấu hình local và production mà không hardcode trong code.
 */
function getRequestBodyLimit(): string {
  return process.env.REQUEST_BODY_LIMIT || '5mb';
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
  application.use('/api/sybil', createSybilRoutes());
  application.use('/api/disbursement', createDisbursementRoutes());
  application.use('/api/admin/dashboard', createAdminDashboardRoutes());
  application.use('/api/notifications', createNotificationRoutes());
}

configureMiddlewares();
registerRoutes();

export default application;
