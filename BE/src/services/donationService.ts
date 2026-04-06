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
import { findUserById } from '../models/authModel';
import { ApplicationError } from '../utils/applicationError';

const logger = getLogger();

type DonationStatus = 'PENDING_ONCHAIN' | 'ONCHAIN_CONFIRMED' | 'INDEXED';

type DonationEventLog = {
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

const donationReceivedEventAbi = [
  'event DonationReceived(address indexed donor, uint256 indexed projectId, uint256 amount, uint256 timestamp, bool isAnonymous)'
];

const donationRelayContractAbi = [
  'function donate(uint256 projectId, uint256 amount, bool isAnonymous) external returns (bool)',
  'error InvalidAddress()',
  'error InvalidProjectId()',
  'error InvalidAmount()',
  'error ProjectNotFound()',
  'error InvalidProjectState()',
  'error InvalidProjectStateTransition()',
  'error TransferFromFailed()',
  'error EnforcedPause()',
  'error ExpectedPause()',
  'error ReentrancyGuardReentrantCall()',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)'
];

type DecodedContractRevert = {
  selector: string;
  errorName: string;
};

/** Hàm lấy selector từ revert data. Mục đích: tách 4-byte selector để fallback decode khi parseError thất bại. */
function extractRevertSelector(revertData: string): string {
  if (!revertData.startsWith('0x') || revertData.length < 10) {
    return '';
  }

  return revertData.slice(0, 10).toLowerCase();
}

/** Hàm decode custom error từ contract. Mục đích: chuyển dữ liệu revert thành tên lỗi nghiệp vụ để map response ổn định. */
function decodeDonationRelayRevert(revertData: string): DecodedContractRevert {
  const donationInterface = new ethers.Interface(donationRelayContractAbi);
  const fallbackSelectorMap: Record<string, string> = {
    '0x4c4f68ca': 'ProjectNotFound'
  };

  const selector = extractRevertSelector(revertData);
  try {
    const parsedError = donationInterface.parseError(revertData);
    if (parsedError) {
      return { selector, errorName: parsedError.name };
    }
  } catch {
    // Ghi chú logic phức tạp: parseError có thể fail với dữ liệu revert cắt ngắn, nên phải fallback theo selector map.
  }

  return {
    selector,
    errorName: fallbackSelectorMap[selector] || 'UnknownContractError'
  };
}

/** Hàm map lỗi contract revert sang ApplicationError. Mục đích: trả message thân thiện và errorCode ổn định cho frontend. */
function mapDonationRelayRevertToApplicationError(decodedRevert: DecodedContractRevert): ApplicationError {
  const errorNameToApplicationErrorMap: Record<string, ApplicationError> = {
    ProjectNotFound: new ApplicationError('Dự án quyên góp không tồn tại trên blockchain.', 404, 'PROJECT_NOT_FOUND'),
    InvalidProjectId: new ApplicationError('Mã dự án không hợp lệ.', 400, 'VALIDATION_ERROR'),
    InvalidAmount: new ApplicationError('Số token quyên góp không hợp lệ.', 400, 'AMOUNT_INVALID'),
    InvalidProjectState: new ApplicationError('Dự án hiện không ở trạng thái nhận quyên góp.', 400, 'PROJECT_NOT_ACTIVE'),
    AccessControlUnauthorizedAccount: new ApplicationError('Tài khoản relay chưa được cấp quyền trên contract donation.', 403, 'UNAUTHORIZED_RELAYER'),
    EnforcedPause: new ApplicationError('Hệ thống donation on-chain đang tạm dừng để bảo trì.', 503, 'CONTRACT_REVERTED'),
    TransferFromFailed: new ApplicationError('Giao dịch token thất bại. Vui lòng kiểm tra số dư hoặc cấp quyền token cho ví relay.', 400, 'CONTRACT_REVERTED'),
    ERC20InsufficientBalance: new ApplicationError('Ví relay không đủ số dư token để thực hiện quyên góp.', 400, 'CONTRACT_REVERTED'),
    ERC20InsufficientAllowance: new ApplicationError('Ví relay chưa được cấp đủ quyền sử dụng token để quyên góp.', 400, 'CONTRACT_REVERTED')
  };

  return (
    errorNameToApplicationErrorMap[decodedRevert.errorName] ||
    new ApplicationError('Giao dịch quyên góp bị từ chối bởi smart contract.', 400, 'CONTRACT_REVERTED')
  );
}

