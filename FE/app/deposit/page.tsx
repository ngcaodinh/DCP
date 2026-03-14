'use client';

import { type ChangeEvent, type MouseEvent, useMemo, useState } from 'react';

type QuickChip = { id: number; value: number; label: string };

type ProcessStep = { id: number; title: string; description: string; status: 'done' | 'active' | 'pending' };

type TransactionItem = { id: number; title: string; date: string; hash: string; amount: string };

type NoteItem = { id: number; content: string; highlight?: boolean };


const quickChips: QuickChip[] = [
  { id: 1, value: 50000, label: '50.000đ' },
  { id: 2, value: 100000, label: '100.000đ' },
  { id: 3, value: 200000, label: '200.000đ' },
  { id: 4, value: 500000, label: '500.000đ' },
  { id: 5, value: 1000000, label: '1.000.000đ' }
];

const processSteps: ProcessStep[] = [
  {
    id: 1,
    title: 'Nhập số tiền VNĐ',
    description: 'Chọn số tiền muốn nạp vào ví Charity Token',
    status: 'active'
  },
  {
    id: 2,
    title: 'Chuyển hướng PayOS',
    description: 'Thanh toán qua Internet Banking hoặc QR Code',
    status: 'pending'
  },
  {
    id: 3,
    title: 'Xác nhận tự động',
    description: 'Backend nhận webhook, xác minh chữ ký HMAC',
    status: 'pending'
  },
  {
    id: 4,
    title: 'Token vào ví ngay',
    description: 'Smart Contract mint token ~30 giây sau khi xác nhận',
    status: 'pending'
  }
];

const recentTransactions: TransactionItem[] = [
  { id: 1, title: 'Nạp tiền', date: '12/02/2025 · 14:23', hash: '0x5c2e...8a1d ↗', amount: '+500K' },
  { id: 2, title: 'Nạp tiền', date: '08/02/2025 · 09:15', hash: '0x3a4f...9b2c ↗', amount: '+200K' },
  { id: 3, title: 'Nạp tiền', date: '01/02/2025 · 20:44', hash: '0x8e1d...4f7a ↗', amount: '+1M' }
];

const noteItems: NoteItem[] = [
  { id: 1, content: 'Tỷ lệ cố định: <strong>1 VNĐ = 1 Charity Token</strong>.' },
  { id: 2, content: 'Số tiền tối thiểu: <strong>10,000 VNĐ</strong>.' },
  { id: 3, content: 'Token được mint sau <strong>2 block confirmations</strong>.' },
  { id: 4, content: 'Token chỉ dùng trong hệ thống DCP.' },
  { id: 5, content: '<strong>Không hỗ trợ rút Token về VNĐ</strong>.', highlight: true }
];

const trustedBanks = ['VCB', 'BIDV', 'TCB', 'VPB', 'MBB', 'ACB', '+40'];


/**
 * Hàm định dạng số tiền theo chuẩn VNĐ.
 * Mục đích: hiển thị số tiền có dấu phân cách dễ đọc.
 */
