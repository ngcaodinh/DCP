'use client';

/**
 * Trang chi tiết dự án quyên góp — hiển thị thông tin đầy đủ,
 * tiến độ gây quỹ, bằng chứng IPFS, và 2 chế độ quyên góp (công khai / ẩn danh).
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiErrorResponse, buildApiUrl, fetchApi } from '../../utils/apiClient';
import { clearAuthSession, readAuthSession } from '../../utils/authSession';
import { useGuestWallet } from '../../components/GuestWalletProvider';
import { executeOneClickDonationRequest } from '../components/DonationModal.services';
import {
  formatWalletAddress,
  formatTransactionHash,
  mapDonationErrorMessage,
  isCampaignBeforeDeadline,
  resolveGuestDisplayStatusRaw,
} from '../components/DonationModal.helpers';
import IpfsEvidencePreviewCard from '../../components/common/IpfsEvidencePreviewCard';
import { buildIpfsGatewayUrl, getIpfsContentType, resolveIpfsPreviewKind } from '../../utils/ipfs';
import LoginModal from '../../components/LoginModal';
import { useAuthCheck } from '../../utils/useAuthCheck';
import {
  MIN_AMOUNT_PER_DONATION,
  MAX_AMOUNT_PER_DONATION,
} from '../../constants/guestDonationLimits';

/** Chi tiết cơ bản của dự án — từ /projects/public-support/{projectId}. */
interface ProjectBasicInfo {
  projectId: string;
  name: string;
  description: string;
  goalAmount: number;
  status: string;
  deadline?: string;
  evidenceCids: string[];
  evidenceFiles?: EvidenceFile[];
  creatorName: string | null;
  lastDonationAt: string | null;
  coverImageUrl?: string;
}

/** Thống kê donation của dự án — từ /donations/campaigns/{projectId}. */
interface ProjectStats {
  projectId: string;
  donatedAmount: number;
  donationCount: number;
}

/** Chi tiết campaign đầy đủ — ghép từ ProjectBasicInfo + ProjectStats. */
interface ProjectDetail {
  projectId: string;
  name: string;
  description: string;
  goalAmount: number;
  donatedAmount: number;
  donationCount: number;
  status: string;
  deadline?: string;
  evidenceCids: string[];
  evidenceFiles?: EvidenceFile[];
  creatorName: string | null;
  lastDonationAt: string | null;
  createdAt: string;
  updatedAt: string;
  coverImageUrl?: string;
}

/** File đính kèm bằng chứng IPFS. */
interface EvidenceFile {
  cid: string;
  fileName: string;
  mimeType: string;
}

/** Item lịch sử donation trên trang chi tiết. */
interface DonationHistoryItem {
  transactionHash: string;
  donorAddress: string;
  amount: number;
  timestamp: string;
  isAnonymous: boolean;
}

/** Trạng thái transaction cho authenticated donation. */
type TransactionStatus = 'idle' | 'processing' | 'submitted' | 'success' | 'failed';

/** Chế độ quyên góp đang active trên trang. */
type DonationMode = 'public' | 'anonymous' | null;

/**
 * Hàm định dạng số tiền VND.
 * Mục đích: hiển thị số liệu gây quỹ đồng nhất với Home page.
 */
function formatCurrencyVnd(amountValue: number): string {
  return new Intl.NumberFormat('vi-VN').format(amountValue);
}

/**
 * Hàm lấy nhãn trạng thái dự án công khai.
 * Mục đích: chuẩn hóa label hiển thị status.
 */
function getPublicProjectStatusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Đang hoạt động';
    case 'COMPLETED':
      return 'Đã hoàn thành';
    case 'EXPIRED':
      return 'Đã hết hạn';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return status;
  }
}

/**
 * Hàm kiểm tra dự án còn nhận quyên góp.
 * Mục đích: chặn donate khi dự án không active hoặc quá deadline.
 */
function isProjectEligibleForDonation(project: ProjectDetail): boolean {
  return project.status === 'ACTIVE' && isCampaignBeforeDeadline(project.deadline);
}

/**
 * Hàm tính phần trăm tiến độ quyên góp.
 * Mục đích: hiển thị thanh progress.
 */
function calculateDonationPercent(donated: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.floor((donated / goal) * 100));
}

/**
 * Hàm định dạng thời gian cập nhật tương đối.
 * Mục đích: hiển thị thời gian "cách đây X phút/giờ/ngày" cho người dùng.
 */
function formatUpdatedTime(isoDate: string): string {
  if (!isoDate) return 'Không rõ';
  const now = Date.now();
  const updated = new Date(isoDate).getTime();
  if (Number.isNaN(updated)) return 'Không rõ';

  const diffMs = now - updated;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return new Date(isoDate).toLocaleDateString('vi-VN');
}

/** Hàm tìm CID ảnh đầu tiên từ metadata evidenceFiles — giống logic trang chủ. */
const getFirstProjectImageCidFromMetadataForDetail = (basic: ProjectBasicInfo): string => {
  const evidenceFileList = basic.evidenceFiles || [];
  const firstImageEvidenceFile = evidenceFileList.find(fileItem =>
    resolveIpfsPreviewKind({ mimeType: fileItem.mimeType, fileName: fileItem.fileName }) === 'image'
  );
  return firstImageEvidenceFile?.cid || '';
};

