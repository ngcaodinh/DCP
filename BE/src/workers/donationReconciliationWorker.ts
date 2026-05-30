/**
 * Worker reconciliation kiểm tra và khôi phục các donation bị kẹt trong pipeline.
 * Chạy mỗi 15 phút để phát hiện các UserOperation đã sponsor nhưng chưa index on-chain.
 *
 * Nhiệm vụ:
 * - Tìm các session có audit record đã tạo (PAYMASTER_REQUESTED) nhưng chưa có onChainTxHash
 * - Check ERC-20 CharityToken balance của guest wallet trên chain
 * - Set hasPendingDonation = true nếu balance > 0 để frontend hiển thị auto-resume modal
 * - Không gửi email — chỉ set flag cho frontend polling
 */
import { ethers } from 'ethers';
import { getLogger } from '../config/logger';
import {
  findUnindexedAudits,
  findAuditsBySessionId
} from '../repositories/anonymousDonationAuditRepository';
import {
  findGuestWalletSessionById,
  updateGuestWalletSession
} from '../repositories/guestWalletSessionRepository';

const logger = getLogger();

/**
 * Khoảng thời gian giữa các lần chạy worker (15 phút).
 */
const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Số bản ghi tối đa xử lý mỗi lần chạy.
 * Giới hạn batch để tránh quá tải RPC và MongoDB.
 */
const BATCH_SIZE = 100;

/**
 * Số request đồng thời tối đa đến RPC provider.
 * Giới hạn để tránh rate limit từ blockchain RPC provider.
 */
const RPC_CONCURRENCY = 10;

/**
 * ABI tối thiểu cho ERC-20 balanceOf.
 */
const ERC20_BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

/**
 * Ngưỡng balance tối thiểu (wei) để coi là "có tiền" và set flag pending donation.
 * Balance phải lớn hơn 0.
 */
const MIN_BALANCE_THRESHOLD = BigInt(1);

/**
 * RPC provider dùng chung cho toàn bộ worker lifecycle.
 * Khởi tạo 1 lần duy nhất — tránh tạo instance mới mỗi lần gọi balance.
 */
export let rpcProvider: ethers.JsonRpcProvider | null = null;

/**
 * Địa chỉ ERC-20 CharityToken contract để check token balance.
 */
export let charityTokenAddress: string | null = null;

/**
 * Reset trạng thái module-level giữa các test runs.
 * Cần gọi sau mỗi test để tránh singleton state leak.
 */
export function resetModuleState(): void {
  rpcProvider = null;
  charityTokenAddress = null;
}

/**
 * Hàm lấy địa chỉ CharityToken contract.
 * @returns Địa chỉ contract hoặc chuỗi rỗng nếu chưa cấu hình
 */
function getCharityTokenAddress(): string {
  if (charityTokenAddress === null) {
    charityTokenAddress = String(process.env.CHARITY_TOKEN_CONTRACT_ADDRESS || '').trim();
  }
  return charityTokenAddress;
}

/**
 * Hàm lấy hoặc khởi tạo RPC provider singleton.
 * @returns Provider instance hoặc null nếu chưa có RPC_URL
 */
function getRpcProvider(): ethers.JsonRpcProvider | null {
  const rpcUrl = getBlockchainRpcUrl();
  if (!rpcUrl) {
    return null;
  }
  if (!rpcProvider) {
    rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
  }
  return rpcProvider;
}

/**
 * Địa chỉ RPC để đọc on-chain balance.
 */
function getBlockchainRpcUrl(): string {
  return String(process.env.BLOCKCHAIN_RPC_URL || '').trim();
}

/**
 * Hàm extract message từ error object.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const msg = (error as Record<string, unknown>).message ?? (error as Record<string, unknown>).errorMessage;
    if (typeof msg === 'string') return msg;
  }
  return String(error);
}

/**
 * Hàm lấy số dư CharityToken ERC-20 của một ví trên chain.
 * Kiểm tra ERC-20 balance thay vì ETH balance để tránh false positive
 * (user có ETH nhưng chưa có token donation).
 *
 * @param walletAddress - Địa chỉ ví EVM cần kiểm tra
 * @returns Số dư token (wei) hoặc null nếu lỗi
 */
export async function getTokenBalance(walletAddress: string): Promise<bigint | null> {
  const provider = getRpcProvider();
  if (!provider) {
    logger.warn('[DonationReconciliation] BLOCKCHAIN_RPC_URL chưa được cấu hình.');
    return null;
  }

  const tokenAddress = getCharityTokenAddress();
  if (!tokenAddress) {
    logger.warn('[DonationReconciliation] CHARITY_TOKEN_CONTRACT_ADDRESS chưa được cấu hình.');
    return null;
  }

  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_BALANCE_OF_ABI, provider);
    const balance = await tokenContract.balanceOf(walletAddress) as bigint;
    return balance;
  } catch (error) {
    logger.error('[DonationReconciliation] Lỗi khi đọc ERC-20 balance on-chain.', {
      errorMessage: extractErrorMessage(error),
      walletAddress,
      charityTokenAddress: tokenAddress
    });
    return null;
  }
}

