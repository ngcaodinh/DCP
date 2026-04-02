import { Router } from 'express';
import {
  handleGetCurrentUserProfile,
  handleGetMyOrganizationKycSubmissions,
  handleGetPendingOrganizationKycSubmissions,
  handleGoogleLogin,
  handleLogoutAll,
  handleOrganizationKycSubmission,
  handleRefreshToken,
  handleReviewOrganizationKycSubmission,
  handleSubmitBeneficiaryBankAccount
} from '../controllers/authController';
import { createRateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { createRefreshCsrfMiddleware } from '../middleware/csrfMiddleware';
import { attachRequestMetadata } from '../middleware/ipMetadataMiddleware';
import { createAuthenticationMiddleware } from '../middleware/authenticationMiddleware';

/**
 * Hàm khởi tạo route cho module auth.
 * Mục đích: gom các tuyến xác thực theo chuẩn MVC.
 */
export function createAuthRoutes(): Router {
  const router = Router();

  const refreshRateLimit = createRateLimitMiddleware(10, 60 * 1000);
  const loginRateLimit = createRateLimitMiddleware(5, 60 * 1000);
  const kycRateLimit = createRateLimitMiddleware(5, 60 * 1000);
  const authenticationMiddleware = createAuthenticationMiddleware();

  router.post('/google-login', attachRequestMetadata(), loginRateLimit, handleGoogleLogin);
  router.post(
    '/refresh',
    attachRequestMetadata(),
    refreshRateLimit,
    createRefreshCsrfMiddleware(),
    handleRefreshToken
  );

  router.get('/me', attachRequestMetadata(), authenticationMiddleware, handleGetCurrentUserProfile);
  router.post('/logout-all', attachRequestMetadata(), authenticationMiddleware, handleLogoutAll);
  router.post(
    '/organization/kyc-submissions',
    attachRequestMetadata(),
    authenticationMiddleware,
    kycRateLimit,
    handleOrganizationKycSubmission
  );
  router.get(
    '/organization/kyc-submissions/pending',
    attachRequestMetadata(),
    authenticationMiddleware,
    kycRateLimit,
    handleGetPendingOrganizationKycSubmissions
  );
  router.get(
    '/organization/kyc-submissions/me',
    attachRequestMetadata(),
    authenticationMiddleware,
    kycRateLimit,
    handleGetMyOrganizationKycSubmissions
  );
  router.post(
    '/organization/kyc-submissions/me/beneficiary-bank-account',
    attachRequestMetadata(),
    authenticationMiddleware,
    kycRateLimit,
    handleSubmitBeneficiaryBankAccount
  );
  router.patch(
    '/organization/kyc-submissions/:submissionId/review',
    attachRequestMetadata(),
    authenticationMiddleware,
    kycRateLimit,
    handleReviewOrganizationKycSubmission
  );

  return router;
}

