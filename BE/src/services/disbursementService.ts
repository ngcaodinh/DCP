import { ethers } from 'ethers';
import { encodeFunctionData } from 'viem';
import { getLogger } from '../config/logger';
import { ApplicationError } from '../utils/applicationError';
import {
  createDisbursementRecord,
  DisbursementRecord,
  DisbursementStatus,
  findDisbursementByRequestId,
  findDisbursementsByOrganizationId,
  findDisbursementsByProjectId,
  findDisbursementsByStatus,
  findPendingDisbursementByBeneficiary,
  updateDisbursementByRequestId
} from '../models/disbursementModel';
import { AuthUser, findUserById } from '../models/authModel';
import { findProjectById } from '../repositories/projectRepository';
import { createKernelClientFromEncryptedOwnerKey } from './zeroDevService';

// ============ CONSTANTS ============
// Ethers ABI cho read-only queries (view calls).
const MULTISIG_CONTRACT_ABI_ETHER = [
  'function createDisbursementRequest(uint256 projectId, address beneficiary, uint256 amount, uint256 projectGoalAmount, string evidenceCid) external returns (uint256 requestId)',
  'function signRequest(uint256 requestId) external',
  'function rejectRequest(uint256 requestId, string reason) external',
  'function getRequest(uint256 requestId) external view returns (uint256 existsFlag, uint256 requestIdOut, uint256 projectId, address beneficiaryAddress, uint256 amount, string memory evidenceCid, uint8 status, uint256 approvalCount, uint256 signedCount, uint256 createdAt, uint256 executedAt, uint256 cancelledAt, string memory rejectReason, bool adminSigned, bool orgSigned, bool regulatorySigned, uint256 timeoutDeadline, uint256 maxWithdrawable)',
  'function getMaxWithdrawableAmount(uint256 projectId) external view returns (uint256 maxAmount)',
  'function finalizeDisbursement(uint256 requestId, uint256 transactionId) external returns (uint256 burnedAmount)'
] as const;

// Viem ABI cho encodeFunctionData (type-safe với viem).
const MULTISIG_VIEM_ABI = [
  {
    name: 'createDisbursementRequest',
    type: 'function',
    inputs: [
      { name: 'projectId', type: 'uint256' },
      { name: 'beneficiary', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'projectGoalAmount', type: 'uint256' },
      { name: 'evidenceCid', type: 'string' }
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }]
  },
  {
    name: 'signRequest',
    type: 'function',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'rejectRequest',
    type: 'function',
    inputs: [
      { name: 'requestId', type: 'uint256' },
      { name: 'reason', type: 'string' }
    ],
    outputs: []
  }
] as const;

// ============ TYPES ============
export type CreateDisbursementPayload = {
  projectId: string;
  amount: number;
  evidenceCid: string;
  beneficiaryBankAccount: {
    bankName: string;
    bankAccountNumber: string;
    accountHolderName: string;
    branchName?: string;
  };
};

export type DisbursementResult = {
  requestId: string;
  onChainRequestId: number;
  projectId: string;
  beneficiaryWalletAddress: string;
  beneficiaryBankAccount: {
    bankName: string;
    bankAccountNumber: string;
    accountHolderName: string;
    branchName?: string;
  };
  amount: number;
  evidenceCid: string;
  status: DisbursementStatus;
  approvals: Array<{
    signerRole: string;
    signerUserId: string;
    signerAddress: string;
    signedAt: Date;
    comment?: string;
  }>;
  rejection: { signerRole: string; signerUserId: string; signerAddress: string; reason: string; rejectedAt: Date } | null;
  createdAt: Date;
  updatedAt: Date;
  expiredAt: Date | null;
  completedAt: Date | null;
};

// ============ LOGGER & CACHE ============
const logger = getLogger();

// ============ HELPERS ============

/**
 * Ham lay Kernel client cho user cu the.
 * Muc dich: giai ma owner key tu DB roi tao Kernel client de gui UserOperation thay user ký.
 * Quy tac: user phai co encryptedOwnerPrivateKey trong MongoDB — neu chua co thi auto tao.
 */
