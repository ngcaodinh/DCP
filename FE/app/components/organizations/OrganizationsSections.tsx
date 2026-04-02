import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProgressBar, SectionCard, StatusBadge } from './OrganizationUiParts';
import { dashboardTimelineItems, statisticItems, transparencyTransactionRows } from './mockData';
import { ApiErrorDetail, fetchApi, buildApiUrl } from '@/app/utils/apiClient';
import { readAuthSession } from '@/app/utils/authSession';
import { ProjectSummary } from './types';

type DisbursementSectionProps = {
  activeDisbursementTab: 'eligible' | 'pending' | 'history';
  onChangeDisbursementTab: (tab: 'eligible' | 'pending' | 'history') => void;
};

type CreateProjectModalProps = {
  onClose: () => void;
  onProjectCreated: (project: ProjectSummary) => void;
};

type ProjectsSectionProps = {
  createdProjects: ProjectSummary[];
  isProjectsLoading?: boolean;
  projectsErrorMessage?: string | null;
  onRetryLoadProjects?: () => void;
  onOpenCreateProjectModal: () => void;
  isCreateProjectAllowed?: boolean;
  createProjectBlockReason?: string | null;
  onGoToBankSettings?: () => void;
  onProjectSubmitted: (projectId: string, project: ProjectSummary) => void;
  onProjectUpdated: (projectId: string, project: ProjectSummary) => void;
};

type NotificationDropdownProps = {
  hasUnreadNotification: boolean;
  onMarkAllAsRead: () => void;
  onRequestClose: () => void;
};

type DashboardSectionProps = {
  onLinkBankAccount: () => void;
  hasApprovedBeneficiaryBankAccount: boolean;
};

type ProjectCardView = {
  key: string;
  projectId: string | null;
  projectStatus: ProjectSummary['status'];
  emoji: string;
  thumbStyle: string;
  statusLabel: string;
  statusStyle: string;
  name: string;
  description: string;
  progressLabel: string;
  progressPercent: number;
  raisedAmount: string;
  goalAmount: string;
  footerMeta: string[];
  statusKey: 'active' | 'pending' | 'done';
  canSubmitForApproval: boolean;
  canUpdateProject: boolean;
};

type CreateProjectFormData = {
  name: string;
  description: string;
  goalAmount: string;
  deadline: string;
};

type CreateProjectFormErrors = Partial<Record<keyof CreateProjectFormData | 'evidenceFiles', string>>;

type UpdateProjectFormData = {
  name: string;
  description: string;
  goalAmount: string;
  deadline: string;
};

type UpdateProjectFormErrors = Partial<Record<keyof UpdateProjectFormData | 'evidenceFiles', string>>;

/** Hàm đổi ISO date sang định dạng input datetime-local. Mục đích: đổ dữ liệu deadline hiện tại vào form cập nhật. */
function formatDateTimeLocalValue(dateIsoString: string): string {
  const parsedDate = new Date(dateIsoString);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  const timezoneOffsetInMilliseconds = parsedDate.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(parsedDate.getTime() - timezoneOffsetInMilliseconds);
  return localDate.toISOString().slice(0, 16);
}

type UploadEvidenceFilePayload = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

type UploadEvidenceResponse = {
  evidenceCids: string[];
};

const createProjectDefaultFormState: CreateProjectFormData = {
  name: '',
  description: '',
  goalAmount: '',
  deadline: ''
};

const createdProjectEmojis = ['🚀', '📌', '🎯', '✨', '🌱'];
const createdProjectStyles = [
  'bg-gradient-to-br from-[#E0F2FE] to-[#BAE6FD]',
  'bg-gradient-to-br from-[#DCFCE7] to-[#BBF7D0]',
  'bg-gradient-to-br from-[#FCE7F3] to-[#FBCFE8]',
  'bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A]',
  'bg-gradient-to-br from-[#EDE9FE] to-[#DDD6FE]'
];
/** Hàm chuyển file thành base64. Mục đích: chuẩn hóa dữ liệu file upload trước khi gửi backend xử lý IPFS/Pinata. */
async function convertFileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryContent = '';

  // Logic này dùng vòng lặp tường minh để tránh lỗi stack khi file lớn nếu dùng String.fromCharCode với spread.
  uint8Array.forEach(byteValue => {
    binaryContent += String.fromCharCode(byteValue);
  });

  return window.btoa(binaryContent);
}

/** Hàm định dạng tiền theo chuẩn VNĐ. Mục đích: hiển thị số tiền rõ ràng cho người dùng. */
function formatCurrencyFromNumber(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount);
}

/** Hàm lấy nhãn trạng thái dự án. Mục đích: thống nhất màu và nhãn theo status backend. */
function buildStatusPresentation(status: ProjectSummary['status']): {
  statusLabel: string;
  statusStyle: string;
  statusKey: 'active' | 'pending' | 'done';
} {
  if (status === 'ACTIVE') {
    return { statusLabel: '● ĐANG HOẠT ĐỘNG', statusStyle: 'bg-[#DCFCE7] text-[#166534]', statusKey: 'active' };
  }

  if (status === 'COMPLETED') {
    return { statusLabel: '● HOÀN THÀNH', statusStyle: 'bg-[#E5E7EB] text-[#374151]', statusKey: 'done' };
  }

  if (status === 'CLOSED') {
    return { statusLabel: '● ĐÃ ĐÓNG', statusStyle: 'bg-[#E5E7EB] text-[#374151]', statusKey: 'done' };
  }

  if (status === 'REJECTED') {
    return { statusLabel: '● BỊ TỪ CHỐI', statusStyle: 'bg-[#FEE2E2] text-[#991B1B]', statusKey: 'pending' };
  }

  if (status === 'DRAFT') {
    return { statusLabel: '● BẢN NHÁP', statusStyle: 'bg-[#E0F2FE] text-[#0C4A6E]', statusKey: 'pending' };
  }

  return { statusLabel: '● CHỜ PHÊ DUYỆT', statusStyle: 'bg-[#FEF3C7] text-[#92400E]', statusKey: 'pending' };
}

/** Hàm chuyển dữ liệu dự án vừa tạo sang dạng card hiển thị. Mục đích: đồng bộ layout UI với dữ liệu API. */
function mapCreatedProjectToCardView(project: ProjectSummary, index: number): ProjectCardView {
  const statusPresentation = buildStatusPresentation(project.status);
  const deadlineDate = new Date(project.deadline);

  // Logic này tính số ngày còn lại để hiển thị nhanh tình trạng deadline trong footer của card.
  const remainingDays = Math.max(0, Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const remainingLabel = remainingDays > 0 ? `📅 ${remainingDays} ngày` : '📅 Hết hạn';

  return {
    key: project.projectId,
    projectId: project.projectId,
    projectStatus: project.status,
    emoji: createdProjectEmojis[index % createdProjectEmojis.length],
    thumbStyle: createdProjectStyles[index % createdProjectStyles.length],
    statusLabel: statusPresentation.statusLabel,
    statusStyle: statusPresentation.statusStyle,
    name: project.name,
    description: project.description,
    progressLabel: '0%',
    progressPercent: 0,
    raisedAmount: '0 ₫',
    goalAmount: `${formatCurrencyFromNumber(project.goalAmount)} ₫`,
    footerMeta: ['👥 0', remainingLabel, '🏅 Chờ xếp hạng'],
    statusKey: statusPresentation.statusKey,
    canSubmitForApproval: project.status === 'DRAFT',
    canUpdateProject: project.status === 'PENDING_APPROVAL'
  };
}

/** Hàm đổi trạng thái dự án sang tiếng Việt. Mục đích: hiển thị thông tin trạng thái dễ hiểu trong modal chi tiết. */
function formatProjectStatusVietnamese(status: ProjectSummary['status']): string {
  if (status === 'DRAFT') {
    return 'Bản nháp';
  }

  if (status === 'PENDING_APPROVAL') {
    return 'Chờ phê duyệt';
  }

  if (status === 'ACTIVE') {
    return 'Đang hoạt động';
  }

  if (status === 'COMPLETED') {
    return 'Hoàn thành';
  }

  if (status === 'CLOSED') {
    return 'Đã đóng';
  }

  return 'Bị từ chối';
}

/** Hàm định dạng thời gian hiển thị tiếng Việt. Mục đích: hiển thị timestamp dự án dễ đọc trong modal chi tiết. */
function formatDateTimeVietnamese(dateValue: string | null): string {
  if (!dateValue) {
    return 'Chưa có';
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Không hợp lệ';
  }

  return parsedDate.toLocaleString('vi-VN');
}


/** Hàm validate form tạo dự án phía client. Mục đích: phản hồi lỗi sớm trước khi gửi request lên server. */
function validateCreateProjectFormData(formData: CreateProjectFormData, selectedEvidenceFiles: File[]): CreateProjectFormErrors {
  const formErrors: CreateProjectFormErrors = {};

  if (formData.name.trim().length < 3 || formData.name.trim().length > 120) {
    formErrors.name = 'Tên dự án phải từ 3 đến 120 ký tự.';
  }

  if (formData.description.trim().length < 10 || formData.description.trim().length > 2000) {
    formErrors.description = 'Mô tả dự án phải từ 10 đến 2000 ký tự.';
  }

  const parsedGoalAmount = Number(formData.goalAmount);
  if (!Number.isFinite(parsedGoalAmount) || parsedGoalAmount <= 0) {
    formErrors.goalAmount = 'Mục tiêu gây quỹ phải lớn hơn 0.';
  }

  if (!formData.deadline) {
    formErrors.deadline = 'Vui lòng chọn thời hạn dự án.';
  } else {
    const parsedDeadline = new Date(formData.deadline);
    if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.getTime() <= Date.now()) {
      formErrors.deadline = 'Hạn dự án phải là thời gian trong tương lai.';
    }
  }

  if (selectedEvidenceFiles.length === 0) {
    formErrors.evidenceFiles = 'Vui lòng tải lên ít nhất 1 file minh chứng.';
  }

  if (selectedEvidenceFiles.length > 10) {
    formErrors.evidenceFiles = 'Bạn chỉ được tải lên tối đa 10 file minh chứng.';
  }

  return formErrors;
}

