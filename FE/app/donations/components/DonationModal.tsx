'use client';

import { useEffect, useState } from 'react';
import { ApiErrorResponse, buildApiUrl, fetchApi } from '../../utils/apiClient';
import { readAuthSession } from '../../utils/authSession';

type DonationCampaignItem = {
  projectId: string;
  name: string;
  status: string;
  deadline?: string;
};

type DonationHistoryItem = {
  transactionHash: string;
  donorAddress: string;
  amount: number;
  timestamp: string;
  isAnonymous: boolean;
};

type TransactionStatus = 'idle' | 'processing' | 'submitted' | 'success' | 'failed';

type DonationModalProps = {
  campaignItem: DonationCampaignItem;
  onClose: () => void;
  onDonationSuccess: (projectId: string) => Promise<void>;
};

/** Hàm rút gọn địa chỉ ví. Mục đích: hiển thị donor address ngắn gọn trong lịch sử donation. */
function formatWalletAddress(walletAddress: string): string {
  return walletAddress.length > 10 ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : walletAddress;
}

/** Hàm kiểm tra campaign còn hạn donate. Mục đích: chặn donate khi campaign đã quá hạn. */
function isCampaignBeforeDeadline(deadlineIso?: string): boolean {
  if (!deadlineIso) {
    return true;
  }

  const parsedDeadline = new Date(deadlineIso);
  if (Number.isNaN(parsedDeadline.getTime())) {
    return true;
  }

  return parsedDeadline.getTime() >= Date.now();
}

/** Hàm map lỗi donation sang thông điệp dễ hiểu. Mục đích: phân loại lỗi đúng nguyên nhân cho luồng relay backend. */
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

