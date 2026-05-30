import {
  GuestDonationRiskModel,
  GuestDonationRisk,
  RiskLevel
} from '../models/guestDonationRiskModel';

/**
 * Hàm tìm bản ghi risk theo sessionId.
 * Mục đích: lấy risk score hiện tại của một phiên guest wallet.
 */
export async function findGuestDonationRiskBySessionId(
  sessionId: string
): Promise<GuestDonationRisk | null> {
  return GuestDonationRiskModel.findOne({ sessionId })
    .lean<GuestDonationRisk>()
    .exec();
}

/**
 * Hàm tìm bản ghi risk theo walletAddress.
 * Mục đích: kiểm tra lịch sử risk của một ví trước khi sponsor paymaster.
 */
export async function findGuestDonationRiskByWalletAddress(
  walletAddress: string
): Promise<GuestDonationRisk | null> {
  return GuestDonationRiskModel.findOne({ walletAddress })
    .lean<GuestDonationRisk>()
    .exec();
}

/**
 * Hàm upsert bản ghi risk evaluation cho một phiên.
 * Mục đích: cập nhật risk score sau mỗi lần đánh giá (tạo session hoặc donate).
 * Sử dụng upsert để tạo record mới nếu chưa có, hoặc cập nhật nếu đã tồn tại.
 */
export async function upsertGuestDonationRisk(
  sessionId: string,
  riskData: Partial<GuestDonationRisk>
): Promise<GuestDonationRisk> {
  const now = new Date();
  const result = await GuestDonationRiskModel.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        ...riskData,
        lastEvaluatedAt: now,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  )
    .lean<GuestDonationRisk>()
    .exec();
  return result;
}

/**
 * Hàm đánh dấu một session là cluster suspect.
 * Mục đích: ghi nhận khi phát hiện nhiều wallets cùng fingerprint/IP có thể là Sybil farm.
 */
export async function markAsClusterSuspect(
  sessionId: string,
  clusterId: string
): Promise<GuestDonationRisk | null> {
  const updated = await GuestDonationRiskModel.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        clusterSuspect: true,
        clusterId,
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  )
    .lean<GuestDonationRisk>()
    .exec();
  return updated;
}

/**
 * Hàm đếm số wallet trong cùng cluster.
 * Mục đích: kiểm tra mức độ nghiêm trọng của cluster — nếu >5 wallets cùng cluster → flag cao.
 */
export async function countClusterMembers(clusterId: string): Promise<number> {
  return GuestDonationRiskModel.countDocuments({ clusterId }).exec();
}

/**
 * Hàm tìm tất cả cluster suspects có phân trang.
 * Mục đích: gửi danh sách cho admin dashboard khi guest donations > 60% total.
 */
export async function findAllClusterSuspects(
  limitCount: number = 100,
  skipCount: number = 0
): Promise<GuestDonationRisk[]> {
  return GuestDonationRiskModel.find({ clusterSuspect: true })
    .skip(skipCount)
    .limit(limitCount)
    .lean<GuestDonationRisk[]>()
    .exec();
}

/**
 * Hàm xác định riskLevel và trustMultiplier từ riskScore.
 * Mục đích: chuẩn hóa việc map score → level để đảm bảo nhất quán.
 *
 * Quy tắc:
 * - 0-25:   SAFE      → trustMultiplier = 1.0
 * - 26-50:  LOW       → trustMultiplier = 0.8
 * - 51-70:  MEDIUM    → trustMultiplier = 0.5
 * - 71-90:  HIGH      → trustMultiplier = 0.2 (không block, dùng Token Paymaster)
 * - 91-100: CRITICAL  → trustMultiplier = 0.2 (không block hoàn toàn, Token Paymaster)
 */
export function computeRiskLevelAndMultiplier(
  riskScore: number
): { riskLevel: RiskLevel; trustMultiplier: number } {
  if (riskScore <= 25) {
    return { riskLevel: 'SAFE', trustMultiplier: 1.0 };
  }
  if (riskScore <= 50) {
    return { riskLevel: 'LOW', trustMultiplier: 0.8 };
  }
  if (riskScore <= 70) {
    return { riskLevel: 'MEDIUM', trustMultiplier: 0.5 };
  }
  if (riskScore <= 90) {
    return { riskLevel: 'HIGH', trustMultiplier: 0.2 };
  }
  return { riskLevel: 'CRITICAL', trustMultiplier: 0.2 };
}
