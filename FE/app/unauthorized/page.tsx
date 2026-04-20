'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      {/* Icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
        <svg
          className="text-red-400"
          width="40"
          height="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold text-slate-900">Không có quyền truy cập</h1>

      {/* Description */}
      <p className="mt-3 max-w-sm text-center text-sm text-slate-500">
        Bạn không có quyền truy cập trang này. Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là lỗi.
      </p>

      {/* Actions */}
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Quay lại
        </button>
        <Link
          href="/"
          className="rounded-lg bg-[#0E7C6B] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d6b5c]"
        >
          Về trang chủ
        </Link>
      </div>

      {/* Code reference */}
      <p className="mt-10 font-mono text-xs text-slate-300">
        DCP — Unauthorized Access (403)
      </p>
    </div>
  );
}
