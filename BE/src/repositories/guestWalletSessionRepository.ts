import mongoose, { Types } from 'mongoose';
import {
  GuestWalletSessionModel,
  GuestWalletSession
} from '../models/guestWalletSessionModel';
import { MAX_DONATIONS_PER_SESSION } from '../constants/guestDonation';

/**
 * Loại chỉ cho phép update các fields có thể thay đổi sau khi tạo.
 * Immutable fields (sessionId, walletAddress, createdAt) bị loại trừ để tránh
 * accidental modification qua repository layer.
 */
export type UpdateableGuestWalletSession = Partial<
  Pick<
    GuestWalletSession,
    | 'status'
    | 'donationCount'
    | 'totalDonatedAmount'
    | 'totalSponsoredGas'
    | 'renewalCount'
    | 'claimedByUserId'
    | 'hasPendingDonation'
    | 'pendingAlertSentAt'
    | 'expiresAt'
    | 'serverSalt'
  >
> & { updatedAt?: Date };

/**
 * Hàm tạo phiên guest wallet mới.
 * Mục đích: khởi tạo record session khi user chọn donate ẩn danh.
 */
export async function createGuestWalletSession(
  session: GuestWalletSession
): Promise<GuestWalletSession> {
  const createdSession = await GuestWalletSessionModel.create(session);
  return createdSession.toObject() as GuestWalletSession;
}

/**
 * Hàm tìm phiên guest wallet theo sessionId.
 * Mục đích: xác thực và truy xuất thông tin phiên ẩn danh.
 */
export async function findGuestWalletSessionById(
  sessionId: string
): Promise<GuestWalletSession | null> {
  return GuestWalletSessionModel.findOne({ sessionId })
    .lean<GuestWalletSession>()
    .exec();
}

/**
 * Hàm tìm phiên guest wallet theo walletAddress.
 * Mục đích: kiểm tra ví đã có session hay chưa, phục vụ restore.
 * Filter theo status = 'ACTIVE' để tránh trả về session đã expired/claimed/purged.
 */
export async function findGuestWalletSessionByWalletAddress(
  walletAddress: string
): Promise<GuestWalletSession | null> {
  return GuestWalletSessionModel.findOne({ walletAddress, status: 'ACTIVE' })
    .lean<GuestWalletSession>()
    .exec();
}

/**
 * Giới hạn số lượng kết quả trả về để tránh unbounded collection scan.
 * Giá trị 50 đủ để phát hiện burst pattern mà không gây quá tải bộ nhớ.
 */
const QUERY_LIMIT = 50;

/**
 * Hàm tìm các phiên guest wallet theo fingerprint trong khoảng thời gian.
 * Mục đích: kiểm tra giới hạn tạo session theo thiết bị (FR5.G).
 * Luôn yêu cầu time range để tránh unbounded collection scan.
 */
export async function findGuestWalletSessionsByFingerprint(
  deviceFingerprintHash: string,
  sinceDate: Date
): Promise<GuestWalletSession[]> {
  return GuestWalletSessionModel.find({
    deviceFingerprintHash,
    createdAt: { $gte: sinceDate }
  })
    .limit(QUERY_LIMIT)
    .lean<GuestWalletSession[]>()
    .exec();
}

/**
 * Hàm tìm các phiên guest wallet theo IP trong khoảng thời gian.
 * Mục đích: kiểm tra giới hạn tạo session theo IP và detect IP burst.
 * Luôn yêu cầu time range để tránh unbounded collection scan.
 */
export async function findGuestWalletSessionsByIp(
  ipAddress: string,
  sinceDate: Date
): Promise<GuestWalletSession[]> {
  return GuestWalletSessionModel.find({
    ipAddress,
    createdAt: { $gte: sinceDate }
  })
    .limit(QUERY_LIMIT)
    .lean<GuestWalletSession[]>()
    .exec();
}

/**
 * Hàm đếm số phiên guest wallet theo fingerprint trong 24 giờ.
 * Mục đích: kiểm tra giới hạn ≤3 sessions/fingerprint/24h.
 */
