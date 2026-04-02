import mongoose, { Schema } from 'mongoose';

export type ProjectStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'COMPLETED' | 'CLOSED' | 'REJECTED';

export type ProjectRecord = {
  projectId: string;
  organizationId: string;
  name: string;
  description: string;
  goalAmount: number;
  deadline: Date;
  status: ProjectStatus;
  evidenceCids: string[];
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const projectSchema = new Schema<ProjectRecord>({
  projectId: { type: String, required: true, unique: true },
  organizationId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  goalAmount: { type: Number, required: true },
  deadline: { type: Date, required: true },
  status: { type: String, required: true, index: true },
  evidenceCids: { type: [String], required: true },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: String, default: null },
  rejectionReason: { type: String, default: null },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
});

projectSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const ProjectMongoModel = mongoose.model<ProjectRecord>('Project', projectSchema);

/** Hàm tìm dự án theo tên trong cùng tổ chức. Mục đích: chặn trùng tên dự án theo nghiệp vụ. */
export async function findProjectByOrganizationIdAndName(organizationId: string, name: string): Promise<ProjectRecord | null> {
  return ProjectMongoModel.findOne({ organizationId, name }).lean<ProjectRecord>().exec();
}

/** Hàm tìm dự án theo projectId. Mục đích: dùng cho submit và review dự án. */
export async function findProjectByProjectId(projectId: string): Promise<ProjectRecord | null> {
  return ProjectMongoModel.findOne({ projectId }).lean<ProjectRecord>().exec();
}

/** Hàm đếm số dự án ACTIVE của tổ chức. Mục đích: enforce giới hạn tối đa 5 dự án ACTIVE. */
export async function countActiveProjectsByOrganizationId(organizationId: string): Promise<number> {
  return ProjectMongoModel.countDocuments({ organizationId, status: 'ACTIVE' }).exec();
}

/** Hàm tạo mới bản ghi dự án. Mục đích: lưu dữ liệu dự án vào MongoDB theo chuẩn repository. */
export async function createProjectRecord(projectRecord: ProjectRecord): Promise<ProjectRecord> {
  const createdProject = await ProjectMongoModel.create(projectRecord);
  return createdProject.toObject() as ProjectRecord;
}

/** Hàm lấy danh sách dự án theo tổ chức. Mục đích: phục vụ màn hình quản lý dự án với dữ liệu thật từ backend. */
export async function findProjectsByOrganizationId(organizationId: string): Promise<ProjectRecord[]> {
  return ProjectMongoModel.find({ organizationId }).sort({ createdAt: -1 }).lean<ProjectRecord[]>().exec();
}

/** Hàm lấy danh sách dự án theo trạng thái. Mục đích: phục vụ màn hình reviewer duyệt dự án chờ phê duyệt. */
export async function findProjectsByStatus(status: ProjectStatus): Promise<ProjectRecord[]> {
  return ProjectMongoModel.find({ status }).sort({ submittedAt: -1, createdAt: -1 }).lean<ProjectRecord[]>().exec();
}

/** Hàm cập nhật dự án theo projectId. Mục đích: cập nhật trạng thái vòng đời và metadata review. */
export async function updateProjectByProjectId(
  projectId: string,
  payload: Partial<ProjectRecord>
): Promise<ProjectRecord | null> {
  const updatedProject = await ProjectMongoModel.findOneAndUpdate({ projectId }, payload, { returnDocument: 'after' }).exec();
  return updatedProject ? (updatedProject.toObject() as ProjectRecord) : null;
}

