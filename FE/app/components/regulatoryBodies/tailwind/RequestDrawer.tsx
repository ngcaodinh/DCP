import type { DrawerTabKey, UrgentRequestItem } from './types';
import IpfsEvidencePreviewCard from '../../common/IpfsEvidencePreviewCard';

type RequestDrawerProps = {
  selectedUrgentRequestItem: UrgentRequestItem | null;
  selectedDrawerTabKey: DrawerTabKey;
  onClose: () => void;
  onChangeTab: (drawerTabKey: DrawerTabKey) => void;
  onApprove: () => void;
  onReject: () => void;
};

/** Hàm ánh xạ nhãn tab sang tiếng Việt để đồng nhất ngôn ngữ hiển thị trong drawer. */
function getDrawerTabLabel(drawerTabKey: DrawerTabKey): string {
  if (drawerTabKey === 'overview') return 'Tổng quan';
  if (drawerTabKey === 'evidence') return 'Chứng từ';
  if (drawerTabKey === 'signature') return 'Chữ ký';
  return 'Lịch sử';
}

/** Hàm component RequestDrawer để hiển thị chi tiết yêu cầu và các tab thông tin nâng cao. */
export default function RequestDrawer({
  selectedUrgentRequestItem,
  selectedDrawerTabKey,
  onClose,
  onChangeTab,
  onApprove,
  onReject
}: RequestDrawerProps) {
  if (!selectedUrgentRequestItem) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} aria-label="Đóng drawer" />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-emerald-900/15 px-6 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900">Chi tiết yêu cầu giải ngân</p>
            <p className="mt-1 text-xs text-slate-500">{selectedUrgentRequestItem.id} · {selectedUrgentRequestItem.projectName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-emerald-900/15 px-2.5 py-1 text-sm">✕</button>
        </div>

        <div className="flex border-b border-emerald-900/15 bg-slate-50 px-3">
          {(['overview', 'evidence', 'signature', 'history'] as DrawerTabKey[]).map(drawerTabKey => (
            <button
              key={drawerTabKey}
              type="button"
              onClick={() => onChangeTab(drawerTabKey)}
              className={`relative px-3.5 py-3 text-[12px] font-medium tracking-[0.01em] transition ${selectedDrawerTabKey === drawerTabKey ? 'text-[#0A5C50]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {getDrawerTabLabel(drawerTabKey)}
              {selectedDrawerTabKey === drawerTabKey ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-500" /> : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {selectedDrawerTabKey === 'overview' ? <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Tổ chức</p><p className="mt-1 text-sm font-semibold">{selectedUrgentRequestItem.organizationName}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Số tiền</p><p className="mt-1 font-mono text-base font-semibold text-[#0A5C50]">{selectedUrgentRequestItem.amountText}</p></div></div> : null}
          {selectedDrawerTabKey === 'evidence' ? <div className="space-y-4">
            {selectedUrgentRequestItem.ipfsCid ? (
              <IpfsEvidencePreviewCard
                cid={selectedUrgentRequestItem.ipfsCid}
                fileName={selectedUrgentRequestItem.fileName}
                documentTypeLabel="Tài liệu minh chứng"
              />
            ) : (
              <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500 text-center">
                Không có tài liệu minh chứng
              </div>
            )}
          </div> : null}
          {selectedDrawerTabKey === 'signature' ? <div className="space-y-2"><div className="rounded-lg border border-slate-200 p-3 text-sm">Bộ Y tế · Đã ký</div><div className="rounded-lg border border-cyan-300 bg-cyan-50 p-3 text-sm">Bộ Tài chính · Chờ bạn ký</div><div className="rounded-lg border border-slate-200 p-3 text-sm">Ngân hàng liên kết · Chờ ký</div></div> : null}
          {selectedDrawerTabKey === 'history' ? <div className="space-y-2"><div className="rounded-lg border border-slate-200 p-3 text-sm">13:55:47 · Tạo yêu cầu giải ngân</div><div className="rounded-lg border border-slate-200 p-3 text-sm">14:12:02 · Bổ sung chứng từ đợt 2</div></div> : null}
        </div>

        <div className="flex gap-3 border-t border-emerald-900/15 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onReject} className="flex-1 rounded-lg border-2 border-red-600 py-2 text-sm font-bold text-red-600 transition hover:bg-red-600 hover:text-white">Từ chối</button>
          <button type="button" onClick={onApprove} className="flex-[2] rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 py-2 text-sm font-bold text-white">Xác nhận ký duyệt</button>
        </div>
      </aside>
    </>
  );
}


