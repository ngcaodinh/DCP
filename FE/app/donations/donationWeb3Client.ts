import { BrowserProvider, Contract, Eip1193Provider } from 'ethers';

const donationContractAbi = ['function donate(uint256 projectId, uint256 amount, bool isAnonymous) external returns (bool)'];

type EthereumBrowserWindow = Window & {
  ethereum?: Eip1193Provider;
};

/** Hàm lấy provider ví trình duyệt. Mục đích: đảm bảo frontend có thể kết nối MetaMask theo chuẩn EIP-1193. */
function getEthereumProvider(): Eip1193Provider {
  const browserWindow = window as EthereumBrowserWindow;
  if (!browserWindow.ethereum) {
    throw new Error('Không tìm thấy ví Web3. Vui lòng cài MetaMask hoặc ví tương thích EVM.');
  }

  return browserWindow.ethereum;
}

/** Hàm đọc cấu hình donation contract từ môi trường. Mục đích: đồng bộ chain và địa chỉ contract giữa FE và BE. */
function readDonationContractConfig(): { donationContractAddress: string; expectedChainId: number } {
  const donationContractAddress = String(process.env.NEXT_PUBLIC_DONATION_RANKING_CONTRACT_ADDRESS || '').trim();
  const expectedChainId = Number(process.env.NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID || 0);

  if (!donationContractAddress) {
    throw new Error('Thiếu cấu hình NEXT_PUBLIC_DONATION_RANKING_CONTRACT_ADDRESS trên frontend.');
  }
  if (!Number.isInteger(expectedChainId) || expectedChainId <= 0) {
    throw new Error('Thiếu hoặc sai cấu hình NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID trên frontend.');
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
    throw new Error(`Ví đang ở sai mạng. Vui lòng chuyển sang chainId ${expectedChainId}.`);
  }
}

/** Hàm gửi giao dịch donate bằng ví người dùng. Mục đích: thực thi đúng UC3.1 theo luồng user ký trực tiếp on-chain. */
export async function donateByWallet(projectId: string, amount: number, isAnonymous: boolean): Promise<string> {
  const normalizedProjectId = projectId.trim();
  const normalizedAmount = Math.floor(Number(amount));

  if (!normalizedProjectId || !Number.isInteger(Number(normalizedProjectId))) {
    throw new Error('projectId không hợp lệ để gửi giao dịch.');
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Số token quyên góp phải lớn hơn 0.');
  }

  const { donationContractAddress, expectedChainId } = readDonationContractConfig();
  const ethereumProvider = getEthereumProvider();
  const browserProvider = new BrowserProvider(ethereumProvider);

  await browserProvider.send('eth_requestAccounts', []);
  await ensureExpectedChain(browserProvider, expectedChainId);

  const signer = await browserProvider.getSigner();
  const donationContract = new Contract(donationContractAddress, donationContractAbi, signer);
  const donationTransaction = await donationContract.donate(BigInt(normalizedProjectId), BigInt(normalizedAmount), isAnonymous);
  const transactionReceipt = await donationTransaction.wait(1);

  if (!transactionReceipt || transactionReceipt.status !== 1) {
    throw new Error('Giao dịch quyên góp thất bại trên blockchain.');
  }

  return donationTransaction.hash;
}
