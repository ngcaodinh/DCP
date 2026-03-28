import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAuthRoutes } from './routes/authRoutes';
import { createHealthRoutes } from './routes/healthRoutes';
import { createDepositRoutes } from './routes/depositRoutes';

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
  application.use(express.json());
}

/**
 * Hàm khai báo các tuyến chính của ứng dụng.
 * Mục đích: tách riêng các module theo chuẩn MVC.
 */
function registerRoutes(): void {
  application.use('/auth', createAuthRoutes());
  application.use('/health', createHealthRoutes());
  application.use('/api/deposit', createDepositRoutes());
}

configureMiddlewares();
registerRoutes();

export default application;

