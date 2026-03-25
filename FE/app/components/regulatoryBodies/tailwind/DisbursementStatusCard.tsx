/** Hàm component DisbursementStatusCard để mô phỏng donut chart và chú thích giống giao diện mẫu. */
export default function DisbursementStatusCard() {
  return (
    <div className="rounded-xl border border-emerald-900/15 bg-white p-5">
      <h2 className="text-sm font-bold">Tình trạng giải ngân tháng 3</h2>
      <div className="mt-4 flex flex-col items-center gap-4">
        <div className="relative h-[120px] w-[120px]">
          <svg viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#EAF1F8" strokeWidth="14" />
            <circle cx="60" cy="60" r="48" fill="none" stroke="#0E9F6E" strokeWidth="14" strokeDasharray="217 302" strokeLinecap="round" />
            <circle cx="60" cy="60" r="48" fill="none" stroke="#1AAE97" strokeWidth="14" strokeDasharray="60 302" strokeDashoffset="-220" strokeLinecap="round" />
            <circle cx="60" cy="60" r="48" fill="none" stroke="#F59E0B" strokeWidth="14" strokeDasharray="25 302" strokeDashoffset="-282" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-mono text-xl font-semibold text-slate-900">72%</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Hoàn tất</p>
          </div>
        </div>

        <div className="w-full space-y-1.5 text-xs">
          <p className="flex items-center justify-between"><span className="text-slate-600"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />Đã hoàn tất</span><span className="font-mono text-slate-800">72%</span></p>
          <p className="flex items-center justify-between"><span className="text-slate-600"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500" />Đang xử lý</span><span className="font-mono text-slate-800">20%</span></p>
          <p className="flex items-center justify-between"><span className="text-slate-600"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />Chờ xác nhận</span><span className="font-mono text-slate-800">8%</span></p>
        </div>
      </div>
    </div>
  );
}