/** Hàm lấy revert data từ lỗi ethers. Mục đích: gom nhiều cấu trúc lỗi khác nhau của CALL_EXCEPTION về một định dạng chung. */
function extractRevertDataFromEthersError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const possibleError = error as {
    data?: string;
    info?: { error?: { data?: string } };
    error?: { data?: string };
  };

  if (typeof possibleError.data === 'string') {
    return possibleError.data;
  }
  if (typeof possibleError.info?.error?.data === 'string') {
    return possibleError.info.error.data;
  }
  if (typeof possibleError.error?.data === 'string') {
    return possibleError.error.data;
  }

  return '';
}

/** Hàm chuẩn hóa lỗi donate relay từ ethers. Mục đích: bắt CALL_EXCEPTION và map sang lỗi nghiệp vụ trước khi trả về controller. */
function normalizeDonationRelayError(error: unknown, logContext: Record<string, unknown>): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  const errorWithCode = error as { code?: string };
  if (errorWithCode?.code === 'CALL_EXCEPTION') {
    const revertData = extractRevertDataFromEthersError(error);
    const decodedRevert = decodeDonationRelayRevert(revertData);
    const mappedError = mapDonationRelayRevertToApplicationError(decodedRevert);

    logger.error('Donation relay contract call reverted.', {
      ...logContext,
      selector: decodedRevert.selector,
      errorName: decodedRevert.errorName
    });

    return mappedError;
  }

  logger.error('Donation relay transaction failed with unexpected error.', {
    ...logContext,
    errorMessage: (error as Error)?.message || 'Unknown error'
  });

  return new ApplicationError('Không thể gửi giao dịch quyên góp lúc này. Vui lòng thử lại sau.', 500, 'INTERNAL_ERROR');
}

/** Hàm tạo correlation id cho donation. Mục đích: gắn định danh xuyên suốt để trace luồng on-chain và off-chain. */
function generateDonationCorrelationId(transactionHash: string): string {
  return `donation:${transactionHash.toLowerCase()}`;
}

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
      donationStatus: 'INDEXED',
      onChainConfirmedAt: now,
      indexedAt: now,
      correlationId: generateDonationCorrelationId(eventLog.transactionHash),
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
  // Ghi chú logic phức tạp: hỗ trợ cả tên biến cấu hình mới và legacy để tránh vỡ môi trường cũ.
  const donationRankingContractAddress =
    process.env.DONATION_RANKING_CONTRACT_ADDRESS?.trim() ||
    process.env.DONATION_RANKING_ADDRESS?.trim() ||
    '';
  const donationRelayerPrivateKey =
    process.env.DONATION_RELAYER_PRIVATE_KEY?.trim() ||
    process.env.BACKEND_MINTER_PRIVATE_KEY?.trim() ||
    '';
  const expectedChainId = Number(process.env.BLOCKCHAIN_CHAIN_ID || 0);

  if (!normalizedProjectId || !Number.isInteger(Number(normalizedProjectId))) {
    throw new ApplicationError('projectId không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new ApplicationError('Số token quyên góp phải lớn hơn 0.', 400, 'AMOUNT_INVALID');
  }
  if (!blockchainRpcUrl || !donationRankingContractAddress || !donationRelayerPrivateKey) {
    throw new ApplicationError(
      'Thiếu cấu hình relay donation. Cần BLOCKCHAIN_RPC_URL, DONATION_RANKING_CONTRACT_ADDRESS (hoặc DONATION_RANKING_ADDRESS), DONATION_RELAYER_PRIVATE_KEY (hoặc BACKEND_MINTER_PRIVATE_KEY).',
      500,
      'INTERNAL_ERROR'
    );
  }

  const provider = new ethers.JsonRpcProvider(blockchainRpcUrl);
  const network = await provider.getNetwork();
  if (expectedChainId > 0 && Number(network.chainId) !== expectedChainId) {
    throw new ApplicationError('Sai network blockchain của dịch vụ relay.', 400, 'CHAIN_MISMATCH');
  }

  const relayerWallet = new ethers.Wallet(donationRelayerPrivateKey, provider);
  const relayLogContext = {
    projectId: normalizedProjectId,
    amount: Math.floor(parsedAmount),
    relayerAddress: relayerWallet.address.toLowerCase(),
    contractAddress: donationRankingContractAddress,
    chainId: Number(network.chainId)
  };

  const donationContract = new ethers.Contract(donationRankingContractAddress, donationRelayContractAbi, relayerWallet);

  try {
    // Ghi chú logic phức tạp: ép kiểu BigInt để tránh sai lệch số lớn khi serialize amount/projectId.
    const donationTransaction = await donationContract.donate(BigInt(normalizedProjectId), BigInt(Math.floor(parsedAmount)), isAnonymous);
    await donationTransaction.wait();

    logger.info('Donation relay transaction submitted successfully.', {
      ...relayLogContext,
      transactionHash: donationTransaction.hash
    });

    return { transactionHash: donationTransaction.hash };
  } catch (error) {
    throw normalizeDonationRelayError(error, relayLogContext);
  }
}


