import { ethers } from 'ethers';
import { getLogger } from '../config/logger';
import {
  findDonationHistoryByProjectId,
  findDonationSummaryByProjectId,
  findPublicCampaignByProjectId,
  findPublicCampaigns,
  getLatestIndexedBlockNumberFromRepository,
  upsertDonationRecordByTransactionHash
} from '../repositories/donationRepository';
import { ApplicationError } from '../utils/applicationError';

const logger = getLogger();

type DonationEventLog = {
  transactionHash: string;
  projectId: string;
  donorAddress: string;
  amount: number;
  timestamp: Date;
  isAnonymous: boolean;
  blockNumber: number;
  createdAt: Date;
  updatedAt: Date;
};

const donationReceivedEventAbi = [
  'event DonationReceived(address indexed donor, uint256 indexed projectId, uint256 amount, uint256 timestamp, bool isAnonymous)'
];

/** Hàm chuẩn hóa giới hạn bản ghi. Mục đích: tránh query quá lớn gây ảnh hưởng hiệu năng API public. */
function normalizeLimitCount(limitCount: number, defaultLimit = 20, maximumLimit = 100): number {
  if (!Number.isFinite(limitCount)) {
    return defaultLimit;
  }

  return Math.max(1, Math.min(maximumLimit, Math.floor(limitCount)));
}

/** Hàm lấy danh sách campaign public. Mục đích: trả dữ liệu chiến dịch cùng thống kê donation để frontend render trang UC3.1. */
export async function getPublicDonationCampaigns(limitCount: number) {
  const normalizedLimitCount = normalizeLimitCount(limitCount, 12, 24);
  const campaignRecords = await findPublicCampaigns(normalizedLimitCount);

  return Promise.all(
    campaignRecords.map(async campaignRecord => {
      const donationSummary = await findDonationSummaryByProjectId(campaignRecord.projectId);
      return {
        projectId: campaignRecord.projectId,
        name: campaignRecord.name,
        description: campaignRecord.description,
        goalAmount: campaignRecord.goalAmount,
        status: campaignRecord.status,
        donatedAmount: donationSummary.totalAmount,
        donationCount: donationSummary.donationCount,
        updatedAt: campaignRecord.updatedAt
      };
    })
  );
}

/** Hàm lấy chi tiết campaign public theo projectId. Mục đích: hiển thị đầy đủ thông tin và thống kê donate của một dự án. */
export async function getPublicDonationCampaignDetail(projectId: string) {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    throw new ApplicationError('projectId không hợp lệ.', 400, 'VALIDATION_ERROR');
  }

  const campaignRecord = await findPublicCampaignByProjectId(normalizedProjectId);
  if (!campaignRecord) {
    return null;
  }

  const donationSummary = await findDonationSummaryByProjectId(normalizedProjectId);
  return {
    projectId: campaignRecord.projectId,
    name: campaignRecord.name,
    description: campaignRecord.description,
    goalAmount: campaignRecord.goalAmount,
    status: campaignRecord.status,
    evidenceCids: campaignRecord.evidenceCids,
    donatedAmount: donationSummary.totalAmount,
    donationCount: donationSummary.donationCount,
    updatedAt: campaignRecord.updatedAt
  };
}

/** Hàm lấy lịch sử donation theo projectId. Mục đích: trả dữ liệu giao dịch công khai cho bảng lịch sử quyên góp. */
export async function getDonationHistoryByProjectId(projectId: string, limitCount: number) {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    throw new ApplicationError('projectId không hợp lệ.', 400, 'VALIDATION_ERROR');
  }

  const normalizedLimitCount = normalizeLimitCount(limitCount, 20, 100);
  return findDonationHistoryByProjectId(normalizedProjectId, normalizedLimitCount);
}

