'use client';

// =============================================================================
// RequestDrawer cho System Admin Page
// Clone from: FE/app/components/regulatoryBodies/tailwind/RequestDrawer.tsx
// Mục đích: Drawer trượt từ phải hiển thị chi tiết yêu cầu giải ngân với 4 tabs
// =============================================================================

import { useState } from 'react';
import type { DrawerTabKey } from './types';
import IpfsEvidencePreviewCard from '../../common/IpfsEvidencePreviewCard';

type RequestDrawerProps = {
  selectedUrgentRequestItem: import('./types').UrgentRequestItem | null;
  selectedDrawerTabKey: DrawerTabKey;
  onClose: () => void;
  onChangeTab: (drawerTabKey: DrawerTabKey) => void;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
};

const TABS: { key: DrawerTabKey; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'evidence', label: 'Chứng từ' },
  { key: 'signature', label: 'Chữ ký' },
  { key: 'history', label: 'Lịch sử' },
];

export default function RequestDrawer({
  selectedUrgentRequestItem,
  selectedDrawerTabKey,
  onClose,
  onChangeTab,
  onApprove,
  onReject,
}: RequestDrawerProps) {
  

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!selectedUrgentRequestItem) return null;

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Đóng drawer"
      />

      {/* Drawer panel */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-emerald-900/15 px-6 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900">Chi tiết yêu cầu giải ngân</p>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {selectedUrgentRequestItem.id} · {selectedUrgentRequestItem.projectName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-emerald-900/15 px-2.5 py-1 text-sm text-slate-700 transition hover:bg-slate-50"
            aria-label="Đóng drawer"
          >
            ?
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-emerald-900/15 bg-slate-50 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChangeTab(tab.key)}
              className={`relative px-3.5 py-3 text-[12px] font-medium tracking-[0.01em] transition ${selectedDrawerTabKey === tab.key ? 'text-[#0A5C50]' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {tab.label}
              {selectedDrawerTabKey === tab.key ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-500" />
              ) : null}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedDrawerTabKey === 'overview' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Tổ chức</p>
                <p className="mt-1 text-sm font-semibold">{selectedUrgentRequestItem.organizationName}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Số tiền</p>
                <p className="mt-1 font-mono text-base font-semibold text-[#0A5C50]">
                  {selectedUrgentRequestItem.amountText}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Mục đích sử dụng tiền</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {selectedUrgentRequestItem.usagePurpose || 'Chưa có thông tin mục đích sử dụng tiền.'}
                </p>
              </div>
            </div>
          )}

          {selectedDrawerTabKey === 'evidence' && (
            <div className="space-y-4">
            {selectedUrgentRequestItem.ipfsCid ? (
              <IpfsEvidencePreviewCard
                cid={selectedUrgentRequestItem.ipfsCid}
                fileName={selectedUrgentRequestItem.fileName}
                documentTypeLabel="Tài liệu minh chứng"
              />
            ) : (
              <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500 text-center">
                Không có Tài liệu minh chứng
              </div>
            )}
          </div>
          )}

          {selectedDrawerTabKey === 'signature' && (
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-200 p-3 text-sm">Bộ Y tế · Đã ký</div>
              <div className="rounded-lg border border-cyan-300 bg-cyan-50 p-3 text-sm">Bộ Tài chính · Chờ bạn ký</div>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">Ngân hàng liên k?t · Chữ ký</div>
            </div>
          )}

          {selectedDrawerTabKey === 'history' && (
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-200 p-3 text-sm">13:55:47 · Tạo yêu cầu giải ngân</div>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">14:12:02 · B? sung Chứng từ d?t 2</div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 border-t border-emerald-900/15 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={handleReject}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border-2 border-red-600 py-2 text-sm font-bold text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
          >
            Từ chối
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSubmitting}
            className="flex-[2] rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 py-2 text-sm font-bold text-white transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận ký duyệt'}
          </button>
        </div>
      </aside>
    </>
  );
}

