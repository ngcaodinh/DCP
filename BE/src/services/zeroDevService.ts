import crypto from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { getZeroDevConfig } from '../config/zeroDev';
import { getLogger } from '../config/logger';
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient
} from '@zerodev/sdk';
import { http, createPublicClient } from 'viem';

const logger = getLogger();
const zeroDevConfig = getZeroDevConfig();
let cachedPublicClient: ReturnType<typeof createPublicClient> | null = null;
let cachedPaymasterClient: ReturnType<typeof createZeroDevPaymasterClient> | null = null;

/**
 * Hàm tạo tài khoản owner cho Smart Account.
 * Mục đích: sinh khóa ký đại diện cho người dùng mới.
 */
function createOwnerAccount() {
  const privateKey = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

/**
 * Hàm lấy public client ZeroDev dùng chung.
 * Mục đích: tái sử dụng kết nối RPC để giảm chi phí khởi tạo.
 */
function getPublicClient() {
  if (!cachedPublicClient) {
    cachedPublicClient = createPublicClient({
      transport: http(zeroDevConfig.rpcUrl)
    });
  }
  return cachedPublicClient;
}

/**
 * Hàm lấy paymaster client dùng chung.
 * Mục đích: tránh khởi tạo lại client cho mỗi lần tạo ví.
 */
function getPaymasterClient() {
  if (!cachedPaymasterClient) {
    cachedPaymasterClient = createZeroDevPaymasterClient({
      transport: http(zeroDevConfig.paymasterUrl)
    });
  }
  return cachedPaymasterClient;
}

/**
 * Hàm tạo Smart Account bằng ZeroDev.
 * Mục đích: khởi tạo ví ERC-4337 cho người dùng mới.
 */
export async function createZeroDevSmartAccount(): Promise<string> {
  const ownerAccount = createOwnerAccount();
  const publicClient = getPublicClient();

  // Ghi chú logic phức tạp: ép kiểu client và tham số để đồng bộ typing giữa viem và ZeroDev SDK.
  const kernelAccountParameters = {
    entryPoint: zeroDevConfig.entryPointAddress,
    kernelVersion: '0.2.3',
    signer: ownerAccount
  } as unknown as Parameters<typeof createKernelAccount>[1];

  const kernelAccount = await createKernelAccount(
    publicClient as Parameters<typeof createKernelAccount>[0],
    kernelAccountParameters
  );

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: publicClient.chain,
    bundlerTransport: http(zeroDevConfig.bundlerUrl),
    paymaster: getPaymasterClient()
  } as Parameters<typeof createKernelAccountClient>[0]);

  // Ghi chú logic phức tạp: đảm bảo account đã sẵn sàng trước khi đọc địa chỉ.
  if (!kernelClient.account) {
    throw new Error('Không thể khởi tạo Smart Account ZeroDev do thiếu thông tin account.');
  }

  const smartAccountAddress = kernelClient.account.address;
  logger.info('ZeroDev smart account created.', { smartAccountAddress });
  return smartAccountAddress.toLowerCase();
}