/** Hàm modal quyên góp. Mục đích: gửi donation qua relay backend từ danh sách campaign. */
export default function DonationModal({ campaignItem, onClose, onDonationSuccess }: DonationModalProps) {
  const [donationAmountInput, setDonationAmountInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingDonationAmount, setPendingDonationAmount] = useState<number | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [historyList, setHistoryList] = useState<DonationHistoryItem[]>([]);

  /** Hàm tải lịch sử donation trong modal. Mục đích: hiển thị dữ liệu mới nhất và refresh sau donate thành công. */
  const loadDonationHistory = async () => {
    try {
      const historyResponse = await fetchApi<DonationHistoryItem[]>(buildApiUrl(`/donations/campaigns/${campaignItem.projectId}/history?limit=5`), { method: 'GET', cache: 'no-store' });
      setHistoryList(historyResponse.data);
    } catch (error) {
      const apiError = error as ApiErrorResponse;
      setStatusMessage(apiError.message || 'Không thể tải lịch sử quyên góp.');
    }
  };

  useEffect(() => {
    void loadDonationHistory();
  }, [campaignItem.projectId]);

  /** Hàm gửi donation qua relay backend. Mục đích: gửi giao dịch on-chain mà không cần MetaMask trên frontend. */
  const submitDonationViaRelay = async (projectId: string, amount: number) => {
    const { accessToken } = readAuthSession();
    if (!accessToken) {
      throw { statusCode: 401, message: 'Bạn chưa đăng nhập.' } as ApiErrorResponse;
    }

    const relayProjectId = resolveRelayProjectId(projectId);
    if (!relayProjectId) {
      throw { statusCode: 400, errorCode: 'VALIDATION_ERROR', message: 'Mã dự án không hợp lệ để gửi giao dịch.' } as ApiErrorResponse;
    }

    return fetchApi<{ transactionHash: string }>(buildApiUrl('/donations/submit'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ projectId: relayProjectId, amount, isAnonymous: false })
    });
  };

  /** Hàm kiểm tra dữ liệu trước khi mở modal xác nhận. Mục đích: gom validate để tái sử dụng cho các bước submit. */
  const validateDonationInput = (): number | null => {
    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatusMessage('Số token quyên góp phải lớn hơn 0.');
      return null;
    }
    if (!campaignItem.projectId) {
      setStatusMessage('projectId không hợp lệ.');
      return null;
    }
    if (campaignItem.status !== 'ACTIVE' || !isCampaignBeforeDeadline(campaignItem.deadline)) {
      setStatusMessage('Dự án hiện không đủ điều kiện nhận quyên góp.');
      return null;
    }

    return parsedAmount;
  };

  /** Hàm mở modal xác nhận. Mục đích: đảm bảo người dùng luôn đi qua đúng 1 bước xác nhận trước khi gửi giao dịch. */
  const handleOpenConfirmModal = () => {
    const validatedAmount = validateDonationInput();
    if (validatedAmount === null) {
      return;
    }

    setPendingDonationAmount(validatedAmount);
    setIsConfirmModalOpen(true);
  };

  /** Hàm đóng modal xác nhận. Mục đích: reset dữ liệu xác nhận tạm để tránh submit nhầm dữ liệu cũ. */
  const handleCloseConfirmModal = () => {
    setIsConfirmModalOpen(false);
    setPendingDonationAmount(null);
  };

  /** Hàm submit donation sau khi đã xác nhận. Mục đích: gửi giao dịch đúng một lần qua relay backend. */
  const handleConfirmDonationSubmit = async () => {
    // Ghi chú logic phức tạp: chặn double-submit tuyệt đối khi người dùng bấm xác nhận liên tiếp nhiều lần.
    if (isSubmitting) {
      return;
    }

    if (!campaignItem.projectId || pendingDonationAmount === null) {
      setStatusMessage('Không tìm thấy thông tin quyên góp hợp lệ. Vui lòng thử lại.');
      handleCloseConfirmModal();
      return;
    }

    try {
      setIsSubmitting(true);
      setTransactionStatus('processing');
      setStatusMessage('Đang gửi giao dịch quyên góp qua hệ thống...');
      handleCloseConfirmModal();

      const submitResponse = await submitDonationViaRelay(campaignItem.projectId, pendingDonationAmount);
      const submittedTransactionHash = String(submitResponse.data.transactionHash || '');

      setTransactionStatus('submitted');
      setStatusMessage(`Đã gửi giao dịch thành công. TxHash: ${submittedTransactionHash}`);
      setTransactionStatus('success');
      setStatusMessage(`Xác nhận quyên góp thành công. TxHash: ${submittedTransactionHash}`);
      await loadDonationHistory();
      await onDonationSuccess(campaignItem.projectId);
    } catch (error) {
      setTransactionStatus('failed');
      setStatusMessage(mapDonationErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-5" onClick={event => event.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#111827]">Quyên góp cho dự án</h3>
        <p className="mt-1 text-sm text-[#374151]">{campaignItem.name} · #{campaignItem.projectId} · {campaignItem.status}</p>
        <input type="number" min={1} value={donationAmountInput} onChange={event => setDonationAmountInput(event.target.value)} placeholder="Nhập số token muốn quyên góp" className="mt-4 w-full rounded-md border border-[#d1d5db] p-2" />
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={isSubmitting} onClick={handleOpenConfirmModal} className="rounded-md bg-[#0e7c6b] px-4 py-2 text-white disabled:opacity-50">Ký và quyên góp</button>
          <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-md border border-[#d1d5db] px-4 py-2">Hủy</button>
        </div>
        <p className="mt-3 text-sm text-[#374151]">Trạng thái: {transactionStatus}</p>
        <p className="mt-1 text-sm text-[#374151]">{statusMessage}</p>
        <div className="mt-4 space-y-2">
          {historyList.length === 0 && <div className="rounded-md border border-[#e5e7eb] p-2 text-sm">Chưa có lịch sử quyên góp.</div>}
          {historyList.map(historyItem => (
            <div key={historyItem.transactionHash} className="rounded-md border border-[#e5e7eb] p-2 text-sm">
              <div>Tx: {historyItem.transactionHash}</div>
              <div>Donor: {historyItem.isAnonymous ? 'Ẩn danh' : formatWalletAddress(historyItem.donorAddress)}</div>
              <div>Amount: {historyItem.amount}</div>
            </div>
          ))}
        </div>

        {isConfirmModalOpen && pendingDonationAmount !== null ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
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
                    void handleConfirmDonationSubmit();
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
      </div>
    </div>
  );
}
