// =============================================================================
// Types cho System Admin Page
// Clone from: FE/app/components/regulatoryBodies/tailwind/types.ts
// Mục đích: Định nghĩa các kiểu dữ liệu dùng chung cho trang Admin
// =============================================================================

/** Các trang/chức năng chính trong Admin panel. */
export type PageKey =
  | 'dashboard'
  | 'projectReview'
  | 'disbursement'
  | 'kyc'
  | 'bankAccountApproval'
  | 'report'
  | 'transparency'
  | 'sybilManagement';

/** Mục điều hướng trong Sidebar. */
export type NavigationItem = {
  key: PageKey;
  label: string;
  iconPath: string;         // SVG path string cho icon
  badge?: number;          // Số thông báo chờ xử lý
};

/** Item hiển thị trong bảng yêu cầu khẩn cấp. */
export type UrgentRequestItem = {
  id: string;
  projectName: string;
  organizationName: string;
  amountText: string;
  signatureState: '1/3' | '2/3' | '3/3';
  deadlineText: string;
  deadlineLevel: 'urgent' | 'normal' | 'ok';
  ipfsCid?: string;
  fileName?: string;
  usagePurpose?: string;
};

/** Một dòng trong bảng audit log. */
export type AuditLogItem = {
  id: string;
  timestamp: string;
  action: string;
  module: string;
  actor: string;
  ipAddress: string;
  details: string;
};

/** Một sự kiện trong timeline hoạt động. */
export type TimelineItem = {
  id: string;
  type: 'sign' | 'view' | 'reject' | 'login';
  actionText: string;
  detailText: string;
  timeText: string;
};

/** Một thông báo toast. */
export type ToastItem = {
  id: string;
  titleText: string;
  bodyText: string;
  tone: 'success' | 'error' | 'warning';
};

/** Các tab trong Request Drawer. */
export type DrawerTabKey = 'overview' | 'evidence' | 'signature' | 'history';

/** Mức độ rủi ro Sybil. */
export type SybilRiskLevel = 'critical' | 'high' | 'medium' | 'low';

/** Yếu tố rủi ro của một ví Sybil. */
export type SybilRiskFactor = {
  factorKey: string;
  factorName: string;
  score: number;
  maxScore: number;
};

/** Lịch sử donation của một ví. */
export type UserDonationHistory = {
  donationId: string;
  projectName: string;
  amount: number;
  timestamp: string;
  txHash: string;
  ipAddress: string;
};

/** Thông tin một user trong danh sách Sybil. */
export type SybilUser = {
  userId: string;
  walletAddress: string;
  displayName: string;
  email: string;
  role: string;
  isSybil: boolean;
  totalRiskScore: number;
  riskLevel: SybilRiskLevel;
  riskFactors: SybilRiskFactor[];
  donationCount: number;
  totalDonationAmount: number;
  ipAddresses: string[];
  deviceFingerprint?: string;
  firstActivity: string;
  lastActivity: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  donationHistory?: UserDonationHistory[];
};

/** Payload gửi lên API toggle Sybil status. */
export type SybilTogglePayload = {
  userId: string;
  walletAddress: string;
  action: 'mark' | 'unmark';
  reason: string;
  reviewedBy?: string;
};

/** Kết quả trả về từ API toggle Sybil. */
export type SybilToggleResult = {
  success: boolean;
  message: string;
  timestamp?: string;
};

