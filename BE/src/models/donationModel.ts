import mongoose, { Schema } from 'mongoose';

export type DonationStatus = 'PENDING_ONCHAIN' | 'ONCHAIN_CONFIRMED' | 'INDEXED';

export type DonationRecord = {
  transactionHash: string;
  projectId: string;
  donorAddress: string;
  amount: number;
  timestamp: Date;
  isAnonymous: boolean;
  blockNumber: number;
  donationStatus: DonationStatus;
  onChainConfirmedAt: Date;
  indexedAt: Date;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
};

const donationSchema = new Schema<DonationRecord>({
  transactionHash: { type: String, required: true, unique: true },
  projectId: { type: String, required: true, index: true },
  donorAddress: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  timestamp: { type: Date, required: true, index: true },
  isAnonymous: { type: Boolean, required: true },
  blockNumber: { type: Number, required: true, index: true },
  donationStatus: { type: String, required: true, enum: ['PENDING_ONCHAIN', 'ONCHAIN_CONFIRMED', 'INDEXED'], default: 'INDEXED' },
  onChainConfirmedAt: { type: Date, required: true },
  indexedAt: { type: Date, required: true },
  correlationId: { type: String, required: true, index: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
});

const DonationMongoModel = mongoose.model<DonationRecord>('Donation', donationSchema);

/** Hàm upsert donation theo transaction hash. Mục đích: đảm bảo indexer không ghi trùng dữ liệu event on-chain. */
export async function upsertDonationByTransactionHash(payload: DonationRecord): Promise<DonationRecord> {
  const updatedDonation = await DonationMongoModel.findOneAndUpdate(
    { transactionHash: payload.transactionHash },
    payload,
    { upsert: true, returnDocument: 'after' }
  ).exec();

  return updatedDonation!.toObject() as DonationRecord;
}

/** Hàm lấy danh sách donation theo project. Mục đích: phục vụ API lịch sử quyên góp minh bạch theo UC3.1. */
export async function findDonationsByProjectId(projectId: string, limitCount: number): Promise<DonationRecord[]> {
  return DonationMongoModel.find({ projectId }).sort({ timestamp: -1 }).limit(limitCount).lean<DonationRecord[]>().exec();
}

/** Hàm lấy tổng donation theo project. Mục đích: trả về số tiền đã quyên góp để hiển thị ở danh sách và trang chi tiết. */
export async function aggregateDonationSummaryByProjectId(projectId: string): Promise<{ totalAmount: number; donationCount: number }> {
  const aggregateResult = await DonationMongoModel.aggregate<{ totalAmount: number; donationCount: number }>([
    { $match: { projectId } },
    { $group: { _id: null, totalAmount: { $sum: '$amount' }, donationCount: { $sum: 1 } } }
  ]);

  if (!aggregateResult.length) {
    return { totalAmount: 0, donationCount: 0 };
  }

  return { totalAmount: aggregateResult[0].totalAmount, donationCount: aggregateResult[0].donationCount };
}

/** Hàm lấy block lớn nhất đã index. Mục đích: hỗ trợ endpoint sync event chỉ đọc block mới. */
export async function findLatestIndexedBlockNumber(): Promise<number> {
  const latestRecord = await DonationMongoModel.findOne({}).sort({ blockNumber: -1 }).lean<DonationRecord>().exec();
  return latestRecord?.blockNumber || 0;
}


