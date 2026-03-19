import '@nomicfoundation/hardhat-ethers';
import hardhatRuntimeEnvironment from 'hardhat';
import { ethers } from 'ethers';
import fileSystem from 'node:fs/promises';
import path from 'node:path';

/**
 * Hàm lấy runtime Hardhat an toàn theo định dạng export của phiên bản hiện tại.
 * Mục đích: đảm bảo truy cập network/artifacts ổn định khi module export khác nhau.
 */
function getHardhatRuntime() {
  const runtimeModule = hardhatRuntimeEnvironment ?? {};
  return runtimeModule.default ?? runtimeModule;
}

/**
 * Hàm lấy biến môi trường bắt buộc.
 * Mục đích: chặn deploy khi thiếu cấu hình quan trọng.
 */
function getRequiredEnvironmentVariable(variableName) {
  const variableValue = process.env[variableName];

  if (!variableValue) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${variableName}`);
  }

  return variableValue;
}

/**
 * Hàm lấy RPC URL theo network hiện tại.
 * Mục đích: ưu tiên localhost khi deploy local, còn lại lấy theo cấu hình Amoy tối thiểu.
 */
function resolveRpcUrl(networkName) {
  if (networkName === 'localhost' || networkName === 'hardhat') {
    return 'http://127.0.0.1:8545';
  }

  return getRequiredEnvironmentVariable('AMOY_RPC_URL');
}

/**
 * Hàm khởi tạo ví deployer với RPC phù hợp.
 * Mục đích: tạo signer độc lập với Hardhat runtime để tránh lỗi thiếu ethers.
 */
function createDeployerSigner(networkName) {
  const deployerPrivateKey = getRequiredEnvironmentVariable('DEPLOYER_PRIVATE_KEY');
  const rpcUrl = resolveRpcUrl(networkName);
  const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);

  return new ethers.Wallet(deployerPrivateKey, jsonRpcProvider);
}

/**
 * Hàm deploy toàn bộ contract cốt lõi của DCP lên network được cấu hình.
 * Mục đích: triển khai token và contract ghi nhận donation cho môi trường Amoy tối thiểu.
 */
async function deployContracts() {
  const hardhatRuntime = getHardhatRuntime();
  // Logic phức tạp: Hardhat 3 có thể không expose network.name trực tiếp trong một số ngữ cảnh ESM.
  const networkName =
    process.env.HARDHAT_NETWORK ?? hardhatRuntime.network?.name ?? 'unknown';
  const deployerSigner = createDeployerSigner(networkName);
  const deployerAddress = await deployerSigner.getAddress();

  const charityTokenArtifact = await hardhatRuntime.artifacts.readArtifact(
    'DcpCharityToken'
  );
  const donationRankingArtifact = await hardhatRuntime.artifacts.readArtifact(
    'DcpDonationRanking'
  );

  const charityTokenFactory = new ethers.ContractFactory(
    charityTokenArtifact.abi,
    charityTokenArtifact.bytecode,
    deployerSigner
  );
  const charityTokenContract = await charityTokenFactory.deploy(deployerAddress);
  await charityTokenContract.waitForDeployment();

  const charityTokenAddress = await charityTokenContract.getAddress();

  const donationRankingFactory = new ethers.ContractFactory(
    donationRankingArtifact.abi,
    donationRankingArtifact.bytecode,
    deployerSigner
  );
  const donationRankingContract = await donationRankingFactory.deploy(
    charityTokenAddress,
    deployerAddress
  );
  await donationRankingContract.waitForDeployment();

  const donationRankingAddress = await donationRankingContract.getAddress();

  const deploymentOutput = {
    network: networkName,
    deployedAt: new Date().toISOString(),
    deployerAddress,
    charityTokenAddress,
    donationRankingAddress
  };

  // Logic phức tạp: tạo thư mục nếu chưa có và ghi đè file theo từng network để dễ tra cứu địa chỉ.
  const deploymentFilePath = path.join(
    process.cwd(),
    'deployments',
    `${networkName}.json`
  );
  await fileSystem.mkdir(path.dirname(deploymentFilePath), { recursive: true });
  await fileSystem.writeFile(
    deploymentFilePath,
    `${JSON.stringify(deploymentOutput, null, 2)}\n`,
    'utf-8'
  );

  console.log(`DcpCharityToken deployed to: ${charityTokenAddress}`);
  console.log(`DcpDonationRanking deployed to: ${donationRankingAddress}`);
  console.log(`Deployment info saved to: ${deploymentFilePath}`);
}

deployContracts().catch((errorObject) => {
  console.error(errorObject);
  process.exitCode = 1;
});

