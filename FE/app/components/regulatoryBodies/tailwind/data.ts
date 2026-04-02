import { getMetricItemList, getUrgentRequestItemList } from '../regulatoryBodiesData';
import type { AuditLogItem, NavigationItem, TimelineItem, UrgentRequestItem } from './types';

export const navigationItemList: NavigationItem[] = [
  { key: 'dashboard', label: 'Tổng quan', iconPath: 'M2 2h5v5H2zm7 0h5v5H9zm-7 7h5v5H2zm7 0h5v5H9z' },
  { key: 'projectReview', label: 'Duyệt dự án mới', badge: 0, iconPath: 'M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm2 3h6v1.5H5zm0 3h4v1.5H5zm5.8 1.2l2 2-3.2 3.2H7.5V12.4z' },
  { key: 'disbursement', label: 'Ký duyệt Giải ngân', badge: 3, iconPath: 'M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1zM8 11l-4-4 1.4-1.4L8 8.2l4.6-4.6L14 5z' },
  { key: 'kyc', label: 'Duyệt Hồ sơ KYC', badge: 5, iconPath: 'M4 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm1 3v1h6V4zm0 3v1h6V7zm0 3v1h4v-1z' },
  { key: 'report', label: 'Báo cáo Tuân thủ', iconPath: 'M2 2h12v12H2zm2 2v3h3V4zm5 0v2h2V4zm-5 5v3h8V9zm0-2h8V6H4z' },
  { key: 'transparency', label: 'Tra cứu Giao dịch', iconPath: 'M8 2a6 6 0 100 12A6 6 0 008 2zm0 2a1 1 0 110 2 1 1 0 010-2zm0 3h2v5H6V7h2z' }
];

export const auditLogItemList: AuditLogItem[] = [
  { transactionId: '0x91a3f2bc76d0f19b', requestId: 'REQ-2026-031', amountText: '450,000,000₫', statusText: 'Đã ký', actorText: 'Bộ Tài chính', timeText: '14:28:10' },
  { transactionId: '0x83bc9d10af4201e7', requestId: 'REQ-2026-028', amountText: '320,000,000₫', statusText: 'Chờ ký', actorText: 'Tổ chức Hành Động Xanh', timeText: '13:55:47' },
  { transactionId: '0x67aa20ce9b1138d4', requestId: 'REQ-2026-025', amountText: '150,000,000₫', statusText: 'Đã ký', actorText: 'Quỹ Nhân Ái Toàn Dân', timeText: '11:20:31' },
  { transactionId: '0x245be92f91ba7720', requestId: 'REQ-2026-019', amountText: '980,000,000₫', statusText: 'Bị từ chối', actorText: 'Bộ Tài chính', timeText: '09:13:54' }
];

export const timelineItemList: TimelineItem[] = [
  { actionText: 'Ký duyệt yêu cầu', detailText: 'REQ-2026-028 · Nước sạch cho miền Tây', timeText: '2 phút trước', type: 'sign' },
  { actionText: 'Xem hồ sơ KYC', detailText: 'ORG-55 · Quỹ Trẻ Em Việt Xanh', timeText: '15 phút trước', type: 'view' },
  { actionText: 'Từ chối yêu cầu', detailText: 'REQ-2026-019 · Chưa đủ hồ sơ chứng minh', timeText: '37 phút trước', type: 'reject' },
  { actionText: 'Đăng nhập hệ thống', detailText: 'Thiết bị Chrome · Hà Nội', timeText: '42 phút trước', type: 'login' }
];

/** Hàm trả về dữ liệu metric gốc để dùng lại trong UI tổng quan. */
export function getDashboardMetricItemList() {
  return getMetricItemList();
}

/** Hàm ánh xạ dữ liệu yêu cầu gấp sang kiểu dữ liệu cho bảng Tailwind. */
export function getDashboardUrgentRequestItemList(): UrgentRequestItem[] {
  return getUrgentRequestItemList().map(item => ({
    id: item.id,
    projectName: item.projectName,
    organizationName: item.organizationName,
    amountText: item.amountText,
    signatureState: item.signatureState,
    deadlineText: item.deadlineText,
    deadlineLevel: item.deadlineClassName
  }));
}

