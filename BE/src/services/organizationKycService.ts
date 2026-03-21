import crypto from 'crypto';
import { AuthUser, findUserById, findUserByLegalRegistrationNumber, updateUser } from '../models/authModel';
import {
  OrganizationKycFile,
  createOrganizationKycSubmission,
  getLatestSubmissionVersion
} from '../models/organizationKycModel';

export type OrganizationKycFileInput = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64Content: string;
  documentType: string;
};

export type OrganizationKycSubmitPayload = {
  organizationName: string;
  legalRegistrationNumber: string;
  organizationDescription: string;
  files: OrganizationKycFileInput[];
};

const maxFileSizeBytes = 10 * 1024 * 1024;
const allowedMimeTypeSet = new Set(['application/pdf', 'image/png', 'image/jpg', 'image/jpeg']);
const pinataPinFileEndpoint = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const pinataRequestTimeoutMilliseconds = 15000;
const pinataMaximumRetryCount = 2;

/**
 * Hàm kiểm tra dữ liệu hồ sơ KYC đầu vào.
 * Mục đích: chặn dữ liệu sai chuẩn trước khi upload lên Pinata.
 */
function validateOrganizationKycPayload(payload: OrganizationKycSubmitPayload): void {
  if (!payload.organizationName.trim() || !payload.legalRegistrationNumber.trim() || !payload.organizationDescription.trim()) {
    throw new Error('Thông tin tổ chức chưa đầy đủ.');
  }

  if (!Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > 3) {
    throw new Error('Bộ hồ sơ KYC phải có từ 1 đến 3 file.');
  }

  payload.files.forEach((file) => {
    if (!allowedMimeTypeSet.has(file.mimeType.toLowerCase())) {
      throw new Error(`Định dạng file không hợp lệ: ${file.fileName}`);
    }
    if (file.fileSize <= 0 || file.fileSize > maxFileSizeBytes) {
      throw new Error(`Dung lượng file vượt ngưỡng 10MB: ${file.fileName}`);
    }
    if (!file.base64Content.trim()) {
      throw new Error(`Nội dung file trống: ${file.fileName}`);
    }
  });
}

/**
 * Hàm lấy JWT Pinata từ biến môi trường.
 * Mục đích: đảm bảo chỉ thực hiện upload IPFS khi đã cấu hình chứng thực đầy đủ.
 */
function getPinataJsonWebToken(): string {
  const pinataJsonWebToken = process.env.PINATA_JWT?.trim() || '';
  if (!pinataJsonWebToken) {
    throw new Error('Thiếu cấu hình PINATA_JWT trên backend.');
  }
  return pinataJsonWebToken;
}

/**
 * Hàm upload một file KYC lên Pinata/IPFS.
 * Mục đích: gửi file nhị phân lên Pinata và nhận CID phục vụ lưu metadata.
 */
async function uploadFileToPinata(file: OrganizationKycFileInput): Promise<string> {
  const pinataJsonWebToken = getPinataJsonWebToken();
  const binaryBuffer = Buffer.from(file.base64Content, 'base64');

  if (!binaryBuffer.length) {
    throw new Error(`Nội dung base64 không hợp lệ: ${file.fileName}`);
  }

  const uploadFormData = new FormData();
  const fileBlob = new Blob([binaryBuffer], { type: file.mimeType });
  uploadFormData.append('file', fileBlob, file.fileName);
  uploadFormData.append(
    'pinataMetadata',
    JSON.stringify({
      name: file.fileName,
      keyvalues: {
        documentType: file.documentType,
        mimeType: file.mimeType
      }
    })
  );

  const pinataResponse = await fetch(pinataPinFileEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pinataJsonWebToken}`
    },
    body: uploadFormData,
    signal: AbortSignal.timeout(pinataRequestTimeoutMilliseconds)
  });

  const pinataResponseData = (await pinataResponse.json()) as { IpfsHash?: string; error?: string };
  if (!pinataResponse.ok || !pinataResponseData.IpfsHash) {
    throw new Error(pinataResponseData.error || `Upload Pinata thất bại: ${file.fileName}`);
  }

  return pinataResponseData.IpfsHash;
}

/**
 * Hàm upload file với cơ chế retry giới hạn.
 * Mục đích: tăng độ ổn định khi Pinata timeout hoặc lỗi tạm thời.
 */
async function uploadFileToPinataWithRetry(file: OrganizationKycFileInput): Promise<string> {
  let latestUploadError: Error | null = null;

  for (let retryAttempt = 1; retryAttempt <= pinataMaximumRetryCount; retryAttempt += 1) {
    try {
      return await uploadFileToPinata(file);
    } catch (error) {
      latestUploadError = error instanceof Error ? error : new Error('Upload Pinata thất bại.');
    }
  }

  throw latestUploadError || new Error('Upload Pinata thất bại.');
}

/**
 * Hàm xử lý nộp hồ sơ KYC của tổ chức.
 * Mục đích: upload file lên IPFS, lưu metadata phiên bản hóa và cập nhật trạng thái tài khoản.
 */
export async function submitOrganizationKyc(
  userId: string,
  payload: OrganizationKycSubmitPayload
): Promise<{ submissionId: string; version: number; status: string }> {
  validateOrganizationKycPayload(payload);

  const organizationUser = await findUserById(userId);
  if (!organizationUser || organizationUser.role !== 'organization') {
    throw new Error('Tài khoản không hợp lệ để nộp KYC.');
  }

  const existingLegalRegistrationOwner = await findUserByLegalRegistrationNumber(payload.legalRegistrationNumber.trim());
  if (existingLegalRegistrationOwner && existingLegalRegistrationOwner.id !== organizationUser.id) {
    throw new Error('Mã số đăng ký pháp lý đã tồn tại.');
  }

  const nextVersion = (await getLatestSubmissionVersion(organizationUser.id)) + 1;
  const now = new Date();
  const submissionId = crypto.randomUUID();

  const uploadedFiles: OrganizationKycFile[] = await Promise.all(
    payload.files.map(async (file) => ({
      cid: await uploadFileToPinataWithRetry(file),
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      documentType: file.documentType,
      version: nextVersion,
      uploadedBy: organizationUser.id,
      uploadedAt: now,
      reviewStatus: 'PENDING_REVIEW',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null
    }))
  );

  try {
    await createOrganizationKycSubmission({
      submissionId,
      organizationId: organizationUser.id,
      version: nextVersion,
      status: 'PENDING_REVIEW',
      submittedBy: organizationUser.id,
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      files: uploadedFiles
    });

    await updateUser({
      ...organizationUser,
      organizationName: payload.organizationName.trim(),
      legalRegistrationNumber: payload.legalRegistrationNumber.trim(),
      accountStatus: 'INACTIVE_PENDING_KYC'
    } as AuthUser);

    return { submissionId, version: nextVersion, status: 'PENDING_REVIEW' };
  } catch (error) {
    // Ghi chú logic phức tạp: file đã pin thành công nhưng lưu metadata lỗi,
    // cần ghi nhận trạng thái SUBMISSION_ERROR để tránh duyệt nhầm và phục vụ đồng bộ lại.
    await createOrganizationKycSubmission({
      submissionId,
      organizationId: organizationUser.id,
      version: nextVersion,
      status: 'SUBMISSION_ERROR',
      submittedBy: organizationUser.id,
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: error instanceof Error ? error.message : 'Lỗi lưu metadata sau khi upload Pinata.',
      files: uploadedFiles
    });

    throw new Error('Đã upload file lên IPFS nhưng lưu metadata thất bại. Hồ sơ ở trạng thái SUBMISSION_ERROR.');
  }
}

