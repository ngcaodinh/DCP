import { useState } from 'react';
import { getPageTitle } from './helpers';
import type { PageKey, UrgentRequestItem } from './types';

type NonDashboardPanelProps = {
  selectedPageKey: PageKey;
  onOpenDisbursementRequest?: (urgentRequestItem: UrgentRequestItem) => void;
};

type KycApprovalRateItem = {
  labelText: string;
  valueText: string;
  progressWidthText: string;
  barClassName: string;
  valueClassName: string;
};

type DisbursementTableItem = {
  requestCodeText: string;
  projectNameText: string;
  organizationNameText: string;
  amountText: string;
  createdTimeText: string;
  statusText: string;
  statusClassName: string;
  signatureStateText: string;
  deadlineText: string;
  deadlineLevel: 'urgent' | 'normal' | 'ok';
};

const disbursementMetricItemList = [
  { labelText: 'Tổng yêu cầu giải ngân', valueText: '42', toneClassName: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
  { labelText: 'Đã phê duyệt (90.5%)', valueText: '38', toneClassName: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  { labelText: 'Đang chờ ký', valueText: '3', toneClassName: 'text-amber-700 bg-amber-50 border-amber-100' },
  { labelText: 'Bị từ chối', valueText: '1', toneClassName: 'text-red-700 bg-red-50 border-red-100' }
];

const monthlyDisbursementItemList = [
  { monthText: 'Tháng 1/2026', valueText: '3.6 tỷ', progressWidthText: '72%' },
  { monthText: 'Tháng 2/2026', valueText: '2.8 tỷ', progressWidthText: '55%' },
  { monthText: 'Tháng 3/2026', valueText: '4.2 tỷ', progressWidthText: '100%' }
];

const recentRequestItemList = [
  { requestCodeText: 'REQ-2026-0312', projectNameText: 'Xây trường học Tây Nguyên', amountText: '₫450,000,000', signatureStatusText: 'Đang chờ 2/3 chữ ký', toneClassName: 'border-amber-200 bg-amber-50 text-amber-800' },
  { requestCodeText: 'REQ-2026-0304', projectNameText: 'Nước sạch Hà Tĩnh', amountText: '₫150,000,000', signatureStatusText: 'Hạn xử lý 17:30 hôm nay', toneClassName: 'border-slate-200 bg-slate-50 text-slate-700' }
];

const disbursementTableItemList: DisbursementTableItem[] = [
  {
    requestCodeText: 'REQ-2026-0312',
    projectNameText: 'Xây trường học Tây Nguyên',
    organizationNameText: 'Quỹ Thiện Nguyện Việt',
    amountText: '₫450,000,000',
    createdTimeText: '22/03 14:10',
    statusText: 'Đang chờ ký',
    statusClassName: 'bg-amber-100 text-amber-700',
    signatureStateText: '2/3',
    deadlineText: 'Hôm nay',
    deadlineLevel: 'urgent'
  },
  {
    requestCodeText: 'REQ-2026-0304',
    projectNameText: 'Nước sạch Hà Tĩnh',
    organizationNameText: 'Hội Nước Sạch Hà Tĩnh',
    amountText: '₫150,000,000',
    createdTimeText: '21/03 16:30',
    statusText: 'Đã phê duyệt',
    statusClassName: 'bg-emerald-100 text-emerald-700',
    signatureStateText: '3/3',
    deadlineText: 'Đúng hạn',
    deadlineLevel: 'ok'
  },
  {
    requestCodeText: 'REQ-2026-0297',
    projectNameText: 'Quỹ học bổng miền núi',
    organizationNameText: 'Quỹ Trẻ Em Việt Xanh',
    amountText: '₫85,000,000',
    createdTimeText: '21/03 11:15',
    statusText: 'Bị từ chối',
    statusClassName: 'bg-red-100 text-red-700',
    signatureStateText: '1/3',
    deadlineText: 'Quá hạn',
    deadlineLevel: 'normal'
  }
];

/** Hàm chuyển một dòng dữ liệu giải ngân thành kiểu dữ liệu mở drawer dùng chung với tab Tổng quan. */
function buildUrgentRequestItem(disbursementTableItem: DisbursementTableItem): UrgentRequestItem {
  return {
    id: disbursementTableItem.requestCodeText,
    projectName: disbursementTableItem.projectNameText,
    organizationName: disbursementTableItem.organizationNameText,
    amountText: disbursementTableItem.amountText,
    signatureState: disbursementTableItem.signatureStateText,
    deadlineText: disbursementTableItem.deadlineText,
    deadlineLevel: disbursementTableItem.deadlineLevel
  };
}

/** Hàm hiển thị card thống kê giá trị giải ngân theo từng tháng bằng progress-bar. */
function MonthlyDisbursementCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
      <div className="border-b border-emerald-900/15 px-5 py-3 text-sm font-bold text-slate-900">Giá trị giải ngân theo tháng (VNĐ)</div>
      <div className="space-y-3 p-5">
        {monthlyDisbursementItemList.map(monthlyDisbursementItem => (
          <div key={monthlyDisbursementItem.monthText} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs">
            <span className="text-slate-700">{monthlyDisbursementItem.monthText}</span>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-gradient-to-r from-[#0E7C6B] to-[#1AAE97]" style={{ width: monthlyDisbursementItem.progressWidthText }} />
            </div>
            <span className="font-semibold text-slate-800">{monthlyDisbursementItem.valueText}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hàm hiển thị danh sách yêu cầu gần nhất cần ký để ưu tiên xử lý nhanh. */
function RecentRequestCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
      <div className="border-b border-emerald-900/15 px-5 py-3 text-sm font-bold text-slate-900">Yêu cầu cần ký gần nhất</div>
      <div className="space-y-2 p-4">
        {recentRequestItemList.map(recentRequestItem => (
          <div key={recentRequestItem.requestCodeText} className={`rounded-lg border p-3 ${recentRequestItem.toneClassName}`}>
            <p className="text-xs font-semibold">{recentRequestItem.requestCodeText} · {recentRequestItem.projectNameText}</p>
            <p className="mt-1 text-xs">{recentRequestItem.amountText} · {recentRequestItem.signatureStatusText}</p>
          </div>
        ))}
      </div>
    </div>
  );
}


/** Hàm hiển thị panel Ký duyệt Giải ngân bám theo bố cục page-disbursement của file mẫu. */
function DisbursementPanel({ onOpenDisbursementRequest }: { onOpenDisbursementRequest?: (urgentRequestItem: UrgentRequestItem) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-900/15 bg-white px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Ký duyệt Giải ngân</h2>
          <p className="mt-1 text-xs text-slate-500">Quản lý và ký xác nhận các yêu cầu giải ngân</p>
        </div>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-900/15 bg-[#0E7C6B] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0A5C50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1AAE97]/40 active:translate-y-px">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="M8 1v9M5 7l3 3 3-3M2 12v2h12v-2" /></svg>
          Xuất báo cáo
        </button>
      </div>

      <div className="grid gap-2 rounded-xl border border-emerald-900/15 bg-white p-3 sm:grid-cols-2 xl:grid-cols-5">
        <select className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option>Tất cả loại yêu cầu</option><option>Giải ngân</option><option>Hoàn trả</option></select>
        <select className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option>Tất cả trạng thái</option><option>Đã phê duyệt</option><option>Đang chờ ký</option><option>Bị từ chối</option></select>
        <select className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option>30 ngày gần nhất</option><option>7 ngày gần nhất</option><option>Tháng này</option></select>
        <input type="text" placeholder="Tìm theo mã yêu cầu" className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-700 placeholder:text-slate-400" />
        <button type="button" className="h-9 rounded-lg bg-[#1AAE97] px-4 text-xs font-semibold text-[#0A5C50] transition hover:bg-[#129b86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1AAE97]/40 active:translate-y-px">Tìm kiếm</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {disbursementMetricItemList.map(disbursementMetricItem => (
          <div key={disbursementMetricItem.labelText} className="rounded-xl border border-emerald-900/15 bg-white p-4">
            <p className="text-2xl font-bold text-slate-900">{disbursementMetricItem.valueText}</p>
            <span className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${disbursementMetricItem.toneClassName}`}>{disbursementMetricItem.labelText}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2"><MonthlyDisbursementCard /><RecentRequestCard /></div>

      <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
        <div className="border-b border-emerald-900/15 px-5 py-3 text-sm font-bold text-slate-900">Danh sách yêu cầu giải ngân</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Mã yêu cầu</th>
                <th className="px-5 py-2.5 font-semibold">Dự án / Tổ chức</th>
                <th className="px-5 py-2.5 font-semibold">Số tiền</th>
                <th className="px-5 py-2.5 font-semibold">Thời gian</th>
                <th className="px-5 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-5 py-2.5 font-semibold text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {disbursementTableItemList.map(disbursementTableItem => {
                const urgentRequestItem = buildUrgentRequestItem(disbursementTableItem);

                // Logic này giúp nút hành động dùng đúng luồng mở drawer giống tab Tổng quan.
                const handleOpenRequest = () => onOpenDisbursementRequest?.(urgentRequestItem);

                return (
                  <tr key={disbursementTableItem.requestCodeText} className="border-t border-slate-100 text-sm hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-[12px] text-cyan-700">{disbursementTableItem.requestCodeText}</td>
                    <td className="px-5 py-3 align-middle">
                      <p className="text-[13px] font-semibold leading-5 text-slate-900">{disbursementTableItem.projectNameText}</p>
                      <p className="mt-0.5 text-[12px] leading-4 text-slate-500">{disbursementTableItem.organizationNameText}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-[13px] font-semibold text-slate-800">{disbursementTableItem.amountText}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{disbursementTableItem.createdTimeText}</td>
                    <td className="px-5 py-3"><span className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${disbursementTableItem.statusClassName}`}>{disbursementTableItem.statusText}</span></td>
                    <td className="px-5 py-3 text-right"><button type="button" onClick={handleOpenRequest} className="rounded-md bg-[#1AAE97] px-3 py-1.5 text-[11px] font-bold leading-none text-[#0A5C50] transition hover:bg-[#129b86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1AAE97]/40 active:translate-y-px">Xem & Ký</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type KycProfileItem = {
  profileId: string;
  organizationNameText: string;
  submittedDateText: string;
  versionText: string;
  reviewStateCodeText: string;
  statusLabelText: string;
  statusClassName: string;
  avatarGradientClassName: string;
  legalNameText: string;
  taxCodeText: string;
  representativeNameText: string;
  registeredDateText: string;
  addressText: string;
  ipfsDocumentNameList: string[];
  ipfsCidText: string;
};

const kycProfileItemList: KycProfileItem[] = [
  {
    profileId: 'ORG-061', organizationNameText: 'Hội Từ thiện Cần Thơ', submittedDateText: '21/03/2026', versionText: 'v1', reviewStateCodeText: 'PENDING_REVIEW',
    statusLabelText: 'Chờ duyệt', statusClassName: 'bg-amber-100 text-amber-700 border-amber-200', avatarGradientClassName: 'from-sky-500 to-slate-900',
    legalNameText: 'Hội Từ thiện Cần Thơ', taxCodeText: '1800123456', representativeNameText: 'Nguyễn Văn Minh', registeredDateText: '15/06/2019',
    addressText: '150 Trần Hưng Đạo, Ninh Kiều, Cần Thơ', ipfsDocumentNameList: ['Giấy phép hoạt động.pdf', 'Điều lệ tổ chức.pdf', 'CCCD người đại diện.pdf'], ipfsCidText: 'Qmf4z9R...xPwL3K'
  },
  {
    profileId: 'ORG-058', organizationNameText: 'Quỹ Hy Vọng Xanh', submittedDateText: '20/03/2026', versionText: 'v2', reviewStateCodeText: 'RESUBMITTED',
    statusLabelText: 'Chờ duyệt', statusClassName: 'bg-amber-100 text-amber-700 border-amber-200', avatarGradientClassName: 'from-amber-500 to-orange-600',
    legalNameText: 'Quỹ Hy Vọng Xanh', taxCodeText: '0102234567', representativeNameText: 'Lê Thị Thanh', registeredDateText: '03/09/2020',
    addressText: '12 Lê Đại Hành, Hai Bà Trưng, Hà Nội', ipfsDocumentNameList: ['Hồ sơ cập nhật pháp lý.pdf', 'Biên bản đại hội.pdf'], ipfsCidText: 'QmL8g2Y...kPq81B'
  },
  {
    profileId: 'ORG-053', organizationNameText: 'Tổ chức Thiện Tâm VN', submittedDateText: '19/03/2026', versionText: 'v1', reviewStateCodeText: 'PENDING_REVIEW',
    statusLabelText: 'Chờ duyệt', statusClassName: 'bg-amber-100 text-amber-700 border-amber-200', avatarGradientClassName: 'from-emerald-500 to-green-700',
    legalNameText: 'Tổ chức Thiện Tâm Việt Nam', taxCodeText: '0304455667', representativeNameText: 'Phan Quốc Khánh', registeredDateText: '11/01/2018',
    addressText: '88 Pasteur, Quận 1, TP Hồ Chí Minh', ipfsDocumentNameList: ['Giấy xác nhận địa chỉ.pdf'], ipfsCidText: 'QmN3f7A...jR2kLm'
  },
  {
    profileId: 'ORG-047', organizationNameText: 'Mái ấm Từ Tâm', submittedDateText: '18/03/2026', versionText: 'v1', reviewStateCodeText: 'APPROVED',
    statusLabelText: 'Đã duyệt', statusClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200', avatarGradientClassName: 'from-indigo-500 to-indigo-700',
    legalNameText: 'Mái ấm Từ Tâm', taxCodeText: '0409988776', representativeNameText: 'Trịnh Anh Khoa', registeredDateText: '07/07/2017',
    addressText: '5 Nguyễn Văn Linh, Hải Châu, Đà Nẵng', ipfsDocumentNameList: ['Giấy chứng nhận hoạt động xã hội.pdf'], ipfsCidText: 'QmP8w4D...hL19mZ'
  },
  {
    profileId: 'ORG-039', organizationNameText: 'Sen Vàng Foundation', submittedDateText: '17/03/2026', versionText: 'v1', reviewStateCodeText: 'REJECTED',
    statusLabelText: 'Từ chối', statusClassName: 'bg-red-100 text-red-700 border-red-200', avatarGradientClassName: 'from-rose-500 to-red-800',
    legalNameText: 'Sen Vàng Foundation', taxCodeText: '0312348899', representativeNameText: 'Đinh Gia Hưng', registeredDateText: '26/04/2021',
    addressText: '20 Võ Văn Kiệt, Ninh Kiều, Cần Thơ', ipfsDocumentNameList: ['Hồ sơ pháp lý thiếu chữ ký.pdf'], ipfsCidText: 'QmA1b5X...pQ83cV'
  }
];

/** Hàm hiển thị panel Duyệt Hồ sơ KYC bám theo bố cục split-layout của file mẫu. */
function KycPanel() {
  const [selectedProfileId, setSelectedProfileId] = useState(kycProfileItemList[0]?.profileId ?? '');
  const selectedProfileItem = kycProfileItemList.find((kycProfileItem) => kycProfileItem.profileId === selectedProfileId) ?? kycProfileItemList[0];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-900/15 bg-white px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Duyệt Hồ sơ KYC</h2>
        <p className="mt-1 text-xs text-slate-500">Xác minh danh tính và hồ sơ pháp lý tổ chức từ thiện</p>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-emerald-900/15 bg-white lg:grid-cols-[340px_1fr]">
        <div className="border-r border-emerald-900/15 bg-white">
          <div className="border-b border-emerald-900/15 bg-slate-50 p-4">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="M11.7 10.3l3 3-1.4 1.4-3-3a6 6 0 111.4-1.4zm-5.7 1a4 4 0 100-8 4 4 0 000 8z" /></svg>
              <input type="text" placeholder="Tìm tổ chức..." className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" />
            </div>
          </div>

          <div className="max-h-[620px] overflow-y-auto">
            {kycProfileItemList.map((kycProfileItem) => {
              const isActiveItem = kycProfileItem.profileId === selectedProfileItem.profileId;
              return (
                <button
                  key={kycProfileItem.profileId}
                  type="button"
                  onClick={() => setSelectedProfileId(kycProfileItem.profileId)}
                  className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${isActiveItem ? 'border-l-4 border-l-cyan-500 bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white ${kycProfileItem.avatarGradientClassName}`}>{kycProfileItem.organizationNameText.charAt(0)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-slate-900">{kycProfileItem.organizationNameText}</p>
                    <p className="mt-0.5 text-[10.5px] text-slate-500">Nộp: {kycProfileItem.submittedDateText}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">{kycProfileItem.versionText} · {kycProfileItem.reviewStateCodeText}</p>
                  </div>
                  <span className={`inline-flex rounded-md border px-2 py-1 text-[9.5px] font-semibold ${kycProfileItem.statusClassName}`}>{kycProfileItem.statusLabelText}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[620px] overflow-y-auto p-6">
          <div className="mb-5 flex items-start gap-3 border-b border-emerald-900/15 pb-5">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl font-bold text-white ${selectedProfileItem.avatarGradientClassName}`}>{selectedProfileItem.organizationNameText.charAt(0)}</div>
            <div>
              <p className="text-xl font-bold text-slate-900">{selectedProfileItem.organizationNameText}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">MST: {selectedProfileItem.taxCodeText} · Phiên bản: {selectedProfileItem.versionText}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${selectedProfileItem.statusClassName}`}>⏳ {selectedProfileItem.reviewStateCodeText}</span>
                <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">Nộp: {selectedProfileItem.submittedDateText}</span>
              </div>
            </div>
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Thông tin tổ chức</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10.5px] text-slate-500">Tên pháp nhân</p><p className="mt-1 text-xs font-semibold text-slate-900">{selectedProfileItem.legalNameText}</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10.5px] text-slate-500">Mã số thuế</p><p className="mt-1 font-mono text-xs font-semibold text-slate-900">{selectedProfileItem.taxCodeText}</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10.5px] text-slate-500">Người đại diện</p><p className="mt-1 text-xs font-semibold text-slate-900">{selectedProfileItem.representativeNameText}</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10.5px] text-slate-500">Ngày đăng ký</p><p className="mt-1 text-xs font-semibold text-slate-900">{selectedProfileItem.registeredDateText}</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2"><p className="text-[10.5px] text-slate-500">Địa chỉ</p><p className="mt-1 text-xs font-semibold text-slate-900">{selectedProfileItem.addressText}</p></div>
          </div>

          <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Tài liệu đính kèm (IPFS)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {selectedProfileItem.ipfsDocumentNameList.map((ipfsDocumentNameText) => (
              <button key={ipfsDocumentNameText} type="button" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50">
                <span className="text-base">📄</span>
                <span className="text-xs font-medium text-slate-700">{ipfsDocumentNameText}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] text-slate-500">CID: <span className="font-mono text-cyan-600">{selectedProfileItem.ipfsCidText}</span></p>

          <div className="mt-5 border-t border-emerald-900/15 pt-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 active:translate-y-px">✗ Từ chối KYC</button>
              <button type="button" className="flex-[2] rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-px">✓ Phê duyệt KYC</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


const reportMetricItemList = [
  { labelText: 'Tổng yêu cầu giải ngân', valueText: '42', toneClassName: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
  { labelText: 'Đã phê duyệt (90.5%)', valueText: '38', toneClassName: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  { labelText: 'Từ chối / Trả lại', valueText: '4', toneClassName: 'text-amber-700 bg-amber-50 border-amber-100' },
  { labelText: 'Tổng giá trị phê duyệt (VNĐ)', valueText: '12.4T', toneClassName: 'text-indigo-700 bg-indigo-50 border-indigo-100' }
];

const kycApprovalRateItemList: KycApprovalRateItem[] = [
  { labelText: 'Đã phê duyệt', valueText: '19 (76%)', progressWidthText: '76%', barClassName: 'bg-emerald-500', valueClassName: 'text-emerald-700' },
  { labelText: 'Đang xét duyệt', valueText: '5 (20%)', progressWidthText: '20%', barClassName: 'bg-amber-500', valueClassName: 'text-amber-700' },
  { labelText: 'Từ chối', valueText: '1 (4%)', progressWidthText: '4%', barClassName: 'bg-red-500', valueClassName: 'text-red-700' }
];

const reportSummaryItemList = [
  { monthText: 'Tháng 1/2026', totalRequestCountText: '14', approvedCountText: '13', rejectedCountText: '1', totalAmountText: '3,620,000,000', approvedRateText: '92.9%', resultText: 'Đạt', resultClassName: 'bg-emerald-100 text-emerald-700' },
  { monthText: 'Tháng 2/2026', totalRequestCountText: '12', approvedCountText: '11', rejectedCountText: '1', totalAmountText: '2,810,000,000', approvedRateText: '91.7%', resultText: 'Đạt', resultClassName: 'bg-emerald-100 text-emerald-700' },
  { monthText: 'Tháng 3/2026', totalRequestCountText: '16', approvedCountText: '14', rejectedCountText: '2', totalAmountText: '4,200,000,000', approvedRateText: '87.5%', resultText: 'Đạt', resultClassName: 'bg-emerald-100 text-emerald-700' }
];

/** Hàm hiển thị panel Báo cáo Tuân thủ theo bố cục tương ứng file mẫu. */
function ReportPanel() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-900/15 bg-white px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Báo cáo Tuân thủ</h2>
          <p className="mt-1 text-xs text-slate-500">Tổng hợp dữ liệu giám sát theo kỳ báo cáo</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option>Quý 1/2026</option><option>Tháng 3/2026</option><option>Tháng 2/2026</option></select>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0E7C6B] px-3 text-xs font-semibold text-white transition hover:bg-[#0A5C50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1AAE97]/40 active:translate-y-px">Xuất PDF</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {reportMetricItemList.map((reportMetricItem) => (
          <div key={reportMetricItem.labelText} className="rounded-xl border border-emerald-900/15 bg-white p-4">
            <p className="text-2xl font-bold text-slate-900">{reportMetricItem.valueText}</p>
            <span className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${reportMetricItem.toneClassName}`}>{reportMetricItem.labelText}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MonthlyDisbursementCard />
        <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
          <div className="border-b border-emerald-900/15 px-5 py-3 text-sm font-bold text-slate-900">Tỷ lệ phê duyệt KYC</div>
          <div className="space-y-3 p-5">
            {kycApprovalRateItemList.map((kycApprovalRateItem) => (
              <div key={kycApprovalRateItem.labelText} className="grid grid-cols-[100px_1fr_auto] items-center gap-2 text-xs">
                <span className="text-slate-700">{kycApprovalRateItem.labelText}</span>
                <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${kycApprovalRateItem.barClassName}`} style={{ width: kycApprovalRateItem.progressWidthText }} /></div>
                <span className={`font-semibold ${kycApprovalRateItem.valueClassName}`}>{kycApprovalRateItem.valueText}</span>
              </div>
            ))}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">✅ Tỷ lệ phê duyệt <strong>96%</strong> đạt chỉ tiêu quý</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
        <div className="border-b border-emerald-900/15 px-5 py-3 text-sm font-bold text-slate-900">Bảng tổng hợp – Quý I/2026</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr><th className="px-5 py-2.5 font-semibold">Tháng</th><th className="px-5 py-2.5 font-semibold">Tổng yêu cầu</th><th className="px-5 py-2.5 font-semibold">Đã ký</th><th className="px-5 py-2.5 font-semibold">Từ chối</th><th className="px-5 py-2.5 font-semibold">Tổng giá trị (VNĐ)</th><th className="px-5 py-2.5 font-semibold">Tỷ lệ duyệt</th><th className="px-5 py-2.5 font-semibold">Trạng thái</th></tr>
            </thead>
            <tbody>
              {reportSummaryItemList.map((reportSummaryItem) => (
                <tr key={reportSummaryItem.monthText} className="border-t border-slate-100 text-sm hover:bg-slate-50">
                  <td className="px-5 py-3 text-xs font-semibold text-slate-900">{reportSummaryItem.monthText}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{reportSummaryItem.totalRequestCountText}</td>
                  <td className="px-5 py-3 font-mono text-xs text-emerald-700">{reportSummaryItem.approvedCountText}</td>
                  <td className="px-5 py-3 font-mono text-xs text-red-700">{reportSummaryItem.rejectedCountText}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{reportSummaryItem.totalAmountText}</td>
                  <td className="px-5 py-3"><span className="inline-flex rounded-md border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{reportSummaryItem.approvedRateText}</span></td>
                  <td className="px-5 py-3"><span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${reportSummaryItem.resultClassName}`}>{reportSummaryItem.resultText}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const transparencyTransactionItemList = [
  { transactionHashText: '0x3a9f...e7d2', transactionTypeText: 'Giải ngân', transactionTypeClassName: 'bg-cyan-100 text-cyan-700 border-cyan-200', projectDescriptionText: 'Mổ mắt miễn phí Hà Giang', senderWalletText: '0xAbC...12F3', amountText: '₫200,000,000', timeText: '22/03 14:10', statusText: 'Hoàn tất', statusClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { transactionHashText: '0xB1d2...9cAe', transactionTypeText: 'Quyên góp', transactionTypeClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200', projectDescriptionText: 'Xây trường học Tây Nguyên', senderWalletText: '0x7eF...4A21', amountText: '₫5,000,000', timeText: '22/03 10:33', statusText: 'Đã ghi nhận', statusClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { transactionHashText: '0x5F3a...e012', transactionTypeText: 'Nạp tiền', transactionTypeClassName: 'bg-amber-100 text-amber-700 border-amber-200', projectDescriptionText: 'Nạp VNĐ → Token', senderWalletText: '0x9bC...77D0', amountText: '₫2,000,000', timeText: '21/03 16:45', statusText: 'Đúc token thành công', statusClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { transactionHashText: '0x2Ec4...d77F', transactionTypeText: 'Giải ngân', transactionTypeClassName: 'bg-cyan-100 text-cyan-700 border-cyan-200', projectDescriptionText: 'Nước sạch Hà Tĩnh', senderWalletText: '0xAbC...12F3', amountText: '₫150,000,000', timeText: '21/03 16:30', statusText: 'Hoàn tất', statusClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { transactionHashText: '0x8Ac1...3bD9', transactionTypeText: 'Quyên góp', transactionTypeClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200', projectDescriptionText: 'Cứu trợ lũ lụt miền Trung', senderWalletText: '0x4Da...E8F2', amountText: '₫10,000,000', timeText: '21/03 09:15', statusText: 'Chờ ghi nhận on-chain', statusClassName: 'bg-amber-100 text-amber-700 border-amber-200' }
];

/** Hàm hiển thị panel Tra cứu Giao dịch theo giao diện bảng minh bạch của file mẫu. */
function TransparencyPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-900/15 bg-white px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Tra cứu Giao dịch</h2>
        <p className="mt-1 text-xs text-slate-500">Tra cứu minh bạch toàn bộ dòng tiền trên hệ thống</p>
      </div>

      <div className="rounded-xl border border-emerald-900/15 bg-white p-3">
        <div className="grid gap-2 xl:grid-cols-[1fr_auto_auto_auto]">
          <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs text-slate-500">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="M11.7 10.3l3 3-1.4 1.4-3-3a6 6 0 111.4-1.4zm-5.7 1a4 4 0 100-8 4 4 0 000 8z" /></svg>
            <input type="text" placeholder="Nhập mã dự án, địa chỉ ví hoặc mã giao dịch..." className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
          <select className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option>Tất cả loại</option><option>Nạp tiền</option><option>Quyên góp</option><option>Giải ngân</option></select>
          <select className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option>Tất cả trạng thái</option><option>Hoàn tất</option><option>Đang chờ xử lý</option><option>Thất bại</option></select>
          <button type="button" className="h-9 rounded-lg bg-[#1AAE97] px-4 text-xs font-semibold text-[#0A5C50] transition hover:bg-[#129b86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1AAE97]/40 active:translate-y-px">Tìm kiếm</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-900/15 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">TX Hash</th>
                <th className="px-5 py-2.5 font-semibold">Loại GD</th>
                <th className="px-5 py-2.5 font-semibold">Dự án / Mô tả</th>
                <th className="px-5 py-2.5 font-semibold">Người gửi</th>
                <th className="px-5 py-2.5 font-semibold">Số tiền</th>
                <th className="px-5 py-2.5 font-semibold">Thời gian</th>
                <th className="px-5 py-2.5 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {transparencyTransactionItemList.map((transparencyTransactionItem) => (
                <tr key={transparencyTransactionItem.transactionHashText} className="border-t border-slate-100 text-sm hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-cyan-700 hover:underline">{transparencyTransactionItem.transactionHashText}</td>
                  <td className="px-5 py-3"><span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${transparencyTransactionItem.transactionTypeClassName}`}>{transparencyTransactionItem.transactionTypeText}</span></td>
                  <td className="px-5 py-3 text-xs font-medium text-slate-700">{transparencyTransactionItem.projectDescriptionText}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{transparencyTransactionItem.senderWalletText}</td>
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-800">{transparencyTransactionItem.amountText}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{transparencyTransactionItem.timeText}</td>
                  <td className="px-5 py-3"><span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${transparencyTransactionItem.statusClassName}`}>{transparencyTransactionItem.statusText}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-emerald-900/15 bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-500">Trang 1 / 156 · Tổng 3,108 giao dịch</span>
          <div className="flex items-center gap-1">
            <button type="button" className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs text-slate-600 transition hover:bg-[#0F2040] hover:text-white">‹</button>
            <button type="button" className="h-7 w-7 rounded-md border border-[#0F2040] bg-[#0F2040] text-xs text-white">1</button>
            <button type="button" className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs text-slate-600 transition hover:bg-[#0F2040] hover:text-white">2</button>
            <button type="button" className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs text-slate-600 transition hover:bg-[#0F2040] hover:text-white">3</button>
            <button type="button" className="h-7 w-7 rounded-md border border-slate-200 bg-white text-xs text-slate-600 transition hover:bg-[#0F2040] hover:text-white">›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hàm component NonDashboardPanel để hiển thị nội dung theo tab ngoài tổng quan. */
export default function NonDashboardPanel({ selectedPageKey, onOpenDisbursementRequest }: NonDashboardPanelProps) {
  const sectionTitle = getPageTitle(selectedPageKey);

  if (selectedPageKey === 'disbursement') {
    return <DisbursementPanel onOpenDisbursementRequest={onOpenDisbursementRequest} />;
  }

  if (selectedPageKey === 'kyc') {
    return <KycPanel />;
  }

  if (selectedPageKey === 'report') {
    return <ReportPanel />;
  }

  if (selectedPageKey === 'transparency') {
    return <TransparencyPanel />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-900/15 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">{sectionTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">Nội dung đang được đồng bộ theo phong cách giao diện tổng quan để nhất quán trải nghiệm người dùng.</p>
      </div>
    </div>
  );
}