/**
 * Hàm kiểm tra và xử lý một session bị kẹt.
 * Logic:
 * 1. Đọc tất cả audit records của session
 * 2. Nếu có record đã sponsor nhưng chưa index → check on-chain balance
 * 3. Nếu balance > 0 → set hasPendingDonation = true
 *
 * @param sessionId - ID của phiên guest wallet
 * @returns true nếu đã set flag pending donation
 */
export async function reconcileSession(sessionId: string): Promise<boolean> {
  const session = await findGuestWalletSessionById(sessionId);
  if (!session) {
    logger.info(`[DonationReconciliation] Session ${sessionId} không tìm thấy trong DB.`);
    return false;
  }

  // Chỉ xử lý các session ACTIVE
  if (session.status !== 'ACTIVE') {
    return false;
  }

  const audits = await findAuditsBySessionId(sessionId);
  if (!audits.length) {
    return false;
  }

  // Kiểm tra xem có audit nào đã sponsor nhưng chưa index không
  const hasUnindexedDonation = audits.some(
    audit => audit.onChainTxHash === null && audit.paymasterSponsoredGas
  );

  if (!hasUnindexedDonation) {
    return false;
  }

  // Check ERC-20 CharityToken balance on-chain
  const balance = await getTokenBalance(session.walletAddress);
  if (balance === null) {
    // Lỗi RPC hoặc chưa cấu hình token — không set flag, để lần sau retry
    return false;
  }

  if (balance > MIN_BALANCE_THRESHOLD) {
    // Balance > 0 → có tiền → set flag pending donation
    await updateGuestWalletSession(sessionId, {
      hasPendingDonation: true,
      updatedAt: new Date()
    });

    logger.info(`[DonationReconciliation] Session ${sessionId} có pending donation. Flag đã được set.`);

    return true;
  }

  return false;
}

/**
 * Lớp semaphore để giới hạn số tác vụ chạy đồng thời.
 * Thay thế processWithConcurrencyLimit cũ (vòng for+await không đảm bảo concurrency).
 * Sử dụng: tạo instance với concurrency limit, gọi run() cho mỗi item.
 */
class Semaphore {
  private readonly maxConcurrent: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async (): Promise<void> => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.release();
        }
      };

      if (this.running < this.maxConcurrent) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }
}

/**
 * Hàm chạy reconciliation cho tất cả unindexed sessions.
 * Mỗi 15 phút, worker tìm các audit records chưa được index và check balance tương ứng.
 *
 * @returns Số session đã được set flag pending donation
 */
async function runReconciliation(): Promise<number> {
  logger.info('[DonationReconciliation] Bắt đầu reconciliation worker.');

  const unindexedAudits = await findUnindexedAudits(BATCH_SIZE);

  if (!unindexedAudits.length) {
    logger.info('[DonationReconciliation] Không có audit record nào cần reconcile.');
    return 0;
  }

  const sessionIds = [...new Set(unindexedAudits.map(audit => audit.sessionId))];
  logger.info(`[DonationReconciliation] Tìm thấy ${sessionIds.length} sessions cần reconcile (${unindexedAudits.length} unindexed audits).`);

  // Semaphore giới hạn số request RPC đồng thời tránh rate limit provider
  const semaphore = new Semaphore(RPC_CONCURRENCY);
  const tasks = sessionIds.map((sessionId) => () =>
    semaphore.run(async () => {
      try {
        return await reconcileSession(sessionId);
      } catch (error) {
        logger.error(`[DonationReconciliation] Lỗi khi reconcile session ${sessionId}.`, {
          errorMessage: extractErrorMessage(error)
        });
        return false;
      }
    })
  );

  const results = await Promise.all(tasks.map((task) => task()));

  const flaggedCount = results.filter(Boolean).length;
  logger.info(`[DonationReconciliation] Hoàn tất reconciliation. Đã flag ${flaggedCount} sessions có pending donation.`);
  return flaggedCount;
}

/**
 * Hàm khởi động donation reconciliation worker.
 * Chạy mỗi 15 phút bằng recursive setTimeout để đảm bảo mỗi lần
 * chạy hoàn tất trước khi tính delay cho lần tiếp theo.
 */
export function startDonationReconciliationWorker(): void {
  logger.info('Donation reconciliation worker khởi động (chạy mỗi 15 phút).');

  const runWithInterval = (): void => {
    setTimeout(async () => {
      try {
        await runReconciliation();
      } catch (error) {
        logger.error('[DonationReconciliation] Reconciliation worker thất bại.', {
          errorMessage: extractErrorMessage(error)
        });
      }

      runWithInterval();
    }, RECONCILIATION_INTERVAL_MS);
  };

  runWithInterval();
}
