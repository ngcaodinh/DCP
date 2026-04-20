'use client';

// =============================================================================
// AuditTable cho System Admin Page
// Clone from: FE/app/components/regulatoryBodies/tailwind/AuditTable.tsx
// Mục đích: Bảng log kiểm toán với search, filter, phân trang, export
// =============================================================================

import { useState } from 'react';
import type { AuditLogItem } from './types';

type AuditTableProps = {
  auditLogItemList: AuditLogItem[];
};

export default function AuditTable({ auditLogItemList }: AuditTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModule, setFilterModule] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Lấy danh sách module/action duy nhất
  const modules = ['all', ...Array.from(new Set(auditLogItemList.map((l) => l.module)))];
  const actions = ['all', ...Array.from(new Set(auditLogItemList.map((l) => l.action)))];

  // Lọc theo search + filter
  const filtered = auditLogItemList.filter((log) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      log.actor.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.ipAddress.includes(q);
    const matchesModule = filterModule === 'all' || log.module === filterModule;
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    return matchesSearch && matchesModule && matchesAction;
  });

  // Phân trang
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = () => {
    const csv = [
      ['ID', 'Thời gian', 'Hành động', 'Module', 'Actor', 'IP', 'Chi tiết'].join(','),
      ...filtered.map((l) =>
        [l.id, l.timestamp, l.action, l.module, l.actor, l.ipAddress, `"${l.details}"`].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Nhật ký kiểm toán</h3>
          <p className="mt-0.5 text-xs text-slate-500">{filtered.length} bản ghi</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-900/15 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-emerald-50"
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <div className="relative flex-1 min-w-40">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="Tìm actor, chi tiết..."
            className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-[#1AAE97] focus:outline-none focus:ring-1 focus:ring-[#1AAE97]/30"
          />
        </div>
        <select
          value={filterModule}
          onChange={(e) => { setFilterModule(e.target.value); setCurrentPage(1); }}
          className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-[#1AAE97] focus:outline-none"
        >
          {modules.map((m) => (
            <option key={m} value={m}>{m === 'all' ? 'Tất cả Module' : m}</option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
          className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-[#1AAE97] focus:outline-none"
        >
          {actions.map((a) => (
            <option key={a} value={a}>{a === 'all' ? 'Tất cả Hành động' : a}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Thời gian</th>
              <th className="px-5 py-2.5 font-semibold">Hành động</th>
              <th className="px-5 py-2.5 font-semibold">Module</th>
              <th className="px-5 py-2.5 font-semibold">Actor</th>
              <th className="px-5 py-2.5 font-semibold">IP</th>
              <th className="px-5 py-2.5 font-semibold">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-xs text-slate-500">
                  Không có bản ghi nào phù hợp
                </td>
              </tr>
            ) : (
              paginated.map((log, idx) => (
                <tr
                  key={log.id}
                  className={`border-t border-slate-100 text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                >
                  <td className="px-5 py-2.5 font-mono text-[10px] text-slate-500">{log.timestamp}</td>
                  <td className="px-5 py-2.5">
                    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-slate-700">{log.module}</td>
                  <td className="px-5 py-2.5 font-semibold text-slate-800">{log.actor}</td>
                  <td className="px-5 py-2.5 font-mono text-[10px] text-slate-500">{log.ipAddress}</td>
                  <td className="px-5 py-2.5 text-slate-600">{log.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <span className="text-xs text-slate-500">
            Trang {currentPage}/{totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setCurrentPage(p)}
                className={`h-7 min-w-7 rounded-md border text-xs font-medium transition ${p === currentPage ? 'border-[#0E7C6B]/30 bg-[#0E7C6B] border border-[#0E7C6B]/30 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}
