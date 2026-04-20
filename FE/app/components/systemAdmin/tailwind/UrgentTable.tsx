'use client';

// =============================================================================
// UrgentTable cho System Admin Page
// Clone from: FE/app/components/regulatoryBodies/tailwind/UrgentTable.tsx
// Mục đích: Bảng hiển thị các yêu cầu cần xử lý gấp với signature checkmark progress
// =============================================================================

import { getDeadlineClass } from './helpers';
import type { UrgentRequestItem } from './types';

type UrgentTableProps = {
  urgentRequestItemList: UrgentRequestItem[];
  onOpenDrawer?: (requestId: string) => void;
};

/** Component bảng yêu cầu khẩn cấp — hiển thị deadline và signature progress. */
export default function UrgentTable({ urgentRequestItemList, onOpenDrawer }: UrgentTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
      <div className="border-b border-emerald-900/15 px-6 py-4">
        <h3 className="text-sm font-bold text-slate-800">Yêu cầu chờ xử lý</h3>
        <p className="mt-0.5 text-xs text-slate-500">Các yêu cầu cần được xử lý sớm</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Mã yêu cầu</th>
              <th className="px-5 py-2.5 font-semibold">Dự án</th>
              <th className="px-5 py-2.5 font-semibold">Tổ chức</th>
              <th className="px-5 py-2.5 font-semibold">Số tiền</th>
              <th className="px-5 py-2.5 font-semibold">Chữ ký</th>
              <th className="px-5 py-2.5 font-semibold">Thời hạn</th>
              <th className="px-5 py-2.5 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {urgentRequestItemList.map((item) => (
              <tr
                key={item.id}
                className="border-t border-slate-100 text-xs transition-colors hover:bg-slate-50/80"
              >
                <td className="px-5 py-3 font-mono text-[12px] font-semibold text-cyan-700">{item.id}</td>
                <td className="px-5 py-3 text-[13px] font-semibold leading-5 text-slate-900">{item.projectName}</td>
                <td className="px-5 py-3 text-[12px] leading-4 text-slate-500">{item.organizationName}</td>
                <td className="px-5 py-3 font-mono text-[13px] font-semibold text-slate-800">{item.amountText}</td>
                <td className="px-5 py-3">
                  <SignatureChecklist state={item.signatureState} />
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${getDeadlineClass(item.deadlineLevel)}`}>
                    {item.deadlineText}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenDrawer?.(item.id)}
                    className="rounded-md bg-[#1AAE97] px-3 py-1.5 text-[11px] font-bold leading-none text-[#0A5C50] transition hover:bg-[#129b86] active:translate-y-px"
                  >
                    Xem &amp; Ký
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// SIGNATURE CHECKLIST — với checkmark icons thay vì dot đơn thuần
// =============================================================================

function SignatureChecklist({ state }: { state: '1/3' | '2/3' }) {
  const signed = state === '2/3' ? 2 : 1;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((d) => (
        <div
          key={d}
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${d <= signed
              ? d === 2
                ? 'bg-cyan-500 text-white'
                : 'bg-[#0E7C6B] text-white'
              : 'border border-slate-200 bg-white text-slate-400'
            }`}
        >
          {d <= signed ? '✓' : d}
        </div>
      ))}
      <span className="ml-1.5 font-mono text-[10px] text-slate-500">{state}</span>
    </div>
  );
}
