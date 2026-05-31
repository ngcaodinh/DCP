/**
 * Route definitions cho guest session endpoints.
 * Tất cả các tuyến đều mount dưới /api/guest/*.
 *
 * Middleware chain:
 * - attachRequestMetadata: gắn IP + User-Agent vào headers
 * - createGuestLayer1RateLimitMiddleware: Lớp 1 anti-DDoS (in-memory)
 * - createGuestSessionRateLimitMiddleware: Lớp 2 business limit (Redis)
 * - createGuestAuthMiddleware: xác thực guest JWT
 * - createGuestDonationRateLimitMiddleware: Lớp 2 donation sponsor limit (Redis)
 * - createAuthenticationMiddleware: xác thực registered user JWT (cho claim endpoints)
 */
import { Router } from 'express';
import {
  handleCreateGuestSession,
  handleRefreshGuestSession,
  handleGetGuestSessionStatus,
  handleSponsorGuestPaymaster,
  handlePrepareGuestClaim,
  handleExecuteGuestClaim,
  handlePartialGuestClaim
} from '../controllers/guestSessionController';
import {
  handleGetPendingDonationStatus,
  handleClearPendingDonation
} from '../controllers/pendingDonationController';
import {
  createGuestLayer1RateLimitMiddleware,
  createGuestSessionRateLimitMiddleware,
  createGuestDonationRateLimitMiddleware
} from '../middleware/guestRateLimitMiddleware';
import { createGuestAuthMiddleware } from '../middleware/guestAuthMiddleware';
import { createAuthenticationMiddleware } from '../middleware/authenticationMiddleware';
import { attachRequestMetadata } from '../middleware/ipMetadataMiddleware';

/**
 * Hàm khởi tạo router cho guest endpoints.
 * Mục đích: gom các tuyến guest wallet theo chuẩn MVC.
 */
export function createGuestRoutes(): Router {
  const router = Router();

  const layer1RateLimit = createGuestLayer1RateLimitMiddleware();
  const sessionRateLimit = createGuestSessionRateLimitMiddleware();
  const guestAuth = createGuestAuthMiddleware();
  const donationRateLimit = createGuestDonationRateLimitMiddleware();
  const metadata = attachRequestMetadata();
  const authMiddleware = createAuthenticationMiddleware();

  // POST /api/guest/session — tạo phiên guest wallet mới
  // Chain: metadata → layer1 → redis-session-limit → handler
  router.post(
    '/session',
    metadata,
    layer1RateLimit,
    sessionRateLimit,
    handleCreateGuestSession
  );

  // POST /api/guest/session/refresh — làm mới token
  // Chain: metadata → layer1 → auth → handler
  router.post(
    '/session/refresh',
    metadata,
    layer1RateLimit,
    guestAuth,
    handleRefreshGuestSession
  );

  // GET /api/guest/session/status — lấy trạng thái phiên
  // Chain: metadata → layer1 → auth → handler
  router.get(
    '/session/status',
    metadata,
    layer1RateLimit,
    guestAuth,
    handleGetGuestSessionStatus
  );

  // GET /api/guest/pending-donation — lấy trạng thái pending donation (Frontend Sweeper)
  // Chain: metadata → layer1 → auth → handler
  router.get(
    '/pending-donation',
    metadata,
    layer1RateLimit,
    guestAuth,
    handleGetPendingDonationStatus
  );

  // POST /api/guest/pending-donation/clear — xóa flag pending donation
  // Chain: metadata → layer1 → auth → handler
  router.post(
    '/pending-donation/clear',
    metadata,
    layer1RateLimit,
    guestAuth,
    handleClearPendingDonation
  );

  // POST /api/guest/paymaster/sponsor — sponsor Paymaster cho guest donation
  // Chain: metadata → layer1 → auth → donation-rate-limit → handler
  router.post(
    '/paymaster/sponsor',
    metadata,
    layer1RateLimit,
    guestAuth,
    donationRateLimit,
    handleSponsorGuestPaymaster
  );

  // POST /api/guest/claim/prepare — chuẩn bị claim EOA (Keyless Claim)
  // Chain: metadata → layer1 (anti-DDoS) → auth (registered user JWT) → handler
  router.post(
    '/claim/prepare',
    metadata,
    layer1RateLimit,
    authMiddleware,
    handlePrepareGuestClaim
  );

  // POST /api/guest/claim/execute — thực thi keyless claim
  // Chain: metadata → layer1 (anti-DDoS) → auth (registered user JWT) → handler
  router.post(
    '/claim/execute',
    metadata,
    layer1RateLimit,
    authMiddleware,
    handleExecuteGuestClaim
  );

  // POST /api/guest/claim/partial — partial claim (fallback khi owner key mất)
  // Chain: metadata → layer1 (anti-DDoS) → auth (registered user JWT) → handler
  router.post(
    '/claim/partial',
    metadata,
    layer1RateLimit,
    authMiddleware,
    handlePartialGuestClaim
  );

  return router;
}