/** Hàm đồng bộ event DonationReceived từ blockchain. Mục đích: index giao dịch on-chain về MongoDB để API history truy vấn nhanh. */
export async function syncDonationEventsFromBlockchain() {
  const blockchainRpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
  const donationRankingContractAddress = process.env.DONATION_RANKING_CONTRACT_ADDRESS?.trim() || '';

  if (!blockchainRpcUrl || !donationRankingContractAddress) {
    throw new ApplicationError('Thiếu cấu hình đồng bộ blockchain.', 500, 'INTERNAL_ERROR');
  }

  const provider = new ethers.JsonRpcProvider(blockchainRpcUrl);
  const eventInterface = new ethers.Interface(donationReceivedEventAbi);
  const donationReceivedEvent = eventInterface.getEvent('DonationReceived');
  if (!donationReceivedEvent) {
    throw new ApplicationError('Không tìm thấy event DonationReceived trong ABI.', 500, 'INTERNAL_ERROR');
  }

  const eventTopic = donationReceivedEvent.topicHash;
  const latestIndexedBlockNumber = await getLatestIndexedBlockNumberFromRepository();
  const fromBlockNumber = latestIndexedBlockNumber > 0 ? latestIndexedBlockNumber + 1 : 0;

  const eventLogList = await provider.getLogs({
    address: donationRankingContractAddress,
    fromBlock: fromBlockNumber,
    toBlock: 'latest',
    topics: [eventTopic]
  });
  const now = new Date();

  const donationEventList: DonationEventLog[] = eventLogList.map(eventLog => {
    const parsedEvent = eventInterface.parseLog({ topics: eventLog.topics, data: eventLog.data });
    if (!parsedEvent) {
      throw new ApplicationError('Không thể parse event DonationReceived.', 500, 'INTERNAL_ERROR');
    }

    return {
      transactionHash: eventLog.transactionHash,
      projectId: parsedEvent.args.projectId.toString(),
      donorAddress: String(parsedEvent.args.donor).toLowerCase(),
      amount: Number(parsedEvent.args.amount),
      timestamp: new Date(Number(parsedEvent.args.timestamp) * 1000),
      isAnonymous: Boolean(parsedEvent.args.isAnonymous),
      blockNumber: eventLog.blockNumber,
      createdAt: now,
      updatedAt: now
    };
  });

  for (const donationEvent of donationEventList) {
    // Ghi chú logic phức tạp: sử dụng upsert theo transactionHash để đảm bảo đồng bộ idempotent khi job chạy lặp.
    await upsertDonationRecordByTransactionHash(donationEvent);
  }

  logger.info(`Donation events synced successfully. totalSyncedEvents=${donationEventList.length} fromBlockNumber=${fromBlockNumber}`);
  return { totalSyncedEvents: donationEventList.length, fromBlockNumber };
}

