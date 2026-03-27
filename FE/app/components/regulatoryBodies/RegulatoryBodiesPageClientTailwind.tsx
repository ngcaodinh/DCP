'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuthSession, readAuthSession } from '../../utils/authSession';
import AuditTable from './tailwind/AuditTable';
import ConfirmModal from './tailwind/ConfirmModal';
import { auditLogItemList, getDashboardMetricItemList, getDashboardUrgentRequestItemList, navigationItemList, timelineItemList } from './tailwind/data';
import { getPageTitle } from './tailwind/helpers';
import DisbursementStatusCard from './tailwind/DisbursementStatusCard';
import MetricCard from './tailwind/MetricCard';
import NonDashboardPanel from './tailwind/NonDashboardPanel';
import RequestDrawer from './tailwind/RequestDrawer';
import Sidebar from './tailwind/Sidebar';
import TimelineCard from './tailwind/TimelineCard';
import ToastStack from './tailwind/ToastStack';
import Topbar from './tailwind/Topbar';
import type { DrawerTabKey, PageKey, ToastItem, UrgentRequestItem } from './tailwind/types';
import UrgentTable from './tailwind/UrgentTable';

/** Hàm tạo toast mới để tái sử dụng cho nhiều hành động UI trên trang tổng quan. */
function buildToastItem(titleText: string, bodyText: string, tone: 'success' | 'error' | 'info'): ToastItem {
  return { id: `${Date.now()}-${Math.random()}`, titleText, bodyText, tone };
}

