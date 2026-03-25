'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [selectedPageKey, setSelectedPageKey] = useState<PageKey>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedUrgentRequestItem, setSelectedUrgentRequestItem] = useState<UrgentRequestItem | null>(null);
  const [selectedDrawerTabKey, setSelectedDrawerTabKey] = useState<DrawerTabKey>('overview');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [toastItemList, setToastItemList] = useState<ToastItem[]>([]);

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

  /** Hàm mở drawer với tab mặc định overview để người dùng luôn thấy thông tin chính trước. */
  function handleOpenDrawer(urgentRequestItem: UrgentRequestItem) {
    setSelectedUrgentRequestItem(urgentRequestItem);
    setSelectedDrawerTabKey('overview');
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <div className="hidden lg:block"><Sidebar selectedPageKey={selectedPageKey} navigationItemList={navigationItemList} onSelectPage={setSelectedPageKey} onLogout={() => pushToast('Đăng xuất', 'Phiên làm việc sẽ được kết thúc sau khi tích hợp API xác thực.', 'info')} /></div>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setIsMobileMenuOpen(false)} aria-label="Đóng menu" />
          <div className="relative h-full w-[248px]"><Sidebar selectedPageKey={selectedPageKey} navigationItemList={navigationItemList} onSelectPage={setSelectedPageKey} onCloseMobileMenu={() => setIsMobileMenuOpen(false)} onLogout={() => pushToast('Đăng xuất', 'Phiên làm việc sẽ được kết thúc sau khi tích hợp API xác thực.', 'info')} /></div>
        </div>
      ) : null}

      <section className="flex-1 p-0">
        <Topbar
          breadcrumbTitle={selectedPageKey === 'dashboard' ? 'Tổng quan' : getPageTitle(selectedPageKey)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenNotification={() => pushToast('Thông báo mới', 'Bạn có 3 yêu cầu ký duyệt cần xử lý.', 'info')}
          onLogout={() => pushToast('Đăng xuất', 'Phiên làm việc sẽ được kết thúc sau khi tích hợp API xác thực.', 'info')}
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

