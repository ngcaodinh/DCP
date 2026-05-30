import compression from 'compression';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
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

/** Hàm cấu hình middleware chính cho ứng dụng. Mục đích: áp dụng bảo mật, tối ưu hiệu năng và parse request body cho toàn hệ thống. */
function configureMiddlewares(): void {
  const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000';
  const allowedOriginList = allowedOriginsEnv.split(',').map(origin => origin.trim());
  const requestBodyLimit = getRequestBodyLimit();

  application.disable('x-powered-by');
  application.set('trust proxy', 1);

  application.use(
    cors({
      origin: (incomingOrigin, callback) => {
        // Cho phép null origin (mobile apps, server-to-server) và các origin trong whitelist
        if (!incomingOrigin || allowedOriginList.includes(incomingOrigin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin '${incomingOrigin}' not allowed`));
        }
      },
      credentials: true
    })
  );
  application.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        }
      },
      noSniff: true,
      xFrameOptions: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
      xPermittedCrossDomainPolicies: { permittedPolicies: 'none' }
    })
  );
  application.use(compression());
  application.use(applyApiResponseTimeHeader);
  application.use(applySeoAndCacheHeaders);

  // Logic này giữ giới hạn body thống nhất giữa local và production để tránh OOM trên VPS ít RAM.
  application.use(express.json({ limit: requestBodyLimit }));
  application.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
}

/** Hàm lấy giới hạn body request từ biến môi trường. Mục đích: tách cấu hình local và production mà không hardcode trong code. */
function getRequestBodyLimit(): string {
  return process.env.REQUEST_BODY_LIMIT || '5mb';
}

/** Hàm kiểm tra request có phải API công khai hay không. Mục đích: áp dụng cache và X-Robots-Tag đúng phạm vi cần thiết. */
function isPublicApiRoute(request: Request): boolean {
  return (
    request.path.startsWith('/health') ||
    request.path.startsWith('/projects') ||
    request.path.startsWith('/donations') ||
    request.path.startsWith('/rankings')
  );
}

/** Hàm kiểm tra request có phải SSE public hay không. Mục đích: tắt cache/buffering cho stream realtime để tránh trễ dữ liệu. */
function isPublicSseRoute(request: Request): boolean {
  return request.path === '/donations/live-feed/stream';
}

/** Hàm kiểm tra request có phải guest API hay không. Mục đích: áp dụng Cache-Control no-store cho guest endpoints để tránh lưu cache dữ liệu nhạy cảm. */
function isGuestApiRoute(request: Request): boolean {
  return request.path.startsWith('/api/guest');
}

/** Hàm gắn header đo thời gian phản hồi. Mục đích: hỗ trợ theo dõi hiệu năng API trong production và qua reverse proxy. */
function applyApiResponseTimeHeader(request: Request, response: Response, next: NextFunction): void {
  const requestStartTime = process.hrtime.bigint();
  const originalWriteHead = response.writeHead.bind(response) as Response['writeHead'];

  response.writeHead = ((...argumentsList: unknown[]) => {
    const responseTimeInMilliseconds = Number(process.hrtime.bigint() - requestStartTime) / 1_000_000;
    response.setHeader('Server-Timing', `app;dur=${responseTimeInMilliseconds.toFixed(2)}`);
    response.setHeader('X-Response-Time', `${responseTimeInMilliseconds.toFixed(2)}ms`);
    return originalWriteHead(...(argumentsList as Parameters<Response['writeHead']>));
  }) as Response['writeHead'];

  next();
}

/** Hàm gắn header SEO và cache cho API. Mục đích: ngăn index endpoint nhạy cảm và tối ưu cache cho dữ liệu công khai phù hợp. */
function applySeoAndCacheHeaders(request: Request, response: Response, next: NextFunction): void {
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (isGuestApiRoute(request)) {
    // Guest API routes must never be cached — contains wallet/session data
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.setHeader('Surrogate-Control', 'no-store');
  } else if (isPublicSseRoute(request)) {
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
  } else if (request.method === 'GET' && isPublicApiRoute(request)) {
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  } else {
    response.setHeader('Cache-Control', 'no-store');
  }

  next();
}

/** Hàm khai báo các tuyến chính của ứng dụng. Mục đích: tách riêng các module theo chuẩn MVC. */
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