/** Hàm map lỗi API về lỗi theo field. Mục đích: hiển thị lỗi đúng vị trí input trong modal tạo dự án. */
function mapApiDetailsToFormErrors(details: ApiErrorDetail[]): CreateProjectFormErrors {
  const formErrors: CreateProjectFormErrors = {};

  details.forEach(detail => {
    if (detail.field === 'name') {
      formErrors.name = detail.message;
    }

    if (detail.field === 'description') {
      formErrors.description = detail.message;
    }

    if (detail.field === 'goalAmount') {
      formErrors.goalAmount = detail.message;
    }

    if (detail.field === 'deadline') {
      formErrors.deadline = detail.message;
    }

    if (detail.field === 'evidenceCids') {
      formErrors.evidenceFiles = detail.message;
    }
  });

  return formErrors;
}

/** Hàm validate form cập nhật dự án phía client. Mục đích: kiểm tra dữ liệu trước khi gọi API cập nhật. */
function validateUpdateProjectFormData(formData: UpdateProjectFormData, selectedEvidenceFiles: File[]): UpdateProjectFormErrors {
  const formErrors: UpdateProjectFormErrors = {};

  if (formData.name.trim().length < 3 || formData.name.trim().length > 120) {
    formErrors.name = 'Tên dự án phải từ 3 đến 120 ký tự.';
  }

  if (formData.description.trim().length < 10 || formData.description.trim().length > 2000) {
    formErrors.description = 'Mô tả dự án phải từ 10 đến 2000 ký tự.';
  }

  const parsedGoalAmount = Number(formData.goalAmount);
  if (!Number.isFinite(parsedGoalAmount) || parsedGoalAmount <= 0) {
    formErrors.goalAmount = 'Mục tiêu gây quỹ phải lớn hơn 0.';
  }

  if (!formData.deadline) {
    formErrors.deadline = 'Vui lòng chọn thời hạn dự án.';
  } else {
    const parsedDeadline = new Date(formData.deadline);
    if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.getTime() <= Date.now()) {
      formErrors.deadline = 'Hạn dự án phải là thời gian trong tương lai.';
    }
  }

  if (selectedEvidenceFiles.length > 10) {
    formErrors.evidenceFiles = 'Bạn chỉ được tải lên tối đa 10 file minh chứng mới.';
  }

  return formErrors;
}

/** Hàm map lỗi API sang lỗi form cập nhật. Mục đích: hiển thị lỗi đúng trường khi API trả validation details. */
function mapApiDetailsToUpdateFormErrors(details: ApiErrorDetail[]): UpdateProjectFormErrors {
  const formErrors: UpdateProjectFormErrors = {};

  details.forEach(detail => {
    if (detail.field === 'name') {
      formErrors.name = detail.message;
    }

    if (detail.field === 'description') {
      formErrors.description = detail.message;
    }

    if (detail.field === 'goalAmount') {
      formErrors.goalAmount = detail.message;
    }

    if (detail.field === 'deadline') {
      formErrors.deadline = detail.message;
    }

    if (detail.field === 'evidenceCids') {
      formErrors.evidenceFiles = detail.message;
    }
  });

  return formErrors;
}

