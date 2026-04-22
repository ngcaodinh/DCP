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
 * Hàm lấy địa chỉ signer từ biến môi trường, dùng chung cho các vai trò multisig.
 * Mục đích: đảm bảo đủ 3 signer khi deploy MultisigDisbursement.
 */
function getMultisigSignerAddress(envVarName, fallbackVarName) {
  return getRequiredEnvironmentVariable(envVarName) || process.env[fallbackVarName] || '';
}

/**
 * Hàm deploy toàn bộ contract cốt lõi của DCP lên network được cấu hình.
 * Mục đích: triển khai token, contract ghi nhận donation và giải ngân multisig.
 */
async function deployContracts() {
  const hardhatRuntime = getHardhatRuntime();
  const networkName =
    process.env.HARDHAT_NETWORK ?? hardhatRuntime.network?.name ?? 'unknown';
  const deployerSigner = createDeployerSigner(networkName);
  const deployerAddress = await deployerSigner.getAddress();

  // --- Deploy DcpCharityToken ---
  const charityTokenArtifact = await hardhatRuntime.artifacts.readArtifact(
    'DcpCharityToken'
  );
  const charityTokenFactory = new ethers.ContractFactory(
    charityTokenArtifact.abi,
    charityTokenArtifact.bytecode,
    deployerSigner
  );
  const charityTokenContract = await charityTokenFactory.deploy(deployerAddress);
  await charityTokenContract.waitForDeployment();
  const charityTokenAddress = await charityTokenContract.getAddress();

  // --- Deploy DcpDonationRanking ---
  const donationRankingArtifact = await hardhatRuntime.artifacts.readArtifact(
    'DcpDonationRanking'
  );
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

  // --- Deploy MultisigDisbursement ---
  const multisigArtifact = await hardhatRuntime.artifacts.readArtifact(
    'MultisigDisbursement'
  );
  const multisigFactory = new ethers.ContractFactory(
    multisigArtifact.abi,
    multisigArtifact.bytecode,
    deployerSigner
  );

  // Lấy 3 signer addresses từ env; fallback về deployer nếu chưa cấu hình riêng.
  const adminSignerAddress = getMultisigSignerAddress('MULTISIG_ADMIN_SIGNER_ADDRESS') || deployerAddress;
  const orgSignerAddress = getMultisigSignerAddress('MULTISIG_ORG_SIGNER_ADDRESS') || deployerAddress;
  const regulatorySignerAddress = getMultisigSignerAddress('MULTISIG_REGULATORY_SIGNER_ADDRESS') || deployerAddress;

  const multisigContract = await multisigFactory.deploy(
    charityTokenAddress,
    donationRankingAddress,
    adminSignerAddress,
    orgSignerAddress,
    regulatorySignerAddress
  );
  await multisigContract.waitForDeployment();
  const multisigAddress = await multisigContract.getAddress();

  // --- Cấp quyền cần thiết ---
  const minterRole = await charityTokenContract.minterRole();
  const disbursementRole = await charityTokenContract.disbursementRole();
  const projectManagerRole = await donationRankingContract.projectManagerRole();

  // Backend (deployer) được quyền mint token khi nhận thanh toán PayOS.
  const grantMinterTx = await charityTokenContract.grantMinterRole(deployerAddress);
  await grantMinterTx.wait();

  // Multisig contract được quyền burn token khi giải ngân thành công.
  const grantDisbursementTx = await charityTokenContract.grantDisbursementRole(multisigAddress);
  await grantDisbursementTx.wait();

  // Org signer được quyền quản lý dự án.
  const grantProjectManagerTx = await donationRankingContract.grantProjectManagerRole(orgSignerAddress);
  await grantProjectManagerTx.wait();

  const deploymentOutput = {
    network: networkName,
    deployedAt: new Date().toISOString(),
    deployerAddress,
    charityTokenAddress,
    donationRankingAddress,
    multisigDisbursementAddress: multisigAddress,
    signerRoles: {
      adminSigner: adminSignerAddress,
      orgSigner: orgSignerAddress,
      regulatorySigner: regulatorySignerAddress
    }
  };

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

  console.log(`DcpCharityToken deployed to:      ${charityTokenAddress}`);
  console.log(`DcpDonationRanking deployed to:    ${donationRankingAddress}`);
  console.log(`MultisigDisbursement deployed to:  ${multisigAddress}`);
  console.log(`Deployment info saved to:         ${deploymentFilePath}`);
}

deployContracts().catch((errorObject) => {
  console.error(errorObject);
  process.exitCode = 1;
});

