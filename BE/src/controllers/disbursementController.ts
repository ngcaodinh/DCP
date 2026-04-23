import { Request, Response } from 'express';
import { getLogger } from '../config/logger';
import { ApplicationError } from '../utils/applicationError';
import {
  createDisbursementRequest,
  CreateDisbursementPayload,
  getDisbursementsForOrganization,
  getDisbursementsForReview,
  getDisbursementRequestSummaries,
  getDisbursementDetail,
  getDisbursementsByProject,
  getMaxWithdrawableAmount,
  signDisbursementRequest,
  rejectDisbursementRequest
} from '../services/disbursementService';

const logger = getLogger();

// ============ UC7.1: TẠO YÊU CẦU RÚT TIỀN ============

/**
 * POST /api/disbursement/create
 * Tạo yêu cầu rút tiền mới.
 * Actor: Tổ chức từ thiện (organizations).
 * Body: { projectId, amount, usagePurpose, evidenceCid, requestMode, emergencyReason?, beneficiaryBankAccount }
 */
export async function handleCreateDisbursementRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).authenticatedUser?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập.' });
      return;
    }

    const payload: CreateDisbursementPayload = {
      projectId: req.body.projectId,
      amount: req.body.amount,
      usagePurpose: req.body.usagePurpose,
      evidenceCid: req.body.evidenceCid,
      requestMode: req.body.requestMode,
      emergencyReason: req.body.emergencyReason,
      beneficiaryBankAccount: req.body.beneficiaryBankAccount
    };

    const result = await createDisbursementRequest(userId, payload);
    logger.info(`Disbursement request created. requestId=${result.requestId} userId=${userId}`);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Yêu cầu rút tiền đã được tạo thành công. Đang chờ ký duyệt theo ngưỡng chữ ký động của request.'
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleCreateDisbursementRequest failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi tạo yêu cầu rút tiền.' });
    }
  }
}

// ============ UC7.2: KÝ DUYỆT YÊU CẦU RÚT TIỀN ============

/**
 * POST /api/disbursement/:requestId/sign
 * Ký duyệt yêu cầu rút tiền.
 * Actor: Admin hệ thống / Đại diện tổ chức từ thiện / Cơ quan giám sát.
 * Body: { comment? }
 */
export async function handleSignDisbursementRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).authenticatedUser?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập.' });
      return;
    }

    const { requestId } = req.params;
    const { comment } = req.body as { comment?: string };

    if (!requestId) {
      res.status(400).json({ error: 'Thiếu requestId bắt buộc.' });
      return;
    }

    const result = await signDisbursementRequest(userId, requestId, comment);
    logger.info(`Disbursement signed. requestId=${requestId} userId=${userId}`);

    res.status(200).json({
      success: true,
      data: result,
      message: result.status === 'APPROVED'
        ? `Đã đủ chữ ký (${result.approvals.length}/${result.requiredApprovals}). Hệ thống đang tự động thực thi chuyển khoản FR8.`
        : `Chữ ký của bạn đã được ghi nhận (${result.approvals.length}/${result.requiredApprovals}).`
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleSignDisbursementRequest failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi ký duyệt.' });
    }
  }
}

/**
 * POST /api/disbursement/:requestId/reject
 * Từ chối yêu cầu rút tiền.
 * Actor: Admin hệ thống / Đại diện tổ chức từ thiện / Cơ quan giám sát.
 * Body: { reason }
 */
export async function handleRejectDisbursementRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).authenticatedUser?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập.' });
      return;
    }

    const { requestId } = req.params;
    const { reason } = req.body as { reason: string };

    if (!requestId) {
      res.status(400).json({ error: 'Thiếu requestId bắt buộc.' });
      return;
    }

    if (!reason || reason.trim().length < 5) {
      res.status(400).json({ error: 'Lý do từ chối phải tối thiểu 5 ký tự.', code: 'VALIDATION_ERROR' });
      return;
    }

    const result = await rejectDisbursementRequest(userId, requestId, reason);
    logger.info(`Disbursement rejected. requestId=${requestId} userId=${userId}`);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Yêu cầu rút tiền đã bị từ chối.'
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleRejectDisbursementRequest failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi từ chối.' });
    }
  }
}

// ============ CÁC ENDPOINT TRUY VẤN ============

/**
 * GET /api/disbursement/me
 * Lấy danh sách yêu cầu của tổ chức đang đăng nhập.
 * Actor: Tổ chức từ thiện.
 */
export async function handleGetMyDisbursements(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).authenticatedUser?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập.' });
      return;
    }

    const result = await getDisbursementsForOrganization(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetMyDisbursements failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi lấy danh sách.' });
    }
  }
}

/**
 * GET /api/disbursement/pending
 * Lấy danh sách yêu cầu chờ ký duyệt.
 * Actor: Admin hệ thống / Cơ quan giám sát.
 */
export async function handleGetPendingDisbursements(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).authenticatedUser?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập.' });
      return;
    }

    const result = await getDisbursementsForReview(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetPendingDisbursements failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi lấy danh sách.' });
    }
  }
}

/**
 * GET /api/disbursement/requests
 * Lấy danh sách tóm tắt cho dashboard ký duyệt.
 * Actor: Admin hệ thống / Cơ quan giám sát.
 */
export async function handleGetDisbursementRequestSummaries(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).authenticatedUser?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập.' });
      return;
    }

    const requests = await getDisbursementRequestSummaries(userId);
    res.status(200).json({ success: true, data: { requests } });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetDisbursementRequestSummaries failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi lấy danh sách tóm tắt giải ngân.' });
    }
  }
}

/**
 * GET /api/disbursement/:requestId
 * Lấy chi tiết yêu cầu rút tiền.
 * Actor: Admin hệ thống / Cơ quan giám sát / Tổ chức từ thiện.
 */
export async function handleGetDisbursementDetail(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).authenticatedUser?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập.' });
      return;
    }

    const { requestId } = req.params;
    if (!requestId) {
      res.status(400).json({ error: 'Thiếu requestId bắt buộc.' });
      return;
    }

    const result = await getDisbursementDetail(userId, requestId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetDisbursementDetail failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi lấy chi tiết.' });
    }
  }
}

/**
 * GET /api/disbursement/project/:projectId
 * Lấy lịch sử giải ngân theo dự án.
 * Actor: Public (optional authentication).
 */
export async function handleGetDisbursementsByProject(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: 'Thiếu projectId bắt buộc.' });
      return;
    }

    const result = await getDisbursementsByProject(projectId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetDisbursementsByProject failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi lấy lịch sử giải ngân.' });
    }
  }
}

/**
 * GET /api/disbursement/max-withdrawable/:projectId
 * Lấy số dư khả dụng tối đa cho withdrawal.
 * Actor: Tổ chức từ thiện.
 */
export async function handleGetMaxWithdrawable(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: 'Thiếu projectId bắt buộc.' });
      return;
    }

    const result = await getMaxWithdrawableAmount(projectId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetMaxWithdrawable failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Lỗi server khi lấy số dư.' });
    }
  }
}
