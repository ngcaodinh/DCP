import { BrowserProvider, Contract, Eip1193Provider } from 'ethers';

export type DonationClientErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'USER_REJECTED'
  | 'CHAIN_MISMATCH'
  | 'RPC_TIMEOUT'
  | 'TRANSACTION_FAILED'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

export class DonationClientError extends Error {
  public readonly errorCode: DonationClientErrorCode;

  /** Hàm khởi tạo lỗi client donation. Mục đích: chuẩn hóa mã lỗi để UI map thông điệp rõ ràng theo từng tình huống Web3. */
  constructor(errorCode: DonationClientErrorCode, message: string) {
    super(message);
    this.name = 'DonationClientError';
    this.errorCode = errorCode;
  }
}

const donationContractAbi = ['function donate(uint256 projectId, uint256 amount, bool isAnonymous) external returns (bool)'];

type EthereumBrowserWindow = Window & {
  ethereum?: Eip1193Provider;
};

/** Hàm lấy provider ví trình duyệt. Mục đích: đảm bảo frontend có thể kết nối MetaMask theo chuẩn EIP-1193. */
function getEthereumProvider(): Eip1193Provider {
  const browserWindow = window as EthereumBrowserWindow;
  if (!browserWindow.ethereum) {
    throw new DonationClientError('WALLET_NOT_FOUND', 'Không tìm thấy ví Web3. Vui lòng cài MetaMask hoặc ví tương thích EVM.');
  }

  return browserWindow.ethereum;
}

/** Hàm đọc cấu hình donation contract từ môi trường. Mục đích: đồng bộ chain và địa chỉ contract giữa FE và BE. */
function readDonationContractConfig(): { donationContractAddress: string; expectedChainId: number } {
  // Ghi chú logic phức tạp: ưu tiên biến chuẩn mới, nhưng vẫn fallback biến cũ để không làm vỡ môi trường local hiện có.
  const donationContractAddress = String(
    process.env.NEXT_PUBLIC_DONATION_RANKING_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_DONATION_RANKING_ADDRESS || ''
  ).trim();
  const expectedChainId = Number(process.env.NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID || process.env.NEXT_PUBLIC_AMOY_CHAIN_ID || 0);

  if (!donationContractAddress) {
    throw new Error(
      'Thiếu cấu hình địa chỉ contract donation. Vui lòng khai báo NEXT_PUBLIC_DONATION_RANKING_CONTRACT_ADDRESS (hoặc NEXT_PUBLIC_DONATION_RANKING_ADDRESS).'
    );
  }
  if (!Number.isInteger(expectedChainId) || expectedChainId <= 0) {
    throw new Error(
      'Thiếu hoặc sai cấu hình chainId. Vui lòng khai báo NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID (hoặc NEXT_PUBLIC_AMOY_CHAIN_ID).'
    );
  }

  return { donationContractAddress, expectedChainId };
}

/** Hàm yêu cầu ví chuyển đúng chain. Mục đích: tránh gửi giao dịch vào sai mạng blockchain. */
async function ensureExpectedChain(provider: BrowserProvider, expectedChainId: number): Promise<void> {
  const currentNetwork = await provider.getNetwork();
  if (Number(currentNetwork.chainId) === expectedChainId) {
    return;
  }

  const chainHexValue = `0x${expectedChainId.toString(16)}`;

  // Ghi chú logic phức tạp: thử switch chain trước, nếu ví không hỗ trợ chain thì throw lỗi rõ ràng để người dùng tự thêm mạng.
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: chainHexValue }]);
  } catch (_error) {
    throw new DonationClientError('CHAIN_MISMATCH', `Ví đang ở sai mạng. Vui lòng chuyển sang chainId ${expectedChainId}.`);
  }
}

/** Hàm chuẩn hóa projectId sang dạng số cho smart contract. Mục đích: hỗ trợ cả mã thuần số và mã có chứa số như PRJ-1001. */
function resolveContractProjectId(projectId: string): string {
  const normalizedProjectId = projectId.trim();
  if (/^[0-9]+$/.test(normalizedProjectId)) {
    return normalizedProjectId;
  }

  const numericPartMatch = normalizedProjectId.match(/([0-9]+)/);
  if (numericPartMatch?.[1]) {
    return numericPartMatch[1];
  }

  throw new DonationClientError('VALIDATION_ERROR', 'Mã dự án chưa có định danh on-chain hợp lệ để gửi giao dịch.');
}

/** Hàm gửi giao dịch donate bằng ví người dùng. Mục đích: thực thi đúng UC3.1 theo luồng user ký trực tiếp on-chain. */
export async function donateByWallet(projectId: string, amount: number, isAnonymous: boolean): Promise<string> {
  const normalizedContractProjectId = resolveContractProjectId(projectId);
  const normalizedAmount = Math.floor(Number(amount));

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new DonationClientError('VALIDATION_ERROR', 'Số token quyên góp phải lớn hơn 0.');
  }

  try {
    const { donationContractAddress, expectedChainId } = readDonationContractConfig();
    const ethereumProvider = getEthereumProvider();
    const browserProvider = new BrowserProvider(ethereumProvider);

    await browserProvider.send('eth_requestAccounts', []);
    await ensureExpectedChain(browserProvider, expectedChainId);

    const signer = await browserProvider.getSigner();
    const donationContract = new Contract(donationContractAddress, donationContractAbi, signer);
    const donationTransaction = await donationContract.donate(BigInt(normalizedContractProjectId), BigInt(normalizedAmount), isAnonymous);
    const transactionReceipt = await donationTransaction.wait(1);

    if (!transactionReceipt || transactionReceipt.status !== 1) {
      throw new DonationClientError('TRANSACTION_FAILED', 'Giao dịch quyên góp thất bại trên blockchain.');
    }

    return donationTransaction.hash;
  } catch (error) {
    if (error instanceof DonationClientError) {
      throw error;
    }

    const typedError = error as { code?: number | string; message?: string };
    if (typedError?.code === 4001 || typedError?.code === 'ACTION_REJECTED') {
      throw new DonationClientError('USER_REJECTED', 'Bạn đã từ chối ký giao dịch.');
    }

    const normalizedErrorMessage = String(typedError?.message || '').toLowerCase();
    if (normalizedErrorMessage.includes('timeout')) {
      throw new DonationClientError('RPC_TIMEOUT', 'Kết nối blockchain bị timeout. Vui lòng thử lại.');
    }

    throw new DonationClientError('UNKNOWN_ERROR', typedError?.message || 'Không thể gửi giao dịch quyên góp.');
  }
}
