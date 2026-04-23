import { Request, Response } from 'express';
import { getLogger } from '../config/logger';
import { ApplicationError } from '../utils/applicationError';
import {
  createDisbursementRequest,
  CreateDisbursementPayload,
  getDisbursementsForOrganization,
  getDisbursementsForReview,
  getDisbursementDetail,
  getDisbursementsByProject,
  getMaxWithdrawableAmount,
  signDisbursementRequest,
  rejectDisbursementRequest
} from '../services/disbursementService';

const logger = getLogger();

// ============ UC7.1: TAO YEU CAU RUT TIEN ============

/**
 * POST /api/disbursement/create
 * Tao yeu cau rut tien moi.
 * Actor: Tá»• chá»©c tá»« thiá»‡n (organizations).
 * Body: { projectId, amount, evidenceCid, beneficiaryBankAccount }
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
      evidenceCid: req.body.evidenceCid,
      beneficiaryBankAccount: req.body.beneficiaryBankAccount
    };

    const result = await createDisbursementRequest(userId, payload);
    logger.info(`Disbursement request created. requestId=${result.requestId} userId=${userId}`);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Yêu cầu rút tiền đã được tạo thành công. Đang chờ ký duyệt.'
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

// ============ UC7.2: KY DUYET YEU CAU RUT TIEN ============

/**
 * POST /api/disbursement/:requestId/sign
 * Ky duyet yeu cau rut tien.
 * Actor: Admin há»‡ thá»‘ng / Äáº¡i diá»‡n tá»• chá»©c tá»« thiá»‡n / CÆ¡ quan giÃ¡m sÃ¡t.
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
      res.status(400).json({ error: 'requestId is required.' });
      return;
    }

    const result = await signDisbursementRequest(userId, requestId, comment);
    logger.info(`Disbursement signed. requestId=${requestId} userId=${userId}`);

    res.status(200).json({
      success: true,
      data: result,
      message: result.status === 'APPROVED'
        ? 'Đã có đủ 2/3 chữ ký. Yêu cầu được phê duyệt và sẵn sàng giải ngân.'
        : 'Chữ ký của bạn đã được ghi nhận. Đang chờ các chữ ký còn lại.'
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
 * Tu choi yeu cau rut tien.
 * Actor: Admin há»‡ thá»‘ng / Äáº¡i diá»‡n tá»• chá»©c tá»« thiá»‡n / CÆ¡ quan giÃ¡m sÃ¡t.
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
      res.status(400).json({ error: 'requestId is required.' });
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

// ============ QUERY ENDPOINTS ============

/**
 * GET /api/disbursement/me
 * Lay danh sach yeu cau cua to chuc dang nhap.
 * Actor: Tá»• chá»©c tá»« thiá»‡n.
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
 * Lay danh sach yeu cau cho ky duyet.
 * Actor: Admin / Regulatory.
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
 * GET /api/disbursement/:requestId
 * Lay chi tiet yeu cau rut tien.
 * Actor: Admin / Regulatory / Organizations.
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
      res.status(400).json({ error: 'requestId is required.' });
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
 * Lay lich su giai ngan theo du an.
 * Actor: Public (optional authentication).
 */
export async function handleGetDisbursementsByProject(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required.' });
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
 * Lay so du kha dung toi da cho withdrawal.
 * Actor: Tá»• chá»©c tá»« thiá»‡n.
 */
export async function handleGetMaxWithdrawable(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required.' });
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
