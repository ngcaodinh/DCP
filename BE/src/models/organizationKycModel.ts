import mongoose, { Schema } from 'mongoose';

export type OrganizationKycFile = {
  cid: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType: string;
  version: number;
  uploadedBy: string;
  uploadedAt: Date;
  reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
};

export type OrganizationKycSubmission = {
  submissionId: string;
  organizationId: string;
  version: number;
  status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'RESUBMITTED'
    | 'SUBMISSION_ERROR';
  submittedBy: string;
  submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  files: OrganizationKycFile[];
};

const organizationKycFileSchema = new Schema<OrganizationKycFile>({
  cid: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true },
  documentType: { type: String, required: true },
  version: { type: Number, required: true },
  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, required: true },
  reviewStatus: { type: String, required: true },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null }
});

const organizationKycSubmissionSchema = new Schema<OrganizationKycSubmission>({
  submissionId: { type: String, required: true, unique: true },
  organizationId: { type: String, required: true, index: true },
  version: { type: Number, required: true },
  status: { type: String, required: true },
  submittedBy: { type: String, required: true },
  submittedAt: { type: Date, required: true },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null },
  files: { type: [organizationKycFileSchema], required: true }
});

const OrganizationKycSubmissionModel = mongoose.model<OrganizationKycSubmission>(
  'OrganizationKycSubmission',
  organizationKycSubmissionSchema
);

/**
 * Hàm lấy phiên bản hồ sơ mới nhất của tổ chức.
 * Mục đích: tăng version đúng chuẩn khi tổ chức nộp lại hồ sơ.
 */
export async function getLatestSubmissionVersion(organizationId: string): Promise<number> {
  const latestSubmission = await OrganizationKycSubmissionModel.findOne({ organizationId })
    .sort({ version: -1 })
    .lean<OrganizationKycSubmission>()
    .exec();
  return latestSubmission?.version || 0;
}

/**
 * Hàm tạo hồ sơ KYC mới cho tổ chức.
 * Mục đích: lưu đầy đủ metadata hồ sơ phiên bản hóa vào MongoDB.
 */
export async function createOrganizationKycSubmission(
  submission: OrganizationKycSubmission
): Promise<OrganizationKycSubmission> {
  const createdSubmission = await OrganizationKycSubmissionModel.create(submission);
  return createdSubmission.toObject() as OrganizationKycSubmission;
}

/**
 * Hàm lấy danh sách hồ sơ KYC theo tổ chức.
 * Mục đích: hiển thị lịch sử nộp hồ sơ để phục vụ audit và truy vết.
 */
export async function findSubmissionsByOrganizationId(
  organizationId: string
): Promise<OrganizationKycSubmission[]> {
  return OrganizationKycSubmissionModel.find({ organizationId })
    .sort({ version: -1 })
    .lean<OrganizationKycSubmission[]>()
    .exec();
}