async function getKernelClientForUser(user: AuthUser) {
  if (!user.smartAccountOwnerEncryptedPrivateKey) {
    // Ghi chú logic phức tạp: user cũ có thể chưa có Smart Account, goi ensureSmartAccountProvisioned tu authService.
    // Import lazy để tránh circular dependency giữa disbursementService và authService.
    const { ensureSmartAccountProvisioned } = await import('./authService');
    const userAfterProvision = await ensureSmartAccountProvisioned(user);
    if (!userAfterProvision.smartAccountOwnerEncryptedPrivateKey) {
      throw new ApplicationError('Khong the khoi tao Smart Account cho nguoi dung nay.', 500, 'INTERNAL_ERROR');
    }
    return createKernelClientFromEncryptedOwnerKey(userAfterProvision.smartAccountOwnerEncryptedPrivateKey);
  }
  return createKernelClientFromEncryptedOwnerKey(user.smartAccountOwnerEncryptedPrivateKey);
}

/**
 * Ham lay contract multisig chi doc (read-only).
 * Muc dich: truy van trang thai request tren chain khong can ký.
 */
function getReadOnlyMultisigContract() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
  const contractAddr = process.env.MULTISIG_DISBURSEMENT_ADDRESS?.trim() || '';
  if (!rpcUrl || !contractAddr) {
    throw new ApplicationError('Thieu cau hinh BLOCKCHAIN_RPC_URL hoac MULTISIG_DISBURSEMENT_ADDRESS.', 500, 'INTERNAL_ERROR');
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return { provider, contractAddress: contractAddr, contract: new ethers.Contract(contractAddr, MULTISIG_CONTRACT_ABI_ETHER, provider) };
}

/** Ham validate payload tao disbursement. Muc dich: chan du lieu sai chuan truoc khi goi contract. */
function validateCreateDisbursementPayload(payload: CreateDisbursementPayload): void {
  if (!payload.projectId?.trim()) {
    throw new ApplicationError('ProjectId khong hop le.', 400, 'VALIDATION_ERROR');
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new ApplicationError('So tien rut phai lon hon 0.', 400, 'VALIDATION_ERROR');
  }

  if (!payload.evidenceCid?.trim()) {
    throw new ApplicationError('CID minh chung su dung tien khong duoc trong.', 400, 'VALIDATION_ERROR');
  }

  if (!payload.beneficiaryBankAccount?.bankName?.trim()) {
    throw new ApplicationError('Ten ngan hang khong hop le.', 400, 'VALIDATION_ERROR');
  }

  const accNumber = payload.beneficiaryBankAccount.bankAccountNumber?.trim() || '';
  if (accNumber.length < 8 || accNumber.length > 20 || !/^\d+$/.test(accNumber)) {
    throw new ApplicationError('So tai khoan phai la chu so, dai 8-20 ky tu.', 400, 'VALIDATION_ERROR');
  }

  if (!payload.beneficiaryBankAccount.accountHolderName?.trim()) {
    throw new ApplicationError('Ten chu tai khoan khong hop le.', 400, 'VALIDATION_ERROR');
  }
}

/** Ham kiem tra quyen tao disbursement. Muc dich: dam bao chi org da KYC duoc phep tao request. */
async function ensureDisbursementCreator(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new ApplicationError('Khong tim thay tai khoan nguoi dung.', 401, 'UNAUTHENTICATED');
  }

  if (user.role !== 'organizations') {
    throw new ApplicationError('Chi to chuc tu thien duoc phep tao yeu cau rut tien.', 403, 'FORBIDDEN');
  }

  if (user.accountStatus !== 'ACTIVE') {
    throw new ApplicationError('Tai khoan chua duoc kich hoat.', 403, 'FORBIDDEN');
  }

  return user;
}

/** Ham kiem tra quyen ky duyet. Muc dich: dam bao chi admin/org/regulatory moi duoc ky. */
async function ensureDisbursementSigner(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new ApplicationError('Khong tim thay tai khoan nguoi dung.', 401, 'UNAUTHENTICATED');
  }

  const validRoles = ['admin', 'organizations', 'regulatory'];
  if (!validRoles.includes(user.role)) {
    throw new ApplicationError('Ban khong co quyen ky duyet yeu cau rut tien.', 403, 'FORBIDDEN');
  }

  return user;
}

