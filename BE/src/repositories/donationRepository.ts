import {
  aggregateDonationSummaryByProjectId,
  findDonationsByProjectId,
  findLatestIndexedBlockNumber,
  upsertDonationByTransactionHash,
  DonationRecord
} from '../models/donationModel';
import { findPublicSupportProjectByProjectId, findPublicSupportProjects, ProjectRecord } from '../models/projectModel';

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

/** Hàm upsert bản ghi donation theo transactionHash. Mục đích: đảm bảo index on-chain idempotent không ghi trùng event. */
export async function upsertDonationRecordByTransactionHash(payload: DonationRecord): Promise<DonationRecord> {
  return upsertDonationByTransactionHash(payload);
}

/** Hàm lấy block mới nhất đã index. Mục đích: hỗ trợ sync event theo cơ chế incremental. */
export async function getLatestIndexedBlockNumberFromRepository(): Promise<number> {
  return findLatestIndexedBlockNumber();
}
