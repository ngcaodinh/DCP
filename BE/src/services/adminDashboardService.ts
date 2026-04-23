import {
  type AuditLogEntry,
  countUsersByLastLoginRange,
  findLatestAuditLogs,
  findSybilAuditLogs,
  findUserById,
  type SybilAuditLogEntry
} from '../models/authModel';
import { findLatestDisbursements, type DisbursementRecord } from '../models/disbursementModel';
import { aggregateTotalDonationAmount } from '../models/donationModel';
import { countPendingKycSubmissions } from '../models/organizationKycModel';
import { countProjectsByStatus } from '../models/projectModel';
import { findProjectById } from '../repositories/projectRepository';

export type AdminDashboardMetrics = {
  pendingProjects: number;
  pendingKycs: number;
  newUsersThisMonth: number;
  totalTransactionAmount: number;
};

export type AdminDashboardTimelineEvent = {
  id: string;
  type: 'sign' | 'view' | 'reject' | 'login';
  actionText: string;
  detailText: string;
  timestamp: string;
};

export type AdminDashboardAuditLog = {
  id: string;
  timestamp: string;
  action: string;
  module: string;
  actor: string;
  ipAddress: string;
  details: string;
};

type TimelineEventWithSortValue = AdminDashboardTimelineEvent & {
  timestampValue: number;
};

type AuditLogWithSortValue = AdminDashboardAuditLog & {
  timestampValue: number;
};

/**
 * Hàm chuẩn hóa dữ liệu ngày giờ về dạng Date hợp lệ.
 * Mục đích: tránh lỗi runtime khi dữ liệu lưu trữ bị thiếu hoặc sai định dạng.
 */