/** Hàm tìm CID ảnh đầu tiên qua danh sách CID Pinata — giống logic trang chủ. */
const resolveFirstProjectImageCidForDetail = async (basic: ProjectBasicInfo): Promise<string> => {
  const imageCidFromMetadata = getFirstProjectImageCidFromMetadataForDetail(basic);
  if (imageCidFromMetadata) {
    return imageCidFromMetadata;
  }

  const evidenceCidList = (basic.evidenceCids || []).filter(evidenceCid => Boolean(evidenceCid?.trim()));
  const evidenceContentTypeList = await Promise.all(evidenceCidList.map(evidenceCid => getIpfsContentType(evidenceCid)));
  const firstImageIndex = evidenceContentTypeList.findIndex(contentType => resolveIpfsPreviewKind({ contentType }) === 'image');

  return firstImageIndex >= 0 ? evidenceCidList[firstImageIndex] : '';
};

/** Component Banner — hiển thị hình ảnh và tên dự án. */
function ProjectBanner({ project, coverImageUrl }: { project: ProjectDetail; coverImageUrl: string }) {
  const bannerStyle = coverImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.18)), url(${coverImageUrl})`,
        minHeight: '240px',
      }
    : {
        background: 'linear-gradient(135deg, #0e7c6b, #34d399)',
        minHeight: '240px',
      };

  return (
    <div className="project-detail-banner mb-6 overflow-hidden" style={bannerStyle}>
      <div className="flex h-60 items-end px-6 pb-5">
        <div className="w-full text-center">
          <span className="mb-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            ● {getPublicProjectStatusLabel(project.status)}
          </span>
          <h1 className="text-2xl font-bold text-white drop-shadow-sm md:text-3xl">{project.name}</h1>
        </div>
      </div>
    </div>
  );
}

/** Component thông tin dự án — mô tả và metadata. */
function ProjectInfoSection({ project }: { project: ProjectDetail }) {
  return (
    <section className="project-detail-section mb-6">
      <div className="mb-4 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0e7c6b" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className="text-sm font-semibold text-[#0e7c6b]">Dự án đã xác minh</span>
      </div>
      <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">{project.description}</p>
      <div className="project-detail-meta-grid">
        {project.creatorName && (
          <div className="project-detail-meta-item">
            <label>Người tạo dự án</label>
            <span>{project.creatorName}</span>
          </div>
        )}
        {project.deadline && (
          <div className="project-detail-meta-item">
            <label>Hạn chót</label>
            <span>{new Date(project.deadline).toLocaleDateString('vi-VN')}</span>
          </div>
        )}
        <div className="project-detail-meta-item">
          <label>Quyên góp gần nhất</label>
          <span>
            {project.lastDonationAt
              ? formatUpdatedTime(project.lastDonationAt)
              : 'Chưa có lượt quyên góp nào'}
          </span>
        </div>
        <div className="project-detail-meta-item">
          <label>Số lượt quyên góp</label>
          <span>{project.donationCount} lượt</span>
        </div>
      </div>
    </section>
  );
}

/** Component tiến độ quyên góp — thanh progress và số liệu. */
function ProjectProgressSection({ project }: { project: ProjectDetail }) {
  const percent = calculateDonationPercent(project.donatedAmount, project.goalAmount);
  const isEligible = isProjectEligibleForDonation(project);

  return (
    <section className="project-detail-section mb-6">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-[#111827]">Tiến độ quyên góp</span>
        <span className="text-[#0e7c6b]">{percent}%</span>
      </div>
      <div className="project-detail-progress-bar">
        <div
          className="project-detail-progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-[#334155]">Đã quyên góp: {formatCurrencyVnd(project.donatedAmount)} VND</span>
        <span className="text-[#6b7280]">Mục tiêu: {formatCurrencyVnd(project.goalAmount)} VND</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <a
          href={`/donors?projectId=${encodeURIComponent(project.projectId)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0e7c6b" strokeWidth="2.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Danh sách người quyên góp
        </a>
        <a
          href={`/disbursements?projectId=${encodeURIComponent(project.projectId)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Xem toàn bộ quá trình giải ngân
        </a>
      </div>
      {!isEligible && (
        <p className="mt-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
          Dự án đã hết hạn nhận quyên góp hoặc không còn hoạt động.
        </p>
      )}
    </section>
  );
}

/** Component bằng chứng minh bạch — hiển thị các CID IPFS. */
function EvidenceSection({ project }: { project: ProjectDetail }) {
  if (!project.evidenceCids || project.evidenceCids.length === 0) return null;

  return (
    <section className="project-detail-section mb-6">
      <h2 className="project-detail-section-title">Bằng chứng minh bạch</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {project.evidenceCids.slice(0, 6).map((cid, index) => {
          const evidenceFile = project.evidenceFiles?.find(f => f.cid === cid);
          return (
            <IpfsEvidencePreviewCard
              key={`${project.projectId}-${cid}-${index}`}
              cid={cid}
              fileName={evidenceFile?.fileName || `Bằng chứng #${index + 1}`}
              mimeType={evidenceFile?.mimeType}
              compact
            />
          );
        })}
      </div>
    </section>
  );
}

