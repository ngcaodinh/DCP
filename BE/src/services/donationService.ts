import { ethers } from 'ethers';
import { getLogger } from '../config/logger';
import {
  findDonationHistoryByProjectId,
  findDonationSummaryByProjectId,
  findPublicCampaignByProjectId,
  findPublicCampaigns,
  findPublicDonorListPaginated,
  getLatestIndexedBlockNumberFromRepository,
  upsertDonationRecordByTransactionHash
} from '../repositories/donationRepository';
import { findUserById, updateUser } from '../models/authModel';
import { getZeroDevConfig } from '../config/zeroDev';
import { createKernelClientFromEncryptedOwnerKey } from './zeroDevService';
import { ApplicationError } from '../utils/applicationError';
import { applyDonationToMetrics } from './rankingIncrementalService';
import { invalidateRankingCache } from './rankingCacheService';

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

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const;

const donationContractAbi = [
  {
    type: 'function',
    name: 'charityToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    type: 'function',
    name: 'donate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'isAnonymous', type: 'bool' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const;

/** Hàm chuẩn hóa projectId sang bigint. Mục đích: hỗ trợ cả mã số thuần và mã dạng PRJ-1001 cho call on-chain. */
function normalizeProjectIdToBigInt(projectId: string): bigint {
  const normalizedProjectId = projectId.trim();
  if (/^[0-9]+$/.test(normalizedProjectId)) {
    return BigInt(normalizedProjectId);
  }

  const numericPartMatch = normalizedProjectId.match(/([0-9]+)/);
  if (!numericPartMatch?.[1]) {
    throw new ApplicationError('projectId không hợp lệ để gửi giao dịch.', 400, 'VALIDATION_ERROR');
  }

  return BigInt(numericPartMatch[1]);
}

/** Hàm gửi donation one-click bằng ZeroDev. Mục đích: backend batch approve + donate để frontend không cần popup MetaMask. */
export async function executeOneClickDonation(authenticatedUserId: string, projectId: string, amount: number, isAnonymous: boolean) {
  const normalizedAmount = Math.floor(Number(amount));
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new ApplicationError('Số token quyên góp phải lớn hơn 0.', 400, 'VALIDATION_ERROR');
  }

  const authenticatedUser = await findUserById(authenticatedUserId.trim());
  if (!authenticatedUser) {
    throw new ApplicationError('Không tìm thấy người dùng đăng nhập.', 404, 'NOT_FOUND');
  }
  if (!authenticatedUser.smartAccountOwnerEncryptedPrivateKey) {
    throw new ApplicationError('Tài khoản chưa sẵn sàng cho luồng one-click donation.', 400, 'VALIDATION_ERROR');
  }

  const donationContractAddress = String(process.env.DONATION_RANKING_CONTRACT_ADDRESS || '').trim() as `0x${string}`;
  if (!donationContractAddress) {
    throw new ApplicationError('Thiếu cấu hình DONATION_RANKING_CONTRACT_ADDRESS.', 500, 'INTERNAL_ERROR');
  }

  const paymasterEnabledKernelClient = await createKernelClientFromEncryptedOwnerKey(authenticatedUser.smartAccountOwnerEncryptedPrivateKey);
  const paymasterEnabledKernelClientAccount = (paymasterEnabledKernelClient as { account?: { address?: `0x${string}` } }).account;
  if (!paymasterEnabledKernelClientAccount?.address) {
    throw new ApplicationError('Không thể lấy smart account address để gửi giao dịch.', 500, 'INTERNAL_ERROR');
  }

  const projectIdAsBigInt = normalizeProjectIdToBigInt(projectId);
  const donationAmountAsBigInt = BigInt(normalizedAmount);
  const maxApprovalAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  const normalizedAuthenticatedWalletAddress = String(authenticatedUser.walletAddress || '').trim().toLowerCase();
  const normalizedKernelAccountAddress = paymasterEnabledKernelClientAccount.address.toLowerCase();

  // Ghi chú logic phức tạp: nếu ví trong hồ sơ user lệch với smart account dựng từ owner key,
  // hệ thống tự đồng bộ lại DB ngay tại thời điểm donation để xử lý dứt điểm dữ liệu user cũ.
  if (normalizedAuthenticatedWalletAddress && normalizedAuthenticatedWalletAddress !== normalizedKernelAccountAddress) {
    await updateUser({
      ...authenticatedUser,
      walletAddress: normalizedKernelAccountAddress
    });

    logger.warn('Đã tự động đồng bộ walletAddress do phát hiện SMART_ACCOUNT_MISMATCH.', {
      correlationId: authenticatedUser.correlationId,
      walletAddress: normalizedKernelAccountAddress,
      smartAccountAddress: normalizedKernelAccountAddress
    });
  }

  const readOnlyProvider = new ethers.JsonRpcProvider(getZeroDevConfig().rpcUrl);
  const donationContract = new ethers.Contract(donationContractAddress, donationContractAbi, readOnlyProvider);
  const charityTokenAddress = (await donationContract.charityToken()) as `0x${string}`;
  const charityTokenContract = new ethers.Contract(charityTokenAddress, erc20Abi, readOnlyProvider);
  const currentTokenBalance = (await charityTokenContract.balanceOf(paymasterEnabledKernelClientAccount.address)) as bigint;

  if (currentTokenBalance < donationAmountAsBigInt) {
    throw new ApplicationError(
      `Số dư token trong smart account không đủ để quyên góp. Số dư hiện tại: ${currentTokenBalance.toString()} Token.`,
      400,
      'INSUFFICIENT_TOKEN_BALANCE'
    );
  }

  const currentAllowance = (await charityTokenContract.allowance(paymasterEnabledKernelClientAccount.address, donationContractAddress)) as bigint;

  const callList: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = [];

  if (currentAllowance < donationAmountAsBigInt) {
    callList.push({
      to: charityTokenAddress,
      data: charityTokenContract.interface.encodeFunctionData('approve', [donationContractAddress, maxApprovalAmount]) as `0x${string}`,
      value: 0n
    });
  }

  callList.push({
    to: donationContractAddress,
    data: donationContract.interface.encodeFunctionData('donate', [projectIdAsBigInt, donationAmountAsBigInt, Boolean(isAnonymous)]) as `0x${string}`,
    value: 0n
  });

  // Ghi chú logic phức tạp: hệ thống bắt buộc paymaster sponsor gas để đúng yêu cầu "deployer tài trợ phí gas".
  // Vì vậy khi paymaster policy không khớp, trả lỗi nghiệp vụ rõ ràng thay vì fallback sang self-sponsored.
  const sendTransactionPayload = {
    calls: callList,
    entryPointAddress: getZeroDevConfig().entryPointAddress
  };

  let transactionHash: string;
  try {
    transactionHash = await (paymasterEnabledKernelClient as any).sendTransaction(sendTransactionPayload);
  } catch (paymasterError) {
    const paymasterErrorMessage = (paymasterError as Error)?.message || '';
    const isPaymasterPolicyError =
      paymasterErrorMessage.includes('pm_getPaymasterStubData') ||
      paymasterErrorMessage.includes('did not match any gas sponsoring policies') ||
      paymasterErrorMessage.includes('no ERC20 gas token data present');

    if (isPaymasterPolicyError) {
      logger.error('Paymaster từ chối tài trợ gas cho one-click donation.', {
        paymasterErrorMessage,
        smartAccountAddress: paymasterEnabledKernelClientAccount.address,
        donationContractAddress
      });

      throw new ApplicationError(
        'Paymaster chưa cấu hình policy phù hợp để tài trợ phí gas cho giao dịch quyên góp.',
        400,
        'PAYMASTER_POLICY_MISMATCH'
      );
    }

    throw paymasterError;
  }

  logger.info('One-click donation transaction submitted.', { transactionHash });
  return {
    transactionHash,
    projectId: projectIdAsBigInt.toString(),
    amount: Number(donationAmountAsBigInt),
    isAnonymous: Boolean(isAnonymous)
  };
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

/** Hàm lấy danh sách nhà hảo tâm công khai. Mục đích: trả dữ liệu có phân trang theo page/limit và lọc theo projectId. */
export async function getPublicDonorList(pageNumber: number, limitCount: number, projectId?: string) {
  const normalizedPageNumber = Number.isFinite(pageNumber) ? Math.max(1, Math.floor(pageNumber)) : 1;
  const normalizedLimitCount = normalizeLimitCount(limitCount, 25, 75);
  return findPublicDonorListPaginated(normalizedPageNumber, normalizedLimitCount, projectId);
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
    // Incremental update running totals — O(1) thay vì full recalculate.
    // Mỗi event từ blockchain được cập nhật running totals ngay lập tức.
    await applyDonationToMetrics(donationEvent.projectId, donationEvent.amount, donationEvent.donorAddress);
  }

  // Ghi chú logic phức tạp: invalidate cache sau khi đồng bộ để GET /rankings trả dữ liệu mới.
  // Không còn triggerRealtimeRankingUpdate + enqueueRankingRecalculate vì incremental đã xử lý.
  if (donationEventList.length > 0) {
    await invalidateRankingCache();
  }

  logger.info(`Donation events synced successfully. totalSyncedEvents=${donationEventList.length} fromBlockNumber=${fromBlockNumber}`);
  return { totalSyncedEvents: donationEventList.length, fromBlockNumber };
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
    throw new ApplicationError('Không tìm thấy thông tin người dùng để ghi nhận quyên góp.', 404, 'NOT_FOUND');
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

    let parsedLog: ethers.LogDescription | null = null;
    try {
      // Ghi chú logic phức tạp: parseLog có thể throw khi log thuộc event khác cùng contract,
      // vì vậy cần bắt lỗi và bỏ qua để tiếp tục quét toàn bộ receipt logs.
      parsedLog = eventInterface.parseLog({ topics: receiptLog.topics, data: receiptLog.data });
    } catch {
      continue;
    }

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
      throw new ApplicationError('Ví người gửi giao dịch không khớp với ví của tài khoản đăng nhập.', 403, 'FORBIDDEN');
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

  // Ghi chú logic phức tạp: incremental update — O(1) update running totals thay vì
  // recalculate toàn bộ donations (trước đây dùng triggerRealtimeRankingUpdate + enqueueRankingRecalculate).
  // Phương pháp mới: applyDonationToMetrics cập nhật running totals trong metrics document,
  // không cần query lại tất cả donations. Bảng xếp hạng phản ánh ngay kết quả donation.
  await applyDonationToMetrics(
    donationEventRecord.projectId,
    donationEventRecord.amount,
    donationEventRecord.donorAddress
  );

  return {
    transactionHash: donationEventRecord.transactionHash,
    projectId: donationEventRecord.projectId,
    amount: donationEventRecord.amount,
    timestamp: donationEventRecord.timestamp.toISOString(),
    isAnonymous: donationEventRecord.isAnonymous
  };
}
