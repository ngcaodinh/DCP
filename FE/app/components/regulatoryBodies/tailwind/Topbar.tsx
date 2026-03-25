type TopbarProps = {
  breadcrumbTitle: string;
  onOpenMobileMenu: () => void;
  onOpenNotification: () => void;
  onLogout: () => void;
};

/** Hàm component Topbar để hiển thị breadcrumb, thao tác nhanh và khối người dùng bám sát giao diện mẫu. */
export default function Topbar({ breadcrumbTitle, onOpenMobileMenu, onOpenNotification, onLogout }: TopbarProps) {
  return (
    <header className="sticky inset-x-0 top-0 z-20 m-0 flex h-16 items-center justify-between border-b border-emerald-900/15 bg-white px-4 lg:px-7">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-900/15 text-slate-700 transition hover:bg-slate-50 lg:hidden"
          aria-label="Mở menu điều hướng"
        >
          ☰
        </button>
        <p className="text-[12.5px] font-medium leading-none text-slate-500">
          <span>DCP</span>
          <span className="mx-1.5 inline-block text-slate-400">›</span>
          <span className="font-semibold text-slate-900">{breadcrumbTitle}</span>
        </p>
      </div>

      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onOpenNotification}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-900/15 text-slate-700 transition hover:bg-slate-50"
          aria-label="Mở thông báo"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M8 2a5 5 0 00-5 5v1L2 10v1h12v-1l-1-2V7a5 5 0 00-5-5zm0 13a2 2 0 002-2H6a2 2 0 002 2z" />
          </svg>
          <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-red-600 text-[9px] font-bold text-white">5</span>
        </button>

        <div className="hidden h-6 w-px bg-emerald-900/15 sm:block" />

        <div className="hidden items-center gap-2 sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-400 text-[10px] font-bold text-white">BTC</div>
          <div className="leading-[1.15]">
            <p className="text-[12px] font-semibold text-slate-900">Bộ Tài chính</p>
            <p className="mt-0.5 text-[10.5px] text-slate-500">Vụ Giám sát &amp; Kiểm toán</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="ml-1 inline-flex h-9 items-center gap-1.5 self-center rounded-lg border border-emerald-900/15 px-3 text-xs font-semibold text-slate-700 transition hover:bg-[#0E7C6B] hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
              <path d="M6 2h4v2H6zm0 10h4v2H6zM2 5h2v6H2zm10 0h2v6h-2zM5 4h6v1H5zm0 7h6v1H5z" />
            </svg>
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}