/** Hàm gửi giao dịch donate qua backend relay. Mục đích: hỗ trợ trải nghiệm Web2/AA không phụ thuộc MetaMask trực tiếp trên frontend. */
export async function submitDonationViaRelay(projectId: string, amount: number, isAnonymous: boolean) {
  const normalizedProjectId = projectId.trim();
  const parsedAmount = Number(amount);
  const blockchainRpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
  const donationRankingContractAddress = process.env.DONATION_RANKING_CONTRACT_ADDRESS?.trim() || '';
  const donationRelayerPrivateKey = process.env.DONATION_RELAYER_PRIVATE_KEY?.trim() || '';
  const expectedChainId = Number(process.env.BLOCKCHAIN_CHAIN_ID || 0);

  if (!normalizedProjectId || !Number.isInteger(Number(normalizedProjectId))) {
    throw new ApplicationError('projectId không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new ApplicationError('Số token quyên góp phải lớn hơn 0.', 400, 'VALIDATION_ERROR');
  }
  if (!blockchainRpcUrl || !donationRankingContractAddress || !donationRelayerPrivateKey) {
    throw new ApplicationError('Thiếu cấu hình relay donation trên hệ thống.', 500, 'INTERNAL_ERROR');
  }

  const provider = new ethers.JsonRpcProvider(blockchainRpcUrl);
  const network = await provider.getNetwork();
  if (expectedChainId > 0 && Number(network.chainId) !== expectedChainId) {
    throw new ApplicationError('Sai network blockchain của dịch vụ relay.', 400, 'CHAIN_MISMATCH');
  }

  const relayerWallet = new ethers.Wallet(donationRelayerPrivateKey, provider);
  const donationContract = new ethers.Contract(
    donationRankingContractAddress,
    ['function donate(uint256 projectId, uint256 amount, bool isAnonymous) external returns (bool)'],
    relayerWallet
  );

  // Ghi chú logic phức tạp: ép kiểu BigInt để tránh sai lệch số lớn khi serialize amount/projectId.
  const donationTransaction = await donationContract.donate(BigInt(normalizedProjectId), BigInt(Math.floor(parsedAmount)), isAnonymous);
  await donationTransaction.wait();

  return { transactionHash: donationTransaction.hash };
}


/** Hàm kiểm tra định dạng transaction hash. Mục đích: chặn dữ liệu sai trước khi gọi RPC blockchain. */
function isValidTransactionHash(transactionHashValue: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(transactionHashValue);
}

/** Hàm ghi nhận donation từ transaction hash của người dùng. Mục đích: xác minh event on-chain rồi upsert lịch sử donation công khai. */
export async function recordDonationFromTransactionHash(projectId: string, transactionHash: string, isAnonymous: boolean) {
  const normalizedProjectId = projectId.trim();
  const normalizedTransactionHash = transactionHash.trim();
  const blockchainRpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
  const donationRankingContractAddress = process.env.DONATION_RANKING_CONTRACT_ADDRESS?.trim() || '';
  const expectedChainId = Number(process.env.BLOCKCHAIN_CHAIN_ID || 0);

  if (!normalizedProjectId || !Number.isInteger(Number(normalizedProjectId))) {
    throw new ApplicationError('projectId không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
  if (!isValidTransactionHash(normalizedTransactionHash)) {
    throw new ApplicationError('transactionHash không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
  if (!blockchainRpcUrl || !donationRankingContractAddress) {
    throw new ApplicationError('Thiếu cấu hình blockchain để ghi nhận donation.', 500, 'INTERNAL_ERROR');
  }

  const provider = new ethers.JsonRpcProvider(blockchainRpcUrl);
  const network = await provider.getNetwork();
  if (expectedChainId > 0 && Number(network.chainId) !== expectedChainId) {
    throw new ApplicationError('Sai network blockchain của dịch vụ donation.', 400, 'CHAIN_MISMATCH');
  }

  const transactionReceipt = await provider.waitForTransaction(normalizedTransactionHash, 1, 90_000);
  if (!transactionReceipt) {
    throw new ApplicationError('Giao dịch đang pending quá lâu. Vui lòng thử lại sau.', 408, 'TRANSACTION_TIMEOUT');
  }
  if (transactionReceipt.status !== 1) {
    throw new ApplicationError('Giao dịch bị thất bại trên blockchain.', 400, 'TRANSACTION_REVERTED');
  }

  const eventInterface = new ethers.Interface(donationReceivedEventAbi);
  let donationEventRecord: DonationEventLog | null = null;

  for (const receiptLog of transactionReceipt.logs) {
    if (String(receiptLog.address).toLowerCase() !== donationRankingContractAddress.toLowerCase()) {
      continue;
    }

    const parsedLog = eventInterface.parseLog({ topics: receiptLog.topics, data: receiptLog.data });
    if (!parsedLog || parsedLog.name !== 'DonationReceived') {
      continue;
    }

    const parsedProjectId = parsedLog.args.projectId.toString();
    if (parsedProjectId !== normalizedProjectId) {
      continue;
    }

    // Ghi chú logic phức tạp: ưu tiên amount/timestamp on-chain để tránh client giả mạo dữ liệu request body.
    donationEventRecord = {
      transactionHash: normalizedTransactionHash,
      projectId: parsedProjectId,
      donorAddress: String(parsedLog.args.donor).toLowerCase(),
      amount: Number(parsedLog.args.amount),
      timestamp: new Date(Number(parsedLog.args.timestamp) * 1000),
      isAnonymous: Boolean(parsedLog.args.isAnonymous ?? isAnonymous),
      blockNumber: transactionReceipt.blockNumber,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    break;
  }

  if (!donationEventRecord) {
    throw new ApplicationError('Không tìm thấy event DonationReceived hợp lệ trong giao dịch.', 400, 'EVENT_NOT_FOUND');
  }

  await upsertDonationRecordByTransactionHash(donationEventRecord);

  return {
    transactionHash: donationEventRecord.transactionHash,
    projectId: donationEventRecord.projectId,
    amount: donationEventRecord.amount,
    timestamp: donationEventRecord.timestamp.toISOString(),
    isAnonymous: donationEventRecord.isAnonymous
  };
}
