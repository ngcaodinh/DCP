'use client';

import { useEffect, useRef, useState } from 'react';

const honeycombOverlayDataUri =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='52'%3E%3Cpolygon points='30,2 58,16 58,44 30,58 2,44 2,16' fill='none' stroke='rgba(255,255,255,0.07)' stroke-width='1.5'/%3E%3C/svg%3E";

/**
 * Hàm hiển thị lớp phủ tổ ong cho panel nền xanh.
 * Mục đích: tạo pattern phủ kín panel theo kích thước tile chuẩn.
 */
const HoneycombOverlay = () => (
  <div
    className="pointer-events-none absolute inset-0 z-[1]"
    style={{
      backgroundImage: `url("${honeycombOverlayDataUri}")`,
      backgroundSize: '60px 52px',
      backgroundPosition: '0 0',
      backgroundRepeat: 'repeat',
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      outline: '1px dashed rgba(255, 255, 255, 0.25)',
      mixBlendMode: 'screen',
      opacity: 1,
    }}
  />
);


/**
 * Hàm trang đăng nhập.
 * Mục đích: hiển thị giao diện đăng nhập theo mẫu DCP.
 */
export default function LoginPage() {
  const googleButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false);
  const [isProgressLoading, setIsProgressLoading] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);

  /**
   * Hàm tạo dữ liệu thống kê minh bạch cho khối nội dung bên trái.
   */
  const trustCardItems = [
    { icon: '⛓', title: '98,341 giao dịch', label: 'đã ghi nhận trên Blockchain' },
    { icon: '🔒', title: 'Smart Contract bảo vệ', label: '100% giải ngân qua đa chữ ký' },
    { icon: '👥', title: '15,842 nhà hảo tâm', label: 'đang tin dùng DCP' },
  ];

  /**
   * Hàm focus nút Google để đồng bộ cảm giác theo mẫu.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => googleButtonRef.current?.focus(), 600);
    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Hàm đổi trạng thái hộp thông tin.
   */
  const handleToggleInfoBox = () => {
    setIsInfoCollapsed(previousValue => !previousValue);
  };

  /**
   * Hàm bật trạng thái loading của thanh tiến trình.
   */
  const triggerProgressBar = () => {
    setIsProgressLoading(true);
    window.setTimeout(() => setIsProgressLoading(false), 1800);
  };

  /**
   * Hàm xử lý đăng nhập bằng mạng xã hội.
   */
  const handleSocialLogin = () => {
    triggerProgressBar();
    window.setTimeout(() => {
      setIsSuccessVisible(true);
    }, 1800);
  };

  return (
    <main className="grid min-h-screen grid-cols-1 overflow-hidden bg-[#f8fafb] text-[#0d1117] lg:h-screen lg:grid-cols-2">
      <div
        className={`fixed left-0 right-0 top-0 z-[999] h-[3px] origin-left bg-gradient-to-r from-[#0e7c6b] to-[#1aae97] transition-transform ${isProgressLoading ? 'scale-x-100 duration-[1800ms]' : 'scale-x-0 duration-300'
          }`}
      />
      <div
        className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#f8fafb]/95 px-6 text-center backdrop-blur ${isSuccessVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          } transition-opacity duration-300`}
      >
        <div
          className={`mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[#10b981] bg-[#d1fae5] transition-transform duration-300 ${isSuccessVisible ? 'scale-100' : 'scale-0'
            }`}
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="text-[22px] font-extrabold text-[#0d1117]">Đăng nhập thành công!</div>
        <div className="mt-2 text-sm text-[#9ca3af]">Đang tải dashboard của bạn...</div>
      </div>

      <aside className="relative hidden flex-col overflow-hidden bg-gradient-to-br from-[#0e7c6b] via-[#0a5c50] to-[#073d36] px-12 py-10 text-white lg:flex">
        <HoneycombOverlay />
        <div className="absolute -right-28 -top-28 z-0 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(26,174,151,0.25)_0%,transparent_70%)]" />
        <div className="absolute -bottom-24 -left-24 z-0 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0%,transparent_70%)]" />

        <a href="/" className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/30 bg-white/15 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-white">
              <path d="M12 21.7C5.8 17.5 2 13.2 2 9a6 6 0 0112 0 6 6 0 0112 0c0 4.2-3.8 8.5-10 12.7z" />
            </svg>
          </div>
          <div>
            <div className="text-[19px] font-extrabold tracking-[-0.3px]">DCP</div>
            <div className="text-[10.5px] leading-none text-white/55">Decentralized Charity Platform</div>
          </div>
        </a>

        <div className="relative z-10 flex flex-1 flex-col justify-center">
          <div className="mb-7 flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-[26px]">
            ⛓
          </div>
          <div className="text-[clamp(20px,2.2vw,26px)] font-bold leading-[1.35] tracking-[-0.3px]">
            Mỗi đồng quyên góp đều để lại <span className="text-[#f59e0b]">dấu vết</span> trên Blockchain.
          </div>
          <div className="mt-4 text-[13.5px] italic text-white/55">— Không thể xóa. Không thể giả mạo. Mãi minh bạch.</div>
        </div>

        <div className="relative z-10 space-y-2.5">
          {trustCardItems.map(item => (
            <div
              key={item.title}
              className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/10 px-[18px] py-[13px] transition hover:bg-white/15"
            >
              <div className="text-xl">{item.icon}</div>
              <div>
                <div className="text-[14.5px] font-semibold leading-tight text-white">{item.title}</div>
                <div className="text-[11.5px] text-white/55">{item.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 mt-6 flex items-center gap-2 text-[11px] text-white/40">
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white/40">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Được bảo mật bởi ERC-4337 Account Abstraction
        </div>
      </aside>

      <section className="flex flex-col overflow-y-visible bg-[#f8fafb] lg:overflow-y-auto">
        <a href="/" className="flex items-center justify-center gap-3 px-6 py-5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0e7c6b]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
              <path d="M12 21.7C5.8 17.5 2 13.2 2 9a6 6 0 0112 0 6 6 0 0112 0c0 4.2-3.8 8.5-10 12.7z" />
            </svg>
          </div>
          <span className="text-lg font-extrabold text-[#0d1117]">DCP</span>
        </a>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 px-12 pt-3 pb-2 text-sm text-[#4b5563] max-[900px]:mt-4 max-[900px]:px-6 max-[900px]:pt-2.5 max-[900px]:pb-2 max-[480px]:mt-3 max-[480px]:px-4 max-[480px]:pt-2 max-[480px]:pb-1.5 lg:mt-0 lg:pt-0.5 lg:pb-0.5">
          <a href="/" className="flex items-center gap-2 text-xs text-[#9ca3af] transition hover:text-[#0e7c6b]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Về trang chủ
          </a>
          <div>
            Chưa có tài khoản? <a href="#" className="font-semibold text-[#0e7c6b]">Đăng ký →</a>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-14 pb-10 pt-6 max-[900px]:px-7 max-[480px]:max-w-full max-[480px]:px-5 max-[480px]:pt-4 max-[480px]:pb-8">
          <div className="mb-2 text-sm font-semibold text-[#0e7c6b]">Chào mừng trở lại 👋</div>
          <h1 className="text-[28px] font-extrabold text-[#0d1117]">Đăng nhập vào DCP</h1>
          <p className="mt-2 text-sm text-[#9ca3af]">Tiếp tục hành trình từ thiện minh bạch của bạn</p>

          <div className="mt-6">
            <button
              ref={googleButtonRef}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#e5e7eb] bg-white text-sm font-semibold text-[#0d1117] transition hover:-translate-y-0.5 hover:border-[#0e7c6b] hover:shadow-[0_2px_14px_rgba(14,124,107,0.12)]"
              type="button"
              onClick={handleSocialLogin}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Tiếp tục với Google</span>
            </button>
          </div>

          <div className="mt-6 rounded-xl border-l-[3px] border-[#0e7c6b] bg-[#e6f7f4] px-4 py-3 text-sm text-[#4b5563]">
            <button
              type="button"
              onClick={handleToggleInfoBox}
              className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-[#0e7c6b]"
            >
              <span className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Tại sao không cần seed phrase?
              </span>
              <svg
                className={`h-4 w-4 transition ${isInfoCollapsed ? '-rotate-90' : 'rotate-0'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {!isInfoCollapsed && (
              <p className="mt-3 text-xs leading-relaxed text-[#4b5563]">
                DCP sử dụng công nghệ <strong className="font-semibold text-[#0e7c6b]">Account Abstraction (ERC-4337)</strong> — tài khoản
                của bạn được tạo tự động từ Google. An toàn như ngân hàng, không cần ghi nhớ hay lưu trữ khóa bí mật.
                Mọi giao dịch vẫn được ghi nhận đầy đủ trên Blockchain.
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-[#e5e7eb] pt-4 text-center text-xs text-[#9ca3af]">
            Bằng cách đăng nhập, bạn đồng ý với <a href="#" className="font-medium text-[#0e7c6b]">Điều khoản sử dụng</a> và{' '}
            <a href="#" className="font-medium text-[#0e7c6b]">Chính sách bảo mật</a> của DCP.
          </div>
        </div>
      </section>
    </main>
  );
}

