import type { PageKey } from './types';

/** Hàm chuẩn hóa tiêu đề để đồng bộ breadcrumb, header và tiêu đề trang. */
export function getPageTitle(pageKey: PageKey): string {
  if (pageKey === 'dashboard') return 'Tổng quan Giám sát';
  if (pageKey === 'disbursement') return 'Ký duyệt Giải ngân';
  if (pageKey === 'kyc') return 'Duyệt Hồ sơ KYC';
  if (pageKey === 'report') return 'Báo cáo Tuân thủ';
  return 'Tra cứu Giao dịch';
}

/** Hàm lấy lớp màu cho trạng thái hạn xử lý để người dùng nhận biết mức ưu tiên nhanh hơn. */
export function getDeadlineClass(deadlineLevel: 'urgent' | 'normal' | 'ok'): string {
  if (deadlineLevel === 'urgent') return 'bg-red-100 text-red-600';
  if (deadlineLevel === 'normal') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

/** Hàm ánh xạ badge trạng thái cho bảng audit để hiển thị đồng nhất toàn trang. */
export function getStatusBadgeClass(statusText: string): string {
  if (statusText === 'Đã ký') return 'bg-emerald-100 text-emerald-700';
  if (statusText === 'Chờ ký') return 'bg-amber-100 text-amber-700';
  if (statusText === 'Bị từ chối') return 'bg-red-100 text-red-600';
  return 'bg-slate-100 text-slate-600';
}

/** Hàm cắt chuỗi hash dài để bảng giữ được bố cục đẹp trên mọi kích thước màn hình. */
export function getShortHash(transactionId: string): string {
  if (transactionId.length < 12) return transactionId;
  return `${transactionId.slice(0, 8)}...${transactionId.slice(-4)}`;
}

