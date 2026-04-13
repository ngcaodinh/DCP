import { Response } from 'express';
import { getLogger } from '../config/logger';
import { AuthenticatedRequest } from '../middleware/authenticationMiddleware';
import { getCurrentRankingSnapshotPaginated, recalculateRankingSnapshot } from '../services/rankingService';
import { buildRankingCacheKey, getRankingResponseCache, invalidateRankingCache, setRankingResponseCache } from '../services/rankingCacheService';
import { sendErrorFromUnknown, sendErrorResponse, sendSuccessResponse } from '../utils/apiResponse';

const logger = getLogger();

/** Hàm parse số nguyên dương từ query. Mục đích: dùng chung cho validate input API ranking. */
function parsePositiveInteger(value: unknown): number | null {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }
  return parsedValue;
}

/** Hàm xử lý request cập nhật lại bảng xếp hạng. Mục đích: cho phép admin trigger UC4.1 theo nhu cầu vận hành, đồng thời xóa cache cũ. */
export async function handleRecalculateRankingSnapshot(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  const requestedWindowHours = parsePositiveInteger(request.body?.windowHours) ?? 720;

  try {
    const rankingSnapshot = await recalculateRankingSnapshot(requestedWindowHours);

    // Ghi chú logic phức tạp: sau khi recalculate xong, xóa toàn bộ cache ranking để GET /rankings trả dữ liệu mới.
    // Nếu Redis lỗi, vẫn tiếp tục trả response thành công — fallback in-memory cache sẽ tự dọn.
    await invalidateRankingCache();

    sendSuccessResponse(response, 200, 'Cập nhật bảng xếp hạng QF thành công.', rankingSnapshot);
  } catch (error) {
    logger.error('Cập nhật bảng xếp hạng QF thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể cập nhật bảng xếp hạng QF.');
  }
}

/** Hàm xử lý request lấy bảng xếp hạng hiện tại. Mục đích: trả dữ liệu ranking có phân trang và sắp xếp cho frontend, có Redis cache. */
export async function handleGetCurrentRankingSnapshot(request: AuthenticatedRequest, response: Response): Promise<void> {
  const pageNumber = parsePositiveInteger(request.query.page) ?? 1;
  const limitCount = parsePositiveInteger(request.query.limit) ?? 10;
  const sortBy = String(request.query.sortBy || 'rankPosition');
  const sortDirection = String(request.query.sortDirection || 'asc');

  const allowedSortByList = ['rankPosition', 'totalFundingScore', 'totalRaisedAmount', 'uniqueDonorCount'];
  if (!allowedSortByList.includes(sortBy)) {
    sendErrorResponse(response, 400, 'Tham số sortBy không hợp lệ.', 'VALIDATION_ERROR');
    return;
  }
  if (!['asc', 'desc'].includes(sortDirection)) {
    sendErrorResponse(response, 400, 'Tham số sortDirection không hợp lệ.', 'VALIDATION_ERROR');
    return;
  }

  const cacheKey = buildRankingCacheKey(`page=${pageNumber}&limit=${limitCount}&sortBy=${sortBy}&sortDirection=${sortDirection}`);

  // Ghi chú logic phức tạp: ưu tiên đọc từ Redis cache trước để giảm tải MongoDB.
  // Nếu cache miss, truy vấn DB rồi lưu lại vào cache với TTL ngắn.
  try {
    const cachedJsonPayload = await getRankingResponseCache(cacheKey);
    if (cachedJsonPayload) {
      const cachedPayload = JSON.parse(cachedJsonPayload);
      sendSuccessResponse(response, 200, 'Lấy bảng xếp hạng QF thành công (từ cache).', cachedPayload);
      return;
    }

    const rankingResult = await getCurrentRankingSnapshotPaginated({
      page: pageNumber,
      limit: limitCount,
      sortBy: sortBy as 'rankPosition' | 'totalFundingScore' | 'totalRaisedAmount' | 'uniqueDonorCount',
      sortDirection: sortDirection as 'asc' | 'desc'
    });

    // Ghi chú logic phức tạp: lưu response JSON vào cache sau khi truy vấn DB thành công.
    // Nếu Redis lỗi, fallback sang in-memory cache vẫn hoạt động.
    await setRankingResponseCache(cacheKey, JSON.stringify(rankingResult));
    sendSuccessResponse(response, 200, 'Lấy bảng xếp hạng QF thành công.', rankingResult);
  } catch (error) {
    logger.error('Lấy bảng xếp hạng QF thất bại.', { errorMessage: (error as Error).message });
    sendErrorFromUnknown(response, error, 'Không thể lấy bảng xếp hạng QF.');
  }
}
