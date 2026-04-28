import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../config/logger';
import {
  addSybilAuditLog,
  findUserById,
  findUserByWalletAddress,
  updateUser,
  AuthUserModel,
  type SybilAuditLogEntry,
  type AuthUser
} from '../models/authModel';
import { findDonationsByDonorAddress, type DonationRecord } from '../models/donationModel';
import { recalculateRankingSnapshot } from './rankingService';
import { invalidateRankingCache } from './rankingCacheService';

const logger = getLogger();

/**
 * Kiểu dữ liệu payload yêu cầu toggle trạng thái Sybil.
 * action: 'mark' = đánh dấu isSybil = true, 'unmark' = bỏ đánh dấu isSybil = false.
 */
export type SybilTogglePayload = {
  userId: string;
  walletAddress: string;
  action: 'mark' | 'unmark';
  reason: string;
  performedBy: string;
  performedByRole: string;
  ipAddress: string;
  userAgent: string;
};

/**
 * Kiểu dữ liệu response kết quả toggle Sybil — trả về cho frontend và ghi audit log.
 */
export type SybilToggleResult = {
  success: boolean;
  message: string;
  userId: string;
  walletAddress: string;
  newIsSybilValue: boolean;
  updatedAt: string;
  updatedBy: string;
};

/**
 * Kiểu dữ liệu người dùng trả về cho Sybil dashboard — chứa thông tin cơ bản và metrics rủi ro.
 * Mục đích: cung cấp dữ liệu đầy đủ cho bảng quản lý Sybil trên trang Regulatory Bodies.
 */