const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} VNĐ`;

/**
 * Hàm format số token theo giá trị VNĐ.
 * Mục đích: đồng bộ hiển thị token nhận được từ số tiền nạp.
 */
const formatToken = (value: number) => `${value.toLocaleString('vi-VN')} Token`;

/**
 * Hàm giao diện trang Home (Deposit).
 * Mục đích: hiển thị bố cục nạp tiền theo mẫu UI gốc.
 */
export default function DepositHomePage() {
  const [amountValue, setAmountValue] = useState(0);
  const [selectedChipId, setSelectedChipId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isToastOpen, setIsToastOpen] = useState(false);
  const [isProgressBarRunning, setIsProgressBarRunning] = useState(false);
  const [isConfirmBannerVisible, setIsConfirmBannerVisible] = useState(false);

  const formattedAmount = useMemo(() => formatCurrency(amountValue), [amountValue]);
  const formattedToken = useMemo(() => formatToken(amountValue), [amountValue]);

  /**
   * Hàm cập nhật số tiền nhập.
   * Mục đích: đồng bộ input với chip nhanh và vùng tổng kết.
   */
  const handleAmountChange = (value: string) => {
    const numericValue = Number(value.replace(/[^0-9]/g, '')) || 0;
    setAmountValue(numericValue);
    setSelectedChipId(null);
  };

  /**
   * Hàm đọc giá trị input số tiền.
   * Mục đích: chuẩn hóa dữ liệu nhập trước khi cập nhật state.
   */
  const handleAmountInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleAmountChange(event.target.value);
  };

  /**
   * Hàm mở modal thanh toán.
   * Mục đích: giả lập chuyển hướng PayOS theo trải nghiệm mẫu.
   */
  const handleOpenModal = () => {
    if (amountValue > 0) {
      setIsModalOpen(true);
    }
  };

  /**
   * Hàm đóng modal thanh toán.
   * Mục đích: đưa người dùng trở lại màn hình nạp tiền.
   */
  const handleCloseModal = () => setIsModalOpen(false);

  /**
   * Hàm xác nhận thanh toán.
   * Mục đích: mô phỏng trạng thái nạp tiền thành công.
   */
  const handleConfirmPayment = () => {
    setIsModalOpen(false);
    setIsProgressBarRunning(true);
    setIsConfirmBannerVisible(true);

    // Giả lập độ trễ xác nhận để hiển thị progress bar theo mẫu UI
    setTimeout(() => {
      setIsProgressBarRunning(false);
      setIsToastOpen(true);
    }, 1500);
  };

  /**
   * Hàm đóng toast.
   * Mục đích: ẩn thông báo nạp tiền.
   */
  const handleCloseToast = () => {
    setIsToastOpen(false);
    setIsConfirmBannerVisible(false);
  };

  /**
   * Hàm xử lý click chip nhanh.
   * Mục đích: lấy dữ liệu từ dataset để cập nhật số tiền nạp.
   */
  const handleChipButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    const chipId = Number(event.currentTarget.dataset.chipId);
    const chipValue = Number(event.currentTarget.dataset.chipValue);

    if (!chipId || !chipValue) {
      return;
    }

    setAmountValue(chipValue);
    setSelectedChipId(chipId);
  };



  /**
   * Hàm render chip số tiền nhanh.
   * Mục đích: hiển thị các mức nạp gợi ý với trạng thái chọn.
   */
  const renderQuickChip = (chip: QuickChip) => (
    <button
      key={chip.id}
      type="button"
      data-chip-id={chip.id}
      data-chip-value={chip.value}
      onClick={handleChipButtonClick}
      className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${selectedChipId === chip.id
        ? 'border-[#0E7C6B] bg-[#E6F7F4] text-[#0E7C6B]'
        : 'border-gray-200 text-gray-500 hover:border-[#0E7C6B] hover:text-[#0E7C6B]'
        }`}
    >
      {chip.label}
    </button>
  );

  /**
   * Hàm render bước quy trình nạp tiền.
   * Mục đích: mô tả các bước chính trong luồng PayOS.
   */
  const renderProcessStep = (step: ProcessStep, stepIndex: number) => {
    const isLastStep = stepIndex === processSteps.length - 1;

    return (
      <div key={step.id} className="relative flex gap-3 pb-4">
        {!isLastStep && (
          <span className="absolute left-[11px] top-7 h-[calc(100%-20px)] border-l border-dashed border-[#E5E7EB]" />
        )}
        <div
          className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step.status === 'done'
            ? 'bg-emerald-500 text-white'
            : step.status === 'active'
              ? 'bg-[#0E7C6B] text-white shadow-[0_0_0_3px_rgba(14,124,107,0.15)]'
              : 'bg-[#E6F7F4] text-[#0E7C6B]'
            }`}
        >
          {step.id}
        </div>
        <div className={isLastStep ? 'pb-0' : ''}>
          <div className="text-sm font-semibold text-[#0D1117]">{step.title}</div>
          <div className="text-xs text-gray-400">{step.description}</div>
        </div>
      </div>
    );
  };

  /**
   * Hàm render giao dịch gần đây.
   * Mục đích: trình bày lịch sử nạp tiền minh họa.
   */
  const renderRecentTransaction = (transaction: TransactionItem) => (
    <div
      key={transaction.id}
      className="flex items-center gap-3 rounded-xl border border-transparent bg-[#F8FAFB] px-3 py-3 transition hover:border-[#0E7C6B]/20 hover:bg-white"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D1FAE5] text-base">💰</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[#0D1117]">{transaction.title}</div>
        <div className="text-[11px] text-gray-400">{transaction.date}</div>
        <div className="text-[10px] text-gray-400">{transaction.hash}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-[#0E7C6B]">{transaction.amount}</div>
        <div className="mt-1 inline-flex rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-semibold text-[#065F46]">
          ✅ Thành công
        </div>
      </div>
    </div>
  );

  /**
   * Hàm render ghi chú hệ thống.
   * Mục đích: nhấn mạnh các lưu ý quan trọng cho người dùng.
   */
  const renderNoteItem = (item: NoteItem) => (
    <div key={item.id} className="flex gap-2">
      <span className={`mt-2 h-2 w-2 rounded-full ${item.highlight ? 'bg-amber-400' : 'bg-[#0E7C6B]'}`} />
      <span
        className="text-sm text-gray-600 [&>strong]:font-semibold [&>strong]:text-[#0D1117]"
        dangerouslySetInnerHTML={{ __html: item.content }}
      />
    </div>
  );

  /**
   * Hàm render danh sách ngân hàng tin cậy.
   * Mục đích: hiển thị các đơn vị hỗ trợ PayOS.
   */
  const renderTrustedBank = (bank: string) => (
    <span
      key={bank}
      className="rounded-md border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold text-gray-500 shadow-sm"
    >
      {bank}
    </span>
  );

  return (
    <main className="min-h-screen bg-[#F8FAFB] text-[#0D1117]">
      <div
        className={`fixed top-0 left-0 right-0 z-50 h-[3px] origin-left bg-gradient-to-r from-[#0E7C6B] to-[#1AAE97] transition-transform duration-700 ${isProgressBarRunning ? 'scale-x-100' : 'scale-x-0'
          }`}
      />

      <div className="flex">
        <aside className="hidden h-screen w-[240px] flex-col overflow-y-auto bg-[#0D1117] pb-6 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex">
          <a href="#" className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0E7C6B] shadow-lg">
              ❤
            </span>
            <div>
              <div className="text-lg font-extrabold">DCP</div>
              <div className="text-[10px] text-white/50">Decentralized Charity</div>
            </div>
          </a>
          <div className="border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#0E7C6B] to-[#1AAE97] text-sm font-bold">
                NVA
              </div>
              <div>
                <div className="text-sm font-semibold">Nguyễn Văn A</div>
                <div className="text-xs text-white/40">0x3a4f...9b2c</div>
              </div>
            </div>
            <div className="mt-3 inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-400">
              💛 Donor
            </div>
            <div className="mt-4 rounded-xl border border-[#0E7C6B]/40 bg-[#0E7C6B]/15 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Số dư Token</div>
              <div className="text-xl font-extrabold text-[#1AAE97]">1,250,000</div>
              <div className="text-xs text-white/50">Charity Token</div>
              <div className="text-xs text-white/40">≈ 1,250,000 VNĐ</div>
            </div>
          </div>
          <div className="border-t border-white/10 px-3 pb-5 pt-3 text-sm">
            <a
              href="#"
              className="flex items-center justify-center rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-400 ring-1 ring-red-400/40 transition hover:bg-red-500/25 hover:text-red-300"
            >
              Đăng xuất
            </a>
          </div>
        </aside>

        <section className="flex-1 px-4 pb-16 pt-8 lg:ml-[240px] lg:px-10">
          <div
            className={`mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm transition-all ${isConfirmBannerVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}
          >
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-base">✅</span>
              <span>Thanh toán xác nhận · Token đã được mint</span>
            </div>
            <button type="button" onClick={handleCloseToast} className="text-xs font-semibold text-emerald-700">
              Đóng
            </button>
          </div>
          <div className="mb-7">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Tổng quan</span>
              <svg className="h-3 w-3 text-[#E5E7EB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span className="font-medium text-[#0E7C6B]">Nạp tiền</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold">💰 Nạp tiền</h1>
            <p className="mt-2 text-sm text-gray-400">
              Chuyển VNĐ thành Charity Token để bắt đầu quyên góp cho dự án từ thiện
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-black/5 bg-white px-6 py-6 shadow-sm">
                <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0E7C6B]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0E7C6B] text-white">1</span>
                  Nhập số tiền nạp
                </div>
                <div className="flex items-center overflow-hidden rounded-xl border-2 border-[#E5E7EB] bg-white">
                  <div className="flex h-[72px] w-24 flex-col items-center justify-center bg-[#E6F7F4] text-[#0E7C6B]">
                    <div className="text-sm font-bold">VNĐ</div>
                    <div className="text-[10px] opacity-60">Việt Nam Đồng</div>
                  </div>
                  <input
                    className="h-[72px] flex-1 bg-transparent px-4 text-3xl font-bold outline-none"
                    placeholder="0"
                    inputMode="numeric"
                    value={amountValue === 0 ? '' : amountValue.toLocaleString('vi-VN')}
                    onChange={handleAmountInputChange}
                    aria-label="Số tiền nạp"
                  />
                  <div className="flex w-32 flex-col items-center justify-center">
                    <div className={`text-sm font-bold ${amountValue ? 'text-[#0E7C6B]' : 'text-gray-300'}`}>
                      {amountValue ? formattedToken : 'Token'}
                    </div>
                    <div className="text-[10px] text-gray-400">Nhận được</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-[#0E7C6B]">✔</span>
                  Tỷ lệ cố định: <span className="font-medium text-[#0E7C6B]">1 VNĐ = 1 Charity Token</span> · Không phí
                  chuyển đổi
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {quickChips.map(renderQuickChip)}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-amber-500">
                  ⚠ Số tiền tối thiểu: 10,000 VNĐ
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white px-6 py-6 shadow-sm">
                <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0E7C6B]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0E7C6B] text-white">2</span>
                  Kiểm tra ví nhận
                </div>
                <div className="rounded-xl border border-[#0E7C6B]/30 bg-[#E6F7F4] px-5 py-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0E7C6B]">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0E7C6B] text-[9px] text-white">
                      ⛓
                    </span>
                    Smart Account của bạn
                  </div>
                  <div className="mt-2 font-mono text-sm text-[#0D1117]">0x3a4f0b9c8f2d4c1e5678a9b2c</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-[#0E7C6B]/10 px-3 py-1 text-[#0E7C6B]">Amoy Testnet</span>
                    <span className="rounded-full bg-[#0E7C6B]/10 px-3 py-1 text-[#0E7C6B]">ERC-4337</span>
                    <span className="rounded-full bg-[#D1FAE5] px-3 py-1 text-[#065F46]">✓ Đã xác thực</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white px-6 py-6 shadow-sm">
                <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0E7C6B]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0E7C6B] text-white">3</span>
                  Tóm tắt thanh toán
                </div>
                <div className="space-y-3 text-sm text-gray-500">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <span className="text-gray-400">Số tiền nạp</span>
                    <span className="font-semibold text-[#0D1117]">{formattedAmount}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <span className="text-gray-400">Phí xử lý PayOS</span>
                    <span className="font-semibold text-emerald-500">Miễn phí</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <span className="text-gray-400">Tỷ lệ quy đổi</span>
                    <span className="font-semibold text-[#0D1117]">1 VNĐ = 1 Token</span>
                  </div>
                  <div className="rounded-xl border border-[#0E7C6B]/20 bg-[#E6F7F4] px-4 py-4">
                    <div className="text-sm font-semibold text-[#0E7C6B]">Tổng nhận được</div>
                    <div className="mt-1 text-xl font-extrabold text-[#0E7C6B]">{formattedToken}</div>
                    <div className="text-xs text-gray-400">≈ {formattedAmount}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenModal}
                  disabled={amountValue === 0}
                  className="mt-5 flex h-14 w-full flex-col items-center justify-center rounded-xl bg-[#F59E0B] font-bold text-[#0D1117] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#E08E00] disabled:cursor-not-allowed disabled:bg-gray-200"
                >
                  <span className="text-base">Thanh toán bằng PayOS</span>
                  <span className="text-[11px] font-normal text-black/60">Chuyển khoản an toàn, xác nhận nhanh</span>
                </button>
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
                  <span className="text-emerald-500">✔</span> Thanh toán bảo mật qua PayOS · Hỗ trợ tất cả ngân hàng Việt Nam
                </div>
                <div className="bank-logos mt-2 flex flex-wrap justify-center gap-2">
                  {trustedBanks.map(renderTrustedBank)}
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#0D1117]">Quy trình nạp tiền</div>
                  <span className="text-xs text-[#0E7C6B]">Realtime</span>
                </div>
                <div className="space-y-4">
                  {processSteps.map((step, index) => renderProcessStep(step, index))}
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#0D1117]">Giao dịch gần đây</div>
                  <a href="#" className="text-xs font-semibold text-[#0E7C6B]">
                    Xem tất cả
                  </a>
                </div>
                <div className="space-y-3">
                  {recentTransactions.map(renderRecentTransaction)}
                </div>
              </div>

              <div className="rounded-2xl border border-[#0E7C6B]/10 bg-[#E6F7F4] px-5 py-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#0E7C6B]">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="8" />
                  </svg>
                  Thông tin quan trọng
                </div>
                <div className="space-y-2">
                  {noteItems.map(renderNoteItem)}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/40 bg-amber-100 text-3xl">
              💳
            </div>
            <h3 className="text-xl font-extrabold">Chuyển đến PayOS</h3>
            <p className="mt-2 text-sm text-gray-400">
              Bạn sẽ được chuyển đến cổng thanh toán an toàn. Hoàn tất thanh toán và quay lại DCP.
            </p>
            <div className="mt-5 flex items-center justify-between rounded-xl bg-[#E6F7F4] px-4 py-3 text-sm">
              <span className="text-gray-500">Số tiền thanh toán</span>
              <span className="font-semibold text-[#0E7C6B]">{formattedAmount}</span>
            </div>
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleConfirmPayment}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F59E0B] font-bold text-[#0D1117] shadow-lg"
              >
                Mở PayOS ngay
              </button>
              <button
                type="button"
                onClick={handleCloseModal}
                className="w-full text-sm text-gray-400"
              >
                ← Hủy và quay lại
              </button>
            </div>
          </div>
        </div>
      )}

      {isToastOpen && (
        <div className="fixed bottom-8 right-6 z-50 w-[360px] rounded-2xl border-l-4 border-emerald-500 bg-white px-5 py-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">✅ Nạp tiền thành công!</div>
            <button type="button" onClick={handleCloseToast} className="h-6 w-6 rounded-full bg-gray-100 text-xs">
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">Token đã được mint vào ví của bạn</p>
          <div className="mt-3 text-lg font-extrabold text-[#0E7C6B]">+{formattedToken}</div>
          <div className="text-xs text-gray-400">Số dư mới: 1,350,000 Token</div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="flex-1 rounded-lg bg-[#0E7C6B] py-2 text-xs font-semibold text-white">
              Quyên góp ngay →
            </button>
            <button type="button" className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
              Xem giao dịch ↗
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-gray-200 bg-white/95 px-4 py-3 text-[10px] text-gray-400 backdrop-blur lg:hidden">
        <button type="button" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="text-base">☰</span>
          Menu
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="text-base">🏠</span>
          Tổng quan
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-[#0E7C6B]">
          <span className="text-base">💳</span>
          Nạp tiền
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="text-base">🎁</span>
          Dự án
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-gray-400">
          <span className="text-base">🧾</span>
          Lịch sử
        </button>
      </nav>
    </main>
  );
}

