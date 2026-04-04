import { Response } from 'express';
import { getLogger } from '../config/logger';
import { AuthenticatedRequest } from '../middleware/authenticationMiddleware';
import {
  getDonationHistoryByProjectId,
  getPublicDonationCampaignDetail,
  getPublicDonationCampaigns,
  recordDonationFromTransactionHash,
  submitDonationViaRelay,
  syncDonationEventsFromBlockchain
} from '../services/donationService';
import { sendErrorFromUnknown, sendErrorResponse, sendSuccessResponse } from '../utils/apiResponse';

const logger = getLogger();

/** Hàm xử lý request lấy danh sách campaign quyên góp công khai. Mục đích: trả dữ liệu cho trang campaign UC3.1. */
export async function handleGetPublicDonationCampaigns(request: AuthenticatedRequest, response: Response): Promise<void> {
  const parsedLimitCount = Number(request.query.limit);

  try {
    const campaignList = await getPublicDonationCampaigns(parsedLimitCount);
    sendSuccessResponse(response, 200, 'Lấy danh sách chiến dịch quyên góp thành công.', campaignList);
  } catch (error) {
    logger.error('Lấy danh sách campaign quyên góp thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể lấy danh sách chiến dịch quyên góp.');
  }
}

/** Hàm xử lý request lấy chi tiết campaign theo projectId. Mục đích: trả dữ liệu trang chi tiết chiến dịch. */
export async function handleGetPublicDonationCampaignDetail(request: AuthenticatedRequest, response: Response): Promise<void> {
  const { projectId } = request.params;

  try {
    const campaignDetail = await getPublicDonationCampaignDetail(projectId);

    if (!campaignDetail) {
      sendSuccessResponse(response, 200, 'Không tìm thấy chiến dịch quyên góp.', null);
      return;
    }

    sendSuccessResponse(response, 200, 'Lấy chi tiết chiến dịch quyên góp thành công.', campaignDetail);
  } catch (error) {
    logger.error('Lấy chi tiết campaign quyên góp thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể lấy chi tiết chiến dịch quyên góp.');
  }
}

/** Hàm xử lý request lấy lịch sử donate theo projectId. Mục đích: trả dữ liệu minh bạch giao dịch public. */
export async function handleGetDonationHistoryByProjectId(request: AuthenticatedRequest, response: Response): Promise<void> {
  const { projectId } = request.params;
  const parsedLimitCount = Number(request.query.limit);

  try {
    const donationHistoryList = await getDonationHistoryByProjectId(projectId, parsedLimitCount);
    sendSuccessResponse(response, 200, 'Lấy lịch sử quyên góp thành công.', donationHistoryList);
  } catch (error) {
    logger.error('Lấy lịch sử quyên góp thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể lấy lịch sử quyên góp.');
  }
}

/** Hàm xử lý request gửi donate qua relay backend. Mục đích: thực thi donation không phụ thuộc MetaMask trên frontend. */
export async function handleSubmitDonationViaRelay(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  const { projectId, amount, isAnonymous } = request.body as { projectId?: string; amount?: number; isAnonymous?: boolean };

  try {
    const donationResult = await submitDonationViaRelay(String(projectId || ''), Number(amount || 0), Boolean(isAnonymous));
    sendSuccessResponse(response, 200, 'Gửi giao dịch quyên góp thành công.', donationResult);
  } catch (error) {
    logger.error('Gửi giao dịch quyên góp thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể gửi giao dịch quyên góp.');
  }
}

/** Hàm xử lý request ghi nhận donation bằng transaction hash từ ví người dùng. Mục đích: xác nhận giao dịch on-chain và index idempotent cho UC3.1. */
export async function handleRecordDonationFromTransactionHash(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  const { projectId, transactionHash, isAnonymous } = request.body as {
    projectId?: string;
    transactionHash?: string;
    isAnonymous?: boolean;
  };

  try {
    const recordResult = await recordDonationFromTransactionHash(
      String(projectId || ''),
      String(transactionHash || ''),
      Boolean(isAnonymous)
    );
    sendSuccessResponse(response, 200, 'Ghi nhận giao dịch quyên góp thành công.', recordResult);
  } catch (error) {
    logger.error('Ghi nhận giao dịch quyên góp thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể ghi nhận giao dịch quyên góp.');
  }
}


/** Hàm xử lý request đồng bộ event quyên góp từ blockchain. Mục đích: cho phép trigger indexer thủ công từ backend API. */
export async function handleSyncDonationEventsFromBlockchain(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  try {
    const syncResult = await syncDonationEventsFromBlockchain();
    sendSuccessResponse(response, 200, 'Đồng bộ event quyên góp thành công.', syncResult);
  } catch (error) {
    logger.error('Đồng bộ event quyên góp thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể đồng bộ event quyên góp từ blockchain.');
  }
}
