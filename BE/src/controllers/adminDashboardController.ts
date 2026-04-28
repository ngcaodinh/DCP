import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authenticationMiddleware';
import {
  getAdminDashboardAuditLogs,
  getAdminDashboardMetrics,
  getAdminDashboardTimelineEvents,
  getAdminSystemErrorLogs,
  type SystemErrorLogCategory,
  type SystemErrorLogReadStateFilter,
  updateAdminSystemErrorLogReadState
} from '../services/adminDashboardService';
import { sendErrorFromUnknown, sendErrorResponse, sendSuccessResponse } from '../utils/apiResponse';

/**
 * Hàm parse giá trị category cho API log lỗi.
 * Mục đích: chỉ cho phép lọc theo nhóm lỗi hợp lệ để tránh query sai ngữ nghĩa.
 */
function parseSystemErrorLogCategory(rawCategory: unknown): SystemErrorLogCategory | 'all' | null {
  if (typeof rawCategory === 'undefined' || rawCategory === null || rawCategory === '') {
    return 'all';
  }

  const normalizedCategory = String(rawCategory).trim();
  const allowedCategoryList: Array<SystemErrorLogCategory | 'all'> = [
    'all',
    'TRANSFER_TIMEOUT_15_MINUTES',
    'DEPOSIT',
    'DISBURSEMENT',
    'AUTH'
  ];

  return allowedCategoryList.includes(normalizedCategory as SystemErrorLogCategory | 'all')
    ? (normalizedCategory as SystemErrorLogCategory | 'all')
    : null;
}

/**
 * Hàm parse giá trị readState cho API log lỗi.
 * Mục đích: đồng bộ filter read/unread theo đúng các trạng thái backend hỗ trợ.
 */
function parseSystemErrorLogReadState(rawReadState: unknown): SystemErrorLogReadStateFilter | null {
  if (typeof rawReadState === 'undefined' || rawReadState === null || rawReadState === '') {
    return 'all';
  }

  const normalizedReadState = String(rawReadState).trim();
  const allowedReadStateList: SystemErrorLogReadStateFilter[] = ['all', 'read', 'unread'];

  return allowedReadStateList.includes(normalizedReadState as SystemErrorLogReadStateFilter)
    ? (normalizedReadState as SystemErrorLogReadStateFilter)
    : null;
}

/**
 * Hàm parse tham số limit cho API log lỗi.
 * Mục đích: giới hạn kích thước dữ liệu trả về, giảm rủi ro lạm dụng tài nguyên.
 */
function parseSystemErrorLogLimit(rawLimitCount: unknown): number | null {
  if (typeof rawLimitCount === 'undefined' || rawLimitCount === null || rawLimitCount === '') {
    return 100;
  }

  const parsedLimitCount = Number(rawLimitCount);
  if (!Number.isFinite(parsedLimitCount)) {
    return null;
  }

  const normalizedLimitCount = Math.floor(parsedLimitCount);
  if (normalizedLimitCount < 1 || normalizedLimitCount > 200) {
    return null;
  }

  return normalizedLimitCount;
}

/**
 * Hàm parse cờ isRead từ body request.
 * Mục đích: kiểm soát kiểu dữ liệu đầu vào khi cập nhật trạng thái đọc log lỗi.
 */
function parseSystemErrorLogReadFlag(rawIsRead: unknown): boolean | null {
  if (typeof rawIsRead === 'undefined') {
    return true;
  }

  if (typeof rawIsRead !== 'boolean') {
    return null;
  }

  return rawIsRead;
}

/**
 * Hàm xử lý request lấy metric tổng quan hệ thống cho admin.
 * Mục đích: trả số liệu thật phục vụ khối KPI của trang `/admin`.
 */
export async function handleGetAdminDashboardMetrics(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  try {
    const metrics = await getAdminDashboardMetrics();
    sendSuccessResponse(response, 200, 'Lấy metrics tổng quan hệ thống thành công.', metrics);
  } catch (error) {
    sendErrorFromUnknown(response, error, 'Không thể lấy metrics tổng quan hệ thống.');
  }
}

