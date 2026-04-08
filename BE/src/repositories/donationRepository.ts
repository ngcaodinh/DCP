import {
  aggregateDonationSummaryByProjectId,
  findDonations,
  findDonationsByProjectId,
  findLatestIndexedBlockNumber,
  upsertDonationByTransactionHash,
  DonationRecord
} from '../models/donationModel';
import { findUsersByWalletAddressList } from '../models/authModel';
import { findPublicSupportProjectByProjectId, findPublicSupportProjects, ProjectRecord } from '../models/projectModel';

export type DonorPublicListItem = {
  fullName: string;
  gmail: string;
  donatedAmount: number;
  donatedAt: Date;
  transactionHash: string;
};

/** Hàm lấy danh sách dự án public cần hỗ trợ. Mục đích: cung cấp dữ liệu nền cho màn hình campaign quyên góp công khai. */
export async function findPublicCampaigns(limitCount: number): Promise<ProjectRecord[]> {
  return findPublicSupportProjects(limitCount);
}

/** Hàm lấy chi tiết dự án public theo projectId. Mục đích: phục vụ màn hình chi tiết campaign trước khi người dùng donate. */
export async function findPublicCampaignByProjectId(projectId: string): Promise<ProjectRecord | null> {
  return findPublicSupportProjectByProjectId(projectId);
}

/** Hàm lấy lịch sử donation theo projectId. Mục đích: hiển thị bảng giao dịch quyên góp minh bạch trên UI. */
export async function findDonationHistoryByProjectId(projectId: string, limitCount: number): Promise<DonationRecord[]> {
  return findDonationsByProjectId(projectId, limitCount);
}

/** Hàm lấy tổng hợp donation theo projectId. Mục đích: trả tổng số tiền và số lượt donate cho card thống kê chiến dịch. */
export async function findDonationSummaryByProjectId(projectId: string): Promise<{ totalAmount: number; donationCount: number }> {
  return aggregateDonationSummaryByProjectId(projectId);
}

/** Hàm lấy danh sách nhà hảo tâm công khai. Mục đích: ghép donation với hồ sơ người dùng và hỗ trợ lọc theo projectId. */
export async function findPublicDonorList(limitCount: number, projectId?: string): Promise<DonorPublicListItem[]> {
  const normalizedProjectId = String(projectId || '').trim();

  // Ghi chú logic phức tạp: ưu tiên query theo projectId khi có truyền vào, nếu không thì trả danh sách toàn cục như hành vi cũ.
  const donationList = normalizedProjectId
    ? await findDonationsByProjectId(normalizedProjectId, limitCount)
    : await findDonations(limitCount);

  if (!donationList.length) {
    return [];
  }

  const walletAddressList = Array.from(new Set(donationList.map(donationItem => donationItem.donorAddress.toLowerCase())));
  const userList = await findUsersByWalletAddressList(walletAddressList);
  const userByWalletAddressMap = new Map(userList.map(userItem => [String(userItem.walletAddress || '').toLowerCase(), userItem]));

  return donationList.map(donationItem => {
    const mappedUser = userByWalletAddressMap.get(donationItem.donorAddress.toLowerCase());
    return {
      fullName: mappedUser?.fullName || 'Ẩn danh',
      gmail: mappedUser?.email || 'Không công khai',
      donatedAmount: donationItem.amount,
      donatedAt: donationItem.timestamp,
      transactionHash: donationItem.transactionHash
    };
  });
}

/** Hàm upsert bản ghi donation theo transactionHash. Mục đích: đảm bảo index on-chain idempotent không ghi trùng event. */
export async function upsertDonationRecordByTransactionHash(payload: DonationRecord): Promise<DonationRecord> {
  return upsertDonationByTransactionHash(payload);
}

/** Hàm lấy block mới nhất đã index. Mục đích: hỗ trợ sync event theo cơ chế incremental. */
export async function getLatestIndexedBlockNumberFromRepository(): Promise<number> {
  return findLatestIndexedBlockNumber();
}