/** Props interface cho DonationSection. */
interface DonationSectionProps {
  project: ProjectDetail;
  donationMode: DonationMode;
  donationAmountInput: string;
  setDonationAmountInput: (v: string) => void;
  isPublicSubmitting: boolean;
  publicStatus: TransactionStatus;
  publicMessage: string;
  isPublicConfirmOpen: boolean;
  pendingPublicAmount: number | null;
  isAnonymousSubmitting: boolean;
  anonymousStatus: string;
  anonymousMessage: string;
  hasInitiatedAnonymous: boolean;
  initState: ReturnType<typeof useGuestWallet>['initState'];
  isLoggedIn: boolean;
  onOpenPublicDonation: () => void;
  onClosePublicDonation: () => void;
  onOpenPublicConfirm: () => void;
  onClosePublicConfirm: () => void;
  onConfirmPublicDonation: () => void;
  onOpenAnonymousDonation: () => void;
  onCloseAnonymousDonation: () => void;
  onSubmitAnonymousDonation: () => void;
}

/** Component quyên góp — 2 nút lớn và form theo mode. */
function DonationSection(props: DonationSectionProps) {
  const {
    project,
    donationMode,
    donationAmountInput,
    setDonationAmountInput,
    isPublicSubmitting,
    publicStatus,
    publicMessage,
    isPublicConfirmOpen,
    pendingPublicAmount,
    isAnonymousSubmitting,
    anonymousStatus,
    anonymousMessage,
    hasInitiatedAnonymous,
    initState,
    isLoggedIn,
    onOpenPublicDonation,
    onClosePublicDonation,
    onOpenPublicConfirm,
    onClosePublicConfirm,
    onConfirmPublicDonation,
    onOpenAnonymousDonation,
    onCloseAnonymousDonation,
    onSubmitAnonymousDonation,
  } = props;

  const isEligible = isProjectEligibleForDonation(project);

  // TRẠNG THÁI 1: Chưa chọn chế độ → hiển thị 2 nút lớn
  if (!donationMode) {
    return (
      <section className="project-detail-section mb-6">
        <h2 className="project-detail-section-title">Quyên góp cho dự án</h2>
        {!isEligible ? (
          <p className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
            Dự án hiện không đủ điều kiện nhận quyên góp.
          </p>
        ) : (
          <div className="project-detail-donation-grid">
            {/* Nút quyên góp công khai */}
            <button
              type="button"
              onClick={onOpenPublicDonation}
              className="project-detail-donation-btn btn-public"
            >
              <span className="text-2xl">🏛️</span>
              <span className="font-semibold">Quyên góp công khai</span>
              <span className="text-xs opacity-70">Cần đăng nhập tài khoản đã xác minh</span>
            </button>
            {/* Nút quyên góp ẩn danh — chỉ hiển thị khi chưa đăng nhập */}
            {!isLoggedIn && (
              <button
                type="button"
                onClick={onOpenAnonymousDonation}
                className="project-detail-donation-btn btn-anonymous"
              >
                <span className="text-2xl">🔐</span>
                <span className="font-semibold">Quyên góp ẩn danh</span>
                <span className="text-xs opacity-70">Không cần đăng nhập · Tối đa 3 lần/session</span>
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  // TRẠNG THÁI 2: Quyên góp công khai
  if (donationMode === 'public') {
    return (
      <section className="project-detail-form-section public mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#065f46]">🏛️ Quyên góp công khai</h2>
          <button type="button" onClick={onClosePublicDonation} className="text-sm text-[#6b7280] hover:text-[#374151]">
            ✕ Đóng
          </button>
        </div>
        <div className="mb-4 rounded-md border border-[#e5e7eb] bg-gray-50 px-3 py-2 text-sm text-[#374151]">
          Sử dụng tài khoản đã đăng nhập. Giao dịch ghi nhận công khai trên hệ thống.
        </div>
        <input
          type="number"
          min={1}
          value={donationAmountInput}
          onChange={e => setDonationAmountInput(e.target.value)}
          disabled={isPublicSubmitting}
          placeholder="Nhập số token muốn quyên góp"
          className="project-detail-input"
        />
        {publicMessage && (
          <p
            className={`mt-2 rounded-md px-3 py-2 text-sm ${
              publicStatus === 'failed'
                ? 'border border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]'
                : publicStatus === 'success'
                  ? 'border border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
                  : 'border border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
            }`}
          >
            {publicMessage}
          </p>
        )}
        <button
          type="button"
          disabled={isPublicSubmitting}
          onClick={onOpenPublicConfirm}
          className="project-detail-submit-btn public mt-3"
        >
          {isPublicSubmitting ? 'Đang xử lý...' : 'Quyên góp'}
        </button>

        {/* Confirm modal */}
        {isPublicConfirmOpen && pendingPublicAmount !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
              <h3 className="text-base font-semibold text-[#111827]">Xác nhận quyên góp</h3>
              <p className="mt-2 text-sm text-[#374151]">
                Bạn muốn quyên góp <strong>{pendingPublicAmount.toLocaleString('vi-VN')} token</strong> cho dự án này?
              </p>
              <p className="mt-1 text-xs text-[#9ca3af]">Giao dịch ghi nhận công khai trên blockchain.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClosePublicConfirm}
                  className="rounded-md border border-[#d1d5db] px-4 py-2 text-sm"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={onConfirmPublicDonation}
                  disabled={isPublicSubmitting}
                  className="project-detail-submit-btn public"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // TRẠNG THÁI 3: Quyên góp ẩn danh
  if (donationMode === 'anonymous') {
    const isGuestReady = initState.initStatus === 'READY';

    return (
      <section className="project-detail-form-section anonymous mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#4338ca]">🔐 Quyên góp ẩn danh</h2>
          <button type="button" onClick={onCloseAnonymousDonation} className="text-sm text-[#6b7280] hover:text-[#374151]">
            ✕ Đóng
          </button>
        </div>

        {!isGuestReady && hasInitiatedAnonymous ? (
          <div className="rounded-lg border border-[#e0e7ff] bg-[#eef2ff] p-4 text-sm text-[#4338ca]">
            Hệ thống đang khởi tạo ví ẩn danh. Vui lòng đợi trong giây lát...
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-gray-50 px-3 py-2 text-xs text-[#374151]">
              <span>
                Ví: <span className="font-mono font-medium">{formatWalletAddress(initState.walletAddress ?? '')}</span>
              </span>
              <span className="text-[#9ca3af]">|</span>
              <span>
                Còn lại: <span className="font-semibold text-[#4338ca]">{initState.remainingDonations}</span>/3 lần
              </span>
              <span className="text-[#9ca3af]">|</span>
              <span>
                Đã dùng: <span className="font-medium">{initState.donationCount}</span> lần
              </span>
            </div>

            {initState.hasPendingDonation && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Hệ thống phát hiện giao dịch đang chờ xử lý. Vui lòng đợi hoặc thử lại sau vài phút.
              </div>
            )}

            <input
              type="number"
              min={MIN_AMOUNT_PER_DONATION}
              max={MAX_AMOUNT_PER_DONATION}
              value={donationAmountInput}
              onChange={e => setDonationAmountInput(e.target.value)}
              disabled={isAnonymousSubmitting}
              placeholder={`Từ ${MIN_AMOUNT_PER_DONATION} đến ${MAX_AMOUNT_PER_DONATION.toLocaleString()} token`}
              className="project-detail-input"
            />
            <p className="mt-1 text-xs text-[#9ca3af]">
              Giới hạn: tối thiểu {MIN_AMOUNT_PER_DONATION} token, tối đa {MAX_AMOUNT_PER_DONATION.toLocaleString()} token/lần
            </p>

            {anonymousMessage && (
              <p
                className={`mt-2 rounded-md px-3 py-2 text-sm ${
                  anonymousStatus === 'FAILED'
                    ? 'border border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]'
                    : anonymousStatus === 'SUCCESS'
                      ? 'border border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
                      : 'border border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
                }`}
              >
                {anonymousMessage}
              </p>
            )}

            <button
              type="button"
              disabled={isAnonymousSubmitting || initState.remainingDonations <= 0}
              onClick={onSubmitAnonymousDonation}
              className="project-detail-submit-btn anonymous mt-3"
            >
              {isAnonymousSubmitting
                ? 'Đang xử lý...'
                : anonymousStatus === 'SUCCESS'
                  ? 'Quyên góp thành công!'
                  : 'Quyên góp ẩn danh'}
            </button>
          </>
        )}
      </section>
    );
  }

  return null;
}

/** Component lịch sử quyên góp — danh sách các giao dịch. */
function DonationHistorySection({ historyList }: { historyList: DonationHistoryItem[] }) {
  return (
    <section className="project-detail-section">
      <h2 className="project-detail-section-title">Lịch sử quyên góp</h2>
      {historyList.length === 0 ? (
        <p className="text-sm text-[#9ca3af]">Chưa có lượt quyên góp nào cho dự án này.</p>
      ) : (
        <div className="space-y-3">
          {historyList.map(historyItem => (
            <div key={historyItem.transactionHash} className="project-detail-history-card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-[#111827]">
                    {historyItem.isAnonymous ? '🔐 Ẩn danh' : formatWalletAddress(historyItem.donorAddress)}
                  </div>
                  <div className="mt-0.5 text-xs text-[#9ca3af]">
                    {new Date(historyItem.timestamp).toLocaleString('vi-VN')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#0e7c6b]">
                    +{historyItem.amount.toLocaleString('vi-VN')} token
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-[#9ca3af]">
                    Tx: {formatTransactionHash(historyItem.transactionHash)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Component chính — trang chi tiết dự án quyên góp. */
export default function DonationCampaignDetailPage() {
  const routeParams = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = String(routeParams?.projectId || '');
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
  const { initState, executeDonation, bootstrapGuestWallet } = useGuestWallet();
  /** Flag đánh dấu user đã bấm nút "Quyên góp ẩn danh" hay chưa */
  const [hasInitiatedAnonymous, setHasInitiatedAnonymous] = useState(false);

  // Project data
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [bannerCoverUrl, setBannerCoverUrl] = useState<string>('');
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState('');

  // Auth check
  const { isLoggedIn, sessionData, syncSessionFromStorage } = useAuthCheck();
  const [isLoginModalVisible, setIsLoginModalVisible] = useState(false);

  // History
  const [historyList, setHistoryList] = useState<DonationHistoryItem[]>([]);

  // Token balance on-chain
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  // Header user menu
  const [isNavbarScrolled, setIsNavbarScrolled] = useState(false);
  const [isUserMenuVisible, setIsUserMenuVisible] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const userMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  /** Hàm toggle menu người dùng trên header. */
  const handleToggleUserMenu = () => {
    setIsUserMenuVisible(currentState => !currentState);
  };

  /** Hàm đóng menu người dùng khi click ra ngoài. */
  const handleHeaderUserLogout = () => {
    clearAuthSession();
    setIsUserMenuVisible(false);
    // Fire event để các component khác (useAuthCheck, LoginModal) nhận biết logout
    window.dispatchEvent(new Event('dcpAuthSessionUpdated'));
  };

  /** Hàm đóng login modal — ở trang này chỉ đóng modal, không redirect. */
  const handleCloseLoginModal = useCallback(() => {
    setIsLoginModalVisible(false);
  }, []);

  /** Hàm mở login modal khi click nút Đăng nhập trên header. */
  const handleOpenLoginModal = () => {
    setIsLoginModalVisible(true);
  };

  /** Hàm effect scroll cho navbar. */
  useEffect(() => {
    const handleScroll = () => {
      setIsNavbarScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /**
   * Hàm tải số dư token on-chain của người dùng đã đăng nhập.
   * Mục đích: sử dụng cùng endpoint và logic với trang /deposit để đảm bảo số dư on-chain đồng nhất.
   */
  const loadTokenBalance = useCallback(async () => {
    const session = readAuthSession();
    if (!session.accessToken?.trim()) {
      return;
    }

    try {
      const response = await fetch(`${backendBaseUrl}/api/deposit/sidebar`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.accessToken}`
        }
      });

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        return;
      }

      const responsePayload = await response.json() as { tokenBalanceOnChain?: number; tokenBalance?: number };
      const tokenBalanceOnChain = Number(responsePayload.tokenBalanceOnChain ?? responsePayload.tokenBalance ?? 0);
      setTokenBalance(tokenBalanceOnChain);
    } catch {
      // Không hiển thị lỗi cho user — balance có thể không critical
    }
  }, [backendBaseUrl]);

  /**
   * Effect sync token balance khi sessionData thay đổi (sau khi đăng nhập thành công).
   * Mục đích: loadTokenBalance được gọi tự động khi sessionData có accessToken mới
   * nhờ useAuthCheck đã sync sessionData ngay khi event "dcpAuthSessionUpdated" được fire.
   */
  const syncTokenBalanceOnLogin = useCallback(() => {
    if (sessionData.accessToken?.trim()) {
      void loadTokenBalance();
    } else {
      setTokenBalance(0);
    }
  }, [sessionData.accessToken, loadTokenBalance]);

  useEffect(() => {
    syncTokenBalanceOnLogin();
  }, [syncTokenBalanceOnLogin]);

  // Donation mode
  const [donationMode, setDonationMode] = useState<DonationMode>(null);
  const [donationAmountInput, setDonationAmountInput] = useState('');

  // Public donation state
  const [isPublicSubmitting, setIsPublicSubmitting] = useState(false);
  const [publicStatus, setPublicStatus] = useState<TransactionStatus>('idle');
  const [publicMessage, setPublicMessage] = useState('');
  const [isPublicConfirmOpen, setIsPublicConfirmOpen] = useState(false);
  const [pendingPublicAmount, setPendingPublicAmount] = useState<number | null>(null);

  // Anonymous donation state
  const [isAnonymousSubmitting, setIsAnonymousSubmitting] = useState(false);
  const [anonymousStatus, setAnonymousStatus] = useState<string>('IDLE');
  const [anonymousMessage, setAnonymousMessage] = useState('');

  /**
   * Hàm tải dữ liệu dự án và lịch sử donation.
   * Mục đích: dùng cho tải trang ban đầu và refresh sau khi donate thành công.
   */
  const loadProjectData = async () => {
    if (!projectId) {
      setProjectError('Không tìm thấy mã dự án hợp lệ.');
      setIsProjectLoading(false);
      return;
    }

    setIsProjectLoading(true);
    setProjectError('');

    try {
      const [basicResponse, statsResponse, historyResponse] = await Promise.all([
        fetchApi<ProjectBasicInfo | null>(buildApiUrl(`/projects/public-support/${projectId}`), {
          method: 'GET',
          cache: 'no-store',
        }),
        fetchApi<ProjectStats | null>(buildApiUrl(`/donations/campaigns/${projectId}`), {
          method: 'GET',
          cache: 'no-store',
        }),
        fetchApi<DonationHistoryItem[]>(buildApiUrl(`/donations/campaigns/${projectId}/history?limit=20`), {
          method: 'GET',
          cache: 'no-store',
        }),
      ]);

      if (!basicResponse.data) {
        setProjectError('Dự án không tồn tại hoặc đã bị xóa.');
        setIsProjectLoading(false);
        return;
      }

      // Ghép dữ liệu từ 2 endpoint: project info + donation stats
      const stats = statsResponse.data;
      const basic = basicResponse.data;
      setProjectDetail({
        projectId: basic.projectId,
        name: basic.name,
        description: basic.description,
        goalAmount: basic.goalAmount,
        status: basic.status,
        deadline: basic.deadline,
        evidenceCids: basic.evidenceCids,
        evidenceFiles: basic.evidenceFiles,
        creatorName: basic.creatorName,
        lastDonationAt: basic.lastDonationAt,
        coverImageUrl: basic.coverImageUrl,
        donatedAmount: stats?.donatedAmount ?? 0,
        donationCount: stats?.donationCount ?? 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setHistoryList(historyResponse.data);

      // Resolve cover image URL từ evidenceFiles giống trang chủ
      const firstImageCid = await resolveFirstProjectImageCidForDetail(basic);
      const coverUrl = firstImageCid ? buildIpfsGatewayUrl(firstImageCid) : '';
      setBannerCoverUrl(coverUrl);

      await loadTokenBalance();
    } catch (error) {
      const apiError = error as ApiErrorResponse;
      setProjectError(apiError.message || 'Không thể tải dữ liệu dự án. Vui lòng thử lại.');
    } finally {
      setIsProjectLoading(false);
    }
  };

  useEffect(() => {
    void loadProjectData();
  }, [projectId]);

  // Public donation handlers
  /** Hàm mở quyên góp công khai — kiểm tra đăng nhập trước. */
  const handleOpenPublicDonation = () => {
    const authSession = readAuthSession();
    if (!authSession.accessToken?.trim()) {
      router.push(`/login?redirect=/donations/${projectId}`);
      return;
    }
    setDonationMode('public');
    setDonationAmountInput('');
    setPublicStatus('idle');
    setPublicMessage('');
  };

  /** Hàm đóng quyên góp công khai. */
  const handleClosePublicDonation = () => {
    setDonationMode(null);
    setDonationAmountInput('');
    setPublicStatus('idle');
    setPublicMessage('');
    setIsPublicConfirmOpen(false);
    setPendingPublicAmount(null);
  };

  /** Hàm mở modal xác nhận quyên góp công khai. */
  const handleOpenPublicConfirm = () => {
    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setPublicMessage('Vui lòng nhập số token lớn hơn 0.');
      return;
    }
    if (!projectDetail || !isProjectEligibleForDonation(projectDetail)) {
      setPublicMessage('Dự án hiện không đủ điều kiện nhận quyên góp.');
      return;
    }
    setPendingPublicAmount(parsedAmount);
    setIsPublicConfirmOpen(true);
  };

  /** Hàm xác nhận và gửi quyên góp công khai. */
  const handleConfirmPublicDonation = async () => {
    if (isPublicSubmitting || !projectDetail || pendingPublicAmount === null) return;

    try {
      setIsPublicSubmitting(true);
      setPublicStatus('processing');
      setPublicMessage('Đang gửi giao dịch quyên góp qua hệ thống...');
      setIsPublicConfirmOpen(false);

      const { accessToken } = readAuthSession();
      const txHash = await executeOneClickDonationRequest(accessToken ?? '', projectDetail.projectId, pendingPublicAmount, false);

      setPublicStatus('success');
      setPublicMessage(`Quyên góp thành công! TxHash: ${formatTransactionHash(String(txHash))}`);
      setDonationAmountInput('');
      setPendingPublicAmount(null);
      await loadProjectData();
    } catch (error) {
      setPublicStatus('failed');
      setPublicMessage(mapDonationErrorMessage(error));
    } finally {
      setIsPublicSubmitting(false);
    }
  };

  // Anonymous donation handlers
  /** Hàm mở quyên góp ẩn danh — bắt đầu bootstrap ví. */
  const handleOpenAnonymousDonation = () => {
    // flushSync buộc React commit render NGAY trước khi async init bắt đầu
    flushSync(() => {
      setDonationMode('anonymous');
      setDonationAmountInput('');
      setAnonymousStatus('IDLE');
      setAnonymousMessage('');
      setHasInitiatedAnonymous(true);
    });
    void bootstrapGuestWallet();
  };

  /** Hàm đóng quyên góp ẩn danh. */
  const handleCloseAnonymousDonation = () => {
    setDonationMode(null);
    setDonationAmountInput('');
    setAnonymousStatus('IDLE');
    setAnonymousMessage('');
    setHasInitiatedAnonymous(false);
  };

  /** Hàm gửi quyên góp ẩn danh qua guest wallet. */
  const handleSubmitAnonymousDonation = async () => {
    if (isAnonymousSubmitting || !projectDetail) return;

    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount < MIN_AMOUNT_PER_DONATION || parsedAmount > MAX_AMOUNT_PER_DONATION) {
      setAnonymousMessage(`Vui lòng nhập số token từ ${MIN_AMOUNT_PER_DONATION} đến ${MAX_AMOUNT_PER_DONATION.toLocaleString()}.`);
      return;
    }

    try {
      setIsAnonymousSubmitting(true);
      setAnonymousStatus('BUILDING_USER_OP');
      setAnonymousMessage('Đang xây dựng giao dịch...');

      const result = await executeDonation(projectDetail.projectId, parsedAmount);

      if (result) {
        setAnonymousStatus('SUCCESS');
        setAnonymousMessage('Quyên góp ẩn danh thành công! Cảm ơn bạn vì tấm lòng sẻ chia.');
        setDonationAmountInput('');
        await loadProjectData();
      } else {
        setAnonymousStatus('FAILED');
        setAnonymousMessage('Giao dịch không thành công. Vui lòng thử lại.');
      }
    } catch (error) {
      setAnonymousStatus('FAILED');
      setAnonymousMessage(mapDonationErrorMessage(error));
    } finally {
      setIsAnonymousSubmitting(false);
    }
  };

  // Render
  return (
    <>
      {isLoginModalVisible && (
        <LoginModal onClose={handleCloseLoginModal} />
      )}
      <main className="project-detail-page">
      <nav id="navbar" className={isNavbarScrolled ? 'scrolled' : ''}>
        <a href="/" className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24">
              <path d="M12 21.7C5.8 17.5 2 13.2 2 9a6 6 0 0112 0 6 6 0 0112 0c0 4.2-3.8 8.5-10 12.7z" />
            </svg>
          </div>
          <div>
            <span className="logo-text">DCP</span>
            <span className="logo-tag">Minh bạch tuyệt đối</span>
          </div>
        </a>
        <ul className="nav-links">
          <li><a href="/#projects">Dự án</a></li>
          <li><a href="/#transparency">Minh bạch</a></li>
        </ul>
        <div className="nav-actions">
          {sessionData.userFullName ? (
            <div className="relative" ref={userMenuContainerRef}>
              <button
                ref={userMenuButtonRef}
                type="button"
                className="btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7c6b] focus-visible:ring-offset-2"
                aria-label="Mở menu người dùng"
                aria-haspopup="menu"
                aria-expanded={isUserMenuVisible}
                onClick={handleToggleUserMenu}
              >
                <span aria-hidden="true">👤</span> {sessionData.userFullName}
              </button>
              <div
                className={`absolute right-0 top-[calc(100%+10px)] z-20 min-w-[170px] rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_12px_32px_rgba(13,17,23,0.14)] transition-all duration-150 ${isUserMenuVisible ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
                  }`}
              >
                <button
                  type="button"
                  className="flex min-h-[44px] w-full items-center justify-start rounded-lg px-3.5 py-2.5 text-sm font-semibold text-[#0d1117] transition-colors duration-150 hover:bg-[#f3f4f6] active:bg-[#e5e7eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7c6b]"
                  onClick={handleHeaderUserLogout}
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={handleOpenLoginModal}>
              Đăng nhập
            </button>
          )}
          {sessionData.accessToken && (
            <span className="rounded-full border border-[#0e7c6b]/40 bg-[#0e7c6b]/15 px-3 py-1 text-xs font-semibold text-[#0e7c6b]">
              💎 {tokenBalance.toLocaleString('vi-VN')} Token
            </span>
          )}
          <a href="/deposit" className="btn-amber">
            💰 Nạp tiền
          </a>
          <button
            type="button"
            className={`mobile-hamburger${isMobileMenuOpen ? ' is-open' : ''}`}
            aria-label={isMobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <svg className="mobile-hamburger-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <g className="hamburger-bars">
                <path d="M4 7H20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M4 12H20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M4 17H20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </g>
              <g className="hamburger-close">
                <path d="M5 5L19 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M19 5L5 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </svg>
          </button>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)} aria-hidden="true" />
          <div id="mobile-menu" className="mobile-menu-drawer" role="dialog" aria-modal="true" aria-label="Menu điều hướng">
            <div className="mobile-menu-header">
              <span className="logo-text">DCP</span>
              <button type="button" className="mobile-menu-close" aria-label="Đóng menu" onClick={() => setIsMobileMenuOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <ul className="mobile-menu-links">
              <li>
                <a href="/#projects" onClick={() => setIsMobileMenuOpen(false)}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M2 6C2 4.9 2.9 4 4 4H7L9 6H16C17.1 6 18 6.9 18 8V14C18 15.1 17.1 16 16 16H4C2.9 16 2 15.1 2 14V6Z" fill="#F59E0B" />
                    <path d="M2 8H18V14C18 15.1 17.1 16 16 16H4C2.9 16 2 15.1 2 14V8Z" fill="#FBBF24" />
                    <path d="M10 9V12M8.5 10.5H11.5" stroke="#FEFCE8" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Dự án
                </a>
              </li>
              <li>
                <a href="/#transparency" onClick={() => setIsMobileMenuOpen(false)}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 2L17 5V10C17 13.5 14 16.5 10 18C6 16.5 3 13.5 3 10V5L10 2Z" fill="#0E7C6B" />
                    <path d="M10 2L17 5V10C17 13.5 14 16.5 10 18C6 16.5 3 13.5 3 10V5L10 2Z" stroke="#0D9488" strokeWidth="1.5" />
                    <path d="M7 10L9 12L13 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Minh bạch
                </a>
              </li>
            </ul>
            <div className="mobile-menu-actions">
              {sessionData.userFullName ? (
                <>
                  <div className="mobile-menu-user">
                    <div className="mobile-menu-avatar">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <circle cx="10" cy="7" r="4" fill="#0E7C6B" />
                        <path d="M2 18C2 14.5 5.5 12 10 12C14.5 12 18 14.5 18 18" stroke="#0E7C6B" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="mobile-menu-user-info">
                      <span className="mobile-menu-user-name">{(sessionData.userFullName || 'Người dùng').length > 14 ? (sessionData.userFullName || 'Người dùng').slice(0, 14) + '…' : (sessionData.userFullName || 'Người dùng')}</span>
                      <span className="mobile-menu-user-badge">Đã đăng nhập</span>
                    </div>
                  </div>
                  <a href="/deposit" className="btn-amber" onClick={() => setIsMobileMenuOpen(false)}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M2 5H16C16.55 5 17 5.45 17 6V14C17 14.55 16.55 15 16 15H2C1.45 15 1 14.55 1 14V6C1 5.45 1.45 5 2 5Z" fill="#059669" />
                      <path d="M2 5H16C16.55 5 17 5.45 17 6V9H1V6C1 5.45 1.45 5 2 5Z" fill="#10B981" />
                      <rect x="1" y="6" width="16" height="3" fill="#10B981" />
                      <circle cx="9" cy="12.5" r="3" fill="#34D399" />
                      <path d="M9 11V14M7.5 12.5H10.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Nạp tiền
                  </a>
                  <button
                    type="button"
                    className="mobile-menu-logout"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleHeaderUserLogout();
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M6 3H3C2.45 3 2 3.45 2 4V12C2 12.55 2.45 13 3 13H6" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M10 11L13 8L10 5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M13 8H5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Đăng xuất
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-ghost w-full" onClick={() => { setIsMobileMenuOpen(false); handleOpenLoginModal(); }}>Đăng nhập</button>
                  <a href="/deposit" className="btn-amber" onClick={() => setIsMobileMenuOpen(false)}>💰 Nạp tiền</a>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Back button */}
        <div className="mb-6">
          <Link href="/" className="project-detail-back">
            ← Quay về trang chủ
          </Link>
        </div>

      {/* Loading */}
      {isProjectLoading && (
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-8 text-center">
          <div className="project-detail-modal-spinner mx-auto" />
          <p className="mt-3 text-sm font-medium text-[#4b5563]">Đang tải chi tiết dự án...</p>
        </div>
      )}

      {/* Error */}
      {!isProjectLoading && projectError && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fff1f2] p-6 text-center">
          <p className="text-sm font-medium text-[#b91c1c]">{projectError}</p>
          <button
            type="button"
            onClick={() => void loadProjectData()}
            className="mt-3 rounded-md bg-[#0e7c6b] px-4 py-2 text-sm font-semibold text-white"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Content */}
      {!isProjectLoading && !projectError && projectDetail && (
        <>
          <ProjectBanner project={projectDetail} coverImageUrl={bannerCoverUrl} />
          <ProjectInfoSection project={projectDetail} />
          <ProjectProgressSection project={projectDetail} />
          <EvidenceSection project={projectDetail} />

          <DonationSection
            project={projectDetail}
            donationMode={donationMode}
            donationAmountInput={donationAmountInput}
            setDonationAmountInput={setDonationAmountInput}
            isPublicSubmitting={isPublicSubmitting}
            publicStatus={publicStatus}
            publicMessage={publicMessage}
            isPublicConfirmOpen={isPublicConfirmOpen}
            pendingPublicAmount={pendingPublicAmount}
            isAnonymousSubmitting={isAnonymousSubmitting}
            anonymousStatus={anonymousStatus}
            anonymousMessage={anonymousMessage}
            hasInitiatedAnonymous={hasInitiatedAnonymous}
            initState={initState}
            isLoggedIn={isLoggedIn}
            onOpenPublicDonation={handleOpenPublicDonation}
            onClosePublicDonation={handleClosePublicDonation}
            onOpenPublicConfirm={handleOpenPublicConfirm}
            onClosePublicConfirm={() => {
              setIsPublicConfirmOpen(false);
              setPendingPublicAmount(null);
            }}
            onConfirmPublicDonation={handleConfirmPublicDonation}
            onOpenAnonymousDonation={handleOpenAnonymousDonation}
            onCloseAnonymousDonation={handleCloseAnonymousDonation}
            onSubmitAnonymousDonation={handleSubmitAnonymousDonation}
          />

          <DonationHistorySection historyList={historyList} />
        </>
      )}
      </div>
    </main>
  </>
  );
}