/** Hàm kiểm tra định dạng transaction hash. Mục đích: chặn dữ liệu sai trước khi gọi RPC blockchain. */
function isValidTransactionHash(transactionHashValue: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(transactionHashValue);
}

/** Hàm ghi nhận donation từ transaction hash của người dùng. Mục đích: xác minh event on-chain rồi upsert lịch sử donation công khai. */
export async function recordDonationFromTransactionHash(authenticatedUserId: string, projectId: string, transactionHash: string, isAnonymous: boolean) {
  const normalizedAuthenticatedUserId = authenticatedUserId.trim();
  const normalizedProjectId = projectId.trim();
  const normalizedTransactionHash = transactionHash.trim();
  const blockchainRpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
  const donationRankingContractAddress = process.env.DONATION_RANKING_CONTRACT_ADDRESS?.trim() || '';
  const expectedChainId = Number(process.env.BLOCKCHAIN_CHAIN_ID || 0);

  if (!normalizedAuthenticatedUserId) {
    throw new ApplicationError('userId không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
  if (!normalizedProjectId || !Number.isInteger(Number(normalizedProjectId))) {
    throw new ApplicationError('projectId không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
  if (!isValidTransactionHash(normalizedTransactionHash)) {
    throw new ApplicationError('transactionHash không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
  if (!blockchainRpcUrl || !donationRankingContractAddress) {
    throw new ApplicationError('Thiếu cấu hình blockchain để ghi nhận donation.', 500, 'INTERNAL_ERROR');
  }

  const authenticatedUser = await findUserById(normalizedAuthenticatedUserId);
  if (!authenticatedUser) {
    throw new ApplicationError('Không tìm thấy thông tin người dùng để ghi nhận quyên góp.', 404, 'USER_NOT_FOUND');
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

    const donorAddressOnChain = String(parsedLog.args.donor).toLowerCase();
    const authenticatedUserWalletAddress = String(authenticatedUser.walletAddress || '').toLowerCase();

    // Ghi chú logic phức tạp: bắt buộc ví người ký on-chain trùng ví đã xác thực để chặn giả mạo txHash giữa các tài khoản.
    if (!authenticatedUserWalletAddress || donorAddressOnChain !== authenticatedUserWalletAddress) {
      throw new ApplicationError('Ví người gửi giao dịch không khớp với ví của tài khoản đăng nhập.', 403, 'DONOR_MISMATCH');
    }

    // Ghi chú logic phức tạp: ưu tiên amount/timestamp on-chain để tránh client giả mạo dữ liệu request body.
    const now = new Date();
    donationEventRecord = {
      transactionHash: normalizedTransactionHash,
      projectId: parsedProjectId,
      donorAddress: donorAddressOnChain,
      amount: Number(parsedLog.args.amount),
      timestamp: new Date(Number(parsedLog.args.timestamp) * 1000),
      isAnonymous: Boolean(parsedLog.args.isAnonymous ?? isAnonymous),
      blockNumber: transactionReceipt.blockNumber,
      donationStatus: 'INDEXED',
      onChainConfirmedAt: now,
      indexedAt: now,
      correlationId: generateDonationCorrelationId(normalizedTransactionHash),
      createdAt: now,
      updatedAt: now
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
