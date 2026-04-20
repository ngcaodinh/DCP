'use client';

// =============================================================================
// DisbursementStatusCard cho System Admin Page
// Clone from: FE/app/components/regulatoryBodies/tailwind/DisbursementStatusCard.tsx
// Mục đích: Thẻ hiển thị tỷ lệ hoàn thành giải ngân dưới dạng donut chart SVG multi-segment
// =============================================================================

type DisbursementStatusCardProps = {
  completedCount: number;
  pendingCount: number;
  totalCount: number;
};

export default function DisbursementStatusCard({
  completedCount,
  pendingCount,
  totalCount,
}: DisbursementStatusCardProps) {
  const completedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const processingPct = 20;
  const confirmPct = 100 - completedPct - processingPct;

  return (
    <div className="rounded-xl border border-emerald-900/15 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-800">Tình trạng Giải ngân</h3>
      <p className="mt-0.5 text-xs text-slate-500">Tỷ lệ hoàn thành</p>

      <div className="mt-4 flex flex-col items-center gap-4">
        {/* Multi-segment SVG donut chart */}
        <div className="relative h-[120px] w-[120px]">
          <svg viewBox="0 0 120 120" className="-rotate-90">
            {/* Background track */}
            <circle cx="60" cy="60" r="48" fill="none" stroke="#EAF1F8" strokeWidth="14" />
            {/* Completed segment (emerald) */}
            <circle cx="60" cy="60" r="48" fill="none" stroke="#0E9F6E" strokeWidth="14"
              strokeDasharray={`${completedPct * 3.02} 302`} strokeLinecap="round" />
            {/* Processing segment (cyan) */}
            <circle cx="60" cy="60" r="48" fill="none" stroke="#1AAE97" strokeWidth="14"
              strokeDasharray={`${processingPct * 3.02} 302`}
              strokeDashoffset={-(completedPct * 3.02)} strokeLinecap="round" />
            {/* Confirm segment (amber) */}
            <circle cx="60" cy="60" r="48" fill="none" stroke="#F59E0B" strokeWidth="14"
              strokeDasharray={`${confirmPct * 3.02} 302`}
              strokeDashoffset={-(completedPct + processingPct) * 3.02} strokeLinecap="round" />
          </svg>
          {/* Center text — HTML <p> thay vì SVG <text> */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-mono text-xl font-semibold text-slate-900">{completedPct}%</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Hoàn tất</p>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-1.5 text-xs">
          <p className="flex items-center justify-between">
            <span className="text-slate-600">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              Đã hoàn tất
            </span>
            <span className="font-mono text-slate-800">{completedPct}%</span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-slate-600">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500" />
              Đang xử lý
            </span>
            <span className="font-mono text-slate-800">{processingPct}%</span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-slate-600">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
              Chờ xác nhận
            </span>
            <span className="font-mono text-slate-800">{confirmPct}%</span>
          </p>
        </div>
      </div>
    </div>
  );
}
