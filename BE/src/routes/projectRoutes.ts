import { Router } from 'express';
import {
  handleCreateProject,
  handleGetCreateProjectEligibility,
  handleGetOrganizationProjects,
  handleGetPendingApprovalProjects,
  handleReviewProject,
  handleSubmitProject,
  handleUpdateProject,
  handleUploadProjectEvidences
} from '../controllers/projectController';
import { createAuthenticationMiddleware } from '../middleware/authenticationMiddleware';
import { attachRequestMetadata } from '../middleware/ipMetadataMiddleware';
import { createRateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { createRoleAuthorizationMiddleware } from '../middleware/roleAuthorizationMiddleware';

/** Hàm khởi tạo route cho module project. Mục đích: gom API create, submit và review dự án. */
export function createProjectRoutes(): Router {
  const router = Router();
  const authenticationMiddleware = createAuthenticationMiddleware();
  const createProjectRateLimit = createRateLimitMiddleware(10, 60 * 1000);
  const submitProjectRateLimit = createRateLimitMiddleware(20, 60 * 1000);
  const updateProjectRateLimit = createRateLimitMiddleware(20, 60 * 1000);
  const reviewProjectRateLimit = createRateLimitMiddleware(30, 60 * 1000);
  const organizationAuthorizationMiddleware = createRoleAuthorizationMiddleware(['organizations']);
  const reviewerAuthorizationMiddleware = createRoleAuthorizationMiddleware(['admin', 'regulatory']);

  router.get(
    '/',
    attachRequestMetadata(),
    authenticationMiddleware,
    organizationAuthorizationMiddleware,
    createProjectRateLimit,
    handleGetOrganizationProjects
  );

  router.post(
    '/',
    attachRequestMetadata(),
    authenticationMiddleware,
    organizationAuthorizationMiddleware,
    createProjectRateLimit,
    handleCreateProject
  );

  router.get(
    '/create-eligibility',
    attachRequestMetadata(),
    authenticationMiddleware,
    organizationAuthorizationMiddleware,
    createProjectRateLimit,
    handleGetCreateProjectEligibility
  );

  router.post(
    '/evidences/upload',
    attachRequestMetadata(),
    authenticationMiddleware,
    organizationAuthorizationMiddleware,
    createProjectRateLimit,
    handleUploadProjectEvidences
  );

  router.get(
    '/pending-approval',
    attachRequestMetadata(),
    authenticationMiddleware,
    reviewerAuthorizationMiddleware,
    reviewProjectRateLimit,
    handleGetPendingApprovalProjects
  );

  router.post(
    '/submit',
    attachRequestMetadata(),
    authenticationMiddleware,
    organizationAuthorizationMiddleware,
    submitProjectRateLimit,
    handleSubmitProject
  );

  router.patch(
    '/',
    attachRequestMetadata(),
    authenticationMiddleware,
    organizationAuthorizationMiddleware,
    updateProjectRateLimit,
    handleUpdateProject
  );

  router.post(
    '/review',
    attachRequestMetadata(),
    authenticationMiddleware,
    reviewerAuthorizationMiddleware,
    reviewProjectRateLimit,
    handleReviewProject
  );

  return router;
}

