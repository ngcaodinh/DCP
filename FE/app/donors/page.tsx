'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildApiUrl, fetchApi } from '../utils/apiClient';

type DonorListItem = { fullName: string; gmail: string; donatedAmount: number; donatedAt: string; transactionHash: string };
type DonationCampaignDetail = { projectId: string; name: string };
type DonorPaginationResponse = { items: DonorListItem[]; totalItems: number; totalPages: number; currentPage: number; pageSize: number };

const pageSizeOptionList = [25, 50, 75] as const;
/** Hàm định dạng số tiền theo chuẩn Việt Nam. Mục đích: hiển thị số tiền quyên góp rõ ràng, dễ đọc. */
const formatCurrencyVnd = (amountValue: number): string => `${new Intl.NumberFormat('vi-VN').format(amountValue)} Token`;
/** Hàm định dạng ngày giờ. Mục đích: hiển thị mốc thời gian dễ hiểu cho người dùng. */
const formatDateTime = (dateTimeValue: string): string => {
  const parsedDateTime = new Date(dateTimeValue);
  if (Number.isNaN(parsedDateTime.getTime())) return 'Không xác định';
  return parsedDateTime.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
/** Hàm rút gọn transaction hash. Mục đích: giữ giao diện gọn trên mobile. */
const shortenTransactionHash = (transactionHashValue: string): string => (transactionHashValue.length <= 16 ? transactionHashValue : `${transactionHashValue.slice(0, 10)}...${transactionHashValue.slice(-8)}`);
/** Hàm tạo link explorer cho transaction hash. Mục đích: mở block explorer khi hệ thống có cấu hình URL. */
const buildTransactionExplorerUrl = (transactionHashValue: string): string => {
  const blockchainExplorerTxBaseUrl = String(process.env.NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_TX_BASE_URL || '').trim();
  return blockchainExplorerTxBaseUrl ? `${blockchainExplorerTxBaseUrl.replace(/\/$/, '')}/${transactionHashValue}` : '';
};

export default function DonorsPage() {
  const searchParams = useSearchParams();
  const selectedProjectId = String(searchParams.get('projectId') || '').trim();
  const [projectName, setProjectName] = useState('Dự án');
  const [donorList, setDonorList] = useState<DonorListItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPageSize, setSelectedPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [pageErrorMessage, setPageErrorMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [copiedTransactionHash, setCopiedTransactionHash] = useState('');

  useEffect(() => setCurrentPage(1), [selectedProjectId]);

  useEffect(() => {
    /** Hàm tải dữ liệu trang donors theo server-side pagination. Mục đích: gọi API theo projectId + page + limit do người dùng chọn. */
    const loadDonorPageData = async () => {
      if (!selectedProjectId) {
        setPageErrorMessage('Thiếu thông tin dự án. Vui lòng quay lại trang chủ và chọn lại dự án.');
        setIsPageLoading(false);
        return;
      }

      setIsPageLoading(true);
      setPageErrorMessage('');

      try {
        const [campaignResponse, donorResponse] = await Promise.all([
          fetchApi<DonationCampaignDetail | null>(buildApiUrl(`/donations/campaigns/${encodeURIComponent(selectedProjectId)}`), { method: 'GET', cache: 'no-store' }),
          fetchApi<DonorPaginationResponse>(
            buildApiUrl(`/donations/donors?projectId=${encodeURIComponent(selectedProjectId)}&page=${currentPage}&limit=${selectedPageSize}`),
            { method: 'GET', cache: 'no-store' }
          )
        ]);

        if (!campaignResponse.data) {
          setPageErrorMessage('Không tìm thấy thông tin dự án đã chọn.');
          setDonorList([]);
          return;
        }

        setProjectName(campaignResponse.data.name);
        setDonorList(donorResponse.data.items);
        setTotalPages(Math.max(1, donorResponse.data.totalPages));
        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        const fallbackErrorMessage = 'Không thể tải dữ liệu nhà hảo tâm cho dự án đã chọn. Vui lòng thử lại sau.';
        setPageErrorMessage(error instanceof Error ? error.message || fallbackErrorMessage : fallbackErrorMessage);
        setDonorList([]);
      } finally {
        setIsPageLoading(false);
      }
    };

    void loadDonorPageData();
  }, [currentPage, selectedPageSize, selectedProjectId]);

  /** Hàm xử lý đổi số dòng mỗi trang. Mục đích: cập nhật limit mới và đưa trang hiện tại về 1 để đồng bộ dữ liệu. */
  const handlePageSizeChange = (nextPageSizeValue: number): void => {
    setSelectedPageSize(nextPageSizeValue);
    // Ghi chú logic quan trọng: khi đổi limit phải quay về trang 1 để tránh trường hợp trang hiện tại vượt quá totalPages mới.
    setCurrentPage(1);
  };

  /** Hàm sao chép transaction hash. Mục đích: cho phép người dùng copy nhanh mã giao dịch. */
  const handleCopyTransactionHash = async (transactionHashValue: string): Promise<void> => {
    try { await navigator.clipboard.writeText(transactionHashValue); setCopiedTransactionHash(transactionHashValue); window.setTimeout(() => setCopiedTransactionHash(''), 1600); }
    catch (_error) { setCopiedTransactionHash(''); }
  };

  const donorListContent = useMemo(() => {
    if (isPageLoading) return <p className="rounded-xl border border-[#d1fae5] bg-white p-4 text-sm text-[#0f766e]">Đang tải thông tin dự án và danh sách nhà hảo tâm...</p>;
    if (pageErrorMessage) return <p className="rounded-xl border border-[#fecaca] bg-[#fff1f2] p-4 text-sm text-[#b91c1c]">{pageErrorMessage}</p>;
    if (donorList.length === 0) return <p className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-sm text-[#475569]">Đến hiện tại chưa có cuộc quyên góp nào được ghi nhận</p>;

    return (
      <>
        <div className="overflow-x-auto rounded-xl border border-[#d1fae5] bg-white">
          <table className="min-w-[980px] w-full text-left text-sm text-[#0f172a]"><thead className="bg-[#ecfdf5] text-xs uppercase tracking-[0.04em] text-[#065f46]"><tr><th className="px-4 py-3">Họ tên</th><th className="px-4 py-3">Gmail</th><th className="px-4 py-3">Số tiền đã quyên góp</th><th className="px-4 py-3">Ngày giờ quyên góp</th><th className="px-4 py-3">Transaction Hash</th></tr></thead><tbody>
            {donorList.map((donorItem, donorIndex) => { const explorerTransactionUrl = buildTransactionExplorerUrl(donorItem.transactionHash); return (<tr key={`${donorItem.transactionHash}-${donorIndex}`} className="border-t border-[#f1f5f9] align-top"><td className="px-4 py-3 font-medium">{donorItem.fullName}</td><td className="px-4 py-3">{donorItem.gmail}</td><td className="px-4 py-3">{formatCurrencyVnd(donorItem.donatedAmount)}</td><td className="px-4 py-3">{formatDateTime(donorItem.donatedAt)}</td><td className="px-4 py-3 font-mono text-xs"><div className="flex items-center gap-2">{explorerTransactionUrl ? <a href={explorerTransactionUrl} target="_blank" rel="noreferrer noopener" className="text-[#1d4ed8] hover:underline">{shortenTransactionHash(donorItem.transactionHash)}</a> : <span>{shortenTransactionHash(donorItem.transactionHash)}</span>}<button type="button" onClick={() => void handleCopyTransactionHash(donorItem.transactionHash)} className="rounded border border-[#cbd5e1] px-2 py-1 text-[11px] font-semibold text-[#0f172a] hover:bg-[#f8fafc]">{copiedTransactionHash === donorItem.transactionHash ? 'Đã copy' : 'Copy'}</button></div></td></tr>); })}
          </tbody></table>
        </div>
        <div className="mt-4 rounded-2xl border border-[#99f6e4] bg-gradient-to-br from-white via-[#f7fffd] to-[#ecfdf5] p-3 shadow-[0_14px_35px_rgba(16,185,129,0.12)] sm:p-4">
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[#d1fae5] bg-white/90 p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(136px,auto)_1fr] sm:items-center sm:gap-3">
                  <label htmlFor="pageSizeSelect" className="text-sm font-semibold text-[#0f766e]">
                    Số dòng mỗi trang
                  </label>
                  <select
                    id="pageSizeSelect"
                    value={selectedPageSize}
                    onChange={event => handlePageSizeChange(Number(event.target.value))}
                    disabled={isPageLoading}
                    className="h-11 w-full min-w-[136px] rounded-xl border border-[#99f6e4] bg-[#f0fdfa] px-3 text-sm font-semibold text-[#0f766e] shadow-[0_6px_14px_rgba(20,184,166,0.12)] outline-none transition hover:border-[#5eead4] hover:bg-[#ccfbf1] focus-visible:ring-2 focus-visible:ring-[#14b8a6] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:border-[#d1d5db] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
                  >
                    {pageSizeOptionList.map(pageSizeOption => (
                      <option key={pageSizeOption} value={pageSizeOption}>
                        {pageSizeOption}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(120px,auto)_1fr_minmax(120px,auto)] sm:items-center sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(previousPage => Math.max(1, previousPage - 1))}
                    disabled={currentPage <= 1 || isPageLoading}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#99f6e4] bg-[#f0fdfa] px-4 text-sm font-semibold text-[#0f766e] shadow-[0_6px_14px_rgba(20,184,166,0.10)] transition hover:border-[#5eead4] hover:bg-[#ccfbf1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14b8a6] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:border-[#d1d5db] disabled:bg-[#f8fafc] disabled:text-[#94a3b8] disabled:shadow-none"
                  >
                    <span aria-hidden="true">←</span>
                    <span>Trang trước</span>
                  </button>

                  {/* Ghi chú logic UI: giữ chiều cao cố định + aria-live để cập nhật trạng thái tải mà không làm giật layout và giúp tăng khả năng truy cập. */}
                  <div
                    aria-live="polite"
                    className="flex h-11 min-w-[180px] items-center justify-center rounded-xl border border-[#99f6e4] bg-[#ecfeff] px-4 text-center text-sm font-semibold text-[#0f766e]"
                  >
                    <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${isPageLoading ? 'animate-pulse bg-[#0d9488]' : 'bg-[#10b981]'}`} />
                    {isPageLoading ? 'Đang tải trang...' : `Trang ${currentPage} / ${totalPages}`}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(previousPage => Math.min(totalPages, previousPage + 1))}
                    disabled={currentPage >= totalPages || isPageLoading}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#99f6e4] bg-[#f0fdfa] px-4 text-sm font-semibold text-[#0f766e] shadow-[0_6px_14px_rgba(20,184,166,0.10)] transition hover:border-[#5eead4] hover:bg-[#ccfbf1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14b8a6] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:border-[#d1d5db] disabled:bg-[#f8fafc] disabled:text-[#94a3b8] disabled:shadow-none"
                  >
                    <span>Trang sau</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }, [copiedTransactionHash, currentPage, donorList, isPageLoading, pageErrorMessage, totalPages]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f0fdf4] to-[#f8fafc] px-4 py-6 md:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <a href="/" className="inline-flex items-center text-sm font-semibold text-[#0f766e] hover:underline">← Quay lại trang chủ</a>
        <section className="space-y-2 rounded-2xl border border-[#a7f3d0] bg-white/90 p-4 text-center md:p-6"><h1 className="text-2xl font-bold text-[#064e3b]">Danh sách nhà hảo tâm - {projectName}</h1><p className="text-sm text-[#334155]">Dữ liệu được lấy trực tiếp từ hệ thống giao dịch quyên góp đã ghi nhận.</p><p className="text-xs font-medium text-[#6b7280]">Lưu ý: 1 Token tương đương 1 đồng (VND).</p><p className="text-xs text-[#64748b]">Cập nhật dữ liệu lúc: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : 'Chưa có dữ liệu'}</p></section>
        {donorListContent}
      </div>
    </main>
  );
}
