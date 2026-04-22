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
 * Actor: Tổ chức từ thiện (organizations).
 * Body: { projectId, amount, evidenceCid, beneficiaryBankAccount }
 */
export async function handleCreateDisbursementRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
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
      message: 'Yeu cau rut tien da duoc tao thanh cong. Dang cho ky duyet.'
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleCreateDisbursementRequest failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Loi server khi tao yeu cau rut tien.' });
    }
  }
}

// ============ UC7.2: KY DUYET YEU CAU RUT TIEN ============

/**
 * POST /api/disbursement/:requestId/sign
 * Ky duyet yeu cau rut tien.
 * Actor: Admin hệ thống / Đại diện tổ chức từ thiện / Cơ quan giám sát.
 * Body: { comment? }
 */
export async function handleSignDisbursementRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
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
        ? 'Da co du 2/3 chu ky. Yeu cau duoc phe duyet va san sang giai ngan.'
        : 'Chu ky cua ban da duoc ghi nhan. Dang cho cac chu ky con lai.'
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleSignDisbursementRequest failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Loi server khi ky duyet.' });
    }
  }
}

/**
 * POST /api/disbursement/:requestId/reject
 * Tu choi yeu cau rut tien.
 * Actor: Admin hệ thống / Đại diện tổ chức từ thiện / Cơ quan giám sát.
 * Body: { reason }
 */
export async function handleRejectDisbursementRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { requestId } = req.params;
    const { reason } = req.body as { reason: string };

    if (!requestId) {
      res.status(400).json({ error: 'requestId is required.' });
      return;
    }

    if (!reason || reason.trim().length < 5) {
      res.status(400).json({ error: 'Ly do tu choi phai toi thieu 5 ky tu.', code: 'VALIDATION_ERROR' });
      return;
    }

    const result = await rejectDisbursementRequest(userId, requestId, reason);
    logger.info(`Disbursement rejected. requestId=${requestId} userId=${userId}`);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Yeu cau rut tien da bi tu choi.'
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleRejectDisbursementRequest failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Loi server khi tu choi.' });
    }
  }
}

// ============ QUERY ENDPOINTS ============

/**
 * GET /api/disbursement/me
 * Lay danh sach yeu cau cua to chuc dang nhap.
 * Actor: Tổ chức từ thiện.
 */
export async function handleGetMyDisbursements(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await getDisbursementsForOrganization(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetMyDisbursements failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Loi server khi lay danh sach.' });
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
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await getDisbursementsForReview(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
    } else {
      logger.error(`handleGetPendingDisbursements failed. error=${(error as Error)?.message}`);
      res.status(500).json({ error: 'Loi server khi lay danh sach.' });
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
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
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
      res.status(500).json({ error: 'Loi server khi lay chi tiet.' });
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
      res.status(500).json({ error: 'Loi server khi lay lich su giai ngan.' });
    }
  }
}

/**
 * GET /api/disbursement/max-withdrawable/:projectId
 * Lay so du kha dung toi da cho withdrawal.
 * Actor: Tổ chức từ thiện.
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
      res.status(500).json({ error: 'Loi server khi lay so du.' });
    }
  }
}