/**
 * Hàm xử lý request lấy timeline tổng quan cho admin.
 * Mục đích: trả danh sách hoạt động gần đây bằng dữ liệu thật từ backend.
 */
export async function handleGetAdminDashboardTimeline(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  try {
    const events = await getAdminDashboardTimelineEvents();
    sendSuccessResponse(response, 200, 'Lấy timeline tổng quan thành công.', { events });
  } catch (error) {
    sendErrorFromUnknown(response, error, 'Không thể lấy timeline tổng quan.');
  }
}

/**
 * Hàm xử lý request lấy audit log tổng quan cho admin.
 * Mục đích: trả dữ liệu kiểm toán thật để hiển thị bảng nhật ký trên dashboard.
 */
export async function handleGetAdminDashboardAuditLogs(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  try {
    const logs = await getAdminDashboardAuditLogs();
    sendSuccessResponse(response, 200, 'Lấy audit log tổng quan thành công.', { logs });
  } catch (error) {
    sendErrorFromUnknown(response, error, 'Không thể lấy audit log tổng quan.');
  }
}

/**
 * Hàm xử lý request lấy danh sách log lỗi hệ thống cho Admin.
 * Mục đích: cung cấp dữ liệu phân loại lỗi, hỗ trợ Admin theo dõi và kiểm soát trạng thái xử lý.
 */
export async function handleGetAdminSystemErrorLogs(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  const category = parseSystemErrorLogCategory(request.query.category);
  if (!category) {
    sendErrorResponse(response, 400, 'category không hợp lệ.', 'INVALID_SYSTEM_ERROR_LOG_CATEGORY');
    return;
  }

  const readState = parseSystemErrorLogReadState(request.query.readState);
  if (!readState) {
    sendErrorResponse(response, 400, 'readState không hợp lệ.', 'INVALID_SYSTEM_ERROR_LOG_READ_STATE');
    return;
  }

  const limitCount = parseSystemErrorLogLimit(request.query.limitCount);
  if (!limitCount) {
    sendErrorResponse(response, 400, 'limitCount phải nằm trong khoảng từ 1 đến 200.', 'INVALID_SYSTEM_ERROR_LOG_LIMIT');
    return;
  }

  try {
    const errorLogs = await getAdminSystemErrorLogs(request.authenticatedUser.userId, {
      category,
      readState,
      limitCount
    });

    sendSuccessResponse(response, 200, 'Lấy log lỗi hệ thống thành công.', errorLogs);
  } catch (error) {
    sendErrorFromUnknown(response, error, 'Không thể lấy log lỗi hệ thống.');
  }
}

/**
 * Hàm xử lý request cập nhật trạng thái đọc cho một log lỗi hệ thống.
 * Mục đích: cho phép Admin đánh dấu log đã đọc hoặc hoàn tác về chưa đọc.
 */
export async function handleUpdateAdminSystemErrorLogReadState(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.authenticatedUser) {
    sendErrorResponse(response, 401, 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ.', 'UNAUTHENTICATED');
    return;
  }

  const normalizedLogId = String(request.params.logId || '').trim();
  if (!normalizedLogId) {
    sendErrorResponse(response, 400, 'logId không hợp lệ.', 'INVALID_SYSTEM_ERROR_LOG_ID');
    return;
  }

  const isRead = parseSystemErrorLogReadFlag(request.body?.isRead);
  if (isRead === null) {
    sendErrorResponse(response, 400, 'isRead phải là boolean.', 'INVALID_SYSTEM_ERROR_LOG_READ_FLAG');
    return;
  }

  try {
    const updatedReadState = await updateAdminSystemErrorLogReadState(
      request.authenticatedUser.userId,
      normalizedLogId,
      isRead
    );

    sendSuccessResponse(response, 200, 'Cập nhật trạng thái đọc log lỗi thành công.', updatedReadState);
  } catch (error) {
    sendErrorFromUnknown(response, error, 'Không thể cập nhật trạng thái đọc log lỗi.');
  }
}
