'use client';

// =============================================================================
// AdminPageClientTailwind — Trang Admin chính
// Clone from: FE/app/components/regulatoryBodies/RegulatoryBodiesPageClientTailwind.tsx
// Mục đích: Trang quản trị hệ thống hoàn chỉnh — kết hợp Sidebar, Topbar, Dashboard,
//           và các NonDashboard panels với đầy đủ auth, toast, drawer/modal coordination
// =============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './tailwind/Sidebar';
import Topbar from './tailwind/Topbar';
import MetricCard from './tailwind/MetricCard';
import UrgentTable from './tailwind/UrgentTable';
import DisbursementStatusCard from './tailwind/DisbursementStatusCard';
import TimelineCard from './tailwind/TimelineCard';
import AuditTable from './tailwind/AuditTable';
import RequestDrawer from './tailwind/RequestDrawer';
import ToastStack from './tailwind/ToastStack';
import NonDashboardPanel from './tailwind/NonDashboardPanel';
import { getNavigationItems } from './tailwind/data';
import { readAuthSession, clearAuthSession } from '@/app/utils/authSession';
import { fetchApi, buildApiUrl } from '@/app/utils/apiClient';
import { getPageTitle } from './tailwind/helpers';
import type { PageKey, ToastItem, UrgentRequestItem, DrawerTabKey } from './tailwind/types';
import type { AuditLogItem, TimelineItem } from './tailwind/types';

// =============================================================================
// TYPES for Dashboard API responses
// =============================================================================