/** Hàm render section Dashboard. Mục đích: hiển thị cảnh báo, thống kê, biểu đồ mô phỏng và timeline. */
export function DashboardSection({ onLinkBankAccount, hasApprovedBeneficiaryBankAccount }: DashboardSectionProps) {
  return (
    <div className="space-y-6">
      {!hasApprovedBeneficiaryBankAccount ? (
        <div className="flex items-start gap-3 rounded-[14px] border border-[#FED7AA] border-l-4 border-l-[#D97706] bg-gradient-to-r from-[#FFF7ED] to-[#FFFBEB] p-4">
          <span className="text-xl">🏦</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#92400E]">Chưa liên kết tài khoản ngân hàng thụ hưởng</p>
            <p className="text-xs text-[#B45309]">Bạn cần xác lập STK ngân hàng trước khi tạo dự án để đảm bảo minh bạch giải ngân.</p>
          </div>
          <button
            type="button"
            onClick={onLinkBankAccount}
            className="rounded bg-[#D97706] px-3 py-2 text-xs font-semibold text-white"
          >
            Liên kết ngay →
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {statisticItems.map(item => (
          <SectionCard key={item.label} title={item.label} bodyClassName="space-y-2 p-4">
            <p className="text-2xl font-bold">{item.icon} {item.value}</p>
            <p className="text-xs text-[#6B7280]">{item.subtitle}</p>
            <StatusBadge label={item.change} className={item.changeStyle === 'warn' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#166534]'} />
          </SectionCard>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <SectionCard
          title="Lịch sử quyên góp"
          rightSlot={<div className="flex gap-1 text-xs"><button type="button" className="rounded border border-[#0E7C6B] bg-[#0E7C6B] px-2 py-1 text-white">Ngày</button><button type="button" className="rounded border border-[#E5E7EB] px-2 py-1">Tuần</button><button type="button" className="rounded border border-[#E5E7EB] px-2 py-1">Tháng</button></div>}
        >
          <div className="h-[180px] rounded-[10px] border border-dashed border-[#D1D5DB] bg-[#F8FAFB] p-3 text-xs text-[#6B7280]">Khu vực biểu đồ line chart tĩnh theo bản HTML.</div>
        </SectionCard>

        <SectionCard title="Dự án nổi bật">
          <div className="mb-3 flex h-[130px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#E6F7F4] to-[#BAE6FD] text-4xl">📚</div>
          <p className="font-semibold">Học bổng vùng cao Tây Bắc</p>
          <p className="mt-1 text-xs text-[#6B7280]">Hỗ trợ 200 học sinh dân tộc thiểu số tiếp cận giáo dục.</p>
          <ProgressBar progressPercent={72} className="mt-3 h-[7px] rounded bg-[#F3F4F6]" />
          <div className="mt-1 flex justify-between text-[11px] text-[#6B7280]"><span>36,000,000 ₫</span><span>50,000,000 ₫</span></div>
          <button type="button" className="mt-3 w-full rounded-[9px] bg-[#0E7C6B] py-2 text-sm font-medium text-white">Xem chi tiết dự án</button>
        </SectionCard>
      </div>

      <SectionCard title="Hoạt động gần đây" actionText="Xem tất cả">
        <div className="space-y-3">
          {dashboardTimelineItems.map(item => (
            <div key={item.content} className="flex gap-3 border-b border-[#F3F4F6] pb-2 last:border-none">
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.dotStyle}`} />
              <p className="flex-1 text-sm">{item.content}</p>
              <span className="text-xs text-[#9CA3AF]">{item.time}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/** Hàm render section Projects. Mục đích: hiển thị danh sách dự án và cho phép submit dự án chờ duyệt. */
export function ProjectsSection({
  createdProjects,
  isProjectsLoading = false,
  projectsErrorMessage = null,
  onRetryLoadProjects,
  onOpenCreateProjectModal,
  isCreateProjectAllowed = true,
  createProjectBlockReason = null,
  onGoToBankSettings,
  onProjectSubmitted,
  onProjectUpdated
}: ProjectsSectionProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'pending'>('all');
  const [submittingProjectId, setSubmittingProjectId] = useState<string | null>(null);
  const [submitProjectErrorMessage, setSubmitProjectErrorMessage] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isUpdateModalVisible, setIsUpdateModalVisible] = useState(false);
  const [updateFormData, setUpdateFormData] = useState<UpdateProjectFormData>({ name: '', description: '', goalAmount: '', deadline: '' });
  const [updateFormErrors, setUpdateFormErrors] = useState<UpdateProjectFormErrors>({});
  const [selectedUpdateEvidenceFiles, setSelectedUpdateEvidenceFiles] = useState<File[]>([]);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [updateProjectErrorMessage, setUpdateProjectErrorMessage] = useState<string | null>(null);

  const mappedCreatedProjects = useMemo(
    () => createdProjects.map((project, projectIndex) => mapCreatedProjectToCardView(project, projectIndex)),
    [createdProjects]
  );

  const mergedProjects = mappedCreatedProjects;

  /** Hàm submit dự án lên reviewer. Mục đích: gọi API submit và cập nhật trạng thái card ngay sau khi thành công. */
  const handleSubmitProjectForApproval = async (project: ProjectCardView) => {
    if (!project.projectId || !project.canSubmitForApproval) {
      return;
    }

    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      setSubmitProjectErrorMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitProjectErrorMessage(null);
    setSubmittingProjectId(project.projectId);

    try {
      const response = await fetchApi<ProjectSummary>(buildApiUrl('/projects/submit'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${authSession.accessToken}` },
        body: JSON.stringify({ projectId: project.projectId })
      });

      onProjectSubmitted(project.projectId, response.data);
    } catch (error: unknown) {
      const fallbackErrorMessage = 'Không thể submit dự án. Vui lòng thử lại sau.';
      if (error && typeof error === 'object' && 'message' in error) {
        setSubmitProjectErrorMessage((error as { message?: string }).message || fallbackErrorMessage);
      } else {
        setSubmitProjectErrorMessage(fallbackErrorMessage);
      }
    } finally {
      setSubmittingProjectId(null);
    }
  };

  const filteredProjects = useMemo(() => {
    const normalizedKeyword = searchKeyword.trim().toLowerCase();

    return mergedProjects.filter(project => {
      if (normalizedKeyword && !project.name.toLowerCase().includes(normalizedKeyword)) {
        return false;
      }

      if (selectedFilter === 'active') {
        return project.statusKey === 'active';
      }

      if (selectedFilter === 'pending') {
        return project.statusKey === 'pending';
      }

      return true;
    });
  }, [mergedProjects, searchKeyword, selectedFilter]);

  const selectedProjectDetail = useMemo(
    () => createdProjects.find(projectItem => projectItem.projectId === selectedProjectId) ?? null,
    [createdProjects, selectedProjectId]
  );

  /** Hàm mở modal chi tiết dự án. Mục đích: cho phép người dùng xem đầy đủ thông tin của dự án đã chọn. */
  const handleOpenProjectDetail = (projectId: string | null) => {
    if (!projectId) {
      return;
    }

    setSelectedProjectId(projectId);
    setIsUpdateModalVisible(false);
  };

  /** Hàm mở modal cập nhật dự án. Mục đích: nạp dữ liệu hiện tại vào form trước khi người dùng chỉnh sửa. */
  const handleOpenProjectUpdate = (projectId: string | null) => {
    if (!projectId) {
      return;
    }

    const selectedProject = createdProjects.find(projectItem => projectItem.projectId === projectId);
    if (!selectedProject) {
      return;
    }

    setSelectedProjectId(projectId);
    setIsUpdateModalVisible(true);
    setUpdateProjectErrorMessage(null);
    setSelectedUpdateEvidenceFiles([]);
    setUpdateFormErrors({});
    setUpdateFormData({
      name: selectedProject.name,
      description: selectedProject.description,
      goalAmount: String(selectedProject.goalAmount),
      deadline: formatDateTimeLocalValue(selectedProject.deadline)
    });
  };

  /** Hàm đóng modal chi tiết/cập nhật. Mục đích: reset trạng thái modal sau khi người dùng hoàn tất thao tác. */
  const handleCloseProjectDetailModal = () => {
    setSelectedProjectId(null);
    setIsUpdateModalVisible(false);
    setUpdateProjectErrorMessage(null);
    setSelectedUpdateEvidenceFiles([]);
    setUpdateFormErrors({});
  };

  /** Hàm cập nhật input form sửa dự án. Mục đích: đồng bộ dữ liệu mới và xóa lỗi theo từng trường. */
  const handleChangeUpdateFormField = (field: keyof UpdateProjectFormData, value: string) => {
    const nextFormData: UpdateProjectFormData = { ...updateFormData, [field]: value };
    setUpdateFormData(nextFormData);
    const nextFormErrors = validateUpdateProjectFormData(nextFormData, selectedUpdateEvidenceFiles);
    setUpdateFormErrors(currentErrors => ({ ...currentErrors, [field]: nextFormErrors[field] }));
  };

  /** Hàm chọn file minh chứng mới khi cập nhật. Mục đích: cho phép thay thế một phần hoặc toàn bộ CID cũ. */
  const handleSelectUpdateEvidenceFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    const nextSelectedEvidenceFiles = [...selectedUpdateEvidenceFiles, ...selectedFiles].slice(0, 10);
    setSelectedUpdateEvidenceFiles(nextSelectedEvidenceFiles);
    setUpdateFormErrors(currentErrors => ({
      ...currentErrors,
      evidenceFiles: validateUpdateProjectFormData(updateFormData, nextSelectedEvidenceFiles).evidenceFiles
    }));
    event.target.value = '';
  };

  /** Hàm xóa file minh chứng mới đã chọn. Mục đích: cho phép người dùng chỉnh lại danh sách file sẽ thay thế. */
  const handleRemoveUpdateEvidenceFile = (fileIndex: number) => {
    const nextSelectedEvidenceFiles = selectedUpdateEvidenceFiles.filter((_, currentFileIndex) => currentFileIndex !== fileIndex);
    setSelectedUpdateEvidenceFiles(nextSelectedEvidenceFiles);
    setUpdateFormErrors(currentErrors => ({
      ...currentErrors,
      evidenceFiles: validateUpdateProjectFormData(updateFormData, nextSelectedEvidenceFiles).evidenceFiles
    }));
  };

  /** Hàm upload file minh chứng mới khi cập nhật. Mục đích: nhận CID mới trước khi gọi API cập nhật dự án. */
  const uploadUpdateEvidenceFiles = async (accessToken: string): Promise<UploadEvidenceResponse> => {
    const uploadPayloadFiles: UploadEvidenceFilePayload[] = await Promise.all(
      selectedUpdateEvidenceFiles.map(async fileItem => ({
        fileName: fileItem.name,
        mimeType: fileItem.type,
        contentBase64: await convertFileToBase64(fileItem)
      }))
    );

    const uploadResponse = await fetchApi<UploadEvidenceResponse>(buildApiUrl('/projects/evidences/upload'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ files: uploadPayloadFiles })
    });

    return uploadResponse.data;
  };

  /** Hàm submit cập nhật dự án. Mục đích: gọi API PATCH và đồng bộ lại card sau khi thành công. */
  const handleSubmitUpdateProject = async (event: { preventDefault: () => void }) => {
    event.preventDefault();

    if (!selectedProjectDetail) {
      setUpdateProjectErrorMessage('Không tìm thấy dữ liệu dự án để cập nhật.');
      return;
    }

    const nextFormErrors = validateUpdateProjectFormData(updateFormData, selectedUpdateEvidenceFiles);
    if (Object.keys(nextFormErrors).length > 0) {
      setUpdateFormErrors(nextFormErrors);
      return;
    }

    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      setUpdateProjectErrorMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setUpdateProjectErrorMessage(null);
    setIsUpdatingProject(true);

    try {
      let nextEvidenceCids = selectedProjectDetail.evidenceCids;

      // Logic này chỉ thay CID khi người dùng thực sự upload file mới; nếu không thì giữ nguyên CID cũ.
      if (selectedUpdateEvidenceFiles.length > 0) {
        const uploadResult = await uploadUpdateEvidenceFiles(authSession.accessToken);
        nextEvidenceCids = uploadResult.evidenceCids;
      }

      const response = await fetchApi<ProjectSummary>(buildApiUrl('/projects'), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authSession.accessToken}` },
        body: JSON.stringify({
          projectId: selectedProjectDetail.projectId,
          name: updateFormData.name.trim(),
          description: updateFormData.description.trim(),
          goalAmount: Number(updateFormData.goalAmount),
          deadline: new Date(updateFormData.deadline).toISOString(),
          evidenceCids: nextEvidenceCids
        })
      });

      onProjectUpdated(selectedProjectDetail.projectId, response.data);
      handleCloseProjectDetailModal();
    } catch (error: unknown) {
      const fallbackErrorMessage = 'Không thể cập nhật dự án. Vui lòng thử lại sau.';
      if (error && typeof error === 'object' && 'details' in error) {
        const typedError = error as { message?: string; details?: ApiErrorDetail[] };
        if (Array.isArray(typedError.details) && typedError.details.length > 0) {
          setUpdateFormErrors(currentErrors => ({ ...currentErrors, ...mapApiDetailsToUpdateFormErrors(typedError.details || []) }));
        }
        setUpdateProjectErrorMessage(typedError.message || fallbackErrorMessage);
      } else if (error && typeof error === 'object' && 'message' in error) {
        setUpdateProjectErrorMessage((error as { message?: string }).message || fallbackErrorMessage);
      } else {
        setUpdateProjectErrorMessage(fallbackErrorMessage);
      }
    } finally {
      setIsUpdatingProject(false);
    }
  };

  return (
    <SectionCard title="Dự án của tổ chức" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#F3F4F6] p-4">
        <input
          className="min-w-[220px] flex-1 rounded border border-[#E5E7EB] bg-[#F3F4F6] px-3 py-2 text-xs"
          placeholder="Tìm dự án theo tên..."
          value={searchKeyword}
          onChange={event => setSearchKeyword(event.target.value)}
        />
        <button type="button" onClick={() => setSelectedFilter('all')} className={`rounded-full px-3 py-1.5 text-xs ${selectedFilter === 'all' ? 'bg-[#0E7C6B] text-white' : 'border border-[#E5E7EB]'}`}>Tất cả</button>
        <button type="button" onClick={() => setSelectedFilter('active')} className={`rounded-full px-3 py-1.5 text-xs ${selectedFilter === 'active' ? 'bg-[#0E7C6B] text-white' : 'border border-[#E5E7EB]'}`}>Đang hoạt động</button>
        <button type="button" onClick={() => setSelectedFilter('pending')} className={`rounded-full px-3 py-1.5 text-xs ${selectedFilter === 'pending' ? 'bg-[#0E7C6B] text-white' : 'border border-[#E5E7EB]'}`}>Đang chờ</button>
        <button
          type="button"
          onClick={onOpenCreateProjectModal}
          disabled={!isCreateProjectAllowed}
          className="rounded-[8px] bg-[#0E7C6B] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          ➕ Tạo dự án
        </button>
      </div>

      {!isCreateProjectAllowed ? (
        <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded border border-[#FED7AA] bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
          <span>{createProjectBlockReason || 'Bạn cần liên kết và được duyệt tài khoản ngân hàng thụ hưởng trước khi tạo dự án.'}</span>
          {onGoToBankSettings ? (
            <button type="button" onClick={onGoToBankSettings} className="rounded border border-[#FDBA74] px-2 py-1 font-semibold text-[#9A3412]">
              Đi tới Cài đặt ngân hàng
            </button>
          ) : null}
        </div>
      ) : null}

      {submitProjectErrorMessage ? (
        <div className="mx-4 mt-4 rounded border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">{submitProjectErrorMessage}</div>
      ) : null}

      {projectsErrorMessage ? (
        <div className="mx-4 mt-4 flex items-center justify-between gap-2 rounded border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">
          <span>{projectsErrorMessage}</span>
          {onRetryLoadProjects ? (
            <button type="button" onClick={onRetryLoadProjects} className="rounded border border-[#FCA5A5] px-2 py-1 text-[11px]">
              Thử lại
            </button>
          ) : null}
        </div>
      ) : null}

      {isProjectsLoading ? <p className="px-4 py-5 text-xs text-[#6B7280]">Đang tải dữ liệu dự án...</p> : null}

      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-3">
        {filteredProjects.map(project => (
          <div key={project.key} className="rounded-[12px] border border-[#E5E7EB] bg-white shadow-sm">
            <div className={`relative flex h-[100px] items-center justify-center text-3xl ${project.thumbStyle}`}>
              {project.emoji}
              <span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-semibold ${project.statusStyle}`}>{project.statusLabel}</span>
            </div>
            <div className="space-y-2 p-3">
              <p className="text-sm font-semibold leading-5">{project.name}</p>
              <p className="line-clamp-2 text-xs text-[#6B7280]">{project.description}</p>
              <p className="text-right text-[11px] font-semibold text-[#0E7C6B]">{project.progressLabel}</p>
              <ProgressBar progressPercent={project.progressPercent} className="h-[7px] rounded bg-[#F3F4F6]" />
              <div className="flex justify-between text-[11px] text-[#6B7280]"><span>{project.raisedAmount}</span><span>{project.goalAmount}</span></div>
              <div className="flex flex-wrap gap-2 text-[11px] text-[#6B7280]">{project.footerMeta.map(meta => <span key={meta}>{meta}</span>)}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenProjectDetail(project.projectId)}
                  className="flex-1 rounded border border-[#E5E7EB] py-1.5 text-xs"
                >
                  Chi tiết
                </button>
                {project.canSubmitForApproval ? (
                  <button
                    type="button"
                    onClick={() => handleSubmitProjectForApproval(project)}
                    disabled={!project.projectId || submittingProjectId === project.projectId}
                    className="flex-1 rounded bg-[#0E7C6B] py-1.5 text-xs text-white disabled:opacity-60"
                  >
                    {submittingProjectId === project.projectId ? 'Đang submit...' : 'Gửi yêu cầu duyệt'}
                  </button>
                ) : project.canUpdateProject ? (
                  <button
                    type="button"
                    onClick={() => handleOpenProjectUpdate(project.projectId)}
                    className="flex-1 rounded bg-[#0E7C6B] py-1.5 text-xs text-white"
                  >
                    Cập nhật
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 rounded bg-[#D1D5DB] py-1.5 text-xs text-[#6B7280]"
                  >
                    Cập nhật
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!isProjectsLoading && filteredProjects.length === 0 ? (
        <p className="px-4 pb-5 text-xs text-[#6B7280]">Chưa có dự án nào hoặc không có kết quả phù hợp bộ lọc.</p>
      ) : null}

      {selectedProjectDetail ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[680px] rounded-[16px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#F3F4F6] pb-3">
              <div>
                <p className="text-lg font-bold text-[#111827]">{isUpdateModalVisible ? 'Cập nhật dự án' : 'Chi tiết dự án'}</p>
                <p className="text-xs text-[#6B7280]">{isUpdateModalVisible ? 'Chỉnh sửa thông tin và minh chứng của dự án.' : 'Xem đầy đủ thông tin đã khai báo của dự án.'}</p>
              </div>
              <button type="button" onClick={handleCloseProjectDetailModal} className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-sm">✕</button>
            </div>

            {isUpdateModalVisible ? (
              <form className="mt-4 space-y-3" onSubmit={handleSubmitUpdateProject}>
                <input className="w-full rounded border border-[#E5E7EB] px-3 py-2 text-sm" value={updateFormData.name} onChange={event => handleChangeUpdateFormField('name', event.target.value)} placeholder="Tên dự án" />
                {updateFormErrors.name ? <p className="text-xs text-[#B91C1C]">{updateFormErrors.name}</p> : null}
                <textarea className="h-28 w-full rounded border border-[#E5E7EB] px-3 py-2 text-sm" value={updateFormData.description} onChange={event => handleChangeUpdateFormField('description', event.target.value)} placeholder="Mô tả dự án" />
                {updateFormErrors.description ? <p className="text-xs text-[#B91C1C]">{updateFormErrors.description}</p> : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <input type="number" min={1} className="w-full rounded border border-[#E5E7EB] px-3 py-2 text-sm" value={updateFormData.goalAmount} onChange={event => handleChangeUpdateFormField('goalAmount', event.target.value)} placeholder="Mục tiêu gây quỹ" />
                    {updateFormErrors.goalAmount ? <p className="mt-1 text-xs text-[#B91C1C]">{updateFormErrors.goalAmount}</p> : null}
                  </div>
                  <div>
                    <input type="datetime-local" className="w-full rounded border border-[#E5E7EB] px-3 py-2 text-sm" value={updateFormData.deadline} onChange={event => handleChangeUpdateFormField('deadline', event.target.value)} />
                    {updateFormErrors.deadline ? <p className="mt-1 text-xs text-[#B91C1C]">{updateFormErrors.deadline}</p> : null}
                  </div>
                </div>

                <div className="rounded border border-[#E5E7EB] p-3">
                  <p className="text-xs text-[#6B7280]">Nếu không chọn file mới, hệ thống sẽ giữ nguyên CID minh chứng cũ.</p>
                  <input type="file" multiple className="mt-2 block w-full text-xs" onChange={handleSelectUpdateEvidenceFiles} />
                  {updateFormErrors.evidenceFiles ? <p className="mt-1 text-xs text-[#B91C1C]">{updateFormErrors.evidenceFiles}</p> : null}
                  {selectedUpdateEvidenceFiles.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-[#374151]">
                      {selectedUpdateEvidenceFiles.map((fileItem, fileIndex) => (
                        <li key={`${fileItem.name}-${fileIndex}`} className="flex items-center justify-between rounded border border-[#E5E7EB] px-2 py-1">
                          <span className="truncate">{fileItem.name}</span>
                          <button type="button" onClick={() => handleRemoveUpdateEvidenceFile(fileIndex)} className="text-[#B91C1C]">Xóa</button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {updateProjectErrorMessage ? <p className="text-xs text-[#B91C1C]">{updateProjectErrorMessage}</p> : null}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={handleCloseProjectDetailModal} className="rounded border border-[#E5E7EB] px-3 py-2 text-xs">Hủy</button>
                  <button type="submit" disabled={isUpdatingProject} className="rounded bg-[#0E7C6B] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{isUpdatingProject ? 'Đang cập nhật...' : 'Lưu cập nhật'}</button>
                </div>
              </form>
            ) : (
              <>
                <div className="mt-4 grid gap-2 text-sm text-[#374151] sm:grid-cols-2">
                  <p><span className="font-semibold">Mã dự án:</span> {selectedProjectDetail.projectId}</p>
                  <p><span className="font-semibold">Mã tổ chức:</span> {selectedProjectDetail.organizationId}</p>
                  <p><span className="font-semibold">Trạng thái:</span> {formatProjectStatusVietnamese(selectedProjectDetail.status)}</p>
                  <p><span className="font-semibold">Mục tiêu gây quỹ:</span> {formatCurrencyFromNumber(selectedProjectDetail.goalAmount)} ₫</p>
                  <p><span className="font-semibold">Hạn chót:</span> {formatDateTimeVietnamese(selectedProjectDetail.deadline)}</p>
                  <p><span className="font-semibold">Thời điểm gửi duyệt:</span> {formatDateTimeVietnamese(selectedProjectDetail.submittedAt)}</p>
                  <p><span className="font-semibold">Thời điểm duyệt:</span> {formatDateTimeVietnamese(selectedProjectDetail.reviewedAt)}</p>
                  <p><span className="font-semibold">Người duyệt:</span> {selectedProjectDetail.reviewedBy || 'Chưa có'}</p>
                </div>
                <div className="mt-3 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm text-[#374151]"><p className="font-semibold text-[#111827]">Mô tả dự án</p><p className="mt-1 whitespace-pre-wrap">{selectedProjectDetail.description}</p></div>
                <div className="mt-3 rounded border border-[#E5E7EB] p-3">
                  <p className="text-sm font-semibold text-[#111827]">CID minh chứng (IPFS)</p>
                  {selectedProjectDetail.evidenceCids.length === 0 ? <p className="mt-1 text-xs text-[#6B7280]">Chưa có CID minh chứng.</p> : (
                    <ul className="mt-2 space-y-2 text-xs text-[#0F766E]">{selectedProjectDetail.evidenceCids.map(cidItem => (
                      <li key={cidItem} className="rounded border border-[#CCFBF1] bg-[#F0FDFA] p-2"><p className="break-all font-mono">{cidItem}</p><a href={`https://gateway.pinata.cloud/ipfs/${cidItem}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[11px] font-semibold text-[#0E7490] underline">Mở CID trên IPFS</a></li>
                    ))}</ul>
                  )}
                </div>
                {selectedProjectDetail.rejectionReason ? <div className="mt-3 rounded border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]"><span className="font-semibold">Lý do từ chối:</span> {selectedProjectDetail.rejectionReason}</div> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

/** Hàm render section Disbursement. Mục đích: hiển thị tab giải ngân và trạng thái đa chữ ký. */
export function DisbursementSection({ activeDisbursementTab, onChangeDisbursementTab }: DisbursementSectionProps) {
  const tabItems = [
    { key: 'eligible', label: 'Đủ điều kiện' },
    { key: 'pending', label: 'Chờ duyệt' },
    { key: 'history', label: 'Lịch sử' }
  ] as const;

  // Ghi chú: ánh xạ trạng thái theo tab để giữ nội dung rõ ràng, tránh viết điều kiện lồng nhau trong JSX.
  const statusLabelMap = {
    eligible: '🟢 Sẵn sàng tạo yêu cầu',
    pending: '⏳ Đang chờ 2/3 chữ ký',
    history: '✅ Đã hoàn tất giải ngân'
  } as const;

  return (
    <SectionCard title="Yêu cầu giải ngân">
      <div className="mb-4 flex gap-2">
        {tabItems.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChangeDisbursementTab(tab.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeDisbursementTab === tab.key ? 'bg-[#0E7C6B] text-white' : 'bg-[#F3F4F6] text-[#4B5563]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-[12px] border border-[#E5E7EB] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="font-semibold">Học bổng vùng cao Tây Bắc</p>
            <p className="text-xs text-[#6B7280]">#DIS-2025-0047 · Đợt giải ngân tháng 05</p>
          </div>
          <p className="text-lg font-bold text-[#0E7C6B]">15,000,000 ₫</p>
        </div>

        <div className="space-y-2 text-xs">
          <div className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2.5">
            <p className="font-medium">✅ Admin hệ thống đã ký</p>
            <p className="mt-0.5 text-[#6B7280]">Nguyễn Văn A · 09:45 20/05/2025</p>
          </div>
          <div className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2.5">
            <p className="font-medium">✅ Đại diện tổ chức đã ký</p>
            <p className="mt-0.5 text-[#6B7280]">Trần Minh H · 10:12 20/05/2025</p>
          </div>
          <div className="rounded border border-[#FCD34D] bg-[#FFFBEB] p-2.5">
            <p className="font-medium text-[#92400E]">⏳ Cơ quan giám sát chưa ký</p>
            <p className="mt-0.5 text-[#B45309]">Bộ Tài chính · Chờ xác nhận</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#0E7C6B]">{statusLabelMap[activeDisbursementTab]}</p>
          <button type="button" className="rounded-[8px] bg-[#0E7C6B] px-3 py-1.5 text-xs font-semibold text-white">Tạo yêu cầu giải ngân</button>
        </div>
      </div>
    </SectionCard>
  );
}

/** Hàm render section Transparency. Mục đích: hiển thị bộ lọc, bảng giao dịch và phân trang. */
export function TransparencySection() {
  return (
    <SectionCard title="Lịch sử giao dịch on-chain" bodyClassName="p-0">
      <div className="flex flex-wrap gap-2 border-b border-[#F3F4F6] p-4">
        <input className="min-w-[200px] flex-1 rounded border border-[#E5E7EB] bg-[#F3F4F6] px-3 py-2 text-xs" placeholder="Tìm theo hash hoặc ví..." />
        <select className="rounded border border-[#E5E7EB] px-2 py-2 text-xs">
          <option>Tất cả loại</option>
        </select>
        <button type="button" className="rounded border border-[#E5E7EB] px-3 py-2 text-xs">⤓ Export CSV</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-xs uppercase text-[#6B7280]">
            <tr>
              <th className="p-3">Thời gian</th>
              <th>Loại</th>
              <th>Số tiền</th>
              <th>Nguồn</th>
              <th>Hash</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {transparencyTransactionRows.map(row => (
              <tr key={row.hash} className="border-t border-[#F3F4F6]">
                <td className="p-3">{row.time}</td>
                <td><StatusBadge label={row.type} className={row.typeStyle} /></td>
                <td>{row.amount}</td>
                <td>{row.sender}</td>
                <td className="text-[#2563EB]">{row.hash}</td>
                <td><StatusBadge label={row.status} className={row.statusStyle} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2 p-4 text-xs">
        <button type="button" className="rounded border border-[#E5E7EB] px-2 py-1">‹</button>
        <button type="button" className="rounded border border-[#0E7C6B] bg-[#0E7C6B] px-2 py-1 text-white">1</button>
        <button type="button" className="rounded border border-[#E5E7EB] px-2 py-1">2</button>
        <button type="button" className="rounded border border-[#E5E7EB] px-2 py-1">›</button>
      </div>
    </SectionCard>
  );
}


const vietnameseBankNameOptions = [
  'Vietcombank',
  'BIDV',
  'VietinBank',
  'Agribank',
  'ACB',
  'Techcombank',
  'MB Bank',
  'VPBank',
  'Sacombank',
  'TPBank'
];

/** Hàm chuẩn hóa tên chủ tài khoản về chữ in hoa. Mục đích: đồng bộ định dạng dữ liệu trước khi hiển thị và submit. */
function normalizeAccountHolderName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Hàm validate form tài khoản thụ hưởng. Mục đích: chặn submit sai dữ liệu ngay tại frontend. */
function validateBeneficiaryBankAccountForm(formData: BeneficiaryBankAccountFormData): BeneficiaryBankAccountFormErrors {
  const formErrors: BeneficiaryBankAccountFormErrors = {};

  if (!formData.bankName.trim()) {
    formErrors.bankName = 'Vui lòng chọn ngân hàng.';
  }
  if (!formData.accountHolderName.trim()) {
    formErrors.accountHolderName = 'Vui lòng nhập tên chủ tài khoản.';
  }
  if (!/^[0-9]{8,20}$/.test(formData.bankAccountNumber.trim())) {
    formErrors.bankAccountNumber = 'Số tài khoản chỉ gồm chữ số và dài từ 8 đến 20 ký tự.';
  }

  return formErrors;
}

type BankSettingsPanelProps = {
  isBankSetupHighlighted: boolean;
  latestOrganizationKycSubmission: SettingsSectionProps['organizationKycSubmissionList'][number] | null;
  bankFormData: BeneficiaryBankAccountFormData;
  bankFormErrors: BeneficiaryBankAccountFormErrors;
  bankSubmitErrorMessage: string | null;
  isSubmittingBankForm: boolean;
  bankSubmitSuccessMessage: string | null;
  onBankFormDataChange: (value: BeneficiaryBankAccountFormData) => void;
  onBankFormErrorsChange: (value: BeneficiaryBankAccountFormErrors) => void;
  onBankSubmitErrorMessageChange: (value: string | null) => void;
  onBankSubmitSuccessMessageChange: (value: string | null) => void;
  onSubmittingBankFormChange: (value: boolean) => void;
  onBankSubmissionSuccess: () => Promise<void> | void;
};

/** Hàm render panel Ngân hàng. Mục đích: hiển thị trạng thái thật và cho phép gửi hồ sơ ngân hàng thụ hưởng. */
function BankSettingsPanel({
  isBankSetupHighlighted,
  latestOrganizationKycSubmission,
  bankFormData,
  bankFormErrors,
  bankSubmitErrorMessage,
  isSubmittingBankForm,
  bankSubmitSuccessMessage,
  onBankFormDataChange,
  onBankFormErrorsChange,
  onBankSubmitErrorMessageChange,
  onBankSubmitSuccessMessageChange,
  onSubmittingBankFormChange,
  onBankSubmissionSuccess
}: BankSettingsPanelProps) {
  const bankStatus = latestOrganizationKycSubmission?.status || null;
  const hasApprovedBeneficiaryBankAccount = bankStatus === 'APPROVED';
  const statusLabel = bankStatus === 'APPROVED' ? '✓ Đã xác minh' : bankStatus === 'REJECTED' ? '❌ Bị từ chối' : bankStatus === 'SUBMISSION_ERROR' ? '⚠️ Lỗi nộp hồ sơ' : bankStatus === 'PENDING_REVIEW' ? '⏳ Chờ xác minh' : '⚠️ Chưa liên kết';
  const statusStyle = bankStatus === 'APPROVED' ? 'bg-[#DCFCE7] text-[#166534]' : bankStatus === 'REJECTED' ? 'bg-[#FEE2E2] text-[#991B1B]' : bankStatus === 'SUBMISSION_ERROR' ? 'bg-[#FEE2E2] text-[#991B1B]' : bankStatus === 'PENDING_REVIEW' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#FEE2E2] text-[#991B1B]';

  /** Hàm cập nhật field form ngân hàng. Mục đích: đổi state input và xóa lỗi field tương ứng khi người dùng sửa. */
  const handleBankFieldChange = (fieldName: keyof BeneficiaryBankAccountFormData, value: string) => {
    onBankFormDataChange({ ...bankFormData, [fieldName]: value });
    if (bankFormErrors[fieldName]) {
      onBankFormErrorsChange({ ...bankFormErrors, [fieldName]: undefined });
    }
  };

  /** Hàm submit form ngân hàng. Mục đích: gọi API thật để tạo hồ sơ PENDING_REVIEW và reload dữ liệu trạng thái. */
  const handleSubmitBeneficiaryBankAccount = async () => {
    onBankSubmitErrorMessageChange(null);
    onBankSubmitSuccessMessageChange(null);
    const nextFormErrors = validateBeneficiaryBankAccountForm(bankFormData);
    onBankFormErrorsChange(nextFormErrors);
    if (Object.keys(nextFormErrors).length > 0) {
      return;
    }

    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      onBankSubmitErrorMessageChange('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    onSubmittingBankFormChange(true);
    try {
      await fetchApi(buildApiUrl('/auth/organization/kyc-submissions/me/beneficiary-bank-account'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${authSession.accessToken}` },
        body: JSON.stringify({
          bankName: bankFormData.bankName.trim(),
          bankAccountNumber: bankFormData.bankAccountNumber.trim(),
          accountHolderName: bankFormData.accountHolderName.trim(),
          branchName: bankFormData.branchName.trim()
        })
      });
      await Promise.resolve(onBankSubmissionSuccess());
      onBankSubmitSuccessMessageChange('Đã gửi duyệt tài khoản thành công. Hồ sơ đang chờ xác minh.');
    } catch (error) {
      const fallbackErrorMessage = 'Không thể gửi duyệt tài khoản ngân hàng. Vui lòng thử lại sau.';
      if (error && typeof error === 'object' && 'message' in error) {
        onBankSubmitErrorMessageChange((error as { message?: string }).message || fallbackErrorMessage);
      } else {
        onBankSubmitErrorMessageChange(fallbackErrorMessage);
      }
    } finally {
      onSubmittingBankFormChange(false);
    }
  };

  return (
    <SectionCard
      title="Tài khoản ngân hàng nhận giải ngân"
      className={isBankSetupHighlighted ? 'ring-2 ring-[#0E7C6B]/35 ring-offset-2 ring-offset-[#F8FAFB]' : ''}
    >
      <div className="rounded-[10px] border border-[#E6F7F4] bg-gradient-to-r from-[#F2FBFA] to-[#F0F9FF] p-3">
        <p className="font-semibold">🏦 Trạng thái tài khoản thụ hưởng</p>
        <p className="mt-1 text-xs text-[#6B7280]">
          {latestOrganizationKycSubmission
            ? `Lần nộp gần nhất: ${new Date(latestOrganizationKycSubmission.submittedAt).toLocaleString('vi-VN')}`
            : 'Tổ chức chưa nộp hồ sơ ngân hàng/KYC.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge label={statusLabel} className={statusStyle} />
          <StatusBadge label="🔒 Cố định giải ngân" className="bg-[#F3F4F6] text-[#4B5563]" />
        </div>
        {bankStatus === 'REJECTED' && latestOrganizationKycSubmission?.rejectionReason ? (
          <p className="mt-2 text-xs text-[#991B1B]">Lý do từ chối: {latestOrganizationKycSubmission.rejectionReason}</p>
        ) : null}
      </div>

      {!hasApprovedBeneficiaryBankAccount ? (
        <div className="mt-3 grid gap-3 text-sm">
          <select
            className="rounded border border-[#D1D5DB] px-3 py-2"
            value={bankFormData.bankName}
            onChange={event => handleBankFieldChange('bankName', event.target.value)}
          >
            <option value="">-- Chọn ngân hàng --</option>
            {vietnameseBankNameOptions.map(bankNameOption => (
              <option key={bankNameOption} value={bankNameOption}>{bankNameOption}</option>
            ))}
          </select>
          {bankFormErrors.bankName ? <p className="text-xs text-[#DC2626]">{bankFormErrors.bankName}</p> : null}

          <input
            className="rounded border border-[#D1D5DB] px-3 py-2"
            placeholder="Số tài khoản"
            value={bankFormData.bankAccountNumber}
            onChange={event => handleBankFieldChange('bankAccountNumber', event.target.value.replace(/[^0-9]/g, ''))}
          />
          {bankFormErrors.bankAccountNumber ? <p className="text-xs text-[#DC2626]">{bankFormErrors.bankAccountNumber}</p> : null}

          <input
            className="rounded border border-[#D1D5DB] px-3 py-2"
            placeholder="Tên chủ tài khoản"
            value={bankFormData.accountHolderName}
            onChange={event => handleBankFieldChange('accountHolderName', normalizeAccountHolderName(event.target.value))}
          />
          {bankFormErrors.accountHolderName ? <p className="text-xs text-[#DC2626]">{bankFormErrors.accountHolderName}</p> : null}

          <input
            className="rounded border border-[#D1D5DB] px-3 py-2"
            placeholder="Chi nhánh (không bắt buộc)"
            value={bankFormData.branchName}
            onChange={event => handleBankFieldChange('branchName', event.target.value)}
          />

          {bankSubmitErrorMessage ? <p className="text-xs text-[#DC2626]">{bankSubmitErrorMessage}</p> : null}
          {bankSubmitSuccessMessage ? <p className="text-xs text-[#166534]">{bankSubmitSuccessMessage}</p> : null}

          <button
            type="button"
            onClick={handleSubmitBeneficiaryBankAccount}
            disabled={isSubmittingBankForm}
            className="rounded bg-[#0E7C6B] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmittingBankForm ? 'Đang gửi duyệt...' : 'Gửi duyệt tài khoản'}
          </button>
        </div>
      ) : null}
    </SectionCard>
  );
}

/** Hàm render section Settings. Mục đích: hiển thị điều hướng cài đặt và cho phép nộp thông tin ngân hàng thụ hưởng thật. */
type SettingsSectionProps = {
  isBankSetupHighlighted: boolean;
  onBankSubmissionSuccess: () => Promise<void> | void;
  organizationKycSubmissionList: Array<{
    submissionId: string;
    organizationId: string;
    organizationName: string;
    legalRegistrationNumber: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUBMISSION_ERROR';
    submittedAt: string;
    reviewedAt: string | null;
    rejectionReason?: string | null;
    beneficiaryBankAccount?: {
      bankName: string;
      bankAccountNumber: string;
      accountHolderName: string;
      branchName: string | null;
    } | null;
  }>;
};

type BeneficiaryBankAccountFormData = {
  bankName: string;
  bankAccountNumber: string;
  accountHolderName: string;
  branchName: string;
};

type BeneficiaryBankAccountFormErrors = Partial<Record<keyof BeneficiaryBankAccountFormData, string>>;

export function SettingsSection({ isBankSetupHighlighted, organizationKycSubmissionList, onBankSubmissionSuccess }: SettingsSectionProps) {
  const [activeSettingsTab, setActiveSettingsTab] = useState<'organization' | 'bank' | 'security'>('organization');
  const [bankFormData, setBankFormData] = useState<BeneficiaryBankAccountFormData>({
    bankName: '',
    bankAccountNumber: '',
    accountHolderName: '',
    branchName: ''
  });
  const [bankFormErrors, setBankFormErrors] = useState<BeneficiaryBankAccountFormErrors>({});
  const [bankSubmitErrorMessage, setBankSubmitErrorMessage] = useState<string | null>(null);
  const [bankSubmitSuccessMessage, setBankSubmitSuccessMessage] = useState<string | null>(null);
  const [isSubmittingBankForm, setIsSubmittingBankForm] = useState(false);

  /** Hàm chọn tab cài đặt. Mục đích: cập nhật nội dung panel theo mục người dùng chọn. */
  const handleSelectSettingsTab = (tab: 'organization' | 'bank' | 'security') => {
    setActiveSettingsTab(tab);
  };

  /** Hàm lấy hồ sơ KYC mới nhất. Mục đích: dùng bản ghi mới nhất để hiển thị trạng thái tài khoản thụ hưởng chính xác. */
  const latestOrganizationKycSubmission = useMemo(() => {
    if (!organizationKycSubmissionList.length) {
      return null;
    }

    // Logic này sắp xếp theo thời gian nộp giảm dần để luôn chọn đúng bản ghi mới nhất.
    const submissionListByLatest = [...organizationKycSubmissionList].sort((leftSubmission, rightSubmission) => {
      return new Date(rightSubmission.submittedAt).getTime() - new Date(leftSubmission.submittedAt).getTime();
    });

    return submissionListByLatest[0];
  }, [organizationKycSubmissionList]);

  const isOrganizationTabActive = activeSettingsTab === 'organization';
  const isBankTabActive = activeSettingsTab === 'bank';
  const isSecurityTabActive = activeSettingsTab === 'security';

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[220px_1fr]">
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-2 text-sm">
        <button type="button" onClick={() => handleSelectSettingsTab('organization')} className={`w-full rounded px-3 py-2 text-left ${isOrganizationTabActive ? 'bg-[#F2FBFA] text-[#0E7C6B]' : ''}`}>🏢 Tổ chức</button>
        <button type="button" onClick={() => handleSelectSettingsTab('bank')} className={`mt-1 w-full rounded px-3 py-2 text-left ${isBankTabActive ? 'bg-[#F2FBFA] text-[#0E7C6B]' : ''}`}>🏦 Ngân hàng</button>
        <button type="button" onClick={() => handleSelectSettingsTab('security')} className={`mt-1 w-full rounded px-3 py-2 text-left ${isSecurityTabActive ? 'bg-[#F2FBFA] text-[#0E7C6B]' : ''}`}>🔐 Bảo mật</button>
      </div>

      <div className="space-y-4">
        {isOrganizationTabActive ? <SectionCard title="Thiết lập tổ chức"><div className="grid gap-3 text-sm"><input className="rounded border border-[#D1D5DB] px-3 py-2" value="Quỹ Hy Vọng Xanh" readOnly /><textarea className="min-h-[86px] rounded border border-[#D1D5DB] px-3 py-2" value="Tổ chức phi lợi nhuận hỗ trợ giáo dục và y tế cho cộng đồng khó khăn." readOnly /></div></SectionCard> : null}

        {isBankTabActive ? (
          <BankSettingsPanel
            isBankSetupHighlighted={isBankSetupHighlighted}
            latestOrganizationKycSubmission={latestOrganizationKycSubmission}
            bankFormData={bankFormData}
            bankFormErrors={bankFormErrors}
            bankSubmitErrorMessage={bankSubmitErrorMessage}
            isSubmittingBankForm={isSubmittingBankForm}
            bankSubmitSuccessMessage={bankSubmitSuccessMessage}
            onBankFormDataChange={setBankFormData}
            onBankFormErrorsChange={setBankFormErrors}
            onBankSubmitErrorMessageChange={setBankSubmitErrorMessage}
            onBankSubmitSuccessMessageChange={setBankSubmitSuccessMessage}
            onSubmittingBankFormChange={setIsSubmittingBankForm}
            onBankSubmissionSuccess={onBankSubmissionSuccess}
          />
        ) : null}

        {isSecurityTabActive ? <SectionCard title="Thiết lập bảo mật"><div className="space-y-3 text-sm"><div className="rounded border border-[#E5E7EB] p-3"><p className="font-medium">Thiết bị đã đăng nhập</p><p className="mt-1 text-xs text-[#6B7280]">Web · Chrome on Windows</p><p className="mt-1 text-xs text-[#9CA3AF]">Lần cuối: 09:12 20/05/2025</p></div><div className="rounded border border-[#E5E7EB] p-3"><p className="font-medium">Phiên hoạt động</p><p className="mt-1 text-xs text-[#6B7280]">Đăng nhập lúc 08:55 20/05/2025</p><p className="mt-1 text-xs text-[#9CA3AF]">IP: 171.232.24.18</p></div></div></SectionCard> : null}
      </div>
    </div>
  );
}

/** Hàm render dropdown thông báo. Mục đích: mô phỏng popup thông báo như HTML gốc. */
export function NotificationDropdown({ hasUnreadNotification, onMarkAllAsRead, onRequestClose }: NotificationDropdownProps) {
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    /** Hàm xử lý click ra ngoài dropdown. Mục đích: đóng dropdown khi người dùng bấm ngoài vùng popup. */
    const handleClickOutsideDropdown = (event: MouseEvent) => {
      if (!dropdownContainerRef.current) {
        return;
      }

      // Logic này kiểm tra target click có nằm ngoài vùng dropdown hay không để tránh đóng khi click bên trong.
      if (!dropdownContainerRef.current.contains(event.target as Node)) {
        onRequestClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutsideDropdown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutsideDropdown);
    };
  }, [onRequestClose]);

  return (
    <div
      ref={dropdownContainerRef}
      className="fixed right-6 top-16 z-30 w-[340px] overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[#F3F4F6] p-4">
        <div className="flex items-center gap-2">
          <p className="font-semibold">Thông báo</p>
          {hasUnreadNotification ? <span className="inline-flex h-2 w-2 rounded-full bg-[#EF4444]" /> : null}
        </div>
        <button type="button" onClick={onMarkAllAsRead} className="text-xs text-[#0E7C6B]">Đánh dấu đã đọc</button>
      </div>

      <div className="space-y-0">
        <div className="flex gap-3 border-b border-[#F3F4F6] bg-[#F2FBFA] p-3">
          <span className="text-lg">💚</span>
          <div>
            <p className="text-sm"><strong>Nhận 1,200,000 ₫ quyên góp</strong> từ 0x9f...2a</p>
            <p className="text-xs text-[#9CA3AF]">5 phút trước</p>
          </div>
        </div>

        <div className="flex gap-3 border-b border-[#F3F4F6] bg-[#F2FBFA] p-3">
          <span className="text-lg">🔵</span>
          <div>
            <p className="text-sm">Dự án Học bổng vùng cao vừa được phê duyệt</p>
            <p className="text-xs text-[#9CA3AF]">2 giờ trước</p>
          </div>
        </div>

        <div className="flex gap-3 p-3">
          <span className="text-lg">📝</span>
          <div>
            <p className="text-sm">Hồ sơ KYC của tổ chức sẽ hết hạn sau <strong>30 ngày</strong></p>
            <p className="text-xs text-[#9CA3AF]">3 ngày trước</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hàm render modal tạo dự án. Mục đích: quản lý form, upload file minh chứng và tạo dự án qua API thật. */
export function CreateProjectModal({ onClose, onProjectCreated }: CreateProjectModalProps) {
  const [formData, setFormData] = useState<CreateProjectFormData>(createProjectDefaultFormState);
  const [selectedEvidenceFiles, setSelectedEvidenceFiles] = useState<File[]>([]);
  const [formErrors, setFormErrors] = useState<CreateProjectFormErrors>({});
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Hàm cập nhật input theo field. Mục đích: gom logic controlled input và xóa lỗi field ngay khi người dùng chỉnh sửa. */
  const handleChangeFormField = (field: keyof CreateProjectFormData, value: string) => {
    const nextFormData: CreateProjectFormData = { ...formData, [field]: value };
    setFormData(nextFormData);
    const nextFormErrors = validateCreateProjectFormData(nextFormData, selectedEvidenceFiles);
    setFormErrors(currentErrors => ({ ...currentErrors, [field]: nextFormErrors[field] }));
  };

  /** Hàm xử lý chọn file minh chứng. Mục đích: thêm file mới vào danh sách và validate giới hạn số lượng. */
  const handleSelectEvidenceFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    const nextSelectedEvidenceFiles = [...selectedEvidenceFiles, ...selectedFiles].slice(0, 10);
    setSelectedEvidenceFiles(nextSelectedEvidenceFiles);
    setFormErrors(currentErrors => ({ ...currentErrors, evidenceFiles: validateCreateProjectFormData(formData, nextSelectedEvidenceFiles).evidenceFiles }));
    event.target.value = '';
  };

  /** Hàm xóa file minh chứng đã chọn. Mục đích: cho phép người dùng chỉnh lại danh sách file trước khi submit. */
  const handleRemoveEvidenceFile = (fileIndex: number) => {
    const nextSelectedEvidenceFiles = selectedEvidenceFiles.filter((_, currentFileIndex) => currentFileIndex !== fileIndex);
    setSelectedEvidenceFiles(nextSelectedEvidenceFiles);
    setFormErrors(currentErrors => ({ ...currentErrors, evidenceFiles: validateCreateProjectFormData(formData, nextSelectedEvidenceFiles).evidenceFiles }));
  };

  /** Hàm upload file minh chứng. Mục đích: gửi file base64 lên backend để nhận CID IPFS từ Pinata. */
  const uploadEvidenceFiles = async (accessToken: string): Promise<UploadEvidenceResponse> => {
    const uploadPayloadFiles: UploadEvidenceFilePayload[] = await Promise.all(
      selectedEvidenceFiles.map(async fileItem => ({
        fileName: fileItem.name,
        mimeType: fileItem.type,
        contentBase64: await convertFileToBase64(fileItem)
      }))
    );

    const uploadResponse = await fetchApi<UploadEvidenceResponse>(buildApiUrl('/projects/evidences/upload'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ files: uploadPayloadFiles })
    });

    return uploadResponse.data;
  };

  /** Hàm submit tạo dự án. Mục đích: upload file lấy CID rồi gọi API tạo dự án. */
  const handleSubmitCreateProject = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const nextFormErrors = validateCreateProjectFormData(formData, selectedEvidenceFiles);

    if (Object.keys(nextFormErrors).length > 0) {
      setFormErrors(nextFormErrors);
      return;
    }

    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      setSubmitErrorMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitErrorMessage(null);
    setIsSubmitting(true);

    try {
      const uploadResult = await uploadEvidenceFiles(authSession.accessToken);
      const response = await fetchApi<ProjectSummary>(buildApiUrl('/projects'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${authSession.accessToken}` },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          goalAmount: Number(formData.goalAmount),
          deadline: new Date(formData.deadline).toISOString(),
          evidenceCids: uploadResult.evidenceCids
        })
      });

      onProjectCreated(response.data);
      setFormData(createProjectDefaultFormState);
      setSelectedEvidenceFiles([]);
      setFormErrors({});
      onClose();
    } catch (error: unknown) {
      const fallbackErrorMessage = 'Không thể tạo dự án. Vui lòng thử lại sau.';
      if (error && typeof error === 'object') {
        const typedError = error as {
          message?: string;
          details?: ApiErrorDetail[];
          errorCode?: string;
        };

        // Logic ưu tiên map theo errorCode để hiển thị đúng thông điệp nghiệp vụ từ backend.
        if (typedError.errorCode === 'BENEFICIARY_BANK_ACCOUNT_NOT_APPROVED') {
          setSubmitErrorMessage(
            typedError.message ||
            'Bạn cần liên kết và được duyệt tài khoản ngân hàng thụ hưởng trước khi tạo dự án. Vui lòng vào Cài đặt để thiết lập ngân hàng.'
          );
          return;
        }

        if (Array.isArray(typedError.details)) {
          setFormErrors(mapApiDetailsToFormErrors(typedError.details));
        }

        setSubmitErrorMessage(typedError.message || fallbackErrorMessage);
      } else {
        setSubmitErrorMessage(fallbackErrorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[640px] overflow-hidden rounded-[18px] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#F3F4F6] p-5">
          <div>
            <p className="mb-1 text-2xl">🚀</p>
            <p className="text-lg font-bold">Tạo dự án mới</p>
            <p className="text-xs text-[#6B7280]">Điền thông tin theo 2 bước để khởi tạo dự án minh bạch.</p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full bg-[#F3F4F6]">✕</button>
        </div>

        <form className="space-y-4 p-5 text-sm" onSubmit={handleSubmitCreateProject}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <input className="w-full rounded border border-[#D1D5DB] px-3 py-2" placeholder="Tên dự án *" value={formData.name} onChange={event => handleChangeFormField('name', event.target.value)} />
              {formErrors.name ? <p className="mt-1 text-xs text-[#DC2626]">{formErrors.name}</p> : null}
            </div>
            <div className="md:col-span-2">
              <textarea className="min-h-[86px] w-full rounded border border-[#D1D5DB] px-3 py-2" placeholder="Mô tả ngắn" value={formData.description} onChange={event => handleChangeFormField('description', event.target.value)} />
              {formErrors.description ? <p className="mt-1 text-xs text-[#DC2626]">{formErrors.description}</p> : null}
            </div>
            <div>
              <input className="w-full rounded border border-[#D1D5DB] px-3 py-2" placeholder="Mục tiêu gây quỹ (VNĐ)" value={formData.goalAmount} onChange={event => handleChangeFormField('goalAmount', event.target.value)} />
              {formErrors.goalAmount ? <p className="mt-1 text-xs text-[#DC2626]">{formErrors.goalAmount}</p> : null}
            </div>
            <div>
              <input type="datetime-local" className="w-full rounded border border-[#D1D5DB] px-3 py-2" value={formData.deadline} onChange={event => handleChangeFormField('deadline', event.target.value)} />
              {formErrors.deadline ? <p className="mt-1 text-xs text-[#DC2626]">{formErrors.deadline}</p> : null}
            </div>
            <div className="md:col-span-2">
              <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={handleSelectEvidenceFiles} className="w-full rounded border border-[#D1D5DB] px-3 py-2" />
              <p className="mt-1 text-xs text-[#6B7280]">Tối đa 10 file: PDF, PNG, JPG, JPEG, DOCX.</p>
              {formErrors.evidenceFiles ? <p className="mt-1 text-xs text-[#DC2626]">{formErrors.evidenceFiles}</p> : null}
              {selectedEvidenceFiles.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {selectedEvidenceFiles.map((fileItem, fileIndex) => (
                    <div key={`${fileItem.name}-${fileIndex}`} className="flex items-center justify-between rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1 text-xs">
                      <span className="truncate">{fileItem.name}</span>
                      <button type="button" onClick={() => handleRemoveEvidenceFile(fileIndex)} className="text-[#DC2626]">Xóa</button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {submitErrorMessage ? <p className="rounded border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">{submitErrorMessage}</p> : null}

          <div className="flex gap-2 border-t border-[#F3F4F6] pt-4">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 rounded bg-[#F3F4F6] py-2 text-sm">Hủy</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 rounded bg-[#0E7C6B] py-2 text-sm font-semibold text-white disabled:opacity-60">{isSubmitting ? 'Đang tạo...' : 'Tạo dự án'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


