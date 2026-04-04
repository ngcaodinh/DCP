'use client';

import { useEffect, useState } from 'react';
import { ApiErrorResponse, buildApiUrl, fetchApi } from '../../utils/apiClient';
import { readAuthSession } from '../../utils/authSession';
import { donateByWallet } from '../donationWeb3Client';

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

/** Hàm map lỗi donation sang thông điệp dễ hiểu. Mục đích: đồng nhất UX lỗi theo thiết kế nghiệp vụ. */
function mapDonationErrorMessage(error: unknown): string {
  const apiError = error as ApiErrorResponse;
  const normalizedMessage = String(apiError?.message || (error as Error)?.message || '').toLowerCase();

  if (apiError?.statusCode === 401) return 'Bạn chưa đăng nhập. Vui lòng đăng nhập để quyên góp.';
  if (normalizedMessage.includes('chain') || normalizedMessage.includes('network')) return 'Hệ thống đang sai network blockchain. Vui lòng liên hệ quản trị viên.';
  if (normalizedMessage.includes('cấu hình')) return 'Thiếu cấu hình contract hoặc relay donation trên hệ thống.';
  if (normalizedMessage.includes('revert') || normalizedMessage.includes('insufficient')) return 'Giao dịch bị từ chối bởi smart contract hoặc số dư không đủ.';
  return apiError?.message || 'Đã xảy ra lỗi không xác định khi quyên góp.';
}

/** Hàm modal quyên góp. Mục đích: donate trực tiếp từ danh sách campaign theo luồng không dùng MetaMask. */
export default function DonationModal({ campaignItem, onClose, onDonationSuccess }: DonationModalProps) {
  const [donationAmountInput, setDonationAmountInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  /** Hàm ghi nhận donation theo transaction hash. Mục đích: đồng bộ giao dịch ví người dùng vào lịch sử backend. */
  const recordDonationTransaction = async (projectId: string, transactionHash: string) => {
    const { accessToken } = readAuthSession();
    if (!accessToken) {
      throw { statusCode: 401, message: 'Bạn chưa đăng nhập.' } as ApiErrorResponse;
    }

    return fetchApi<{ transactionHash: string }>(buildApiUrl('/donations/record'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ projectId, transactionHash, isAnonymous: false })
    });
  };

  /** Hàm submit donate. Mục đích: validate dữ liệu và cập nhật trạng thái theo tiến trình giao dịch. */
  const handleDonateSubmit = async () => {
    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setStatusMessage('Số token quyên góp phải lớn hơn 0.');
    if (!campaignItem.projectId) return setStatusMessage('projectId không hợp lệ.');
    if (campaignItem.status !== 'ACTIVE' || !isCampaignBeforeDeadline(campaignItem.deadline)) {
      return setStatusMessage('Dự án hiện không đủ điều kiện nhận quyên góp.');
    }

    try {
      setIsSubmitting(true);
      setTransactionStatus('processing');
      setStatusMessage('Đang xử lý yêu cầu giao dịch...');

      const submittedTransactionHash = await donateByWallet(campaignItem.projectId, parsedAmount, false);
      setTransactionStatus('submitted');
      setStatusMessage(`Đã gửi giao dịch on-chain thành công. TxHash: ${submittedTransactionHash}`);

      await recordDonationTransaction(campaignItem.projectId, submittedTransactionHash);
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
          <button type="button" disabled={isSubmitting} onClick={handleDonateSubmit} className="rounded-md bg-[#0e7c6b] px-4 py-2 text-white disabled:opacity-50">Ký và quyên góp</button>
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
      </div>
    </div>
  );
}