/** Ham map record thanh response. Muc dich: format du lieu tra ve cho API. */
function mapDisbursementRecordToResult(record: DisbursementRecord): DisbursementResult {
  return {
    requestId: record.requestId,
    onChainRequestId: record.onChainRequestId,
    projectId: record.projectId,
    beneficiaryWalletAddress: record.beneficiaryWalletAddress,
    beneficiaryBankAccount: record.beneficiaryBankAccount,
    amount: record.amount,
    evidenceCid: record.evidenceCid,
    status: record.status,
    approvals: record.approvals,
    rejection: record.rejection,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiredAt: record.expiredAt,
    completedAt: record.completedAt
  };
}

// ============ UC7.1: TAO YEU CAU RUT TIEN ============

/**
 * Ham tao yeu cau rut tien (UC7.1).
 * Thuc hien: validate quyen, kiem tra so du, tao request on-chain, luu MongoDB.
 * Quy tac: Project da raised >= 50% goal, amount <= 80% raised, chi 1 request pending mỗi beneficiary.
 */
export async function createDisbursementRequest(
  userId: string,
  payload: CreateDisbursementPayload
): Promise<DisbursementResult> {
  validateCreateDisbursementPayload(payload);
  const user = await ensureDisbursementCreator(userId);

  // Lay project tu MongoDB de check organization.
  const project = await findProjectById(payload.projectId);
  if (!project) {
    throw new ApplicationError('Khong tim thay du an.', 404, 'NOT_FOUND');
  }

  if (project.organizationId !== user.id) {
    throw new ApplicationError('Ban khong co quyen tao yeu cau cho du an nay.', 403, 'FORBIDDEN');
  }

  if (project.status !== 'ACTIVE') {
    throw new ApplicationError('Du an phai o trang thai ACTIVE moi duoc rut tien.', 409, 'INVALID_STATUS_TRANSITION');
  }

  // Kiem tra so du kha dung tren blockchain (chi doc, khong can ký).
  const { contractAddress, contract: readOnlyContract } = getReadOnlyMultisigContract();
  const onChainProjectId = Number(project.projectId);
  let maxWithdrawable: bigint;
  try {
    maxWithdrawable = await readOnlyContract.getMaxWithdrawableAmount(onChainProjectId);
  } catch {
    throw new ApplicationError('Khong the lay so du kha dung tu blockchain.', 502, 'INTERNAL_ERROR');
  }

  if (maxWithdrawable === 0n) {
    throw new ApplicationError('Du an chua co so du de rut tien.', 409, 'MINIMUM_RAISED_NOT_MET');
  }

  if (BigInt(payload.amount) > maxWithdrawable) {
    throw new ApplicationError(
      `So tien vuot qua kha dung. Toi da: ${maxWithdrawable.toString()} token.`,
      409,
      'MAX_WITHDRAWAL_EXCEEDED'
    );
  }

  // Kiem tra khong co request PENDING nao cho beneficiary nay.
  const existingPending = await findPendingDisbursementByBeneficiary(user.walletAddress);
  if (existingPending) {
    throw new ApplicationError(
      `Tai khoan da co yeu cau rut tien dang cho duyet (${existingPending.requestId}). Vui long cho xu ly hoan tat.`,
      409,
      'DUPLICATE_BENEFICIARY_PENDING'
    );
  }

  // Tao request on-chain bang Smart Account (ZeroDev Kernel) — truyen them projectGoalAmount de kiem tra 50% goal tren chain.
  // Muc dich: user Org ký bằng Smart Account riêng của họ, không dùng EOA private key từ env.
  let onChainRequestId: number | undefined;
  try {
    const kernelClient = await getKernelClientForUser(user);
    const projectGoalAmount = BigInt(project.goalAmount);

    const callData = encodeFunctionData({
      abi: MULTISIG_VIEM_ABI,
      functionName: 'createDisbursementRequest',
      args: [BigInt(onChainProjectId), user.walletAddress as `0x${string}`, BigInt(payload.amount), projectGoalAmount, payload.evidenceCid]
    });

    // Kernel account client gui UserOperation thay user — gas do ZeroDev Paymaster sponsor.
    // Cast qua unknown de bypass type checking cua Kernel client (khong the infer type cua account).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await (kernelClient as any).sendTransaction({
      to: contractAddress as `0x${string}`,
      data: callData,
      value: BigInt(0)
    }) as `0x${string}`;
    logger.info(`Disbursement request created on-chain via Smart Account. txHash=${txHash} user=${user.walletAddress}`);

    // Lay requestId tu event tren chain.
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const txReceipt = await provider.waitForTransaction(txHash);
    if (!txReceipt) {
      throw new Error('Khong nhan duoc receipt tu blockchain.');
    }
    // Cast ABI qua unknown de bypass ethers Interface type constraint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iface = new ethers.Interface(MULTISIG_CONTRACT_ABI_ETHER as unknown as any);
    for (const log of txReceipt.logs) {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'RequestCreated') {
        onChainRequestId = Number(parsed.args[0]);
        break;
      }
    }

    if (!onChainRequestId) {
      throw new Error('Khong the doc requestId tu event.');
    }
  } catch (error) {
    logger.error(`Create disbursement on-chain failed. error=${(error as Error)?.message}`);
    throw new ApplicationError('Khong the tao yeu cau rut tien tren blockchain.', 502, 'INTERNAL_ERROR');
  }

  // Luu vao MongoDB.
  const now = new Date();
  const expiredAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 ngay
  const record: DisbursementRecord = {
    requestId: `DS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    onChainRequestId,
    projectId: payload.projectId,
    onChainProjectId,
    organizationId: user.id,
    beneficiaryWalletAddress: user.walletAddress,
    beneficiaryBankAccount: payload.beneficiaryBankAccount,
    amount: payload.amount,
    evidenceCid: payload.evidenceCid,
    status: 'PENDING',
    approvals: [],
    rejection: null,
    payosTransferId: null,
    payosTransferStatus: null,
    transactionHash: null,
    createdAt: now,
    updatedAt: now,
    expiredAt,
    completedAt: null
  };

  const createdRecord = await createDisbursementRecord(record);
  logger.info(`Disbursement record saved to MongoDB. requestId=${createdRecord.requestId}`);

  return mapDisbursementRecordToResult(createdRecord);
}

// ============ UC7.2: KY DUYET YEU CAU RUT TIEN ============

/**
 * Ham ky duyet request (UC7.2).
 * Quy tac: chi signer hợp lệ (admin/org/regulatory), chua ký, request dang PENDING.
 * Khi đủ 2/3 chu ky → tu dong Approved → trigger auto-execute.
 */
export async function signDisbursementRequest(
  userId: string,
  requestId: string,
  comment?: string
): Promise<DisbursementResult> {
  const user = await ensureDisbursementSigner(userId);

  const record = await findDisbursementByRequestId(requestId);
  if (!record) {
    throw new ApplicationError('Khong tim thay yeu cau rut tien.', 404, 'NOT_FOUND');
  }

  if (record.status !== 'PENDING') {
    throw new ApplicationError('Yeu cau khong con o trang thai cho duyet.', 409, 'INVALID_STATUS_TRANSITION');
  }

  // Kiem tra da het han chua (7 ngay).
  if (record.expiredAt && new Date() > record.expiredAt) {
    await updateDisbursementByRequestId(requestId, { status: 'EXPIRED', updatedAt: new Date() });
    throw new ApplicationError('Yeu cau da het han (7 ngay khong du ky).', 409, 'REQUEST_EXPIRED');
  }

  // Xac dinh signer role tu user.role.
  const signerRoleMap: Record<string, string> = {
    admin: 'ADMIN_SIGNER',
    organizations: 'ORG_SIGNER',
    regulatory: 'REGULATORY_SIGNER'
  };
  const signerRole = signerRoleMap[user.role];
  if (!signerRole) {
    throw new ApplicationError('Vai tro khong hop le de ky duyet.', 403, 'FORBIDDEN');
  }

  // Kiem tra da ky chua.
  const alreadySigned = record.approvals.some(a => a.signerRole === signerRole);
  if (alreadySigned) {
    throw new ApplicationError('Ban da ky duyet yeu cau nay.', 409, 'ALREADY_SIGNED');
  }

  // Ky request on-chain bang Smart Account (ZeroDev Kernel) — user ký bằng Smart Account riêng của họ.
  // Muc dich: thay the EOA private key bang encrypted owner key tu MongoDB.
  const { contractAddress } = getReadOnlyMultisigContract();
  let txHash: string;
  try {
    const kernelClient = await getKernelClientForUser(user);
    const callData = encodeFunctionData({
      abi: MULTISIG_VIEM_ABI,
      functionName: 'signRequest',
      args: [BigInt(record.onChainRequestId)]
    });
    // Cast qua any de bypass type checking cua Kernel client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txHash = await (kernelClient as any).sendTransaction({
      to: contractAddress as `0x${string}`,
      data: callData,
      value: BigInt(0)
    }) as string;
    logger.info(`Disbursement request signed on-chain via Smart Account. txHash=${txHash} signer=${user.walletAddress} role=${signerRole}`);

    // Cho receipt xac nhan.
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    await provider.waitForTransaction(txHash);
  } catch (error) {
    logger.error(`Sign disbursement on-chain failed. error=${(error as Error)?.message}`);
    throw new ApplicationError('Khong the ky duyet tren blockchain.', 502, 'INTERNAL_ERROR');
  }

  // Cap nhat MongoDB.
  const now = new Date();
  const updatedApprovals = [
    ...record.approvals,
    { signerRole: signerRole as 'ADMIN_SIGNER' | 'ORG_SIGNER' | 'REGULATORY_SIGNER', signerUserId: user.id, signerAddress: user.walletAddress, signedAt: now, comment }
  ];

  // Kiem tra trang thai moi tren chain de sync.
  let newStatus: DisbursementStatus = record.status;
  try {
    const { contract: readOnlyContract } = getReadOnlyMultisigContract();
    const [, , , , , , onChainStatus] = await readOnlyContract.getRequest(record.onChainRequestId) as [unknown, unknown, unknown, unknown, unknown, unknown, number, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown];
    if (onChainStatus === 3) { // Approved
      newStatus = 'APPROVED';
    }
  } catch {
    logger.warn(`Could not read on-chain status after signing. requestId=${requestId}`);
  }

  const updatedRecord = await updateDisbursementByRequestId(requestId, {
    approvals: updatedApprovals,
    status: newStatus,
    transactionHash: txHash,
    updatedAt: now
  });

  if (!updatedRecord) {
    throw new ApplicationError('Khong the cap nhat trang thai ky duyet.', 500, 'INTERNAL_ERROR');
  }

  logger.info(`Disbursement signed and updated in MongoDB. requestId=${requestId} approvalCount=${updatedApprovals.length}`);
  return mapDisbursementRecordToResult(updatedRecord);
}

/**
 * Ham tu choi request.
 * Quy tac: chi signer hop le, reason toi thieu 5 ky tu, org khong duoc tu tu choi request cua minh.
 */
export async function rejectDisbursementRequest(
  userId: string,
  requestId: string,
  reason: string
): Promise<DisbursementResult> {
  const user = await ensureDisbursementSigner(userId);

  if (!reason || reason.trim().length < 5) {
    throw new ApplicationError('Ly do tu choi phai toi thieu 5 ky tu.', 400, 'VALIDATION_ERROR');
  }

  const record = await findDisbursementByRequestId(requestId);
  if (!record) {
    throw new ApplicationError('Khong tim thay yeu cau rut tien.', 404, 'NOT_FOUND');
  }

  if (record.status !== 'PENDING') {
    throw new ApplicationError('Yeu cau khong con o trang thai cho duyet.', 409, 'INVALID_STATUS_TRANSITION');
  }

  const signerRoleMap: Record<string, string> = {
    admin: 'ADMIN_SIGNER',
    organizations: 'ORG_SIGNER',
    regulatory: 'REGULATORY_SIGNER'
  };
  const signerRole = signerRoleMap[user.role];

  // Org khong duoc tu tu choi request cua minh.
  if (user.role === 'organizations' && record.organizationId === user.id) {
    throw new ApplicationError('To chuc khong duoc tu tu choi yeu cau rut tien cua minh.', 403, 'FORBIDDEN');
  }

  // Gui reject len chain bang Smart Account (ZeroDev Kernel).
  const { contractAddress } = getReadOnlyMultisigContract();
  let txHash: string;
  try {
    const kernelClient = await getKernelClientForUser(user);
    const callData = encodeFunctionData({
      abi: MULTISIG_VIEM_ABI,
      functionName: 'rejectRequest',
      args: [BigInt(record.onChainRequestId), reason.trim()]
    });
    // Cast qua any de bypass type checking cua Kernel client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txHash = await (kernelClient as any).sendTransaction({
      to: contractAddress as `0x${string}`,
      data: callData,
      value: BigInt(0)
    }) as string;
    logger.info(`Disbursement rejected on-chain via Smart Account. txHash=${txHash} reason=${reason}`);

    // Cho receipt xac nhan.
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || '';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    await provider.waitForTransaction(txHash);
  } catch (error) {
    logger.error(`Reject disbursement on-chain failed. error=${(error as Error)?.message}`);
    throw new ApplicationError('Khong the tu choi tren blockchain.', 502, 'INTERNAL_ERROR');
  }

  const updatedRecord = await updateDisbursementByRequestId(requestId, {
    status: 'REJECTED',
    rejection: { signerRole, signerUserId: user.id, signerAddress: user.walletAddress, reason: reason.trim(), rejectedAt: new Date() },
    transactionHash: txHash,
    updatedAt: new Date()
  });

  if (!updatedRecord) {
    throw new ApplicationError('Khong the cap nhat trang thai tu choi.', 500, 'INTERNAL_ERROR');
  }

  return mapDisbursementRecordToResult(updatedRecord);
}

// ============ QUERY FUNCTIONS ============

/** Ham lay danh sach yeu cau cua to chuc. Muc dich: trang quan ly giai ngan cua org. */
export async function getDisbursementsForOrganization(userId: string): Promise<DisbursementResult[]> {
  const user = await ensureDisbursementCreator(userId);
  const records = await findDisbursementsByOrganizationId(user.id);
  return records.map(mapDisbursementRecordToResult);
}

/** Ham lay danh sach yeu cau cho ky duyet. Muc dich: dashboard ky duyet cho admin/regulatory. */
export async function getDisbursementsForReview(userId: string): Promise<DisbursementResult[]> {
  await ensureDisbursementSigner(userId);
  const records = await findDisbursementsByStatus('PENDING');
  return records.map(mapDisbursementRecordToResult);
}

/** Ham lay chi tiet yeu cau. Muc dich: trang chi tiet request. */
export async function getDisbursementDetail(userId: string, requestId: string): Promise<DisbursementResult> {
  await ensureDisbursementSigner(userId);
  const record = await findDisbursementByRequestId(requestId);
  if (!record) {
    throw new ApplicationError('Khong tim thay yeu cau rut tien.', 404, 'NOT_FOUND');
  }
  return mapDisbursementRecordToResult(record);
}

/** Ham lay danh sach yeu cau theo project. Muc dich: trang chi tiet du an. */
export async function getDisbursementsByProject(projectId: string): Promise<DisbursementResult[]> {
  const records = await findDisbursementsByProjectId(projectId);
  return records.map(mapDisbursementRecordToResult);
}

/** Ham lay so du kha dung cua du an. Muc dich: hien thi max withdrawal cho org. */
export async function getMaxWithdrawableAmount(projectId: string): Promise<{ projectId: string; maxAmount: string; reserve: string }> {
  const project = await findProjectById(projectId);
  if (!project) {
    throw new ApplicationError('Khong tim thay du an.', 404, 'NOT_FOUND');
  }

  const { contract: readOnlyContract } = getReadOnlyMultisigContract();
  const onChainProjectId = Number(project.projectId);

  let maxAmount: bigint;
  try {
    maxAmount = await readOnlyContract.getMaxWithdrawableAmount(onChainProjectId);
  } catch {
    throw new ApplicationError('Khong the lay so du kha dung.', 502, 'INTERNAL_ERROR');
  }

  return {
    projectId,
    maxAmount: maxAmount.toString(),
    reserve: '20%'
  };
}