export async function countRecentSessionsByFingerprint(
  deviceFingerprintHash: string,
  sinceDate: Date
): Promise<number> {
  return GuestWalletSessionModel.countDocuments({
    deviceFingerprintHash,
    createdAt: { $gte: sinceDate }
  }).exec();
}

/**
 * Hàm đếm số phiên guest wallet theo IP trong 1 giờ.
 * Mục đích: kiểm tra IP burst (≥3 sessions/1h → +30 risk score).
 */
export async function countRecentSessionsByIp(
  ipAddress: string,
  sinceDate: Date
): Promise<number> {
  return GuestWalletSessionModel.countDocuments({
    ipAddress,
    createdAt: { $gte: sinceDate }
  }).exec();
}

/**
 * Hàm đếm số phiên guest wallet theo IP trong khoảng thời gian, loại trừ một session cụ thể.
 * Mục đích: kiểm tra session velocity - đếm các session TỒN TẠI TRƯỚC session hiện tại,
 * không include chính nó trong count. Session hiện tại đã được insert vào DB
 * trước khi hàm này được gọi.
 * @param ipAddress - Địa chỉ IP cần đếm
 * @param sinceDate - Thời điểm bắt đầu đếm
 * @param excludeSessionId - Session ID cần loại trừ khỏi count
 */
export async function countRecentSessionsByIpExcluding(
  ipAddress: string,
  sinceDate: Date,
  excludeSessionId: string
): Promise<number> {
  return GuestWalletSessionModel.countDocuments({
    ipAddress,
    createdAt: { $gte: sinceDate },
    sessionId: { $ne: excludeSessionId }
  }).exec();
}

/**
 * Hàm cập nhật trạng thái và metadata của phiên guest wallet.
 * Mục đích: cập nhật donation count, total amount, hoặc status khi có sự kiện.
 * Luôn tự động set updatedAt để đảm bảo consistency.
 * @param sessionId - ID của phiên cần cập nhật
 * @param updateData - Dữ liệu cần cập nhật
 * @param mongoSession - MongoDB session cho transaction (tùy chọn)
 */
export async function updateGuestWalletSession(
  sessionId: string,
  updateData: UpdateableGuestWalletSession,
  mongoSession?: mongoose.ClientSession
): Promise<GuestWalletSession | null> {
  const updatedSession = await GuestWalletSessionModel.findOneAndUpdate(
    { sessionId },
    {
      ...updateData,
      updatedAt: new Date()
    },
    { returnDocument: 'after', session: mongoSession }
  )
    .lean<GuestWalletSession>()
    .exec();
  return updatedSession;
}

/**
 * Hàm atomic increment donation counters và reset pending flag cho một session.
 * Mục đích: dùng trong sync worker sau khi donation được index thành công.
 *
 * Design: Dùng atomic $inc + $set trong một findOneAndUpdate duy nhất để:
 * 1. Tránh race condition TOCTOU — nếu sync worker xử lý 2 events cùng session gần nhau,
 *    cả 2 sẽ đọc donationCount ban đầu và cộng dồn đúng thay vì dùng stale value.
 * 2. Reset hasPendingDonation về false — flag này được set=true khi paymaster sponsor,
 *    cần reset về false khi donation hoàn tất trên blockchain.
 * 3. Đảm bảo updatedAt luôn được cập nhật.
 *
 * @param sessionId - ID của session cần cập nhật
 * @param amountToAdd - Số lượng token đã donate (đơn vị: 0.01 Token)
 * @returns Session đã được cập nhật, hoặc null nếu session không tồn tại
 */
