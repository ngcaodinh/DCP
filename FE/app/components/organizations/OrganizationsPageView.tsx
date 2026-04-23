'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { financeNavigationItems, primaryNavigationItems, systemNavigationItems } from './mockData';
import {
  CreateProjectModal,
  DashboardSection,
  DisbursementSection,
  NotificationDropdown,
  ProjectsSection,
  SettingsSection,
  TransparencySection
} from './OrganizationsSections';
import { ApiErrorResponse, fetchApi, buildApiUrl } from '@/app/utils/apiClient';
import { clearAuthSession, readAuthSession } from '@/app/utils/authSession';
import Topbar from '../regulatoryBodies/tailwind/Topbar';
import { NavigationItem, OrganizationPageKey, ProjectSummary } from './types';

type CreateProjectEligibilityResponse = {
  isEligibleToCreateProject: boolean;
  blockReason: string | null;
};

type OrganizationKycSubmissionSummary = {
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
};

type SidebarItemProps = {
  item: NavigationItem;
  activePage: OrganizationPageKey;
  onSelectPage: (page: OrganizationPageKey) => void;
  onTriggerAction: (action: 'createProject' | 'toggleNotification') => void;
};

/** Hàm kiểm tra có tài khoản thụ hưởng đã duyệt hay chưa. Mục đích: chặn UI tạo dự án khi chưa đủ điều kiện ngân hàng theo dữ liệu thật từ KYC. Chỉ check submission có dữ liệu bank account thực sự, tránh nhầm với KYC profile submission. */
function hasApprovedBeneficiaryBankAccount(submissionList: OrganizationKycSubmissionSummary[]): boolean {
  return submissionList.some(submissionItem =>
    submissionItem.beneficiaryBankAccount !== null && submissionItem.status === 'APPROVED'
  );
}

/** Hàm chuẩn hóa message lỗi API. Mục đích: hiển thị thông báo ổn định khi response lỗi hoặc thiếu cấu trúc mong muốn. */
function resolveApiErrorMessage(error: unknown, fallbackErrorMessage: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackErrorMessage;
  }

  const typedError = error as ApiErrorResponse;
  return typedError.message || fallbackErrorMessage;
}