/** Chuẩn hóa metric card từ API cho dashboard Admin. */
type MetricCardData = {
  valueText: string;
  labelText: string;
  trendText: string;
  trendClassName: 'trend-up' | 'trend-dn';
  colorVariant: 'amber' | 'cyan' | 'green' | 'teal';
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AdminPageClientTailwind() {
  // Auth state — kiểm tra quyền truy cập 'admin'
  const [authVerified, setAuthVerified] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Page navigation
  const [activePage, setActivePage] = useState<PageKey>('dashboard');

  // Toast notifications
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Drawer state
  const [selectedUrgentRequestItem, setSelectedUrgentRequestItem] = useState<UrgentRequestItem | null>(null);
  const [drawerTabKey, setDrawerTabKey] = useState<DrawerTabKey>('overview');

  // Dashboard real API state
  const [dashboardMetrics, setDashboardMetrics] = useState<MetricCardData[]>([]);
  const [dashboardUrgentRequests, setDashboardUrgentRequests] = useState<UrgentRequestItem[]>([]);
  const [dashboardTimeline, setDashboardTimeline] = useState<TimelineItem[]>([]);
  const [dashboardAuditLogs, setDashboardAuditLogs] = useState<AuditLogItem[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(false);

  // User info from session
  const [userDisplayName, setUserDisplayName] = useState('Quản trị viên');
  const [userEmail, setUserEmail] = useState('');
  const [userWalletAddress, setUserWalletAddress] = useState('');

  const router = useRouter();

  // =============================================================================
  // AUTH VERIFICATION + USER INFO + DASHBOARD DATA
  // =============================================================================

  useEffect(() => {
    const verifyAuth = async () => {
      setAuthLoading(true);
      const session = readAuthSession();

      if (!session.accessToken) {
        router.push('/login');
        return;
      }

      // Kiểm tra quyền admin (chu?n OWASP A01: Access Control)
      if (session.userRole !== 'admin') {
        router.push('/unauthorized');
        return;
      }

      // Lưu thông tin user từ session để hiển thị trên Topbar
      setUserDisplayName(session.userFullName || 'Quản trị viên');
      setUserEmail(session.userEmail || '');
      setUserWalletAddress(session.userWalletAddress || '');

      setAuthVerified(true);
      setAuthLoading(false);
    };

    verifyAuth();
  }, [router]);

  /** Hàm định dạng deadline mức độ ưu tiên — chuyển số giây sang text cho bảng urgent. */
  const normalizeDeadlineText = (deadlineTimestamp: number): string => {
    const now = Date.now();
    const diffMs = deadlineTimestamp - now;
    if (diffMs <= 0) return 'Đã quá hạn';
    const diffSeconds = Math.floor(diffMs / 1000);
    if (diffSeconds < 60) return `${diffSeconds} giây`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} phút`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày`;
  };

  /** Hàm Chuẩn hóa deadline level từ timestamp để hiển thị màu s?c phù h?p trên bảng urgent. */
  const normalizeDeadlineLevel = (deadlineTimestamp: number): 'urgent' | 'normal' | 'ok' => {
    const now = Date.now();
    const diffMs = deadlineTimestamp - now;
    if (diffMs <= 0) return 'ok';
    if (diffMs <= 60 * 60 * 1000) return 'urgent'; // Du?i 1 giờ: kh?n c?p
    if (diffMs <= 24 * 60 * 60 * 1000) return 'normal'; // Du?i 24 giờ: b́nh thu?ng
    return 'ok';
  };

  /** Hàm chuẩn hóa trạng thái chữ ký. Mục đích: bảo đảm dữ liệu API luôn khớp union type mà UI hỗ trợ. */
  const normalizeSignatureState = (currentSignatures: number, requiredSignatures: number): '1/3' | '2/3' | '3/3' => {
    const safeRequiredSignatures = requiredSignatures === 3 ? 3 : 3;
    const safeCurrentSignatures = Math.min(Math.max(currentSignatures, 1), safeRequiredSignatures);

    if (safeCurrentSignatures >= 3) {
      return '3/3';
    }

    if (safeCurrentSignatures === 2) {
      return '2/3';
    }

    return '1/3';
  };

  /** Hàm gọi API dashboard từng h?p cho Admin — lấy metrics, urgent requests, timeline, audit logs. */
  const loadDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(false);
    const session = readAuthSession();
    const authHeaders = { Authorization: `Bearer ${session.accessToken}` };

    try {
      // Gọi song song 4 API endpoint d? từi uu th?i gian từi dashboard
      const [metricsResp, urgentResp, timelineResp, auditResp] = await Promise.allSettled([
        fetchApi<{
          pendingProjects: number;
          pendingKycs: number;
          newUsersThisMonth: number;
          totalTransactionAmount: number;
        }>(buildApiUrl('/api/admin/dashboard/metrics'), { headers: authHeaders }),
        fetchApi<{
          requests: {
            id: string;
            projectName: string;
            organizationName: string;
            amount: number;
            requiredSignatures: number;
            currentSignatures: number;
            deadlineTimestamp: number;
            usagePurpose?: string;
            ipfsCid?: string;
            fileName?: string;
          }[];
        }>(buildApiUrl('/api/disbursement/requests'), { headers: authHeaders }),
        fetchApi<{
          events: { id: string; type: string; actionText: string; detailText: string; timestamp: string }[];
        }>(buildApiUrl('/api/admin/dashboard/timeline'), { headers: authHeaders }),
        fetchApi<{
          logs: { id: string; timestamp: string; action: string; module: string; actor: string; ipAddress: string; details: string }[];
        }>(buildApiUrl('/api/admin/dashboard/audit-logs'), { headers: authHeaders }),
      ]);

      // Xử lý metrics — fallback 0 nếu API lỗi
      if (metricsResp.status === 'fulfilled') {
        const m = metricsResp.value.data;
        setDashboardMetrics([
          { colorVariant: 'amber', valueText: String(m.pendingProjects), labelText: 'Dự án chờ duyệt', trendText: '↺ Cập nhật theo thời gian thực', trendClassName: 'trend-up' },
          { colorVariant: 'cyan', valueText: String(m.pendingKycs), labelText: 'Hồ sơ KYC chờ duyệt', trendText: '↺ Cập nhật theo thời gian thực', trendClassName: 'trend-up' },
          { colorVariant: 'green', valueText: String(m.newUsersThisMonth), labelText: 'Người dùng mới tháng này', trendText: '↺ Cập nhật theo thời gian thực', trendClassName: 'trend-up' },
          { colorVariant: 'teal', valueText: m.totalTransactionAmount >= 1e12 ? `${(m.totalTransactionAmount / 1e12).toFixed(1)}T` : `${(m.totalTransactionAmount / 1e9).toFixed(1)}B`, labelText: 'Tổng giá trị giao dịch (VNĐ)', trendText: '↺ Cập nhật theo thời gian thực', trendClassName: 'trend-up' },
        ]);
      } else {
        setDashboardMetrics([
          { colorVariant: 'amber', valueText: '—', labelText: 'Dự án chờ duyệt', trendText: 'Không thể tải', trendClassName: 'trend-dn' },
          { colorVariant: 'cyan', valueText: '—', labelText: 'Hồ sơ KYC chờ duyệt', trendText: 'Không thể tải', trendClassName: 'trend-dn' },
          { colorVariant: 'green', valueText: '—', labelText: 'Người dùng mới tháng này', trendText: 'Không thể tải', trendClassName: 'trend-dn' },
          { colorVariant: 'teal', valueText: '—', labelText: 'Tổng giá trị giao dịch (VNĐ)', trendText: 'Không thể tải', trendClassName: 'trend-dn' },
        ]);
      }

      // Xử lý urgent requests — chuyển đổi từ raw API sang UrgentRequestItem
      if (urgentResp.status === 'fulfilled') {
        const rawRequests = urgentResp.value.data.requests ?? [];
        setDashboardUrgentRequests(rawRequests.map((r) => ({
          id: r.id,
          projectName: r.projectName,
          organizationName: r.organizationName,
          amountText: new Intl.NumberFormat('vi-VN').format(r.amount) + '₫',
          signatureState: normalizeSignatureState(r.currentSignatures, r.requiredSignatures),
          deadlineText: normalizeDeadlineText(r.deadlineTimestamp),
          deadlineLevel: normalizeDeadlineLevel(r.deadlineTimestamp),
          ipfsCid: r.ipfsCid,
          fileName: r.fileName,
          usagePurpose: r.usagePurpose,
        })));
      } else {
        setDashboardUrgentRequests([]);
      }

      // Xử lý timeline — chuẩn hóa từ API sang TimelineItem
      if (timelineResp.status === 'fulfilled') {
        const rawEvents = timelineResp.value.data.events ?? [];
        setDashboardTimeline(rawEvents.map((e, idx) => ({
          id: e.id || `TL-${idx + 1}`,
          type: e.type as TimelineItem['type'],
          actionText: e.actionText,
          detailText: e.detailText,
          timeText: e.timestamp,
        })));
      } else {
        setDashboardTimeline([]);
      }

      // Xử lý audit logs — chuẩn hóa từ API sang AuditLogItem
      if (auditResp.status === 'fulfilled') {
        const rawLogs = auditResp.value.data.logs ?? [];
        setDashboardAuditLogs(rawLogs.map((l) => ({
          id: l.id,
          timestamp: l.timestamp,
          action: l.action,
          module: l.module,
          actor: l.actor,
          ipAddress: l.ipAddress,
          details: l.details,
        })));
      } else {
        setDashboardAuditLogs([]);
      }
    } catch {
      setDashboardError(true);
      // Fallback: đặt rỗng để tránh hiển thị mock data
      setDashboardMetrics([]);
      setDashboardUrgentRequests([]);
      setDashboardTimeline([]);
      setDashboardAuditLogs([]);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  // từi dashboard data khi auth dă xác thực thành công
  useEffect(() => {
    if (authVerified) {
      loadDashboardData();
    }
  }, [authVerified, loadDashboardData]);

  // =============================================================================
  // TOAST HANDLERS
  // =============================================================================

  const addToast = useCallback((toastItem: Omit<ToastItem, 'id'>) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toastItem, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  /** Gỡ toast khỏi danh sách. */
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // =============================================================================
  // DRAWER HANDLERS
  // =============================================================================

  /** Mở drawer với item được chọn. */
  const handleOpenDrawer = useCallback((requestId: string) => {
    const item = dashboardUrgentRequests.find((r) => r.id === requestId) ?? null;
    setSelectedUrgentRequestItem(item);
    setDrawerTabKey('overview');
  }, [dashboardUrgentRequests]);

  /** Đóng drawer — reset state về null. */
  const handleCloseDrawer = useCallback(() => {
    setSelectedUrgentRequestItem(null);
  }, []);

  /** Hàm thực thi action ký/từ chối với API thật. Mục đích: đồng bộ dashboard admin với dữ liệu backend, không dùng mock. */
  const submitDisbursementAction = useCallback(async (
    requestId: string,
    action: 'approve' | 'reject',
    rejectReason?: string
  ): Promise<void> => {
    const session = readAuthSession();
    if (!session.accessToken) {
      addToast({ titleText: 'Phiên đăng nhập hết hạn', bodyText: 'Vui lòng đăng nhập lại để tiếp tục ký duyệt.', tone: 'error' });
      return;
    }

    if (action === 'approve') {
      await fetchApi(buildApiUrl(`/api/disbursement/${requestId}/sign`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ comment: 'Approved from admin dashboard' })
      });
      addToast({ titleText: 'Ký duyệt thành công', bodyText: `Đã ký duyệt yêu cầu ${requestId}.`, tone: 'success' });
    } else {
      await fetchApi(buildApiUrl(`/api/disbursement/${requestId}/reject`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ reason: rejectReason })
      });
      addToast({ titleText: 'Đã từ chối yêu cầu', bodyText: `Yêu cầu ${requestId} đã được cập nhật trạng thái từ chối.`, tone: 'warning' });
    }

    await loadDashboardData();
  }, [addToast, loadDashboardData]);

  /** Hàm xử lý ký duyệt từ drawer. Mục đích: gọi API thật, làm mới dữ liệu và đóng drawer sau khi thành công. */
  const handleApproveFromDrawer = useCallback(async (): Promise<void> => {
    const requestId = selectedUrgentRequestItem?.id;
    if (!requestId) {
      return;
    }

    try {
      await submitDisbursementAction(requestId, 'approve');
      setSelectedUrgentRequestItem(null);
    } catch {
      addToast({ titleText: 'Ký duyệt thất bại', bodyText: 'Không thể cập nhật trạng thái yêu cầu. Vui lòng thử lại.', tone: 'error' });
    }
  }, [addToast, selectedUrgentRequestItem, submitDisbursementAction]);

  /** Hàm xử lý từ chối từ drawer. Mục đích: bắt buộc nhập lý do và đồng bộ trạng thái reject với backend. */
  const handleRejectFromDrawer = useCallback(async (): Promise<void> => {
    const requestId = selectedUrgentRequestItem?.id;
    if (!requestId) {
      return;
    }

    const rejectReason = window.prompt('Nhập lý do từ chối (tối thiểu 5 ký tự):', 'Thiếu thông tin chứng từ minh chứng.');
    if (!rejectReason || rejectReason.trim().length < 5) {
      addToast({ titleText: 'Thiếu lý do từ chối', bodyText: 'Bạn cần nhập lý do từ chối tối thiểu 5 ký tự.', tone: 'warning' });
      return;
    }

    try {
      await submitDisbursementAction(requestId, 'reject', rejectReason.trim());
      setSelectedUrgentRequestItem(null);
    } catch {
      addToast({ titleText: 'Từ chối thất bại', bodyText: 'Không thể cập nhật trạng thái yêu cầu. Vui lòng thử lại.', tone: 'error' });
    }
  }, [addToast, selectedUrgentRequestItem, submitDisbursementAction]);

  // =============================================================================
  // LOGOUT
  // =============================================================================

  const handleLogout = useCallback(() => {
    clearAuthSession();
    router.push('/login');
  }, [router]);

  // =============================================================================
  // PAGE NAVIGATION
  // =============================================================================

  const handleNavigate = useCallback((key: PageKey) => {
    setActivePage(key);
  }, []);

  // =============================================================================
  // RENDER: LOADING
  // =============================================================================

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0E7C6B] border-t-transparent" />
          <p className="text-sm text-slate-500">Đang xác thực quy?n truy c?p...</p>
        </div>
      </div>
    );
  }

  // =============================================================================
  // RENDER: AUTH FAILED
  // =============================================================================

  if (!authVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-center">
          <svg className="text-red-400" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-base font-semibold text-red-700">Không có quy?n truy c?p</p>
          <p className="text-sm text-slate-500">Bạn cần Đãng nhập với tài khoản Admin d? truy c?p trang này.</p>
        </div>
      </div>
    );
  }

  const navigationItemList = getNavigationItems();

  // =============================================================================
  // RENDER: DASHBOARD
  // =============================================================================

  if (activePage === 'dashboard') {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
        <Sidebar
          selectedPageKey={activePage}
          navigationItemList={navigationItemList}
          onSelectPage={handleNavigate}
          onLogout={handleLogout}
        />

        <section className="flex-1 p-0">
          <Topbar
            breadcrumbTitle={getPageTitle(activePage)}
            userDisplayName={userDisplayName}
            userEmail={userEmail}
            userWalletAddress={userWalletAddress}
            onLogout={handleLogout}
          />

          <div className="space-y-5 p-4 lg:p-7">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{getPageTitle(activePage)}</h1>
              <p className="mt-1 text-xs text-slate-500">từng quan h? th?ng</p>
            </div>

            {/* Metric cards — từ API th?t */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {dashboardLoading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white px-5 py-4">
                    <div className="h-8 w-20 animate-pulse rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-100" />
                  </div>
                ))
              ) : dashboardMetrics.length > 0 ? (
                dashboardMetrics.map((item, idx) => (
                  <MetricCard key={idx} {...item} />
                ))
              ) : (
                <div className="col-span-4 overflow-hidden rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-700">
                  Không thể tải metric. Vui ḷng thử lại.
                </div>
              )}
            </div>

            {/* Main dashboard grid */}
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              {/* Left: Urgent table */}
              <UrgentTable urgentRequestItemList={dashboardUrgentRequests} onOpenDrawer={(requestId) => {
                const item = dashboardUrgentRequests.find((r) => r.id === requestId) ?? null;
                setSelectedUrgentRequestItem(item);
                setDrawerTabKey('overview');
              }} />

              {/* Right: Disbursement status + Timeline */}
              <div className="space-y-4">
                <DisbursementStatusCard completedCount={dashboardUrgentRequests.filter(r => r.signatureState === "3/3" || r.signatureState === "2/3").length} pendingCount={dashboardUrgentRequests.filter(r => r.signatureState !== "3/3" && r.signatureState !== "2/3").length} totalCount={dashboardUrgentRequests.length} />
                {dashboardLoading ? (
                  <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white p-5">
                    <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="mt-4 space-y-3">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <TimelineCard timelineItemList={dashboardTimeline} />
                )}
              </div>
            </div>

            {/* Audit table */}
            {dashboardLoading ? (
              <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white p-5">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="h-10 animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              </div>
            ) : (
              <AuditTable auditLogItemList={dashboardAuditLogs} />
            )}

            {/* Retry button when dashboard data failed */}
            {dashboardError && !dashboardLoading && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => loadDashboardData()}
                  className="rounded-lg border border-emerald-900/15 bg-[#0E7C6B] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#0d6b5c]"
                >
                  ? từi l?i d? li?u từng quan
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Global overlays */}
        {selectedUrgentRequestItem && (
          <RequestDrawer
            selectedUrgentRequestItem={selectedUrgentRequestItem}
            selectedDrawerTabKey={drawerTabKey}
            onClose={handleCloseDrawer}
            onChangeTab={setDrawerTabKey}
            onApprove={handleApproveFromDrawer}
            onReject={handleRejectFromDrawer}
          />
        )}

        <ToastStack toastItemList={toasts} onCloseToast={removeToast} />
      </main>
    );
  }

  // =============================================================================
  // RENDER: NON-DASHBOARD PAGES
  // =============================================================================

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <div className="hidden lg:block">
        <Sidebar
          selectedPageKey={activePage}
          navigationItemList={navigationItemList}
          onSelectPage={handleNavigate}
          onLogout={handleLogout}
        />
      </div>

      <section className="flex-1 p-0">
        <Topbar
          breadcrumbTitle={getPageTitle(activePage)}
          userDisplayName={userDisplayName}
          userEmail={userEmail}
          userWalletAddress={userWalletAddress}
          onLogout={handleLogout}
        />

        <div className="space-y-5 p-4 lg:p-7">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{getPageTitle(activePage)}</h1>
            <p className="mt-1 text-xs text-slate-500">Quản lý và giám sát hệ thống</p>
          </div>

          <NonDashboardPanel
            activePage={activePage}
            onPushToast={addToast}
            onOpenDrawer={(urgentRequestItem) => {
              setSelectedUrgentRequestItem(urgentRequestItem);
              setDrawerTabKey('overview');
            }}
          />
        </div>
      </section>

      {selectedUrgentRequestItem && (
        <RequestDrawer
          selectedUrgentRequestItem={selectedUrgentRequestItem}
          selectedDrawerTabKey={drawerTabKey}
          onClose={handleCloseDrawer}
          onChangeTab={setDrawerTabKey}
          onApprove={handleApproveFromDrawer}
          onReject={handleRejectFromDrawer}
        />
      )}

      <ToastStack toastItemList={toasts} onCloseToast={removeToast} />
    </main>
  );
}