export async function incrementSessionDonationCounters(
  sessionId: string,
  amountToAdd: number
): Promise<GuestWalletSession | null> {
  return GuestWalletSessionModel.findOneAndUpdate(
    { sessionId },
    {
      $inc: {
        donationCount: 1,
        totalDonatedAmount: amountToAdd
      },
      $set: {
        hasPendingDonation: false,
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  )
    .lean<GuestWalletSession>()
    .exec();
}

/**
 * Hàm atomic reserve donation slot cho một session.
 * Dùng findOneAndUpdate để check-and-set tất cả conditions trong một operation nguyên tử,
 * tránh race condition TOCTOU khi nhiều request đồng thời cùng sessionId
 * cùng pass các check riêng lẻ trước khi transaction hoàn tất.
 *
 * Conditions được check atomically:
 * - status === 'ACTIVE'
 * - donationCount < MAX_DONATIONS_PER_SESSION
 * - hasPendingDonation === false
 * - totalDonatedAmount <= limit
 * - expiresAt > now
 *
 * @param sessionId - ID của session cần reserve
 * @param walletAddress - Địa chỉ ví để verify (case-insensitive)
 * @param maxStoredAmount - Giới hạn tổng amount (đơn vị: 0.01 Token, stored format)
 * @param mongoSession - MongoDB session cho transaction
 * @returns Session đã được reserved (hasPendingDonation = true) nếu thành công, null nếu không đủ điều kiện
 */
export async function reserveDonationSlot(
  sessionId: string,
  walletAddress: string,
  maxStoredAmount: number,
  mongoSession: mongoose.ClientSession
): Promise<GuestWalletSession | null> {
  return GuestWalletSessionModel.findOneAndUpdate(
    {
      sessionId,
      walletAddress: walletAddress.toLowerCase(),
      status: 'ACTIVE',
      donationCount: { $lt: MAX_DONATIONS_PER_SESSION },
      hasPendingDonation: false,
      totalDonatedAmount: { $lte: maxStoredAmount },
      expiresAt: { $gt: new Date() }
    },
    {
      $set: {
        hasPendingDonation: true,
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after', session: mongoSession }
  )
    .lean<GuestWalletSession>()
    .exec();
}

/**
 * Hàm expire các phiên guest wallet đã hết hạn.
 * Mục đích: worker chạy định kỳ để đánh dấu các session quá hạn.
 */
export async function expireGuestSessions(deadline: Date): Promise<number> {
  const result = await GuestWalletSessionModel.updateMany(
    { status: 'ACTIVE', expiresAt: { $lt: deadline } },
    {
      $set: {
        status: 'EXPIRED',
        updatedAt: new Date()
      }
    }
  );
  return result.modifiedCount;
}

/**
 * Hàm purge các phiên guest wallet đã expired quá 30 ngày.
 * Mục đích: chuyển trạng thái sang PURGED (soft-delete) để giữ audit trail
 * phục vụ compliance. Hard-delete có thể được thực hiện bởi worker riêng
 * sau 90 ngày nếu cần GDPR compliance.
 */
export async function purgeOldGuestSessions(cutoffDate: Date): Promise<number> {
  const result = await GuestWalletSessionModel.updateMany(
    { status: 'EXPIRED', updatedAt: { $lt: cutoffDate } },
    {
      $set: {
        status: 'PURGED',
        updatedAt: new Date()
      }
    }
  );
  return result.modifiedCount;
}

/**
 * Hàm đánh dấu phiên guest wallet đã được claim.
 * Mục đích: cập nhật trạng thái sau khi user claim ví ẩn danh thành tài khoản.
 */
export async function markGuestSessionAsClaimed(
  sessionId: string,
  claimedByUserId: string
): Promise<GuestWalletSession | null> {
  return updateGuestWalletSession(sessionId, {
    status: 'CLAIMED',
    claimedByUserId
  });
}

/**
 * Hàm tìm nhiều phiên guest wallet theo danh sách sessionId.
 * Mục đích: batch fetch phục vụ cluster detection trong cleanup worker.
 * Tránh N+1 query khi cần session data cho nhiều cluster suspects.
 *
 * @param sessionIds - Danh sách sessionId cần tìm
 * @returns Array các session records
 */
export async function findGuestWalletSessionsByIds(
  sessionIds: string[]
): Promise<GuestWalletSession[]> {
  if (!sessionIds.length) return [];
  return GuestWalletSessionModel.find({ sessionId: { $in: sessionIds } })
    .lean<GuestWalletSession[]>()
    .exec();
}
