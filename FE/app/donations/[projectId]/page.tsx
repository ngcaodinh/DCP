'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiErrorResponse, buildApiUrl, fetchApi } from '../../utils/apiClient';
import { readAuthSession } from '../../utils/authSession';
import { useGuestWallet } from '../../components/GuestWalletProvider';
import { executeOneClickDonationRequest } from '../components/DonationModal.services';
import {
  formatWalletAddress,
  mapDonationErrorMessage,
  isCampaignBeforeDeadline,
} from '../components/DonationModal.helpers';
import IpfsEvidencePreviewCard from '../../components/common/IpfsEvidencePreviewCard';
import { buildIpfsGatewayUrl, getIpfsContentType, resolveIpfsPreviewKind } from '../../utils/ipfs';
import {
  MIN_AMOUNT_PER_DONATION,
  MAX_AMOUNT_PER_DONATION,
} from '../../constants/guestDonationLimits';
import {
  initPayosDonation,
  getPayosDonationStatus,
  type PayosDonationStatus,
} from '../../utils/guestPayosClient';

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

/** Component tiến độ dự án. */
function ProjectProgressSection({ project }: { project: ProjectDetail }) {
  const donationPercent = calculateDonationPercent(project.donatedAmount, project.goalAmount);

  return (
    <section className="project-detail-section mb-6">
      <h2 className="project-detail-section-title">Tiến độ gây quỹ</h2>
      <div className="mb-3 mt-4 flex items-center justify-between text-sm text-[#4b5563]">
        <span>Đã quyên góp: {formatCurrencyVnd(project.donatedAmount)} token</span>
        <span>Mục tiêu: {formatCurrencyVnd(project.goalAmount)} token</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#d1fae5]">
        <div className="h-full rounded-full bg-[#10b981]" style={{ width: `${donationPercent}%` }} />
      </div>
      <div className="mt-3 text-right text-sm font-medium text-[#0e7c6b]">{donationPercent}% hoàn thành</div>
    </section>
  );
}

