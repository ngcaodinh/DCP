import crypto from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { polygonAmoy } from 'viem/chains';
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from '@zerodev/sdk';
import { getZeroDevConfig } from '../config/zeroDev';
import { getLogger } from '../config/logger';

const logger = getLogger();
const zeroDevConfig = getZeroDevConfig();
let cachedPublicClient: ReturnType<typeof createPublicClient> | null = null;
let cachedPaymasterClient: ReturnType<typeof createZeroDevPaymasterClient> | null = null;

type ZeroDevSmartAccountProvisionResult = {
  smartAccountAddress: string;
  ownerAddress: string;
  encryptedOwnerPrivateKey: string;
};

/** Hàm lấy khóa mã hóa owner key. Mục đích: đảm bảo private key luôn được mã hóa trước khi lưu DB. */
function getOwnerEncryptionKey(): Buffer {
  const encryptionSecret = String(process.env.SMART_ACCOUNT_ENCRYPTION_KEY || '').trim();
  if (!encryptionSecret) {
    throw new Error('Thiếu SMART_ACCOUNT_ENCRYPTION_KEY để bảo vệ owner private key.');
  }

  const normalizedSecret = encryptionSecret.startsWith('0x') ? encryptionSecret.slice(2) : encryptionSecret;
  if (!/^[a-fA-F0-9]{64}$/.test(normalizedSecret)) {
    throw new Error('SMART_ACCOUNT_ENCRYPTION_KEY phải là chuỗi hex 32 bytes.');
  }

  return Buffer.from(normalizedSecret, 'hex');
}

/** Hàm mã hóa private key owner. Mục đích: lưu private key an toàn trong DB theo định dạng iv:ciphertext:tag. */
function encryptOwnerPrivateKey(ownerPrivateKey: string): string {
  const encryptionKey = getOwnerEncryptionKey();
  const ivBuffer = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, ivBuffer);
  const encryptedBuffer = Buffer.concat([cipher.update(ownerPrivateKey, 'utf8'), cipher.final()]);
  const authTagBuffer = cipher.getAuthTag();
  return `${ivBuffer.toString('hex')}:${encryptedBuffer.toString('hex')}:${authTagBuffer.toString('hex')}`;
}

/** Hàm giải mã private key owner. Mục đích: khôi phục signer để backend gửi UserOperation thay người dùng. */
function decryptOwnerPrivateKey(encryptedOwnerPrivateKey: string): `0x${string}` {
  const [ivHexValue, encryptedHexValue, authTagHexValue] = String(encryptedOwnerPrivateKey || '').split(':');
  if (!ivHexValue || !encryptedHexValue || !authTagHexValue) {
    throw new Error('Định dạng encrypted owner private key không hợp lệ.');
  }

  const encryptionKey = getOwnerEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivHexValue, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHexValue, 'hex'));
  const decryptedText = Buffer.concat([decipher.update(Buffer.from(encryptedHexValue, 'hex')), decipher.final()]).toString('utf8');
  return decryptedText as `0x${string}`;
}

/** Hàm tạo owner account ngẫu nhiên. Mục đích: sinh signer gốc cho tài khoản smart account mới. */
function createOwnerAccount() {
  const ownerPrivateKey = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
  return { ownerPrivateKey, ownerAccount: privateKeyToAccount(ownerPrivateKey) };
}

/** Hàm lấy public client ZeroDev dùng chung. Mục đích: tái sử dụng kết nối RPC để giảm chi phí khởi tạo. */
function getPublicClient() {
  if (!cachedPublicClient) {
    cachedPublicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(zeroDevConfig.rpcUrl)
    });
  }
  return cachedPublicClient;
}

/** Hàm lấy paymaster client dùng chung. Mục đích: tránh khởi tạo lại client cho mỗi request donation. */
function getPaymasterClient() {
  if (!cachedPaymasterClient) {
    cachedPaymasterClient = createZeroDevPaymasterClient({ transport: http(zeroDevConfig.paymasterUrl) });
  }
  return cachedPaymasterClient;
}

/** Hàm tạo kernel account client từ owner private key. Mục đích: dựng client để backend gửi transaction batch. */
async function createKernelClientFromOwnerPrivateKey(ownerPrivateKey: `0x${string}`, usePaymaster: boolean) {
  const ownerAccount = privateKeyToAccount(ownerPrivateKey);
  const publicClient = getPublicClient();

  const kernelAccount = await createKernelAccount(publicClient as never, {
    entryPoint: {
      address: zeroDevConfig.entryPointAddress,
      version: '0.7'
    },
    // Kernel >= 0.3.3 là bắt buộc khi dùng eip7702Account theo SDK v5.
    kernelVersion: '0.3.3',
    // SDK v5 yêu cầu validator plugin. Truyền eip7702Account để SDK tự dựng sudo validator.
    eip7702Account: ownerAccount
  } as never);

  if (!usePaymaster) {
    return createKernelAccountClient({
      account: kernelAccount,
      chain: publicClient.chain,
      bundlerTransport: http(zeroDevConfig.bundlerUrl)
    } as never);
  }

  return createKernelAccountClient({
    account: kernelAccount,
    chain: publicClient.chain,
    bundlerTransport: http(zeroDevConfig.bundlerUrl),
    paymaster: getPaymasterClient()
  } as never);
}

/** Hàm tạo kernel account client từ owner private key đã mã hóa. Mục đích: tái sử dụng signer đã lưu bảo mật trong DB với paymaster tài trợ gas. */
export async function createKernelClientFromEncryptedOwnerKey(encryptedOwnerPrivateKey: string) {
  const ownerPrivateKey = decryptOwnerPrivateKey(encryptedOwnerPrivateKey);
  return createKernelClientFromOwnerPrivateKey(ownerPrivateKey, true);
}

/** Hàm tạo kernel account client không dùng paymaster. Mục đích: fallback khi policy tài trợ gas từ paymaster không khớp. */
export async function createKernelClientFromEncryptedOwnerKeyWithoutPaymaster(encryptedOwnerPrivateKey: string) {
  const ownerPrivateKey = decryptOwnerPrivateKey(encryptedOwnerPrivateKey);
  return createKernelClientFromOwnerPrivateKey(ownerPrivateKey, false);
}

/** Hàm tạo Smart Account và dữ liệu owner bảo mật. Mục đích: cấp đủ thông tin để user đăng nhập social nhưng donate kiểu web2 click. */
export async function createZeroDevSmartAccount(): Promise<ZeroDevSmartAccountProvisionResult> {
  const { ownerPrivateKey, ownerAccount } = createOwnerAccount();
  const kernelClient = await createKernelClientFromOwnerPrivateKey(ownerPrivateKey);

  const kernelClientAccount = (kernelClient as { account?: { address?: string } }).account;
  if (!kernelClientAccount?.address) {
    throw new Error('Không thể khởi tạo Smart Account ZeroDev do thiếu account.');
  }

  const smartAccountAddress = String(kernelClientAccount.address).toLowerCase();
  const ownerAddress = ownerAccount.address.toLowerCase();
  const encryptedOwnerPrivateKey = encryptOwnerPrivateKey(ownerPrivateKey);

  logger.info('ZeroDev smart account created.', { smartAccountAddress });

  return {
    smartAccountAddress,
    ownerAddress,
    encryptedOwnerPrivateKey
  };
}

