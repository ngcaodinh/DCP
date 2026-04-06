'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ApiErrorResponse, buildApiUrl, fetchApi } from '../../utils/apiClient';
import { readAuthSession } from '../../utils/authSession';

type DonationCampaignDetail = {
  projectId: string;
  name: string;
  description: string;
  goalAmount: number;
  donatedAmount: number;
  donationCount: number;
  evidenceCids: string[];
  status: string;
  deadline?: string;
};

type DonationHistoryItem = {
  transactionHash: string;
  projectId: string;
  donorAddress: string;
  amount: number;
  timestamp: string;
  isAnonymous: boolean;
};

type TransactionStatus = 'idle' | 'processing' | 'submitted' | 'success' | 'failed';

/** Hàm cắt ngắn địa chỉ ví. Mục đích: hiển thị donorAddress gọn gàng trong bảng lịch sử donation. */
function formatWalletAddress(walletAddress: string): string {
  if (!walletAddress || walletAddress.length < 10) return walletAddress || 'Không xác định';
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

/** Hàm kiểm tra campaign còn hạn donate. Mục đích: chặn donate nếu chiến dịch đã hết hạn. */
function isCampaignBeforeDeadline(deadlineIso?: string): boolean {
  if (!deadlineIso) return true;
  const parsedDeadline = new Date(deadlineIso);
  if (Number.isNaN(parsedDeadline.getTime())) return true;
  return parsedDeadline.getTime() >= Date.now();
}

/** Hàm map lỗi donation sang thông điệp dễ hiểu. Mục đích: phân loại lỗi đúng ngữ cảnh cho luồng relay không phụ thuộc ví trình duyệt. */
function mapDonationErrorMessage(error: unknown): string {
  const apiError = error as ApiErrorResponse;
  if (apiError?.statusCode === 401) return 'Bạn chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại để quyên góp.';
  if (apiError?.errorCode === 'CHAIN_MISMATCH') return 'Hệ thống relay đang ở sai mạng blockchain. Vui lòng thử lại sau.';
  if (apiError?.errorCode === 'TRANSACTION_TIMEOUT') return 'Giao dịch đang pending quá lâu. Vui lòng đợi thêm hoặc thử lại sau.';
  if (apiError?.errorCode === 'TRANSACTION_REVERTED') return 'Giao dịch bị từ chối trên blockchain. Vui lòng kiểm tra lại số dư token.';
  if (apiError?.errorCode === 'VALIDATION_ERROR') {
    return apiError.message || 'Dữ liệu quyên góp không hợp lệ. Vui lòng kiểm tra lại thông tin.';
  }
  return apiError?.message || (error as Error)?.message || 'Không thể gửi giao dịch quyên góp lúc này. Vui lòng thử lại sau.';
}

/** Hàm chuẩn hóa projectId cho relay. Mục đích: hỗ trợ cả mã thuần số và mã có chứa số như PRJ-1001. */
function resolveRelayProjectId(projectId: string): string {
  const normalizedProjectId = projectId.trim();
  if (/^[0-9]+$/.test(normalizedProjectId)) {
    return normalizedProjectId;
  }

  const numericPartMatch = normalizedProjectId.match(/([0-9]+)/);
  if (numericPartMatch?.[1]) {
    return numericPartMatch[1];
  }

  return '';
}

/** Hàm trang chi tiết chiến dịch quyên góp. Mục đích: hiển thị thông tin dự án, gửi donation qua relay và tải lịch sử giao dịch. */
export default function DonationCampaignDetailPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = String(routeParams?.projectId || '');
  const [campaignDetail, setCampaignDetail] = useState<DonationCampaignDetail | null>(null);
  const [donationHistoryList, setDonationHistoryList] = useState<DonationHistoryItem[]>([]);
  const [donationAmountInput, setDonationAmountInput] = useState('');
  const [isAnonymousDonation, setIsAnonymousDonation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingDonationAmount, setPendingDonationAmount] = useState<number | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  /** Hàm tải chi tiết campaign và lịch sử donation. Mục đích: dùng cho tải trang ban đầu và refresh sau donate thành công. */
  const loadCampaignData = async () => {
    if (!projectId) {
      setStatusMessage('Không tìm thấy mã dự án hợp lệ trên đường dẫn.');
      return;
    }

    try {
      const [detailResponse, historyResponse] = await Promise.all([
        fetchApi<DonationCampaignDetail | null>(buildApiUrl(`/donations/campaigns/${projectId}`), { method: 'GET', cache: 'no-store' }),
        fetchApi<DonationHistoryItem[]>(buildApiUrl(`/donations/campaigns/${projectId}/history?limit=20`), { method: 'GET', cache: 'no-store' })
      ]);

      setCampaignDetail(detailResponse.data);
      setDonationHistoryList(historyResponse.data);
    } catch (error) {
      const apiError = error as ApiErrorResponse;
      setStatusMessage(apiError.message || 'Không thể tải dữ liệu chiến dịch.');
    }
  };

  useEffect(() => {
    void loadCampaignData();
  }, [projectId]);

  /** Hàm gửi donation qua relay backend. Mục đích: gửi giao dịch on-chain mà không cần MetaMask trên frontend. */
  const submitDonationViaRelay = async (donationProjectId: string, amount: number, isAnonymous: boolean) => {
    const { accessToken } = readAuthSession();
    if (!accessToken) {
      throw { statusCode: 401, message: 'Bạn chưa đăng nhập.' } as ApiErrorResponse;
    }

    const relayProjectId = resolveRelayProjectId(donationProjectId);
    if (!relayProjectId) {
      throw { statusCode: 400, errorCode: 'VALIDATION_ERROR', message: 'Mã dự án không hợp lệ để gửi giao dịch.' } as ApiErrorResponse;
    }

    return fetchApi<{ transactionHash: string }>(buildApiUrl('/donations/submit'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ projectId: relayProjectId, amount, isAnonymous })
    });
  };

  /** Hàm kiểm tra dữ liệu donate trước khi mở xác nhận. Mục đích: gom validate để tái sử dụng cho nhiều bước submit. */
  const validateDonationInput = (): number | null => {
    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatusMessage('Vui lòng nhập số token lớn hơn 0.');
      return null;
    }
    if (!campaignDetail?.projectId) {
      setStatusMessage('Không tìm thấy thông tin dự án hợp lệ.');
      return null;
    }
    if (campaignDetail.status !== 'ACTIVE' || !isCampaignBeforeDeadline(campaignDetail.deadline)) {
      setStatusMessage('Dự án hiện không đủ điều kiện nhận quyên góp.');
      return null;
    }

    return parsedAmount;
  };

  /** Hàm mở modal xác nhận quyên góp. Mục đích: hiển thị bước xác nhận cuối trước khi gọi ví ký giao dịch. */
  const handleOpenConfirmModal = () => {
    const validatedAmount = validateDonationInput();
    if (validatedAmount === null) {
      return;
    }

    setPendingDonationAmount(validatedAmount);
    setIsConfirmModalOpen(true);
  };

  /** Hàm đóng modal xác nhận quyên góp. Mục đích: reset trạng thái xác nhận tạm để tránh dùng lại dữ liệu cũ. */
  const handleCloseConfirmModal = () => {
    setIsConfirmModalOpen(false);
    setPendingDonationAmount(null);
  };

  /** Hàm xử lý donate sau khi người dùng đã xác nhận ở modal. Mục đích: gửi giao dịch qua relay backend và cập nhật UI. */
  const handleConfirmDonate = async () => {
    // Ghi chú logic phức tạp: chặn double-submit tuyệt đối khi người dùng bấm nhanh nhiều lần.
    if (isSubmitting) {
      return;
    }

    if (!campaignDetail?.projectId || pendingDonationAmount === null) {
      setStatusMessage('Không tìm thấy thông tin quyên góp hợp lệ. Vui lòng thử lại.');
      handleCloseConfirmModal();
      return;
    }

    try {
      setIsSubmitting(true);
      setTransactionStatus('processing');
      setStatusMessage('Đang gửi giao dịch quyên góp qua hệ thống...');
      handleCloseConfirmModal();

      const submitResponse = await submitDonationViaRelay(campaignDetail.projectId, pendingDonationAmount, isAnonymousDonation);
      const submittedTransactionHash = String(submitResponse.data.transactionHash || '');

      setTransactionStatus('submitted');
      setStatusMessage(`Đã gửi giao dịch thành công. TxHash: ${submittedTransactionHash}`);

      setTransactionStatus('success');
      setStatusMessage(`Quyên góp thành công và đã ghi nhận lịch sử. TxHash: ${submittedTransactionHash}`);
      await loadCampaignData();
    } catch (error) {
      setTransactionStatus('failed');
      setStatusMessage(mapDonationErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[#0d1117]">{campaignDetail?.name || 'Chi tiết chiến dịch'}</h1>
      <p className="mt-2 text-sm text-[#4b5563]">{campaignDetail?.description || 'Đang tải dữ liệu...'}</p>
      <section className="mt-6 rounded-xl border border-[#e5e7eb] p-4">
        <h2 className="text-lg font-semibold">Quyên góp công khai</h2>
        <input className="mt-3 w-full rounded-md border border-[#d1d5db] p-2" type="number" min={1} value={donationAmountInput} onChange={event => setDonationAmountInput(event.target.value)} placeholder="Nhập số token muốn donate" />
        <label className="mt-3 block text-sm"><input type="checkbox" checked={isAnonymousDonation} onChange={event => setIsAnonymousDonation(event.target.checked)} /> Quyên góp ẩn danh</label>
        <button type="button" disabled={isSubmitting} className="mt-3 rounded-md bg-[#0e7c6b] px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={handleOpenConfirmModal}>Ký và quyên góp</button>
        <p className="mt-3 text-sm text-[#374151]">Trạng thái: {transactionStatus}</p>
        <p className="text-sm text-[#374151]">{statusMessage}</p>
      </section>
      <section className="mt-6 rounded-xl border border-[#e5e7eb] p-4">
        <h2 className="text-lg font-semibold">Lịch sử quyên góp</h2>
        <div className="mt-3 space-y-2">
          {donationHistoryList.map(historyItem => (
            <div key={historyItem.transactionHash} className="rounded-md border border-[#f3f4f6] p-3 text-sm">
              <div>Tx: {historyItem.transactionHash}</div>
              <div>Donor: {historyItem.isAnonymous ? 'Ẩn danh' : formatWalletAddress(historyItem.donorAddress)}</div>
              <div>Số token: {historyItem.amount}</div>
              <div>Thời gian: {new Date(historyItem.timestamp).toLocaleString('vi-VN')}</div>
            </div>
          ))}
        </div>
      </section>

      {isConfirmModalOpen && pendingDonationAmount !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-[#111827]">Xác nhận quyên góp</h3>
            <p className="mt-3 text-sm text-[#374151]">
              Bạn muốn quyên góp {pendingDonationAmount.toLocaleString('vi-VN')} token cho dự án này?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseConfirmModal}
                className="rounded-md border border-[#d1d5db] px-4 py-2 text-sm text-[#374151]"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmDonate();
                }}
                disabled={isSubmitting}
                className="rounded-md bg-[#0e7c6b] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                xác nhận
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
