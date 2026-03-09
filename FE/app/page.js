/**
 * Hàm trang chủ mặc định.
 * Mục đích: xác nhận FE khởi tạo thành công và sẵn sàng phát triển.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-10">
      <h1 className="text-3xl font-bold">DCP Frontend is ready</h1>
      <p className="mt-4 text-slate-300">
        Next.js 14 + React 18 + TailwindCSS + Ethers v6 + React Query + Zustand
      </p>
    </main>
  );
}