/** Hàm render item sidebar. Mục đích: tái sử dụng giao diện điều hướng bên trái. */
function SidebarItem({ item, activePage, onSelectPage, onTriggerAction }: SidebarItemProps) {
  const isActive = item.page === activePage;

  /** Hàm xử lý click item sidebar. Mục đích: phân tách luồng điều hướng và action đặc biệt. */
  const handleClick = () => {
    if (item.page) {
      onSelectPage(item.page);
      return;
    }

    if (item.action) {
      onTriggerAction(item.action);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${isActive ? 'border border-white/25 bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
    >
      <span>{item.icon} {item.label}</span>
      {item.badge ? <span className="rounded-full bg-[#E11D48] px-1.5 text-[10px] text-white">{item.badge}</span> : null}
    </button>
  );
}

/** Hàm render trang Organizations chi tiết. Mục đích: bám sát layout HTML gốc theo các section chính. */
export default function OrganizationsPageView() {
  const router = useRouter();
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
  const [activePage, setActivePage] = useState<OrganizationPageKey>('dashboard');
  const [activeDisbursementTab, setActiveDisbursementTab] = useState<'eligible' | 'pending' | 'history'>('eligible');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isBankSetupHighlighted, setIsBankSetupHighlighted] = useState(false);
  const [hasUnreadNotification, setHasUnreadNotification] = useState(true);
  const [createdProjects, setCreatedProjects] = useState<ProjectSummary[]>([]);
  const [disbursements, setDisbursements] = useState<import('./types').DisbursementResult[]>([]);
  const [isDisbursementsLoading, setIsDisbursementsLoading] = useState(false);
  const [disbursementsErrorMessage, setDisbursementsErrorMessage] = useState<string | null>(null);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [projectsErrorMessage, setProjectsErrorMessage] = useState<string | null>(null);
  const [isCreateProjectAllowed, setIsCreateProjectAllowed] = useState(true);
  const [createProjectBlockReason, setCreateProjectBlockReason] = useState<string | null>(null);
  const [organizationKycSubmissionList, setOrganizationKycSubmissionList] = useState<OrganizationKycSubmissionSummary[]>([]);
  const [isOrganizationKycLoading, setIsOrganizationKycLoading] = useState(false);
  const [organizationKycErrorMessage, setOrganizationKycErrorMessage] = useState<string | null>(null);
  const [isAccessChecking, setIsAccessChecking] = useState(true);
  const [isLogoutProcessing, setIsLogoutProcessing] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState('Người dùng');
  const [userEmail, setUserEmail] = useState('');
  const [userWalletAddress, setUserWalletAddress] = useState('');
  const latestEligibilityRequestRef = useRef(0);

  /** Hàm tính tiêu đề topbar. Mục đích: đồng bộ tiêu đề theo menu đang active. */
  const pageTitle = useMemo(() => {
    const pageTitleMap: Record<OrganizationPageKey, string> = {
      dashboard: 'Tổng quan',
      projects: 'Dự án của tôi',
      disbursement: 'Giải ngân',
      transparency: 'Minh bạch',
      settings: 'Cài đặt'
    };

    return pageTitleMap[activePage];
  }, [activePage]);

  /** Hàm tải điều kiện tạo dự án từ backend. Mục đích: đồng bộ rule ngân hàng thụ hưởng để khóa/mở tính năng tạo dự án trên UI. */
  const loadCreateProjectEligibility = async (): Promise<boolean> => {
    const requestOrderNumber = latestEligibilityRequestRef.current + 1;
    latestEligibilityRequestRef.current = requestOrderNumber;

    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      if (requestOrderNumber === latestEligibilityRequestRef.current) {
        setIsCreateProjectAllowed(false);
        setCreateProjectBlockReason('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
      return false;
    }

    try {
      const response = await fetchApi<CreateProjectEligibilityResponse>(buildApiUrl('/projects/create-eligibility'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${authSession.accessToken}` }
      });

      // Logic này dùng cả điều kiện backend và trạng thái KYC local để tránh hiển thị sai nút tạo dự án khi dữ liệu chưa đồng bộ hoàn toàn.
      const hasApprovedBankAccount = hasApprovedBeneficiaryBankAccount(organizationKycSubmissionList);
      const isEligibleToCreateProject = response.data.isEligibleToCreateProject && hasApprovedBankAccount;

      // Chỉ cập nhật state từ request mới nhất để tránh race condition khi có nhiều request chạy song song.
      if (requestOrderNumber === latestEligibilityRequestRef.current) {
        setIsCreateProjectAllowed(isEligibleToCreateProject);
        setCreateProjectBlockReason(
          isEligibleToCreateProject
            ? null
            : response.data.blockReason || 'Bạn cần liên kết và được duyệt tài khoản ngân hàng thụ hưởng trước khi tạo dự án. Vui lòng vào Cài đặt ngân hàng.'
        );
      }
      return isEligibleToCreateProject;
    } catch (error: unknown) {
      const fallbackBlockReason = 'Không thể kiểm tra điều kiện tạo dự án. Vui lòng thử lại sau.';
      if (requestOrderNumber === latestEligibilityRequestRef.current) {
        setCreateProjectBlockReason(resolveApiErrorMessage(error, fallbackBlockReason));
        setIsCreateProjectAllowed(false);
      }
      return false;
    }
  };

  /** Hàm tải danh sách hồ sơ KYC của tổ chức hiện tại. Mục đích: lấy dữ liệu thật trạng thái tài khoản thụ hưởng cho Dashboard/Settings. */
  const loadOrganizationKycSubmissions = async () => {
    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      setOrganizationKycSubmissionList([]);
      setOrganizationKycErrorMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      setIsOrganizationKycLoading(false);
      setIsCreateProjectAllowed(false);
      setCreateProjectBlockReason('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setIsOrganizationKycLoading(true);
    setOrganizationKycErrorMessage(null);

    try {
      const response = await fetchApi<{ submissions?: OrganizationKycSubmissionSummary[] }>(
        buildApiUrl('/auth/organization/kyc-submissions/me'),
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${authSession.accessToken}` }
        }
      );

      // Logic này luôn ép về mảng an toàn để tránh runtime crash khi backend tạm thời không trả field submissions.
      const nextSubmissionList = Array.isArray(response.data?.submissions) ? response.data.submissions : [];
      setOrganizationKycSubmissionList(nextSubmissionList);

      const hasApprovedBankAccount = hasApprovedBeneficiaryBankAccount(nextSubmissionList);
      setIsCreateProjectAllowed(hasApprovedBankAccount);
      setCreateProjectBlockReason(
        hasApprovedBankAccount
          ? null
          : 'Bạn cần liên kết và được duyệt tài khoản ngân hàng thụ hưởng trước khi tạo dự án. Vui lòng vào Cài đặt ngân hàng.'
      );
    } catch (error: unknown) {
      const fallbackErrorMessage = 'Không thể tải trạng thái duyệt tài khoản. Vui lòng thử lại sau.';
      setOrganizationKycErrorMessage(resolveApiErrorMessage(error, fallbackErrorMessage));
      setOrganizationKycSubmissionList([]);
      setIsCreateProjectAllowed(false);
      setCreateProjectBlockReason('Bạn cần liên kết và được duyệt tài khoản ngân hàng thụ hưởng trước khi tạo dự án. Vui lòng vào Cài đặt ngân hàng.');
    } finally {
      setIsOrganizationKycLoading(false);
    }
  };

  /** Hàm xử lý khi gửi duyệt ngân hàng thành công. Mục đích: tải lại trạng thái thật và eligibility theo thứ tự để tránh dữ liệu chồng chéo. */
  const handleBankSubmissionSuccess = async () => {
    await loadOrganizationKycSubmissions();
    await loadCreateProjectEligibility();
  };

  /** Hàm mở modal tạo dự án. Mục đích: chỉ mở modal khi tổ chức đã đủ điều kiện ngân hàng thụ hưởng. */
  const handleOpenCreateProjectModal = async () => {
    const isEligibleToCreateProject = await loadCreateProjectEligibility();
    if (!isEligibleToCreateProject) {
      handleLinkBankAccount();
      return;
    }

    setIsCreateProjectOpen(true);
  };

  /** Hàm xử lý action từ sidebar. Mục đích: mở modal hoặc dropdown thông báo đúng ngữ cảnh. */
  const handleSidebarAction = (action: 'createProject' | 'toggleNotification') => {
    if (action === 'createProject') {
      void handleOpenCreateProjectModal();
      return;
    }

    setIsNotificationOpen(currentState => !currentState);
  };

  /** Hàm tải danh sách giải ngân từ backend. Mục đích: đồng bộ dữ liệu thật cho màn hình "Giải ngân". */
  const loadDisbursementsFromApi = async () => {
    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      setDisbursementsErrorMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setIsDisbursementsLoading(true);
    setDisbursementsErrorMessage(null);

    try {
      const response = await fetchApi<import('./types').DisbursementResult[]>(buildApiUrl('/api/disbursement/me'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${authSession.accessToken}` }
      });
      setDisbursements(response.data);
    } catch (error: unknown) {
      const fallbackErrorMessage = 'Không thể tải danh sách giải ngân. Vui lòng thử lại sau.';
      if (error && typeof error === 'object' && 'message' in error) {
        setDisbursementsErrorMessage((error as { message?: string }).message || fallbackErrorMessage);
      } else {
        setDisbursementsErrorMessage(fallbackErrorMessage);
      }
    } finally {
      setIsDisbursementsLoading(false);
    }
  };

  /** Hàm tải danh sách dự án từ backend. Mục đích: đồng bộ dữ liệu thật cho màn hình “Dự án của tôi”. */
  const loadProjectsFromApi = async () => {
    const authSession = readAuthSession();
    if (!authSession?.accessToken) {
      setProjectsErrorMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setIsProjectsLoading(true);
    setProjectsErrorMessage(null);

    try {
      const response = await fetchApi<ProjectSummary[]>(buildApiUrl('/projects'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${authSession.accessToken}` }
      });
      setCreatedProjects(response.data);
    } catch (error: unknown) {
      const fallbackErrorMessage = 'Không thể tải danh sách dự án. Vui lòng thử lại sau.';
      if (error && typeof error === 'object' && 'message' in error) {
        setProjectsErrorMessage((error as { message?: string }).message || fallbackErrorMessage);
      } else {
        setProjectsErrorMessage(fallbackErrorMessage);
      }
    } finally {
      setIsProjectsLoading(false);
    }
  };

  /** Hàm nhận dự án vừa tạo. Mục đích: thêm dự án mới vào đầu danh sách để hiển thị ngay. */
  const handleProjectCreated = (project: ProjectSummary) => {
    setCreatedProjects(currentProjects => [project, ...currentProjects]);
  };

  /** Hàm cập nhật dự án sau khi submit. Mục đích: đồng bộ trạng thái PENDING_APPROVAL tại danh sách local. */
  const handleProjectSubmitted = (projectId: string, submittedProject: ProjectSummary) => {
    setCreatedProjects(currentProjects => {
      return currentProjects.map(project => {
        if (project.projectId !== projectId) {
          return project;
        }

        return submittedProject;
      });
    });
  };

  /** Hàm cập nhật dự án sau khi chỉnh sửa. Mục đích: đồng bộ dữ liệu mới nhất từ API vào danh sách local. */
  const handleProjectUpdated = (projectId: string, updatedProject: ProjectSummary) => {
    setCreatedProjects(currentProjects => {
      return currentProjects.map(project => {
        if (project.projectId !== projectId) {
          return project;
        }

        return updatedProject;
      });
    });
  };

  /** Hàm tạo danh sách menu hệ thống. Mục đích: đồng bộ badge thông báo theo trạng thái đã đọc/chưa đọc. */
  const systemNavigationItemsWithNotificationState = useMemo(() => {
    return systemNavigationItems.map(item => {
      if (item.action !== 'toggleNotification') {
        return item;
      }

      // Logic này chỉ gắn badge cho item thông báo để reset số khi người dùng đánh dấu đã đọc.
      return {
        ...item,
        badge: hasUnreadNotification ? '3' : undefined
      };
    });
  }, [hasUnreadNotification]);

  /** Hàm xử lý chọn trang từ sidebar. Mục đích: điều hướng trang và tắt trạng thái nhấn mạnh cài đặt ngân hàng khi rời trang. */
  const handleSelectPage = (page: OrganizationPageKey) => {
    setActivePage(page);

    if (page !== 'settings') {
      setIsBankSetupHighlighted(false);
    }
  };

  /** Hàm xử lý liên kết tài khoản ngân hàng. Mục đích: chuyển nhanh sang tab cài đặt ngân hàng để người dùng thao tác. */
  const handleLinkBankAccount = () => {
    setActivePage('settings');
    setIsBankSetupHighlighted(true);
  };


  /** Hàm kiểm tra quyền truy cập Organizations tại frontend kết hợp xác thực server để tránh bypass. */
  const verifyOrganizationAccess = useCallback(async () => {
    const sessionPayload = readAuthSession();
    if (!sessionPayload.accessToken) {
      clearAuthSession();
      router.replace('/login');
      return;
    }

    setUserDisplayName(sessionPayload.userFullName || 'Người dùng');
    setUserEmail(sessionPayload.userEmail || '');
    setUserWalletAddress(sessionPayload.userWalletAddress || '');

    // Ghi chú logic phức tạp: chặn sớm từ dữ liệu local để giảm flash UI,
    // sau đó vẫn gọi server /auth/me để chống giả mạo role ở client.
    const isOrganizationRoleFromLocal =
      sessionPayload.userRole === 'organization' || sessionPayload.userRole === 'organizations';
    if (sessionPayload.userRole && !isOrganizationRoleFromLocal) {
      clearAuthSession();
      router.replace('/');
      return;
    }

    try {
      const response = await fetch(`${backendBaseUrl}/auth/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${sessionPayload.accessToken}`
        }
      });

      if (!response.ok) {
        clearAuthSession();
        router.replace('/login');
        return;
      }

      const responseData = await response.json();
      const userRole = responseData?.user?.role as string | undefined;
      const isOrganizationRoleFromServer = userRole === 'organization' || userRole === 'organizations';
      if (!isOrganizationRoleFromServer) {
        clearAuthSession();
        router.replace('/');
        return;
      }
    } catch (_error) {
      clearAuthSession();
      router.replace('/login');
      return;
    } finally {
      setIsAccessChecking(false);
    }
  }, [backendBaseUrl, router]);

  /** Hàm gọi API logout, xóa phiên cục bộ và điều hướng về login an toàn. */
  const handleLogout = useCallback(async () => {
    if (isLogoutProcessing) {
      return;
    }

    setIsLogoutProcessing(true);
    const sessionPayload = readAuthSession();

    try {
      if (sessionPayload.accessToken) {
        await fetch(`${backendBaseUrl}/auth/logout-all`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionPayload.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });
      }
    } catch (_error) {
      // Ghi chú logic phức tạp: vẫn tiếp tục clear session local để chắc chắn đóng phiên client.
    } finally {
      clearAuthSession();
      window.sessionStorage.clear();
      router.replace('/login');
      router.refresh();
      setIsLogoutProcessing(false);
    }
  }, [backendBaseUrl, isLogoutProcessing, router]);
  /** Hàm đánh dấu toàn bộ thông báo đã đọc. Mục đích: cập nhật trạng thái thông báo về đã đọc. */
  const handleMarkAllNotificationsAsRead = () => {
    setHasUnreadNotification(false);
  };

  /** Hàm đóng dropdown thông báo. Mục đích: gom một điểm xử lý đóng popup để tái sử dụng. */
  const handleCloseNotificationDropdown = () => {
    setIsNotificationOpen(false);
  };

  /** Hàm mở thông báo từ topbar. Mục đích: đồng bộ thao tác chuông thông báo giữa topbar và sidebar. */
  const handleOpenTopbarNotification = () => {
    setIsNotificationOpen(currentState => !currentState);
  };

  /** Hàm mở menu mobile. Mục đích: giữ tương thích API của Topbar trong khi sidebar hiện tại là desktop cố định. */
  const handleOpenMobileMenu = () => {
    // Ghi chú logic phức tạp: layout organizations hiện chưa có drawer mobile,
    // nên tạm thời giữ hàm rỗng để không phá vỡ props contract của Topbar.
  };

  /** Hàm chạy guard phân quyền khi component mount. */
  useEffect(() => {
    void verifyOrganizationAccess();
  }, [verifyOrganizationAccess]);

  useEffect(() => {
    if (activePage !== 'settings') {
      setIsBankSetupHighlighted(false);
    }
  }, [activePage]);

  useEffect(() => {
    if (!hasUnreadNotification) {
      setIsNotificationOpen(false);
    }
  }, [hasUnreadNotification]);

  useEffect(() => {
    if (isAccessChecking) {
      return;
    }

    void Promise.all([loadProjectsFromApi(), loadCreateProjectEligibility(), loadOrganizationKycSubmissions(), loadDisbursementsFromApi()]);
  }, [isAccessChecking]);

  useEffect(() => {
    if (activePage !== 'projects') {
      return;
    }

    // Khi người dùng vào tab dự án, luôn re-check eligibility để đồng bộ trạng thái chặn/mở nút tạo dự án ngay lập tức.
    void loadCreateProjectEligibility();
  }, [activePage]);

  if (isAccessChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFB] text-[#0D1117]">
        <p className="text-sm font-medium text-[#4B5563]">Đang kiểm tra quyền truy cập...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFB] text-[#0D1117]">
      <div className="flex">
        <aside className="fixed left-0 top-0 z-20 flex h-screen w-[248px] flex-col border-r border-[#0F6B5D] bg-gradient-to-b from-[#0E7C6B] via-[#0A5C50] to-[#08473F]">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 shadow-[0_8px_20px_rgba(0,0,0,0.18)] ring-1 ring-white/20">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
                  <path d="M12 21.7C5.8 17.5 2 13.2 2 9a6 6 0 0112 0 6 6 0 0112 0c0 4.2-3.8 8.5-10 12.7z" />
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-bold leading-none text-white">DCP</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/55">Decentralized Charity Platform</p>
              </div>
            </div>
          </div>

          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-xs font-semibold text-white">Quỹ Hy Vọng Xanh</p>
            <p className="mt-1 text-[10px] text-[#4ADE80]">● Đã xác minh KYC</p>
          </div>

          <div className="px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">CHÍNH</div>
          <div className="space-y-1 px-3">
            {primaryNavigationItems.map(item => (
              <SidebarItem
                key={item.label}
                item={item}
                activePage={activePage}
                onSelectPage={handleSelectPage}
                onTriggerAction={handleSidebarAction}
              />
            ))}
          </div>

          <div className="px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">TÀI CHÍNH</div>
          <div className="space-y-1 px-3">
            {financeNavigationItems.map(item => (
              <SidebarItem
                key={item.label}
                item={item}
                activePage={activePage}
                onSelectPage={handleSelectPage}
                onTriggerAction={handleSidebarAction}
              />
            ))}
          </div>

          <div className="px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">HỆ THỐNG</div>
          <div className="space-y-1 px-3">
            {systemNavigationItemsWithNotificationState.map(item => (
              <SidebarItem
                key={item.label}
                item={item}
                activePage={activePage}
                onSelectPage={handleSelectPage}
                onTriggerAction={handleSidebarAction}
              />
            ))}
          </div>

          <div className="m-4 mt-auto">
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
              disabled={isLogoutProcessing}
              className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLogoutProcessing ? 'Đang đăng xuất...' : 'Đăng xuất'}
            </button>
          </div>
        </aside>

        <section className="ml-[248px] flex min-h-screen flex-1 flex-col">
          <Topbar
            breadcrumbTitle={pageTitle}
            userDisplayName={userDisplayName}
            userEmail={userEmail}
            userWalletAddress={userWalletAddress}
            onOpenMobileMenu={handleOpenMobileMenu}
            onOpenNotification={handleOpenTopbarNotification}
            onLogout={() => {
              void handleLogout();
            }}
          />

          <div className="p-7">
            {activePage === 'dashboard' ? (
              <DashboardSection
                onLinkBankAccount={handleLinkBankAccount}
                hasApprovedBeneficiaryBankAccount={isCreateProjectAllowed}
              />
            ) : null}
            {activePage === 'projects' ? (
              <ProjectsSection
                createdProjects={createdProjects}
                isProjectsLoading={isProjectsLoading}
                projectsErrorMessage={projectsErrorMessage}
                onRetryLoadProjects={loadProjectsFromApi}
                onOpenCreateProjectModal={() => {
                  void handleOpenCreateProjectModal();
                }}
                isCreateProjectAllowed={isCreateProjectAllowed}
                createProjectBlockReason={createProjectBlockReason}
                onGoToBankSettings={handleLinkBankAccount}
                onProjectSubmitted={handleProjectSubmitted}
                onProjectUpdated={handleProjectUpdated}
              />
            ) : null}
            {activePage === 'disbursement' ? (
              <DisbursementSection
                activeDisbursementTab={activeDisbursementTab}
                onChangeDisbursementTab={setActiveDisbursementTab}
                disbursements={disbursements}
                isDisbursementsLoading={isDisbursementsLoading}
                disbursementsErrorMessage={disbursementsErrorMessage}
                onRetryLoadDisbursements={loadDisbursementsFromApi}
                createdProjects={createdProjects}
              />
            ) : null}
            {activePage === 'transparency' ? <TransparencySection /> : null}
            {activePage === 'settings' ? (
              <SettingsSection
                isBankSetupHighlighted={isBankSetupHighlighted}
                organizationKycSubmissionList={organizationKycSubmissionList}
                isOrganizationKycLoading={isOrganizationKycLoading}
                organizationKycErrorMessage={organizationKycErrorMessage}
                onRetryLoadOrganizationKycSubmissions={loadOrganizationKycSubmissions}
                onBankSubmissionSuccess={handleBankSubmissionSuccess}
              />
            ) : null}
          </div>
        </section>
      </div>

      {isNotificationOpen ? (
        <NotificationDropdown
          hasUnreadNotification={hasUnreadNotification}
          onMarkAllAsRead={handleMarkAllNotificationsAsRead}
          onRequestClose={handleCloseNotificationDropdown}
        />
      ) : null}
      {isCreateProjectOpen ? (
        <CreateProjectModal
          onClose={() => setIsCreateProjectOpen(false)}
          onProjectCreated={handleProjectCreated}
        />
      ) : null}
    </main>
  );
}

