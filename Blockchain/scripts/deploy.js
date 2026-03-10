import { ethers } from 'hardhat';

/**
 * Hàm deploy contract mẫu lên network cấu hình.
 * Mục đích: cung cấp script deploy cơ bản cho giai đoạn khởi tạo workspace.
 */
async function deployContracts() {
  const simpleStorageFactory = await ethers.getContractFactory('SimpleStorage');
  const simpleStorageContract = await simpleStorageFactory.deploy();

  await simpleStorageContract.waitForDeployment();

  const deployedAddress = await simpleStorageContract.getAddress();
  console.log(`SimpleStorage deployed to: ${deployedAddress}`);
}

deployContracts().catch((errorObject) => {
  console.error(errorObject);
  process.exitCode = 1;
});