function parseSafeDate(dateValue: Date | string | null | undefined): Date | null {
  if (!dateValue) {
    return null;
  }

  const parsedDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

/**
 * Hàm format mốc thời gian cho timeline.
 * Mục đích: hiển thị thời gian ngắn gọn, dễ quét nhanh trên giao diện tổng quan.
 */
function formatTimelineTimestamp(dateValue: Date): string {
  const dayText = String(dateValue.getDate()).padStart(2, '0');
  const monthText = String(dateValue.getMonth() + 1).padStart(2, '0');
  const hourText = String(dateValue.getHours()).padStart(2, '0');
  const minuteText = String(dateValue.getMinutes()).padStart(2, '0');
  return `${hourText}:${minuteText} ${dayText}/${monthText}`;
}

/**
 * Hàm format mốc thời gian cho bảng audit log.
 * Mục đích: giữ thông tin đầy đủ đến giây để phục vụ kiểm toán.
 */
function formatAuditTimestamp(dateValue: Date): string {
  const dayText = String(dateValue.getDate()).padStart(2, '0');
  const monthText = String(dateValue.getMonth() + 1).padStart(2, '0');
  const yearText = String(dateValue.getFullYear());
  const hourText = String(dateValue.getHours()).padStart(2, '0');
  const minuteText = String(dateValue.getMinutes()).padStart(2, '0');
  const secondText = String(dateValue.getSeconds()).padStart(2, '0');
  return `${dayText}/${monthText}/${yearText} ${hourText}:${minuteText}:${secondText}`;
}

/**
 * Hàm chuyển signer role thành nhãn dễ đọc.
 * Mục đích: tránh lộ kỹ thuật nội bộ khi hiển thị actor trong timeline/audit.
 */
function mapSignerRoleToDisplayName(signerRole: string): string {
  if (signerRole === 'ADMIN_SIGNER') return 'Admin hệ thống';
  if (signerRole === 'ORG_SIGNER') return 'Đại diện tổ chức';
  if (signerRole === 'REGULATORY_SIGNER') return 'Cơ quan giám sát';
  return signerRole;
}

/**
 * Hàm chuẩn hóa action cho audit log auth.
 * Mục đích: hiển thị tên hành động dễ hiểu thay vì event code thô.
 */
function mapAuthEventTypeToAction(eventType: string): string {
  if (eventType === 'GOOGLE_LOGIN_FAILED') return 'Đăng nhập thất bại';
  if (eventType === 'NEW_DEVICE_LOGIN') return 'Đăng nhập thiết bị mới';
  if (eventType === 'REFRESH_DEVICE_MISMATCH') return 'Sai khác thiết bị phiên đăng nhập';
  if (eventType === 'REFRESH_TOKEN_FAILED') return 'Làm mới token thất bại';
  return eventType;
}

/**
 * Hàm lấy tên dự án theo projectId có cache.
 * Mục đích: giảm số lần query MongoDB khi duyệt nhiều bản ghi giải ngân.
 */
async function resolveProjectName(projectId: string, projectNameCache: Map<string, string>): Promise<string> {
  const cachedProjectName = projectNameCache.get(projectId);
  if (cachedProjectName) {
    return cachedProjectName;
  }

  const projectRecord = await findProjectById(projectId);
  const projectName = projectRecord?.name || projectId;
  projectNameCache.set(projectId, projectName);
  return projectName;
}

/**
 * Hàm lấy tên tổ chức theo organizationId có cache.
 * Mục đích: tránh query lặp khi nhiều request giải ngân thuộc cùng một tổ chức.
 */
async function resolveOrganizationName(organizationId: string, organizationNameCache: Map<string, string>): Promise<string> {
  const cachedOrganizationName = organizationNameCache.get(organizationId);
  if (cachedOrganizationName) {
    return cachedOrganizationName;
  }

  const organizationUser = await findUserById(organizationId);
  const organizationName = organizationUser?.organizationName || organizationUser?.fullName || organizationId;
  organizationNameCache.set(organizationId, organizationName);
  return organizationName;
}

/**
 * Hàm trích xuất event timeline từ danh sách request giải ngân.
 * Mục đích: tạo hoạt động gần đây bằng dữ liệu thật thay vì mock timeline.
 */
async function buildTimelineEventsFromDisbursement(disbursementRecordList: DisbursementRecord[]): Promise<TimelineEventWithSortValue[]> {
  const timelineEventList: TimelineEventWithSortValue[] = [];
  const projectNameCache = new Map<string, string>();
  const organizationNameCache = new Map<string, string>();

  for (const disbursementRecord of disbursementRecordList) {
    const [projectName, organizationName] = await Promise.all([
      resolveProjectName(disbursementRecord.projectId, projectNameCache),
      resolveOrganizationName(disbursementRecord.organizationId, organizationNameCache)
    ]);

    const createdAtDate = parseSafeDate(disbursementRecord.createdAt);
    if (createdAtDate) {
      timelineEventList.push({
        id: `${disbursementRecord.requestId}-created`,
        type: 'view',
        actionText: 'Tạo yêu cầu giải ngân',
        detailText: `${organizationName} · ${projectName}`,
        timestamp: formatTimelineTimestamp(createdAtDate),
        timestampValue: createdAtDate.getTime()
      });
    }

    for (const approvalItem of disbursementRecord.approvals) {
      const signedAtDate = parseSafeDate(approvalItem.signedAt);
      if (!signedAtDate) {
        continue;
      }

      timelineEventList.push({
        id: `${disbursementRecord.requestId}-sign-${approvalItem.signerRole}-${signedAtDate.getTime()}`,
        type: 'sign',
        actionText: 'Ký duyệt giải ngân',
        detailText: `${mapSignerRoleToDisplayName(approvalItem.signerRole)} · ${projectName}`,
        timestamp: formatTimelineTimestamp(signedAtDate),
        timestampValue: signedAtDate.getTime()
      });
    }

    const rejectedAtDate = parseSafeDate(disbursementRecord.rejection?.rejectedAt);
    if (rejectedAtDate && disbursementRecord.rejection) {
      timelineEventList.push({
        id: `${disbursementRecord.requestId}-reject-${rejectedAtDate.getTime()}`,
        type: 'reject',
        actionText: 'Từ chối giải ngân',
        detailText: `${mapSignerRoleToDisplayName(disbursementRecord.rejection.signerRole)} · ${projectName}`,
        timestamp: formatTimelineTimestamp(rejectedAtDate),
        timestampValue: rejectedAtDate.getTime()
      });
    }
  }

  return timelineEventList;
}

/**
 * Hàm trích xuất event timeline từ audit log đăng nhập.
 * Mục đích: bổ sung dấu vết hoạt động hệ thống gần đây vào khối timeline.
 */
function buildTimelineEventsFromAuthAudit(auditLogEntryList: AuditLogEntry[]): TimelineEventWithSortValue[] {
  const timelineEventList: TimelineEventWithSortValue[] = [];

  for (const auditLogEntry of auditLogEntryList) {
    const createdAtDate = parseSafeDate(auditLogEntry.createdAt);
    if (!createdAtDate) {
      continue;
    }

    const actorLabel = auditLogEntry.email || auditLogEntry.userId || 'Ẩn danh';
    timelineEventList.push({
      id: `audit-${auditLogEntry.id}`,
      type: 'login',
      actionText: mapAuthEventTypeToAction(auditLogEntry.eventType),
      detailText: `${actorLabel} · ${auditLogEntry.detail}`,
      timestamp: formatTimelineTimestamp(createdAtDate),
      timestampValue: createdAtDate.getTime()
    });
  }

  return timelineEventList;
}

/**
 * Hàm chuyển audit log auth về format bảng admin.
 * Mục đích: thống nhất dữ liệu kiểm toán giữa backend và frontend.
 */
function buildAuditLogsFromAuth(auditLogEntryList: AuditLogEntry[]): AuditLogWithSortValue[] {
  return auditLogEntryList
    .map((auditLogEntry) => {
      const createdAtDate = parseSafeDate(auditLogEntry.createdAt);
      if (!createdAtDate) {
        return null;
      }

      return {
        id: `auth-${auditLogEntry.id}`,
        timestamp: formatAuditTimestamp(createdAtDate),
        action: mapAuthEventTypeToAction(auditLogEntry.eventType),
        module: 'AUTH',
        actor: auditLogEntry.email || auditLogEntry.userId || 'Hệ thống',
        ipAddress: auditLogEntry.ipAddress || '-',
        details: auditLogEntry.detail,
        timestampValue: createdAtDate.getTime()
      };
    })
    .filter((auditLogItem): auditLogItem is AuditLogWithSortValue => Boolean(auditLogItem));
}

/**
 * Hàm chuyển audit log Sybil về format bảng admin.
 * Mục đích: hiển thị đầy đủ thao tác đánh dấu/huỷ đánh dấu Sybil trên khối kiểm toán.
 */
function buildAuditLogsFromSybil(sybilAuditLogEntryList: SybilAuditLogEntry[]): AuditLogWithSortValue[] {
  return sybilAuditLogEntryList
    .map((sybilAuditLogEntry) => {
      const createdAtDate = parseSafeDate(sybilAuditLogEntry.createdAt);
      if (!createdAtDate) {
        return null;
      }

      return {
        id: `sybil-${sybilAuditLogEntry.id}`,
        timestamp: formatAuditTimestamp(createdAtDate),
        action: sybilAuditLogEntry.action === 'mark_as_sybil' ? 'Đánh dấu Sybil' : 'Bỏ đánh dấu Sybil',
        module: 'SYBIL',
        actor: sybilAuditLogEntry.performedBy,
        ipAddress: sybilAuditLogEntry.ipAddress || '-',
        details: sybilAuditLogEntry.reason,
        timestampValue: createdAtDate.getTime()
      };
    })
    .filter((auditLogItem): auditLogItem is AuditLogWithSortValue => Boolean(auditLogItem));
}

/**
 * Hàm chuyển dữ liệu giải ngân thành audit log.
 * Mục đích: ghi nhận đầy đủ vòng đời request giải ngân để phục vụ kiểm toán vận hành.
 */
async function buildAuditLogsFromDisbursement(disbursementRecordList: DisbursementRecord[]): Promise<AuditLogWithSortValue[]> {
  const auditLogItemList: AuditLogWithSortValue[] = [];
  const projectNameCache = new Map<string, string>();
  const organizationNameCache = new Map<string, string>();

  for (const disbursementRecord of disbursementRecordList) {
    const [projectName, organizationName] = await Promise.all([
      resolveProjectName(disbursementRecord.projectId, projectNameCache),
      resolveOrganizationName(disbursementRecord.organizationId, organizationNameCache)
    ]);

    const createdAtDate = parseSafeDate(disbursementRecord.createdAt);
    if (createdAtDate) {
      auditLogItemList.push({
        id: `disbursement-${disbursementRecord.requestId}-created`,
        timestamp: formatAuditTimestamp(createdAtDate),
        action: 'Tạo yêu cầu giải ngân',
        module: 'DISBURSEMENT',
        actor: organizationName,
        ipAddress: '-',
        details: `Request ${disbursementRecord.requestId} · ${projectName}`,
        timestampValue: createdAtDate.getTime()
      });
    }

    for (const approvalItem of disbursementRecord.approvals) {
      const signedAtDate = parseSafeDate(approvalItem.signedAt);
      if (!signedAtDate) {
        continue;
      }

      auditLogItemList.push({
        id: `disbursement-${disbursementRecord.requestId}-sign-${approvalItem.signerRole}-${signedAtDate.getTime()}`,
        timestamp: formatAuditTimestamp(signedAtDate),
        action: 'Ký duyệt giải ngân',
        module: 'DISBURSEMENT',
        actor: mapSignerRoleToDisplayName(approvalItem.signerRole),
        ipAddress: '-',
        details: `Request ${disbursementRecord.requestId} · ${projectName}`,
        timestampValue: signedAtDate.getTime()
      });
    }

    const rejectedAtDate = parseSafeDate(disbursementRecord.rejection?.rejectedAt);
    if (rejectedAtDate && disbursementRecord.rejection) {
      auditLogItemList.push({
        id: `disbursement-${disbursementRecord.requestId}-reject-${rejectedAtDate.getTime()}`,
        timestamp: formatAuditTimestamp(rejectedAtDate),
        action: 'Từ chối giải ngân',
        module: 'DISBURSEMENT',
        actor: mapSignerRoleToDisplayName(disbursementRecord.rejection.signerRole),
        ipAddress: '-',
        details: disbursementRecord.rejection.reason,
        timestampValue: rejectedAtDate.getTime()
      });
    }
  }

  return auditLogItemList;
}

/**
 * Hàm lấy metrics tổng quan hệ thống cho admin dashboard.
 * Mục đích: trả dữ liệu thật từ MongoDB thay cho cấu hình mock phía frontend.
 */
export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const currentDate = new Date();
  const monthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const nextMonthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

  const [pendingProjectCount, pendingKycCount, activeUserThisMonthCount, totalTransactionAmount] = await Promise.all([
    countProjectsByStatus('PENDING_APPROVAL'),
    countPendingKycSubmissions(),
    countUsersByLastLoginRange(monthStartDate, nextMonthStartDate),
    aggregateTotalDonationAmount()
  ]);

  return {
    pendingProjects: pendingProjectCount,
    pendingKycs: pendingKycCount,
    newUsersThisMonth: activeUserThisMonthCount,
    totalTransactionAmount
  };
}