/** Hàm trang chính để dựng giao diện Cơ quan giám sát theo mẫu HTML bằng Tailwind + component tách nhỏ. */
export default function RegulatoryBodiesPageClientTailwind() {
  const router = useRouter();
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
  const [selectedPageKey, setSelectedPageKey] = useState<PageKey>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedUrgentRequestItem, setSelectedUrgentRequestItem] = useState<UrgentRequestItem | null>(null);
  const [selectedDrawerTabKey, setSelectedDrawerTabKey] = useState<DrawerTabKey>('overview');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [toastItemList, setToastItemList] = useState<ToastItem[]>([]);
  const [isAccessChecking, setIsAccessChecking] = useState(true);
  const [isLogoutProcessing, setIsLogoutProcessing] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState('Người dùng');
  const [userEmail, setUserEmail] = useState('');
  const [userWalletAddress, setUserWalletAddress] = useState('');

  const metricItemList = useMemo(() => getDashboardMetricItemList(), []);
  const urgentRequestItemList = useMemo(() => getDashboardUrgentRequestItemList(), []);

  /** Hàm đồng bộ khóa cuộn nền khi mở lớp phủ mobile menu/drawer/modal để UX trên màn nhỏ ổn định hơn. */
  useEffect(() => {
    const isOverlayOpen = isMobileMenuOpen || Boolean(selectedUrgentRequestItem) || isConfirmModalOpen;

    // Logic này đảm bảo không bị cuộn nền khi người dùng đang thao tác trên lớp phủ nổi.
    document.body.style.overflow = isOverlayOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen, selectedUrgentRequestItem, isConfirmModalOpen]);

  /** Hàm thêm toast và tự đóng sau 3 giây để phản hồi nhanh mà không gây cản trở thao tác. */
  function pushToast(titleText: string, bodyText: string, tone: 'success' | 'error' | 'info') {
    const newToastItem = buildToastItem(titleText, bodyText, tone);
    setToastItemList(previousToastItemList => [...previousToastItemList, newToastItem]);
    window.setTimeout(() => {
      setToastItemList(previousToastItemList => previousToastItemList.filter(toastItem => toastItem.id !== newToastItem.id));
    }, 3000);
  }

  /** Hàm kiểm tra quyền truy cập Regulatory tại frontend kết hợp xác thực server để tránh bypass. */
  const verifyRegulatoryAccess = useCallback(async () => {
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
    if (sessionPayload.userRole && sessionPayload.userRole !== 'regulatory') {
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
      if (userRole !== 'regulatory') {
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


  /** Hàm chạy guard phân quyền khi component mount. */
  useEffect(() => {
    verifyRegulatoryAccess();
  }, [verifyRegulatoryAccess]);

  if (isAccessChecking) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-lg bg-white px-6 py-4 shadow-sm">
            <p className="text-sm font-medium text-slate-700">Đang kiểm tra quyền truy cập...</p>
          </div>
        </div>
      </main>
    );
  }

  /** Hàm mở drawer với tab mặc định overview để người dùng luôn thấy thông tin chính trước. */
  function handleOpenDrawer(urgentRequestItem: UrgentRequestItem) {
    setSelectedUrgentRequestItem(urgentRequestItem);
    setSelectedDrawerTabKey('overview');
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <div className="hidden lg:block"><Sidebar selectedPageKey={selectedPageKey} navigationItemList={navigationItemList} onSelectPage={setSelectedPageKey} onLogout={handleLogout} /></div>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setIsMobileMenuOpen(false)} aria-label="Đóng menu" />
          <div className="relative h-full w-[248px]"><Sidebar selectedPageKey={selectedPageKey} navigationItemList={navigationItemList} onSelectPage={setSelectedPageKey} onCloseMobileMenu={() => setIsMobileMenuOpen(false)} onLogout={handleLogout} /></div>
        </div>
      ) : null}

      <section className="flex-1 p-0">
        <Topbar
          breadcrumbTitle={selectedPageKey === 'dashboard' ? 'Tổng quan' : getPageTitle(selectedPageKey)}
          userDisplayName={userDisplayName}
          userEmail={userEmail}
          userWalletAddress={userWalletAddress}

          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenNotification={() => pushToast('Thông báo mới', 'Bạn có 3 yêu cầu ký duyệt cần xử lý.', 'info')}
          onLogout={handleLogout}
        />

        <div className="space-y-5 p-4 lg:p-7">
          <div><h1 className="text-2xl font-bold">{getPageTitle(selectedPageKey)}</h1><p className="mt-1 text-xs text-slate-500">Thứ Sáu, 22/03/2026 — Cập nhật lúc 14:32</p></div>

          {selectedPageKey === 'dashboard' ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{metricItemList.map(metricItem => <MetricCard key={metricItem.label} valueText={metricItem.value} labelText={metricItem.label} trendText={metricItem.trendText} trendClassName={metricItem.trendClassName} colorVariant={metricItem.colorVariant} />)}</div>

              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <UrgentTable urgentRequestItemList={urgentRequestItemList} onOpenDrawer={handleOpenDrawer} />
                <div className="space-y-4">
                  <DisbursementStatusCard />
                  <TimelineCard timelineItemList={timelineItemList} />
                </div>
              </div>

              <AuditTable auditLogItemList={auditLogItemList} />
            </>
          ) : <NonDashboardPanel selectedPageKey={selectedPageKey} onOpenDisbursementRequest={handleOpenDrawer} />}
        </div>
      </section>

      <RequestDrawer
        selectedUrgentRequestItem={selectedUrgentRequestItem}
        selectedDrawerTabKey={selectedDrawerTabKey}
        onClose={() => setSelectedUrgentRequestItem(null)}
        onChangeTab={setSelectedDrawerTabKey}
        onReject={() => { setSelectedUrgentRequestItem(null); pushToast('Đã từ chối yêu cầu', 'Yêu cầu đã được cập nhật trạng thái từ chối.', 'error'); }}
        onApprove={() => setIsConfirmModalOpen(true)}
      />

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={() => {
          setIsConfirmModalOpen(false);
          setSelectedUrgentRequestItem(null);
          pushToast('Ký duyệt thành công', 'Giao dịch đã được xác thực và ghi nhận trên hệ thống.', 'success');
        }}
      />

      <ToastStack toastItemList={toastItemList} onCloseToast={toastId => setToastItemList(previousToastItemList => previousToastItemList.filter(toastItem => toastItem.id !== toastId))} />
    </main>
  );
}

