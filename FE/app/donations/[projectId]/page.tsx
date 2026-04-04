'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ApiErrorResponse, buildApiUrl, fetchApi } from '../../utils/apiClient';
import { readAuthSession } from '../../utils/authSession';
import { donateByWallet } from '../donationWeb3Client';

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

/** Hàm map lỗi donation sang thông điệp dễ hiểu. Mục đích: chuẩn hóa thông báo lỗi cho người dùng. */
function mapDonationErrorMessage(error: unknown): string {
  const apiError = error as ApiErrorResponse;
  if (apiError?.statusCode === 401) return 'Bạn chưa đăng nhập. Vui lòng đăng nhập để quyên góp.';
  return apiError?.message || (error as Error)?.message || 'Giao dịch thất bại. Vui lòng thử lại.';
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

  /** Hàm ghi nhận donation theo transaction hash. Mục đích: đồng bộ dữ liệu on-chain về backend để hiển thị lịch sử công khai. */
  const recordDonationTransaction = async (donationProjectId: string, transactionHash: string, isAnonymous: boolean) => {
    const { accessToken } = readAuthSession();
    if (!accessToken) {
      throw { statusCode: 401, message: 'Bạn chưa đăng nhập.' } as ApiErrorResponse;
    }

    return fetchApi<{ transactionHash: string }>(buildApiUrl('/donations/record'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ projectId: donationProjectId, transactionHash, isAnonymous })
    });
  };

  /** Hàm xử lý donate. Mục đích: validate dữ liệu và cập nhật trạng thái giao dịch đầy đủ theo UC3.1. */
  const handleDonate = async () => {
    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setStatusMessage('Vui lòng nhập số token lớn hơn 0.');
    if (!campaignDetail?.projectId) return setStatusMessage('Không tìm thấy thông tin dự án hợp lệ.');
    if (campaignDetail.status !== 'ACTIVE' || !isCampaignBeforeDeadline(campaignDetail.deadline)) {
      return setStatusMessage('Dự án hiện không đủ điều kiện nhận quyên góp.');
    }

    try {
      setIsSubmitting(true);
      setTransactionStatus('processing');
      setStatusMessage('Đang xử lý yêu cầu giao dịch...');

      const submittedTransactionHash = await donateByWallet(campaignDetail.projectId, parsedAmount, isAnonymousDonation);
      setTransactionStatus('submitted');
      setStatusMessage(`Đã gửi giao dịch on-chain thành công. TxHash: ${submittedTransactionHash}`);

      await recordDonationTransaction(campaignDetail.projectId, submittedTransactionHash, isAnonymousDonation);
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
        <button type="button" disabled={isSubmitting} className="mt-3 rounded-md bg-[#0e7c6b] px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={handleDonate}>Ký và quyên góp</button>
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
    </main>
  );
}