/**
 * Hàm lấy danh sách timeline hoạt động gần đây cho admin dashboard.
 * Mục đích: tổng hợp sự kiện thật từ luồng giải ngân và audit đăng nhập.
 */
export async function getAdminDashboardTimelineEvents(): Promise<AdminDashboardTimelineEvent[]> {
  const [disbursementRecordList, auditLogEntryList] = await Promise.all([
    findLatestDisbursements(20),
    findLatestAuditLogs(20)
  ]);

  const [disbursementTimelineEvents, authTimelineEvents] = await Promise.all([
    buildTimelineEventsFromDisbursement(disbursementRecordList),
    Promise.resolve(buildTimelineEventsFromAuthAudit(auditLogEntryList))
  ]);

  return [...disbursementTimelineEvents, ...authTimelineEvents]
    .sort((leftEvent, rightEvent) => rightEvent.timestampValue - leftEvent.timestampValue)
    .slice(0, 12)
    .map(({ timestampValue, ...timelineEventItem }) => timelineEventItem);
}

/**
 * Hàm lấy danh sách audit log cho admin dashboard.
 * Mục đích: tổng hợp dữ liệu kiểm toán thật từ auth, sybil và disbursement.
 */
export async function getAdminDashboardAuditLogs(): Promise<AdminDashboardAuditLog[]> {
  const [auditLogEntryList, sybilAuditLogEntryList, disbursementRecordList] = await Promise.all([
    findLatestAuditLogs(40),
    findSybilAuditLogs(30, 0),
    findLatestDisbursements(30)
  ]);

  const [disbursementAuditLogItemList] = await Promise.all([
    buildAuditLogsFromDisbursement(disbursementRecordList)
  ]);

  const authAuditLogItemList = buildAuditLogsFromAuth(auditLogEntryList);
  const sybilAuditLogItemList = buildAuditLogsFromSybil(sybilAuditLogEntryList);

  return [...disbursementAuditLogItemList, ...authAuditLogItemList, ...sybilAuditLogItemList]
    .sort((leftLogItem, rightLogItem) => rightLogItem.timestampValue - leftLogItem.timestampValue)
    .slice(0, 50)
    .map(({ timestampValue, ...auditLogItem }) => auditLogItem);
}
