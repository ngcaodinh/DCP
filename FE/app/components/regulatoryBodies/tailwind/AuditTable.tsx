import { getShortHash, getStatusBadgeClass } from './helpers';
import type { AuditLogItem } from './types';

type AuditTableProps = {
  auditLogItemList: AuditLogItem[];
};

/** Hàm component AuditTable để hiển thị nhật ký ký duyệt đầy đủ gồm lọc, bảng và phân trang theo giao diện mẫu. */
export default function AuditTable({ auditLogItemList }: AuditTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
      <div className="border-b border-emerald-900/15 px-6 py-3.5">
        <h2 className="text-[14px] font-bold leading-5 text-slate-900">Nhật ký ký duyệt gần nhất</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-emerald-900/15 bg-slate-50 px-6 py-3">
        <div className="relative w-full md:w-[300px]">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input
            placeholder="Tìm mã yêu cầu / Tx hash"
            className="h-8 w-full rounded-lg border border-emerald-900/15 bg-white pl-7 pr-3 text-[12px] outline-none transition focus:border-cyan-500"
          />
        </div>
        <select className="h-8 min-w-[156px] rounded-lg border border-emerald-900/15 bg-white px-3 text-[12px] text-slate-700 outline-none transition focus:border-cyan-500">
          <option>Tất cả trạng thái</option>
          <option>Đã ký</option>
          <option>Chờ ký</option>
          <option>Bị từ chối</option>
        </select>
        <button
          type="button"
          className="ml-auto inline-flex h-8 items-center rounded-lg border border-emerald-900/15 bg-white px-3.5 text-[12px] font-semibold text-slate-700 transition hover:bg-[#0E7C6B] hover:text-white"
        >
          Xuất báo cáo
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500">
            <tr>
              {['Tx hash', 'Yêu cầu', 'Số tiền', 'Trạng thái', 'Đơn vị thao tác', 'Thời gian'].map(headerLabel => (
                <th key={headerLabel} className="px-6 py-2.5 font-semibold">{headerLabel}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {auditLogItemList.map(auditLogItem => (
              <tr key={auditLogItem.transactionId} className="border-t border-slate-100 text-sm transition hover:bg-slate-50/80">
                <td className="px-6 py-3 font-mono text-[12px] leading-4 text-cyan-700">{getShortHash(auditLogItem.transactionId)}</td>
                <td className="px-6 py-3 text-[13px] leading-4 text-slate-800">{auditLogItem.requestId}</td>
                <td className="px-6 py-3 font-mono text-[13px] font-semibold leading-4 text-slate-800">{auditLogItem.amountText}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${getStatusBadgeClass(auditLogItem.statusText)}`}>
                    {auditLogItem.statusText}
                  </span>
                </td>
                <td className="px-6 py-3 text-[13px] leading-4 text-slate-700">{auditLogItem.actorText}</td>
                <td className="px-6 py-3 font-mono text-[12px] leading-4 text-slate-600">{auditLogItem.timeText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-900/15 bg-slate-50 px-6 py-2.5 text-[12px] text-slate-600">
        <p>Hiển thị 1-4 trên 24 bản ghi</p>
        <div className="flex items-center gap-1.5">
          <button type="button" className="inline-flex h-7 items-center rounded-md border border-emerald-900/15 bg-white px-2.5 leading-none text-slate-700 transition hover:bg-slate-100">‹</button>
          <button type="button" className="inline-flex h-7 items-center rounded-md border border-[#0E7C6B]/30 bg-[#0E7C6B] px-2.5 leading-none text-white">1</button>
          <button type="button" className="inline-flex h-7 items-center rounded-md border border-emerald-900/15 bg-white px-2.5 leading-none text-slate-700 transition hover:bg-slate-100">2</button>
          <button type="button" className="inline-flex h-7 items-center rounded-md border border-emerald-900/15 bg-white px-2.5 leading-none text-slate-700 transition hover:bg-slate-100">3</button>
          <button type="button" className="inline-flex h-7 items-center rounded-md border border-emerald-900/15 bg-white px-2.5 leading-none text-slate-700 transition hover:bg-slate-100">›</button>
        </div>
      </div>
    </div>
  );
}

