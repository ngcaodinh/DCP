import {
  countActiveProjectsByOrganizationId,
  createProjectRecord,
  findProjectByOrganizationIdAndName,
  findProjectByProjectId,
  findProjectsByOrganizationId,
  findProjectsByStatus,
  ProjectRecord,
  ProjectStatus,
  updateProjectByProjectId
} from '../models/projectModel';

export type CreateProjectDataAccessPayload = {
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

/** Hàm repository tìm dự án theo tên trong tổ chức. Mục đích: tách data-access khỏi lớp service để dễ test. */
export async function findProjectByOrganizationAndName(organizationId: string, name: string): Promise<ProjectRecord | null> {
  return findProjectByOrganizationIdAndName(organizationId, name);
}

/** Hàm repository tìm dự án theo projectId. Mục đích: hỗ trợ submit/review vòng đời dự án. */
export async function findProjectById(projectId: string): Promise<ProjectRecord | null> {
  return findProjectByProjectId(projectId);
}

/** Hàm repository đếm số dự án ACTIVE theo tổ chức. Mục đích: enforce giới hạn 5 dự án ACTIVE. */
export async function countActiveProjectsByOrganizationIdFromRepository(organizationId: string): Promise<number> {
  return countActiveProjectsByOrganizationId(organizationId);
}

/** Hàm repository tạo mới dự án. Mục đích: chuẩn hóa payload trước khi gọi model MongoDB. */
export async function createProject(payload: CreateProjectDataAccessPayload): Promise<ProjectRecord> {
  return createProjectRecord(payload);
}

/** Hàm repository lấy danh sách dự án theo organizationId. Mục đích: tách data-access cho luồng hiển thị danh sách dự án thật. */
export async function findProjectsByOrganizationIdFromRepository(organizationId: string): Promise<ProjectRecord[]> {
  return findProjectsByOrganizationId(organizationId);
}

/** Hàm repository lấy danh sách dự án theo trạng thái. Mục đích: tách data-access cho màn hình duyệt dự án mới. */
export async function findProjectsByStatusFromRepository(status: ProjectStatus): Promise<ProjectRecord[]> {
  return findProjectsByStatus(status);
}

/** Hàm repository cập nhật dự án theo projectId. Mục đích: cập nhật trạng thái submit/review. */
export async function updateProject(
  projectId: string,
  payload: Partial<ProjectRecord>
): Promise<ProjectRecord | null> {
  return updateProjectByProjectId(projectId, payload);
}

