import { Router } from 'express';
import { createAuthenticationMiddleware } from '../middleware/authenticationMiddleware';
import { createRoleAuthorizationMiddleware } from '../middleware/roleAuthorizationMiddleware';
import {
  handleCreateDisbursementRequest,
  handleGetMyDisbursements,
  handleGetPendingDisbursements,
  handleGetDisbursementRequestSummaries,
  handleGetDisbursementDetail,
  handleGetDisbursementsByProject,
  handleGetMaxWithdrawable,
  handleSignDisbursementRequest,
  handleRejectDisbursementRequest
} from '../controllers/disbursementController';

/**
 * Hàm khởi tạo router cho module disbursement.
 * Mục đích: tạo các endpoint API giải ngân multisig theo chuẩn MVC.
 */
export function createDisbursementRoutes(): Router {
  const router = Router();
  const authenticationMiddleware = createAuthenticationMiddleware();

  /**
   * POST /api/disbursement/create
   * Tao yeu cau rut tien (UC7.1).
   * Quyen: organizations (da KYC + Bank Account APPROVED).
   */
  router.post(
    '/create',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['organizations']),
    handleCreateDisbursementRequest
  );

  /**
   * GET /api/disbursement/me
   * Lay danh sach yeu cau cua to chuc.
   * Quyen: organizations.
   */
  router.get(
    '/me',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['organizations']),
    handleGetMyDisbursements
  );

  /**
   * GET /api/disbursement/pending
   * Lay danh sach yeu cau cho ky duyet.
   * Quyen: admin, regulatory.
   */
  router.get(
    '/requests',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['admin', 'regulatory']),
    handleGetDisbursementRequestSummaries
  );

  router.get(
    '/pending',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['admin', 'regulatory']),
    handleGetPendingDisbursements
  );

  /**
   * GET /api/disbursement/:requestId
   * Lay chi tiet yeu cau.
   * Quyen: admin, regulatory, organizations.
   */
  router.get(
    '/:requestId',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['admin', 'regulatory', 'organizations']),
    handleGetDisbursementDetail
  );

  /**
   * POST /api/disbursement/:requestId/sign
   * Ky duyet yeu cau rut tien (UC7.2).
   * Quyen: admin, regulatory, organizations.
   */
  router.post(
    '/:requestId/sign',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['admin', 'regulatory', 'organizations']),
    handleSignDisbursementRequest
  );

  /**
   * POST /api/disbursement/:requestId/reject
   * Tu choi yeu cau rut tien.
   * Quyen: admin, regulatory (organizations chi duoc reject request khong phai cua minh).
   */
  router.post(
    '/:requestId/reject',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['admin', 'regulatory', 'organizations']),
    handleRejectDisbursementRequest
  );

  /**
   * GET /api/disbursement/project/:projectId
   * Lay lich su giai ngan theo du an.
   * Quyen: cong khai (khong can dang nhap).
   */
  router.get(
    '/project/:projectId',
    handleGetDisbursementsByProject
  );

  /**
   * GET /api/disbursement/max-withdrawable/:projectId
   * Lay so du kha dung toi da.
   * Quyen: organizations.
   */
  router.get(
    '/max-withdrawable/:projectId',
    authenticationMiddleware,
    createRoleAuthorizationMiddleware(['organizations']),
    handleGetMaxWithdrawable
  );

  return router;
}