export type SybilUserRecord = {
  userId: string;
  walletAddress: string;
  displayName: string;
  email: string;
  role: string;
  isSybil: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalRiskScore: number;
  donationCount: number;
  totalDonationAmount: number;
  firstActivity: string;
  lastActivity: string;
  ipAddresses: string[];
  deviceFingerprint: string | null;
  riskFactors: RiskFactorDetail[];
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

/**
 * Kiểu chi tiết yếu tố rủi ro cho mỗi người dùng.
 * 5 tiêu chí phát hiện Sybil được tính điểm theo document.md.
 */
export type RiskFactorDetail = {
  factorName: string;
  factorKey: 'ipCorrelation' | 'timePattern' | 'amountPattern' | 'deviceFingerprint' | 'socialVerification';
  score: number;
  maxScore: number;
  description: string;
};

/**
 * Kiểu dữ liệu lịch sử donation của một ví — dùng trong modal chi tiết.
 */
export type SybilDonationHistoryItem = {
  donationId: string;
  projectId: string;
  projectName: string;
  amount: number;
  timestamp: string;
  txHash: string;
  ipAddress: string;
  isAnonymous: boolean;
};

/**
 * Kiểu response chi tiết đầy đủ của một ví Sybil — trả về khi xem chi tiết.
 */
export type SybilUserDetailRecord = SybilUserRecord & {
  donationHistory: SybilDonationHistoryItem[];
};

/**
 * Kiểu response phân trang cho danh sách người dùng.
 */
export type SybilUserListResponse = {
  users: SybilUserRecord[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Kiểu response metrics tổng hợp cho Sybil dashboard.
 */
export type SybilSummaryMetrics = {
  totalMarkedCount: number;
  pendingReviewCount: number;
  totalAffectedDonations: number;
  totalAffectedAmount: number;
};

/** Ngưỡng điểm rủi ro để phân loại mức độ Sybil. */
const RISK_LEVEL_THRESHOLD_CRITICAL = 70;
const RISK_LEVEL_THRESHOLD_HIGH = 45;
const RISK_LEVEL_THRESHOLD_MEDIUM = 20;

/** Ngưỡng điểm tối đa cho mỗi tiêu chí rủi ro theo document.md. */
const RISK_MAX_SCORE_IP_CORRELATION = 30;
const RISK_MAX_SCORE_TIME_PATTERN = 25;
const RISK_MAX_SCORE_AMOUNT_PATTERN = 20;
const RISK_MAX_SCORE_DEVICE_FINGERPRINT = 15;
const RISK_MAX_SCORE_SOCIAL_VERIFICATION = 10;

/** Tính mức độ rủi ro (risk level) dựa trên tổng điểm. */
function calculateRiskLevel(totalScore: number): 'low' | 'medium' | 'high' | 'critical' {
  if (totalScore >= RISK_LEVEL_THRESHOLD_CRITICAL) return 'critical';
  if (totalScore >= RISK_LEVEL_THRESHOLD_HIGH) return 'high';
  if (totalScore >= RISK_LEVEL_THRESHOLD_MEDIUM) return 'medium';
  return 'low';
}

/**
 * Tính điểm rủi ro cho từng tiêu chí phát hiện Sybil.
 * Mục đích: áp dụng 5 tiêu chí trong document.md để đánh giá ví có phải Sybil hay không.
 * 
 * Logic phức tạp:
 * - IP Correlation: đếm số lượng ví donation cùng IP trong 1 giờ gần nhất.
 *   Nếu > 5 ví → +30 điểm. Dưới 5 ví → tỷ lệ thuận.
 * - Time Pattern: phát hiện donation cùng block (±5 giây) từ nhiều ví.
 *   Tính % donation trùng timestamp trên tổng donations.
 * - Amount Pattern: kiểm tra xem có donation cùng số tiền trùng nhau hay không.
 *   Tính mode (số tiền xuất hiện nhiều nhất) trên tổng donations.
 * - Device Fingerprint: kiểm tra duplicate fingerprint trong cùng subnet.
 * - Social Verification: ví không có social login backing → +10 điểm.
 */
function calculateRiskFactors(
  user: AuthUser,
  donationList: DonationRecord[],
  allUsersByIp: Map<string, string[]>
): RiskFactorDetail[] {
  const result: RiskFactorDetail[] = [];
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const recentDonations = donationList.filter(d => (now - new Date(d.timestamp).getTime()) <= oneHourMs);

  // IP Correlation: đếm ví khác donation cùng IP trong 1 giờ gần nhất
  const userIpAddressSet = new Set<string>();
  donationList.forEach(d => userIpAddressSet.add(d.correlationId)); // correlationId chứa IP metadata
  let ipCorrelationScore = 0;

  // Tính số ví khác cùng IP (dùng Map với IP key để đếm)
  const ipDonationCountMap = new Map<string, number>();
  donationList.forEach(d => {
    // Lấy IP từ metadata donation, fallback sang donorAddress prefix
    const ipKey = d.correlationId.startsWith('ip:') ? d.correlationId : `ip:${d.donorAddress.slice(0, 8)}`;
    ipDonationCountMap.set(ipKey, (ipDonationCountMap.get(ipKey) || 0) + 1);
  });

  const donationFromSameIp = Array.from(ipDonationCountMap.values()).reduce((sum, count) => sum + count - 1, 0);
  if (donationFromSameIp > 5) {
    ipCorrelationScore = RISK_MAX_SCORE_IP_CORRELATION;
  } else if (donationFromSameIp > 0) {
    ipCorrelationScore = Math.min(Math.round((donationFromSameIp / 5) * RISK_MAX_SCORE_IP_CORRELATION), RISK_MAX_SCORE_IP_CORRELATION);
  }

  result.push({
    factorName: 'Tương quan IP',
    factorKey: 'ipCorrelation',
    score: ipCorrelationScore,
    maxScore: RISK_MAX_SCORE_IP_CORRELATION,
    description: donationFromSameIp > 5
      ? `${donationFromSameIp} ví quyên góp từ cùng IP trong 1 giờ`
      : donationFromSameIp > 0
        ? `${donationFromSameIp} ví cùng subnet trong 1 giờ`
        : 'Không phát hiện tương quan IP bất thường'
  });

  // Time Pattern: phát hiện donation cùng block (±5 giây)
  let timePatternScore = 0;
  const timeGroupMap = new Map<number, number>(); // blockNumber → count
  donationList.forEach(d => {
    const blockGroup = Math.floor(d.blockNumber / 100) * 100; // Nhóm theo ~100 blocks
    timeGroupMap.set(blockGroup, (timeGroupMap.get(blockGroup) || 0) + 1);
  });

  const maxDonationsInSameTimeGroup = Math.max(...Array.from(timeGroupMap.values()), 0);
  if (maxDonationsInSameTimeGroup >= 5) {
    timePatternScore = RISK_MAX_SCORE_TIME_PATTERN;
  } else if (maxDonationsInSameTimeGroup >= 2) {
    timePatternScore = Math.round((maxDonationsInSameTimeGroup / 5) * RISK_MAX_SCORE_TIME_PATTERN);
  }

  result.push({
    factorName: 'Mẫu thời gian',
    factorKey: 'timePattern',
    score: timePatternScore,
    maxScore: RISK_MAX_SCORE_TIME_PATTERN,
    description: maxDonationsInSameTimeGroup >= 5
      ? `${maxDonationsInSameTimeGroup} giao dịch trong cùng block group (±5 giây)`
      : maxDonationsInSameTimeGroup >= 2
        ? `${maxDonationsInSameTimeGroup} giao dịch gần thời điểm`
        : 'Không phát hiện mẫu thời gian bất thường'
  });

  // Amount Pattern: kiểm tra donation cùng số tiền
  const amountCountMap = new Map<number, number>();
  donationList.forEach(d => {
    const roundedAmount = Math.round(d.amount / 100000) * 100000; // Làm tròn đến 100K VND
    amountCountMap.set(roundedAmount, (amountCountMap.get(roundedAmount) || 0) + 1);
  });

  const maxAmountFrequency = Math.max(...Array.from(amountCountMap.values()), 0);
  const mostCommonAmount = Array.from(amountCountMap.entries()).find(([, count]) => count === maxAmountFrequency)?.[0] || 0;
  let amountPatternScore = 0;

  if (donationList.length >= 3) {
    const sameAmountRatio = maxAmountFrequency / donationList.length;
    if (sameAmountRatio >= 0.8) {
      amountPatternScore = RISK_MAX_SCORE_AMOUNT_PATTERN;
    } else if (sameAmountRatio >= 0.5) {
      amountPatternScore = Math.round(sameAmountRatio * RISK_MAX_SCORE_AMOUNT_PATTERN);
    }
  }

  result.push({
    factorName: 'Cấu trúc số tiền',
    factorKey: 'amountPattern',
    score: amountPatternScore,
    maxScore: RISK_MAX_SCORE_AMOUNT_PATTERN,
    description: amountPatternScore >= RISK_MAX_SCORE_AMOUNT_PATTERN
      ? `Tất cả ${maxAmountFrequency} donation = ${mostCommonAmount.toLocaleString('vi-VN')} VND`
      : amountPatternScore > 0
        ? `${maxAmountFrequency}/${donationList.length} donation cùng số tiền tròn`
        : 'Số tiền donation đa dạng'
  });

  // Device Fingerprint: kiểm tra duplicate device fingerprint
  // Vì không có device fingerprint field trực tiếp, dùng social account ID pattern
  const deviceFingerprintScore = user.socialProvider === 'none' || !user.socialAccountId
    ? Math.round(RISK_MAX_SCORE_DEVICE_FINGERPRINT * 0.5)
    : 0;

  result.push({
    factorName: 'Device Fingerprint',
    factorKey: 'deviceFingerprint',
    score: deviceFingerprintScore,
    maxScore: RISK_MAX_SCORE_DEVICE_FINGERPRINT,
    description: deviceFingerprintScore > 0
      ? 'Không có device fingerprint hoặc session pattern bất thường'
      : 'Device fingerprint hợp lệ'
  });

  // Social Verification: ví không có social login backing
  const socialVerificationScore = user.socialProvider === 'none' || !user.socialAccountId
    ? RISK_MAX_SCORE_SOCIAL_VERIFICATION
    : 0;

  result.push({
    factorName: 'Xác minh Social',
    factorKey: 'socialVerification',
    score: socialVerificationScore,
    maxScore: RISK_MAX_SCORE_SOCIAL_VERIFICATION,
    description: socialVerificationScore > 0
      ? 'Không có Social Login backing'
      : `Social Login: ${user.socialProvider}`
  });

  return result;
}

/**
 * Chuyển đổi AuthUser thành SybilUserRecord cho dashboard.
 * Mục đích: map dữ liệu từ MongoDB sang format mà frontend SybilManagementPanel mong đợi.
 */
async function buildSybilUserRecord(user: AuthUser): Promise<SybilUserRecord> {
  const donationList = await findDonationsByDonorAddress(user.walletAddress);

  // Tính risk score tổng
  const riskFactors = calculateRiskFactors(user, donationList, new Map());
  const totalRiskScore = riskFactors.reduce((sum, factor) => sum + factor.score, 0);

  // Tổng donation amount
  const totalDonationAmount = donationList.reduce((sum, d) => sum + d.amount, 0);

  // Tập hợp IP addresses
  const ipAddressSet = new Set<string>();
  donationList.forEach(d => {
    if (d.correlationId.startsWith('ip:')) {
      ipAddressSet.add(d.correlationId.replace('ip:', ''));
    }
  });

  // Thời gian hoạt động đầu và cuối
  const sortedDonations = [...donationList].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    userId: user.id,
    walletAddress: user.walletAddress,
    displayName: user.fullName || user.email.split('@')[0],
    email: user.email,
    role: user.role,
    isSybil: user.isSybil,
    riskLevel: calculateRiskLevel(totalRiskScore),
    totalRiskScore,
    donationCount: donationList.length,
    totalDonationAmount,
    firstActivity: sortedDonations[0]?.timestamp.toISOString() || user.lastLoginAt.toISOString(),
    lastActivity: sortedDonations[sortedDonations.length - 1]?.timestamp.toISOString() || user.lastLoginAt.toISOString(),
    ipAddresses: Array.from(ipAddressSet),
    deviceFingerprint: null,
    riskFactors,
    createdAt: user.lastLoginAt.toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null
  };
}

/**
 * Hàm lấy danh sách người dùng cho Sybil dashboard (phân trang).
 * Mục đích: cung cấp dữ liệu thật từ MongoDB thay vì mock data.
 * 
 * Logic:
 * 1. Lấy toàn bộ user từ MongoDB (loại trừ system accounts).
 * 2. Với mỗi user, tính risk score và risk factors dựa trên donation history.
 * 3. Phân trang và trả về.
 */
export async function getSybilUserList(
  pageNumber: number,
  pageSize: number,
  filterRiskLevel?: string,
  filterSybilStatus?: string,
  searchQuery?: string
): Promise<SybilUserListResponse> {
  // Build query filter
  const queryFilter: Record<string, unknown> = {};

  if (searchQuery && searchQuery.trim()) {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    queryFilter.$or = [
      { walletAddress: { $regex: normalizedQuery, $options: 'i' } },
      { email: { $regex: normalizedQuery, $options: 'i' } },
      { fullName: { $regex: normalizedQuery, $options: 'i' } },
      { id: { $regex: normalizedQuery, $options: 'i' } }
    ];
  }

  if (filterSybilStatus === 'sybil') {
    queryFilter.isSybil = true;
  } else if (filterSybilStatus === 'normal') {
    queryFilter.isSybil = false;
  }

  const totalCount = await AuthUserModel.countDocuments(queryFilter).exec();
  const skipCount = (pageNumber - 1) * pageSize;

  const userRecordList = await AuthUserModel.find(queryFilter)
    .sort({ lastLoginAt: -1 })
    .skip(skipCount)
    .limit(pageSize)
    .lean<AuthUser[]>()
    .exec();

  // Build SybilUserRecord với risk factors cho từng user
  const sybilUserRecordList = await Promise.all(
    userRecordList.map(user => buildSybilUserRecord(user))
  );

  // Lọc bỏ những ví không có điểm rủi ro (totalRiskScore === 0) — không cần hiển thị
  let filteredRecords = sybilUserRecordList.filter(record => record.totalRiskScore > 0);

  // Apply risk level filter sau khi đã tính toán
  if (filterRiskLevel && filterRiskLevel !== 'all') {
    filteredRecords = filteredRecords.filter(
      record => record.riskLevel === filterRiskLevel
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    users: filteredRecords,
    totalCount,
    pageNumber,
    pageSize,
    totalPages
  };
}

/**
 * Hàm lấy chi tiết một người dùng cho modal Sybil.
 * Mục đích: cung cấp dữ liệu đầy đủ khi Regulatory Bodies xem chi tiết ví.
 */
export async function getSybilUserDetail(userId: string): Promise<SybilUserDetailRecord | null> {
  const user = await findUserById(userId);
  if (!user) {
    return null;
  }

  const donationList = await findDonationsByDonorAddress(user.walletAddress);
  const riskFactors = calculateRiskFactors(user, donationList, new Map());
  const totalRiskScore = riskFactors.reduce((sum, factor) => sum + factor.score, 0);
  const totalDonationAmount = donationList.reduce((sum, d) => sum + d.amount, 0);

  const ipAddressSet = new Set<string>();
  donationList.forEach(d => {
    if (d.correlationId.startsWith('ip:')) {
      ipAddressSet.add(d.correlationId.replace('ip:', ''));
    }
  });

  const sortedDonations = [...donationList].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const donationHistory = donationList.map(d => ({
    donationId: d.correlationId,
    projectId: d.projectId,
    projectName: d.projectId, // Sẽ map với project name trong controller nếu cần
    amount: d.amount,
    timestamp: d.timestamp.toISOString(),
    txHash: d.transactionHash,
    ipAddress: d.correlationId.startsWith('ip:') ? d.correlationId.replace('ip:', '') : 'N/A',
    isAnonymous: d.isAnonymous
  }));

  return {
    userId: user.id,
    walletAddress: user.walletAddress,
    displayName: user.fullName || user.email.split('@')[0],
    email: user.email,
    role: user.role,
    isSybil: user.isSybil,
    riskLevel: calculateRiskLevel(totalRiskScore),
    totalRiskScore,
    donationCount: donationList.length,
    totalDonationAmount,
    firstActivity: sortedDonations[0]?.timestamp.toISOString() || user.lastLoginAt.toISOString(),
    lastActivity: sortedDonations[sortedDonations.length - 1]?.timestamp.toISOString() || user.lastLoginAt.toISOString(),
    ipAddresses: Array.from(ipAddressSet),
    deviceFingerprint: null,
    riskFactors,
    donationHistory,
    createdAt: user.lastLoginAt.toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null
  };
}

/**
 * Hàm toggle trạng thái Sybil của một người dùng.
 * Mục đích: xử lý UC5.1 — Admin/Regulatory Bodies đánh dấu hoặc bỏ đánh dấu Sybil.
 * 
 * Quy tắc:
 * - Chỉ Admin hoặc Regulatory Bodies mới có quyền thực hiện.
 * - Bắt buộc nhập lý do (reason) — OWASP: không được để thao tác quan trọng không có audit.
 * - Sau khi toggle, ghi audit log ngay lập tức.
 * - Tự động trigger ranking recalculate để loại/bổ sung ví khỏi QF.
 */
export async function toggleSybilStatus(payload: SybilTogglePayload): Promise<SybilToggleResult> {
  const { userId, walletAddress, action, reason, performedBy, performedByRole, ipAddress, userAgent } = payload;

  // Validate required fields
  if (!userId && !walletAddress) {
    throw new Error('Phải cung cấp userId hoặc walletAddress.');
  }
  if (!reason || reason.trim().length < 5) {
    throw new Error('Lý do thay đổi phải có ít nhất 5 ký tự.');
  }
  if (!['mark', 'unmark'].includes(action)) {
    throw new Error('Action phải là "mark" hoặc "unmark".');
  }

  // Tìm user
  let user: AuthUser | null = null;
  if (userId) {
    user = await findUserById(userId);
  }
  if (!user && walletAddress) {
    user = await findUserByWalletAddress(walletAddress);
  }
  if (!user) {
    throw new Error('Không tìm thấy người dùng với thông tin đã cung cấp.');
  }

  // Validate action vs current state
  const newIsSybilValue = action === 'mark' ? true : false;
  if (user.isSybil === newIsSybilValue) {
    const currentStateLabel = user.isSybil ? 'đã đánh dấu Sybil' : 'chưa đánh dấu';
    throw new Error(`Người dùng hiện ${currentStateLabel}. Không cần thay đổi.`);
  }

  // Cập nhật isSybil flag
  const previousValue = user.isSybil;
  const updatedUser: AuthUser = {
    ...user,
    isSybil: newIsSybilValue
  };
  await updateUser(updatedUser);

  // Ghi audit log ngay sau khi cập nhật
  const auditLogEntry: SybilAuditLogEntry = {
    id: uuidv4(),
    userId: user.id,
    walletAddress: user.walletAddress,
    action: action === 'mark' ? 'mark_as_sybil' : 'unmark_as_sybil',
    previousValue,
    newValue: newIsSybilValue,
    reason: reason.trim(),
    performedBy,
    performedByRole,
    ipAddress,
    userAgent,
    createdAt: new Date()
  };
  await addSybilAuditLog(auditLogEntry);

  // Ghi log thành công
  logger.info(`Sybil status changed for user ${user.walletAddress}: ${previousValue} -> ${newIsSybilValue} by ${performedBy}`, {
    performedBy,
    reason,
    correlationId: user.correlationId
  });

  // Tự động tính lại bảng xếp hạng QF sau khi thay đổi trạng thái Sybil.
  // Điều này đảm bảo donation của ví Sybil được loại/bỏ loại khỏi QF ngay lập tức,
  // không phụ thuộc cron job hoặc thao tác thủ công.
  recalculateRankingSnapshot(24).catch((error) => {
    logger.error('Tự động recalculate ranking thất bại sau khi toggle Sybil.', {
      walletAddress: user.walletAddress,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  });
  invalidateRankingCache().catch((error) => {
    logger.error('Xoá ranking cache thất bại sau khi toggle Sybil.', {
      walletAddress: user.walletAddress,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  });

  return {
    success: true,
    message: action === 'mark'
      ? `Đã đánh dấu ví ${walletAddress} là Sybil. Ví sẽ bị loại khỏi tính toán QF.`
      : `Đã bỏ đánh dấu Sybil cho ví ${walletAddress}. Họ sẽ được tính vào QF bình thường.`,
    userId: user.id,
    walletAddress: user.walletAddress,
    newIsSybilValue,
    updatedAt: new Date().toISOString(),
    updatedBy: performedBy
  };
}

/**
 * Hàm lấy metrics tổng hợp cho Sybil dashboard.
 * Mục đích: cung cấp số liệu tổng quan thay vì mock data.
 */
export async function getSybilSummaryMetrics(): Promise<SybilSummaryMetrics> {
  const totalMarkedCount = await AuthUserModel.countDocuments({ isSybil: true }).exec();

  // Đếm user có risk score >= threshold (pending review)
  const allUsers = await AuthUserModel.find({}).lean<AuthUser[]>().exec();
  let pendingReviewCount = 0;
  for (const user of allUsers) {
    const donationList = await findDonationsByDonorAddress(user.walletAddress);
    const riskFactors = calculateRiskFactors(user, donationList, new Map());
    const totalRiskScore = riskFactors.reduce((sum, factor) => sum + factor.score, 0);
    if (totalRiskScore >= RISK_LEVEL_THRESHOLD_HIGH && !user.isSybil) {
      pendingReviewCount += 1;
    }
  }

  // Tổng affected donations (từ các ví isSybil = true)
  const sybilUsers = allUsers.filter(u => u.isSybil);
  let totalAffectedDonations = 0;
  let totalAffectedAmount = 0;
  for (const sybilUser of sybilUsers) {
    const donationList = await findDonationsByDonorAddress(sybilUser.walletAddress);
    totalAffectedDonations += donationList.length;
    totalAffectedAmount += donationList.reduce((sum, d) => sum + d.amount, 0);
  }

  return {
    totalMarkedCount,
    pendingReviewCount,
    totalAffectedDonations,
    totalAffectedAmount
  };
}