/** Component danh sách bằng chứng IPFS. */
function EvidenceSection({ project }: { project: ProjectDetail }) {
  const hasEvidence = project.evidenceCids.length > 0;

  return (
    <section className="project-detail-section mb-6">
      <h2 className="project-detail-section-title">Bằng chứng minh bạch</h2>
      {!hasEvidence ? (
        <p className="mt-3 text-sm text-[#6b7280]">Dự án chưa có tệp bằng chứng.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {project.evidenceCids.map((evidenceCid, index) => {
            const evidenceFile = project.evidenceFiles?.find(file => file.cid === evidenceCid);
            return (
              <IpfsEvidencePreviewCard
                key={evidenceCid}
                cid={evidenceCid}
                fileName={evidenceFile?.fileName || `Bằng chứng #${index + 1}`}
                mimeType={evidenceFile?.mimeType}
                compact
              />
            );
          })}
        </div>
      )}
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
  anonymousWalletAddress: string | null;
  anonymousRemainingDonations: number;
  anonymousDonationCount: number;
  anonymousHasPendingDonation: boolean;
  isLoggedIn: boolean;
  payosPaymentUrl: string | null;
  payosStatus: PayosDonationStatus | null;
  isAwaitingAnonymousPayment: boolean;
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
    anonymousWalletAddress,
    anonymousRemainingDonations,
    anonymousDonationCount,
    anonymousHasPendingDonation,
    isLoggedIn,
    payosPaymentUrl,
    payosStatus,
    isAwaitingAnonymousPayment,
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
            <button
              type="button"
              onClick={onOpenPublicDonation}
              className="project-detail-donation-btn btn-public"
            >
              <span className="text-2xl">🏛️</span>
              <span className="font-semibold">Quyên góp công khai</span>
              <span className="text-xs opacity-70">Cần đăng nhập tài khoản đã xác minh</span>
            </button>
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

  const payosStatusText =
    payosStatus === 'PENDING_PAYMENT'
      ? 'Đang chờ thanh toán PayOS'
      : payosStatus === 'PAYMENT_CONFIRMED'
        ? 'Đã nhận thanh toán, hệ thống đang chuẩn bị quyên góp'
        : payosStatus === 'MINTING'
          ? 'Hệ thống đang mint token để thực hiện quyên góp'
          : payosStatus === 'RELAYING'
            ? 'Hệ thống đang gửi giao dịch quyên góp lên blockchain'
            : payosStatus === 'COMPLETED'
              ? 'Quyên góp thành công'
              : payosStatus === 'FAILED'
                ? 'Thanh toán thất bại'
                : '';

  return (
    <section className="project-detail-form-section anonymous mb-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#4338ca]">🔐 Quyên góp ẩn danh</h2>
        <button type="button" onClick={onCloseAnonymousDonation} className="text-sm text-[#6b7280] hover:text-[#374151]">
          ✕ Đóng
        </button>
      </div>

      {!hasInitiatedAnonymous ? (
        <div className="rounded-lg border border-[#e0e7ff] bg-[#eef2ff] p-4 text-sm text-[#4338ca]">
          Hệ thống đang chuẩn bị ví ẩn danh. Vui lòng đợi trong giây lát...
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-gray-50 px-3 py-2 text-xs text-[#374151]">
            <span>
              Ví: <span className="font-mono font-medium">{formatWalletAddress(anonymousWalletAddress ?? '')}</span>
            </span>
            <span className="text-[#9ca3af]">|</span>
            <span>
              Còn lại: <span className="font-semibold text-[#4338ca]">{anonymousRemainingDonations}</span>/3 lần
            </span>
            <span className="text-[#9ca3af]">|</span>
            <span>
              Đã dùng: <span className="font-medium">{anonymousDonationCount}</span> lần
            </span>
          </div>

          {anonymousHasPendingDonation && (
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
            disabled={isAnonymousSubmitting || isAwaitingAnonymousPayment}
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
                    : 'border border-[#c7d2fe] bg-[#eef2ff] text-[#3730a3]'
              }`}
            >
              {anonymousMessage}
            </p>
          )}

          {isAwaitingAnonymousPayment && payosPaymentUrl && (
            <div className="mt-4 rounded-xl border border-[#c7d2fe] bg-[#eef2ff] p-4">
              <p className="text-sm font-semibold text-[#3730a3]">Tiếp tục thanh toán PayOS để hoàn tất quyên góp</p>
              {payosStatusText && <p className="mt-1 text-xs text-[#4338ca]">Trạng thái: {payosStatusText}</p>}
              <a
                href={payosPaymentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-md bg-[#4338ca] px-4 py-2 text-sm font-semibold text-white"
              >
                Mở trang thanh toán PayOS
              </a>
            </div>
          )}

          <button
            type="button"
            disabled={isAnonymousSubmitting || anonymousRemainingDonations <= 0 || isAwaitingAnonymousPayment}
            onClick={onSubmitAnonymousDonation}
            className="project-detail-submit-btn anonymous mt-3"
          >
            {isAnonymousSubmitting
              ? 'Đang xử lý...'
              : isAwaitingAnonymousPayment
                ? 'Đang chờ thanh toán...'
                : 'Quyên góp ẩn danh'}
          </button>
        </>
      )}
    </section>
  );
}

/** Component lịch sử quyên góp. */
function DonationHistorySection({ historyList }: { historyList: DonationHistoryItem[] }) {
  return (
    <section className="project-detail-section mb-6">
      <h2 className="project-detail-section-title">Lịch sử quyên góp gần đây</h2>
      <div className="space-y-3">
        {historyList.length === 0 ? (
          <p className="text-sm text-[#6b7280]">Chưa có lượt quyên góp nào.</p>
        ) : (
          historyList.map((historyItem, index) => (
            <div key={`${historyItem.transactionHash}-${index}`} className="rounded-lg border border-[#e5e7eb] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#111827]">
                    {historyItem.isAnonymous ? 'Người quyên góp ẩn danh' : formatWalletAddress(historyItem.donorAddress)}
                  </p>
                  <p className="text-xs text-[#6b7280]">{new Date(historyItem.timestamp).toLocaleString('vi-VN')}</p>
                </div>
                <span className="rounded-full bg-[#ecfdf5] px-3 py-1 text-sm font-semibold text-[#0e7c6b]">
                  {formatCurrencyVnd(historyItem.amount)} token
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Hàm dựng đường dẫn returnTo an toàn từ route hiện tại.
 * Mục đích: giữ người dùng quay lại đúng trang quyên góp sau khi đăng nhập.
 * @param pathnameValue - Đường dẫn hiện tại không gồm query string
 * @param searchParamsValue - Tập query string hiện tại trên URL
 * @returns Đường dẫn đầy đủ gồm pathname và query string hiện tại
 */
function buildCurrentReturnToPath(
  pathnameValue: string,
  searchParamsValue: ReturnType<typeof useSearchParams>
): string {
  const currentSearchParams = searchParamsValue.toString();
  return `${pathnameValue}${currentSearchParams ? `?${currentSearchParams}` : ''}`;
}

/** Trang chi tiết dự án quyên góp. */
export default function DonationProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = params?.projectId;
  const { accessToken } = readAuthSession();
  const isLoggedIn = Boolean(accessToken);
  const { initState, bootstrapGuestWallet } = useGuestWallet();

  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [historyList, setHistoryList] = useState<DonationHistoryItem[]>([]);
  const [bannerCoverUrl, setBannerCoverUrl] = useState('');
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState('');

  const [donationMode, setDonationMode] = useState<DonationMode>(null);
  const [donationAmountInput, setDonationAmountInput] = useState('');

  const [isPublicSubmitting, setIsPublicSubmitting] = useState(false);
  const [publicStatus, setPublicStatus] = useState<TransactionStatus>('idle');
  const [publicMessage, setPublicMessage] = useState('');
  const [isPublicConfirmOpen, setIsPublicConfirmOpen] = useState(false);
  const [pendingPublicAmount, setPendingPublicAmount] = useState<number | null>(null);

  const [isAnonymousSubmitting, setIsAnonymousSubmitting] = useState(false);
  const [anonymousStatus, setAnonymousStatus] = useState<string>('IDLE');
  const [anonymousMessage, setAnonymousMessage] = useState('');
  const [hasInitiatedAnonymous, setHasInitiatedAnonymous] = useState(false);
  const [payosPaymentUrl, setPayosPaymentUrl] = useState<string | null>(null);
  const [payosOrderCode, setPayosOrderCode] = useState<string | null>(null);
  const [payosStatus, setPayosStatus] = useState<PayosDonationStatus | null>(null);
  const [isAwaitingAnonymousPayment, setIsAwaitingAnonymousPayment] = useState(false);

  /**
   * Hàm tải dữ liệu dự án và lịch sử donation.
   * Mục đích: dùng cho tải trang ban đầu và refresh sau khi donate thành công.
   */
  const loadProjectData = useCallback(async () => {
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

      const firstImageCid = await resolveFirstProjectImageCidForDetail(basic);
      const coverUrl = firstImageCid ? buildIpfsGatewayUrl(firstImageCid) : '';
      setBannerCoverUrl(coverUrl);
    } catch (error) {
      const apiError = error as ApiErrorResponse;
      setProjectError(apiError.message || 'Không thể tải dữ liệu dự án. Vui lòng thử lại.');
    } finally {
      setIsProjectLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProjectData();
  }, [loadProjectData]);

  /**
   * Effect poll trạng thái donation PayOS cho guest.
   * Mục đích: cập nhật UI anonymous mà không thay đổi UI public.
   */
  useEffect(() => {
    if (!isAwaitingAnonymousPayment || !payosOrderCode || !initState.guestSessionToken) return;

    const pollIntervalId = window.setInterval(async () => {
      try {
        const statusResponse = await getPayosDonationStatus(payosOrderCode, initState.guestSessionToken!);
        setPayosStatus(statusResponse.status);

        if (statusResponse.status === 'COMPLETED') {
          window.clearInterval(pollIntervalId);
          setIsAwaitingAnonymousPayment(false);
          setIsAnonymousSubmitting(false);
          setAnonymousStatus('SUCCESS');
          setAnonymousMessage('Quyên góp ẩn danh thành công! Cảm ơn bạn vì tấm lòng sẻ chia.');
          setDonationAmountInput('');
          await loadProjectData();
        } else if (statusResponse.status === 'FAILED') {
          window.clearInterval(pollIntervalId);
          setIsAwaitingAnonymousPayment(false);
          setIsAnonymousSubmitting(false);
          setAnonymousStatus('FAILED');
          setAnonymousMessage(statusResponse.errorMessage || 'Thanh toán thất bại. Vui lòng thử lại.');
        } else if (statusResponse.status === 'PAYMENT_CONFIRMED' || statusResponse.status === 'MINTING' || statusResponse.status === 'RELAYING') {
          setAnonymousStatus('PROCESSING');
          setAnonymousMessage('Đã nhận thanh toán, hệ thống đang xử lý quyên góp của bạn...');
        }
      } catch {
        // Bỏ qua lỗi poll tạm thời để tránh làm gián đoạn trải nghiệm người dùng.
      }
    }, 3000);

    return () => window.clearInterval(pollIntervalId);
  }, [isAwaitingAnonymousPayment, payosOrderCode, initState.guestSessionToken, loadProjectData]);

  /**
   * Hàm mở form quyên góp công khai.
   * Mục đích: giữ nguyên UI phân tách 2 luồng donate như trước.
   */
  const handleOpenPublicDonation = () => {
    if (!accessToken) {
      setPublicStatus('failed');
      setPublicMessage('Vui lòng đăng nhập để sử dụng quyên góp công khai.');
      const returnToPath = buildCurrentReturnToPath(pathname, searchParams);
      router.push(`/login?returnTo=${encodeURIComponent(returnToPath)}`);
      return;
    }

    setDonationMode('public');
    setDonationAmountInput('');
    setPublicStatus('idle');
    setPublicMessage('');
  };

  /**
   * Hàm đóng form quyên góp công khai.
   * Mục đích: reset trạng thái confirm và input public.
   */
  const handleClosePublicDonation = () => {
    setDonationMode(null);
    setDonationAmountInput('');
    setIsPublicConfirmOpen(false);
    setPendingPublicAmount(null);
  };

  /**
   * Hàm mở form quyên góp ẩn danh.
   * Mục đích: giữ nguyên UI cũ nhưng bootstrap ví guest cho flow PayOS mới.
   */
  const handleOpenAnonymousDonation = async () => {
    setDonationMode('anonymous');
    setDonationAmountInput('');
    setAnonymousStatus('INITIALIZING');
    setAnonymousMessage('Đang khởi tạo ví ẩn danh...');
    setHasInitiatedAnonymous(false);

    try {
      await bootstrapGuestWallet();
      setHasInitiatedAnonymous(true);
      setAnonymousStatus('IDLE');
      setAnonymousMessage('Ví ẩn danh đã sẵn sàng. Bạn có thể nhập số token muốn quyên góp.');
    } catch (error) {
      setHasInitiatedAnonymous(true);
      setAnonymousStatus('FAILED');
      setAnonymousMessage(mapDonationErrorMessage(error));
    }
  };

  /**
   * Hàm đóng form quyên góp ẩn danh.
   * Mục đích: reset trạng thái thanh toán PayOS đang chờ.
   */
  const handleCloseAnonymousDonation = () => {
    setDonationMode(null);
    setDonationAmountInput('');
    setAnonymousStatus('IDLE');
    setAnonymousMessage('');
    setPayosPaymentUrl(null);
    setPayosOrderCode(null);
    setPayosStatus(null);
    setIsAwaitingAnonymousPayment(false);
  };

  /**
   * Hàm mở confirm cho public donation.
   * Mục đích: giữ nguyên xác nhận trước khi submit công khai.
   */
  const handleOpenPublicConfirm = () => {
    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !Number.isInteger(parsedAmount)) {
      setPublicStatus('failed');
      setPublicMessage('Số token quyên góp phải là số nguyên lớn hơn 0.');
      return;
    }

    setPendingPublicAmount(parsedAmount);
    setIsPublicConfirmOpen(true);
  };

  /**
   * Hàm xác nhận và submit public donation.
   * Mục đích: giữ nguyên luồng công khai cũ.
   */
  const handleConfirmPublicDonation = async () => {
    if (!projectDetail || pendingPublicAmount === null) return;
    if (!accessToken) {
      setPublicStatus('failed');
      setPublicMessage('Bạn chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại để quyên góp.');
      return;
    }

    try {
      setIsPublicSubmitting(true);
      setIsPublicConfirmOpen(false);
      setPublicStatus('processing');
      setPublicMessage('Hệ thống đang gửi giao dịch quyên góp, vui lòng chờ trong giây lát...');

      await executeOneClickDonationRequest(accessToken, projectDetail.projectId, pendingPublicAmount, false);

      setPublicStatus('success');
      setPublicMessage('Giao dịch quyên góp đã được xác nhận thành công trên blockchain.');
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

  /**
   * Hàm submit anonymous donation qua PayOS.
   * Mục đích: chỉ thay logic ẩn danh, không thay đổi UI hiển thị.
   */
  const handleSubmitAnonymousDonation = async () => {
    if (!projectDetail) return;

    const parsedAmount = Number(donationAmountInput);
    if (!Number.isFinite(parsedAmount) || !Number.isInteger(parsedAmount) || parsedAmount < MIN_AMOUNT_PER_DONATION || parsedAmount > MAX_AMOUNT_PER_DONATION) {
      setAnonymousStatus('FAILED');
      setAnonymousMessage(
        `Số token quyên góp phải là số nguyên từ ${MIN_AMOUNT_PER_DONATION} đến ${MAX_AMOUNT_PER_DONATION.toLocaleString()}.`
      );
      return;
    }

    if (!initState.guestSessionToken) {
      setAnonymousStatus('FAILED');
      setAnonymousMessage('Không tìm thấy phiên ví ẩn danh hợp lệ. Vui lòng mở lại form và thử lại.');
      return;
    }

    try {
      setIsAnonymousSubmitting(true);
      setAnonymousStatus('PROCESSING');
      setAnonymousMessage('Đang khởi tạo thanh toán PayOS cho quyên góp ẩn danh...');

      const response = await initPayosDonation(
        {
          projectId: projectDetail.projectId,
          amount: parsedAmount,
        },
        initState.guestSessionToken,
      );

      setPayosOrderCode(response.orderCode);
      setPayosPaymentUrl(response.paymentUrl);
      setPayosStatus('PENDING_PAYMENT');
      setIsAwaitingAnonymousPayment(true);
      setAnonymousStatus('PENDING');
      setAnonymousMessage('Vui lòng hoàn tất thanh toán trên PayOS để hệ thống thực hiện quyên góp ẩn danh.');
    } catch (error) {
      setIsAnonymousSubmitting(false);
      setAnonymousStatus('FAILED');
      setAnonymousMessage(mapDonationErrorMessage(error));
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <Link href="/" className="project-detail-back">
            ← Quay về trang chủ
          </Link>
        </div>

        {isProjectLoading && (
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-8 text-center">
            <div className="project-detail-modal-spinner mx-auto" />
            <p className="mt-3 text-sm font-medium text-[#4b5563]">Đang tải chi tiết dự án...</p>
          </div>
        )}

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
              anonymousWalletAddress={initState.walletAddress}
              anonymousRemainingDonations={initState.remainingDonations}
              anonymousDonationCount={initState.donationCount}
              anonymousHasPendingDonation={initState.hasPendingDonation}
              isLoggedIn={isLoggedIn}
              payosPaymentUrl={payosPaymentUrl}
              payosStatus={payosStatus}
              isAwaitingAnonymousPayment={isAwaitingAnonymousPayment}
              onOpenPublicDonation={handleOpenPublicDonation}
              onClosePublicDonation={handleClosePublicDonation}
              onOpenPublicConfirm={handleOpenPublicConfirm}
              onClosePublicConfirm={() => {
                setIsPublicConfirmOpen(false);
                setPendingPublicAmount(null);
              }}
              onConfirmPublicDonation={handleConfirmPublicDonation}
              onOpenAnonymousDonation={() => {
                void handleOpenAnonymousDonation();
              }}
              onCloseAnonymousDonation={handleCloseAnonymousDonation}
              onSubmitAnonymousDonation={() => {
                void handleSubmitAnonymousDonation();
              }}
            />

            <DonationHistorySection historyList={historyList} />
          </>
        )}
      </div>
    </main>
  );
}
