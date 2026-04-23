import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authenticationMiddleware';
import {
  getAdminDashboardAuditLogs,
  getAdminDashboardMetrics,
  getAdminDashboardTimelineEvents
} from '../services/adminDashboardService';
import { sendErrorFromUnknown, sendErrorResponse, sendSuccessResponse } from '../utils/apiResponse';

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

