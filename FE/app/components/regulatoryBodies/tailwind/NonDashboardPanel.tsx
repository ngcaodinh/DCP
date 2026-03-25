import { getPageTitle } from './helpers';
import type { PageKey } from './types';

type NonDashboardPanelProps = {
  selectedPageKey: PageKey;
};

/** Hàm component NonDashboardPanel để hiển thị nội dung thay thế có cấu trúc rõ ràng cho các tab ngoài tổng quan. */
export default function NonDashboardPanel({ selectedPageKey }: NonDashboardPanelProps) {
  const sectionTitle = getPageTitle(selectedPageKey);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-900/15 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">{sectionTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">Nội dung đang được đồng bộ theo phong cách giao diện tổng quan để nhất quán trải nghiệm người dùng.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
        <div className="border-b border-emerald-900/15 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Danh sách xử lý gần nhất</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Mã nghiệp vụ</th>
                <th className="px-4 py-2.5">Đối tượng</th>
                <th className="px-4 py-2.5">Trạng thái</th>
                <th className="px-4 py-2.5">Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 text-sm hover:bg-slate-50"><td className="px-4 py-3 font-mono text-xs text-cyan-700">OP-2026-018</td><td className="px-4 py-3">Quỹ Trẻ Em Việt Xanh</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Đã xử lý</span></td><td className="px-4 py-3 text-xs text-slate-600">14:26:12</td></tr>
              <tr className="border-t border-slate-100 text-sm hover:bg-slate-50"><td className="px-4 py-3 font-mono text-xs text-cyan-700">OP-2026-017</td><td className="px-4 py-3">Tổ chức Hành Động Xanh</td><td className="px-4 py-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Chờ xác thực</span></td><td className="px-4 py-3 text-xs text-slate-600">13:55:47</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

