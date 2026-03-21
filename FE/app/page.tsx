'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { authenticationSessionUpdatedEventName, clearAuthSession, readAuthSession } from './utils/authSession';

type Project = {
  id: number;
  icon: string;
  background: string;
  status: string;
  qfScore: string;
  organization: string;
  title: string;
  description: string;
  raisedLabel: string;
  goalLabel: string;
  progress: number;
  donors: string;
  daysLeft: string;
  transactions: string;
  delay?: number;
};

type RankingItem = {
  rank: string;
  name: string;
  organization: string;
  score: string;
  raised: string;
  donors: string;
};

type TransactionItem = {
  id: number;
  type: 'donation' | 'deposit' | 'disbursement';
  hash: string;
  project: string;
  amount: string;
  time: string;
  amountColor?: string;
};

type StatItem = {
  id: number;
  value: number;
  suffix: string;
  label: string;
  delay?: number;
};

const projects: Project[] = [
  {
    id: 1,
    icon: '🏫',
    background: 'linear-gradient(135deg,#E6F7F4,#B2EEE4)',
    status: '● ACTIVE',
    qfScore: 'QF 9.2',
    organization: '✅ Ánh Sáng Việt Nam',
    title: 'Xây dựng phòng học cho 120 em học sinh vùng cao Hà Giang',
    description:
      'Dự án nhằm cung cấp cơ sở vật chất học tập cho trẻ em dân tộc thiểu số tại xã Đồng Văn, huyện Đồng Văn, Hà Giang.',
    raisedLabel: '458M₫',
    goalLabel: '630M₫ · 73%',
    progress: 73,
    donors: '👥 248 donors',
    daysLeft: '📅 12 ngày',
    transactions: '⛓ 1,247 tx'
  },
  {
    id: 2,
    icon: '🏥',
    background: 'linear-gradient(135deg,#FEF3C7,#FDE68A)',
    status: '● ACTIVE',
    qfScore: 'QF 8.7',
    organization: '✅ Trái Tim Xanh Foundation',
    title: 'Hỗ trợ phẫu thuật tim miễn phí cho 50 trẻ em nghèo',
    description:
      'Chương trình kết hợp với bệnh viện Nhi Đồng 1 để thực hiện phẫu thuật tim bẩm sinh miễn phí cho các bé dưới 10 tuổi.',
    raisedLabel: '890M₫',
    goalLabel: '1.2T₫ · 74%',
    progress: 74,
    donors: '👥 512 donors',
    daysLeft: '📅 8 ngày',
    transactions: '⛓ 2,831 tx',
    delay: 0.1
  },
  {
    id: 3,
    icon: '🌊',
    background: 'linear-gradient(135deg,#EDE9FE,#C4B5FD)',
    status: '● ACTIVE',
    qfScore: 'QF 8.1',
    organization: '✅ Cứu Trợ Miền Trung',
    title: 'Tái thiết nhà ở cho 80 hộ dân bị lũ lụt tại Quảng Bình',
    description:
      'Hỗ trợ xây dựng lại nhà kiên cố cho các hộ nghèo mất nhà hoàn toàn sau đợt lũ lịch sử tháng 10/2024.',
    raisedLabel: '320M₫',
    goalLabel: '800M₫ · 40%',
    progress: 40,
    donors: '👥 187 donors',
    daysLeft: '📅 25 ngày',
    transactions: '⛓ 634 tx',
    delay: 0.2
  }
];

const stats: StatItem[] = [
  { id: 1, value: 2847500000, suffix: '₫', label: 'Tổng quyên góp' },
  { id: 2, value: 89, suffix: '', label: 'Dự án hoàn thành', delay: 0.1 },
  { id: 3, value: 15842, suffix: '', label: 'Nhà hảo tâm', delay: 0.2 },
  { id: 4, value: 98, suffix: '%', label: 'Giao dịch thành công', delay: 0.3 }
];

const rankingItems: RankingItem[] = [
  {
    rank: '4',
    name: 'Nước sạch cho 500 hộ dân Sóc Trăng',
    organization: '✅ Nước Xanh VN',
    score: '7.9',
    raised: '256,000,000₫',
    donors: '142'
  },
  {
    rank: '5',
    name: 'Sách giáo khoa cho học sinh nghèo',
    organization: '✅ Học Mãi Foundation',
    score: '7.4',
    raised: '189,000,000₫',
    donors: '298'
  },
  {
    rank: '6',
    name: 'Chăm sóc người cao tuổi cô đơn',
    organization: '✅ Mái Ấm Tuổi Già',
    score: '7.1',
    raised: '134,000,000₫',
    donors: '89'
  }
];

const initialTransactions: TransactionItem[] = [
  {
    id: 1,
    type: 'donation',
    hash: '0x3a4f...9b2c',
    project: '→ Trường học vùng cao Hà Giang',
    amount: '+500,000₫',
    time: '2 giây trước'
  },
  {
    id: 2,
    type: 'deposit',
    hash: '0x8e1d...4f7a',
    project: 'Nạp tiền → Smart Account',
    amount: '+2,000,000₫',
    time: '45 giây trước',
    amountColor: '#F59E0B'
  },
  {
    id: 3,
    type: 'donation',
    hash: '0x5c2e...8a1d',
    project: '→ Phẫu thuật tim miễn phí',
    amount: '+1,200,000₫',
    time: '1 phút trước'
  },
  {
    id: 4,
    type: 'disbursement',
    hash: '0x9b7c...2e4f',
    project: 'Giải ngân → Ánh Sáng Việt Nam',
    amount: '-50,000,000₫',
    time: '3 phút trước',
    amountColor: '#3B82F6'
  },
  {
    id: 5,
    type: 'donation',
    hash: '0x1f8a...6c3b',
    project: '→ Tái thiết nhà Quảng Bình',
    amount: '+300,000₫',
    time: '5 phút trước'
  }
];

const transactionSources = [
  {
    type: 'donation' as const,
    projects: ['Trường học Hà Giang', 'Phẫu thuật tim', 'Nhà Quảng Bình', 'Nước sạch Sóc Trăng'],
    amounts: ['+200,000₫', '+500,000₫', '+1,000,000₫', '+300,000₫', '+750,000₫']
  },
  {
    type: 'deposit' as const,
    projects: ['Nạp tiền → Smart Account'],
    amounts: ['+500,000₫', '+2,000,000₫', '+1,000,000₫']
  }
];

const chartData = [
  45, 72, 58, 91, 68, 110, 95, 130, 88, 145, 162, 138, 155, 178, 142, 190, 168, 205, 182, 220, 195, 245,
  210, 260, 238, 280, 255, 300, 272, 295
];

const hexCharacters = '0123456789abcdef';

const trustItems = [
  { label: '💰 Tổng quyên góp', value: '2,847,500,000₫' },
  { label: '📋 Dự án hoạt động', value: '127' },
  { label: '👥 Nhà hảo tâm', value: '15,842' },
  { label: '⛓ Giao dịch on-chain', value: '98,341' },
  { label: '🏆 Dự án hoàn thành', value: '89' }
];

/**
 * Hàm tạo mã hash giả lập cho luồng giao dịch hiển thị.
 * Mục đích: mô phỏng dữ liệu blockchain ở phần live feed.
 */
const createRandomHash = () => {
  const prefix = Array.from({ length: 4 }, () => hexCharacters[Math.floor(Math.random() * 16)]).join('');
  const suffix = Array.from({ length: 4 }, () => hexCharacters[Math.floor(Math.random() * 16)]).join('');
  return `0x${prefix}...${suffix}`;
};

/**
 * Hàm định dạng số liệu đếm theo phong cách thống kê gốc.
 * Mục đích: giữ đúng định dạng chữ số tại phần thống kê.
 */
const formatStatValue = (value: number, suffix: string) => {
  if (value > 1000000) {
    return `${(value / 1000000).toFixed(0)}M${suffix}`;
  }

  if (value > 999) {
    return `${value.toLocaleString('vi')}${suffix}`;
  }

  return `${value}${suffix}`;
};

/**
 * Hàm tính toán đường biểu đồ để vẽ SVG.
 * Mục đích: đồng bộ đường line và vùng fill giống file mẫu.
 */
const useChartPath = () => {
  return useMemo(() => {
    const width = 480;
    const height = 180;
    const maxValue = Math.max(...chartData);
    const points = chartData.map((value, index) => [
      index * (width / (chartData.length - 1)),
      height - (value / maxValue) * height
    ]);

    const linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)},${point[1].toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L${points[points.length - 1][0]},${height} L0,${height} Z`;

    return { linePath, areaPath, points };
  }, []);
};

/**
 * Hàm trang chủ.
 * Mục đích: hiển thị toàn bộ cấu trúc giao diện trang Home theo mẫu HTML.
 */
export default function HomePage() {
  const [isNavbarScrolled, setIsNavbarScrolled] = useState(false);
  const [isHeroReady, setIsHeroReady] = useState(false);
  const [activeTab, setActiveTab] = useState('Tất cả');
  const [visibleCards, setVisibleCards] = useState({
    steps: false,
    projects: false,
    why: false,
    stats: false,
    ranking: false
  });
  const [statValues, setStatValues] = useState(() => stats.map(() => 0));
  const [transactions, setTransactions] = useState<TransactionItem[]>(initialTransactions);
  const [authenticatedUserName, setAuthenticatedUserName] = useState('');
  const [isUserMenuVisible, setIsUserMenuVisible] = useState(false);
  const userMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const logoutMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const userMenuId = 'headerUserMenu';
  const { linePath, areaPath, points } = useChartPath();

  useEffect(() => {
    const handleScroll = () => {
      setIsNavbarScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsHeroReady(true), 500);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const group = target.dataset.group;
            if (group) {
              setVisibleCards(current => ({ ...current, [group]: true }));
            }
          }
        });
      },
      { threshold: 0.12 }
    );

    const elements = document.querySelectorAll('[data-observe]');
    elements.forEach(element => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visibleCards.stats) {
      return;
    }

    const duration = 1800;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      const nextValues = stats.map(stat => Math.floor(eased * stat.value));
      setStatValues(nextValues);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [visibleCards.stats]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const source = transactionSources[Math.floor(Math.random() * transactionSources.length)];
      const newTransaction: TransactionItem = {
        id: Date.now(),
        type: source.type,
        hash: createRandomHash(),
        project: `→ ${source.projects[Math.floor(Math.random() * source.projects.length)]}`,
        amount: source.amounts[Math.floor(Math.random() * source.amounts.length)],
        time: 'vừa xong'
      };

      setTransactions(current => {
        const nextItems = [newTransaction, ...current].slice(0, 6);
        return nextItems.map((item, index) => ({
          ...item,
          time: ['vừa xong', '5 giây', '30 giây', '1 phút', '2 phút', '4 phút'][index] || '5 phút trước'
        }));
      });
    }, 3500);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    /**
     * Hàm đồng bộ trạng thái đăng nhập từ localStorage vào header trang chủ.
     * Mục đích: giữ đúng hiển thị sau refresh và sau khi đăng nhập Google.
     */
    const syncAuthenticatedUserName = () => {
      const authSession = readAuthSession();
      const hasAccessToken = Boolean(authSession.accessToken);

      // Ghi chú logic phức tạp: chỉ hiện tên người dùng khi đã có access token hợp lệ trong session.
      if (!hasAccessToken) {
        setAuthenticatedUserName('');
        setIsUserMenuVisible(false);
        return;
      }

      setAuthenticatedUserName(authSession.userFullName || 'Người dùng');
    };

    syncAuthenticatedUserName();
    window.addEventListener(authenticationSessionUpdatedEventName, syncAuthenticatedUserName);

    return () => {
      window.removeEventListener(authenticationSessionUpdatedEventName, syncAuthenticatedUserName);
    };
  }, []);

  /**
   * Hàm bật/tắt menu người dùng trên header.
   * Mục đích: hiển thị menu dropdown chứa hành động đăng xuất.
   */
  const handleToggleUserMenu = () => {
    setIsUserMenuVisible(currentState => !currentState);
  };

  /**
   * Hàm xử lý phím trên nút người dùng.
   * Mục đích: mở menu bằng Enter/Space để cải thiện truy cập bàn phím.
   */
  const handleUserMenuButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    setIsUserMenuVisible(true);
  };

  /**
   * Hàm xử lý đăng xuất từ menu người dùng.
   * Mục đích: xóa toàn bộ session client và cập nhật UI ngay không cần reload.
   */
  const handleHeaderUserLogout = () => {
    clearAuthSession();
    setAuthenticatedUserName('');
    setIsUserMenuVisible(false);
  };

  useEffect(() => {
    /**
     * Hàm đóng menu khi người dùng click ra ngoài vùng menu.
     * Mục đích: đảm bảo dropdown hoạt động đúng UX phổ biến.
     */
    const handleClickOutsideUserMenu = (event: MouseEvent) => {
      // Ghi chú logic phức tạp: kiểm tra phần tử chứa để tránh đóng menu khi click bên trong.
      if (!userMenuContainerRef.current?.contains(event.target as Node)) {
        setIsUserMenuVisible(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutsideUserMenu);
    return () => {
      window.removeEventListener('mousedown', handleClickOutsideUserMenu);
    };
  }, []);

  useEffect(() => {
    /**
     * Hàm xử lý bàn phím cho menu người dùng.
     * Mục đích: hỗ trợ phím Escape để đóng menu theo chuẩn truy cập cơ bản.
     */
    const handleEscapeForUserMenu = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setIsUserMenuVisible(false);
      userMenuButtonRef.current?.focus();
    };

    window.addEventListener('keydown', handleEscapeForUserMenu);
    return () => {
      window.removeEventListener('keydown', handleEscapeForUserMenu);
    };
  }, []);

  useEffect(() => {
    // Ghi chú logic phức tạp: khi menu mở, đưa focus vào action chính để thao tác bàn phím nhanh và rõ ràng.
    if (isUserMenuVisible) {
      logoutMenuItemRef.current?.focus();
    }
  }, [isUserMenuVisible]);

  return (
    <main className="home-root">
      <nav id="navbar" className={isNavbarScrolled ? 'scrolled' : ''}>
        <a href="#" className="logo">
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
          <li>
            <a href="#projects">Dự án</a>
          </li>
          <li>
            <a href="#ranking">Bảng xếp hạng</a>
          </li>
          <li>
            <a href="#transparency">Minh bạch</a>
          </li>
          <li>
            <a href="#how">Cách hoạt động</a>
          </li>
        </ul>
        <div className="nav-actions">
          {authenticatedUserName ? (
            <div className="relative" ref={userMenuContainerRef}>
              <button
                ref={userMenuButtonRef}
                type="button"
                className="btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7c6b] focus-visible:ring-offset-2"
                aria-label="Mở menu người dùng"
                aria-haspopup="menu"
                aria-expanded={isUserMenuVisible}
                aria-controls={userMenuId}
                onClick={handleToggleUserMenu}
                onKeyDown={handleUserMenuButtonKeyDown}
              >
                <span aria-hidden="true">👤</span> {authenticatedUserName}
              </button>
              <div
                id={userMenuId}
                role="menu"
                aria-hidden={!isUserMenuVisible}
                className={`absolute right-0 top-[calc(100%+10px)] z-20 min-w-[170px] rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_12px_32px_rgba(13,17,23,0.14)] transition-all duration-150 ease-out ${isUserMenuVisible ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
                  }`}
              >
                <button
                  ref={logoutMenuItemRef}
                  type="button"
                  role="menuitem"
                  className="flex min-h-[44px] w-full items-center justify-start rounded-lg px-3.5 py-2.5 text-sm font-semibold text-[#0d1117] transition-colors duration-150 hover:bg-[#f3f4f6] active:bg-[#e5e7eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7c6b]"
                  onClick={handleHeaderUserLogout}
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          ) : (
            <a href="/login" className="btn-ghost">
              Đăng nhập
            </a>
          )}
          <a href="/deposit" className="btn-amber">
            💰 Nạp tiền
          </a>
        </div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-bg" />
        <div className="hero-pattern" />
        <div className="hero-hex" />

        <div className="hero-content">
          <div className="hero-badge">
            <span /> ⛓ Powered by Blockchain × PayOS
          </div>
          <h1>
            Quyên góp <em>minh bạch.</em>
            <br />
            Mọi đồng tiền
            <br />
            kiểm chứng được.
          </h1>
          <p className="hero-desc">
            Nền tảng từ thiện đầu tiên kết hợp Blockchain + PayOS tại Việt Nam. 100% giao dịch ghi nhận on-chain — không
            trung gian, không gian lận.
          </p>
          <div className="hero-actions">
            <a href="#projects" className="btn-primary">
              Khám phá dự án <span>→</span>
            </a>
            <a href="#how" className="btn-play">
              <div className="play-circle">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4 2.5l7 4.5-7 4.5V2.5z" fill="#0E7C6B" />
                </svg>
              </div>
              Xem cách hoạt động
            </a>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-card-wrapper">
            <div className="floating-badges">
              <div className="f-badge-1">
                <div className="donor-stack">
                  <div className="donor-av" style={{ background: '#10B981' }}>
                    N
                  </div>
                  <div className="donor-av" style={{ background: '#3B82F6' }}>
                    T
                  </div>
                  <div className="donor-av" style={{ background: '#F59E0B' }}>
                    L
                  </div>
                </div>
                <span className="donor-count">+248 người đã ủng hộ</span>
              </div>
            </div>
            <div className="project-card-hero">
              <div className="card-img">
                <div className="card-img-overlay" />
                <div className="card-img-text">
                  🏫 Trường học vùng cao Hà Giang
                  <small>Tổ chức: Ánh Sáng Việt Nam ✓</small>
                </div>
                <div className="badge-verified">⛓ Xác minh on-chain</div>
              </div>
              <div className="card-body">
                <div className="card-org">✅ Ánh Sáng Việt Nam</div>
                <div className="card-title">Xây dựng phòng học cho 120 em học sinh dân tộc thiểu số</div>
                <div className="progress-wrap">
                  <div className="progress-label">
                    <span className="progress-value">458,000,000₫</span>
                    <span className="progress-goal">
                      / 630,000,000₫ <strong>73%</strong>
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: isHeroReady ? '73%' : '0%' }} />
                  </div>
                </div>
                <div className="card-stats">
                  <span>👥 248 donors</span>
                  <span>📅 12 ngày còn lại</span>
                  <span>⛓ 1,247 tx</span>
                </div>
              </div>
            </div>
            <div className="f-badge-2">🔒 Smart Contract bảo vệ</div>
          </div>
        </div>
      </section>

      <div className="trust-bar">
        <div className="trust-scroll">
          {[...trustItems, ...trustItems].map((item, index) => (
            <div className="trust-item" key={`${item.label}-${index}`}>
              {item.label} <strong>{item.value}</strong>
              <span className="trust-sep">·</span>
            </div>
          ))}
        </div>
      </div>

      <section className="how" id="how">
        <div className="how-header">
          <div className="section-label">Quy trình</div>
          <h2 className="section-title">Đơn giản — Minh bạch — Bảo mật</h2>
          <p className="section-sub">
            3 bước từ ví tiền của bạn đến tay người cần giúp đỡ, mọi bước đều ghi nhận on-chain
          </p>
        </div>
        <div className="how-steps">
          {[
            {
              icon: '💳',
              title: 'Nạp tiền VNĐ',
              description:
                'Chuyển khoản qua PayOS — hệ thống tự động mint Charity Token vào ví Smart Account của bạn. Tỷ lệ 1₫ = 1 Token.',
              delay: 0
            },
            {
              icon: '🎯',
              title: 'Chọn & Quyên góp',
              description:
                'Duyệt danh sách dự án được xếp hạng bằng Quadratic Funding, quyên góp Token — giao dịch ghi nhận ngay lên Blockchain.',
              delay: 0.15
            },
            {
              icon: '🔍',
              title: 'Theo dõi Minh bạch',
              description:
                'Xem lịch sử toàn bộ on-chain bất kỳ lúc nào. Giải ngân cần 2/3 admin ký trên Smart Contract — không ai có thể tự ý sử dụng.',
              delay: 0.3
            }
          ].map((step, index) => (
            <div
              className={`step ${visibleCards.steps ? 'visible' : ''}`}
              key={step.title}
              style={{ transitionDelay: `${step.delay}s` }}
              data-observe
              data-group="steps"
            >
              <div className="step-icon-wrapper">
                <div className="step-icon">
                  <span>{step.icon}</span>
                </div>
                <div className="step-num">{index + 1}</div>
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="projects" id="projects">
        <div className="projects-header">
          <div>
            <div className="section-label">Dự án</div>
            <h2 className="section-title">Đang cần hỗ trợ</h2>
          </div>
          <div className="filter-tabs">
            {['Tất cả', 'Giáo dục', 'Y tế', 'Thiên tai', 'Trẻ em'].map(tab => (
              <button
                className={`tab ${activeTab === tab ? 'active' : ''}`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="projects-grid">
          {projects.map(project => (
            <div
              className={`pcard ${visibleCards.projects ? 'visible' : ''}`}
              key={project.id}
              style={{ transitionDelay: `${project.delay ?? 0}s` }}
              data-observe
              data-group="projects"
            >
              <div className="pcard-img">
                <div className="pcard-img-bg" style={{ background: project.background }}>
                  {project.icon}
                </div>
                <div className="pcard-status status-active">{project.status}</div>
                <div className="qf-badge">{project.qfScore}</div>
              </div>
              <div className="pcard-body">
                <div className="pcard-org">{project.organization}</div>
                <div className="pcard-title">{project.title}</div>
                <div className="pcard-desc">{project.description}</div>
                <div className="progress-wrap">
                  <div className="progress-label">
                    <span className="progress-value">{project.raisedLabel}</span>
                    <span>{`/ ${project.goalLabel}`}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${project.progress}%` }} />
                  </div>
                </div>
                <div className="pcard-meta">
                  <span>{project.donors}</span>
                  <span>{project.daysLeft}</span>
                  <span>{project.transactions}</span>
                </div>
                <div className="pcard-actions">
                  <button className="btn-donate" type="button">
                    💛 Quyên góp ngay
                  </button>
                  <button className="btn-detail" type="button">
                    Chi tiết
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="projects-footer">
          <a href="#" className="btn-ghost btn-ghost-large">
            Xem tất cả dự án →
          </a>
        </div>
      </section>

      <section className="transparency" id="transparency">
        <div className="trans-header">
          <div className="section-label">Minh bạch</div>
          <h2 className="section-title">Giao dịch thời gian thực</h2>
          <p className="section-sub">Mọi giao dịch đều công khai và kiểm chứng được trên Blockchain</p>
        </div>
        <div className="trans-grid">
          <div className="live-feed-wrap">
            <div className="live-header">
              <h3 className="live-title">Live Feed</h3>
              <div className="live-label">
                <span className="live-dot" /> Đang cập nhật
              </div>
            </div>
            <div className="tx-list">
              {transactions.map(transaction => (
                <div className="tx-item" key={transaction.id}>
                  <div className={`tx-dot ${transaction.type}`} />
                  <div className="tx-info">
                    <div className="tx-hash">{transaction.hash}</div>
                    <div className="tx-project">{transaction.project}</div>
                  </div>
                  <div>
                    <div className="tx-amount" style={transaction.amountColor ? { color: transaction.amountColor } : {}}>
                      {transaction.amount}
                    </div>
                    <div className="tx-time">{transaction.time}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="tx-footer">
              <a href="#" className="tx-link">
                Xem tất cả giao dịch → ↗ Block Explorer
              </a>
            </div>
          </div>

          <div className="chart-wrap">
            <div className="chart-title">Tổng quyên góp 30 ngày</div>
            <div className="chart-sub">Đơn vị: triệu VNĐ</div>
            <svg className="chart-svg" viewBox="0 0 480 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0E7C6B" stopOpacity=".25" />
                  <stop offset="100%" stopColor="#0E7C6B" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="40" x2="480" y2="40" stroke="#E6F7F4" strokeWidth="1" />
              <line x1="0" y1="80" x2="480" y2="80" stroke="#E6F7F4" strokeWidth="1" />
              <line x1="0" y1="120" x2="480" y2="120" stroke="#E6F7F4" strokeWidth="1" />
              <line x1="0" y1="160" x2="480" y2="160" stroke="#E6F7F4" strokeWidth="1" />
              <path id="chartArea" fill="url(#chartGrad)" d={areaPath} />
              <path
                id="chartLine"
                fill="none"
                stroke="#0E7C6B"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d={linePath}
              />
              <g id="chartDots">
                {points.map((point, index) => {
                  if (index % 5 !== 0 && index !== points.length - 1) {
                    return null;
                  }

                  return (
                    <circle
                      key={`${point[0]}-${point[1]}`}
                      cx={point[0]}
                      cy={point[1]}
                      r={4}
                      fill="#0E7C6B"
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
              <text x="0" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                1/2
              </text>
              <text x="60" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                5/2
              </text>
              <text x="120" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                10/2
              </text>
              <text x="180" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                15/2
              </text>
              <text x="240" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                20/2
              </text>
              <text x="300" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                24/2
              </text>
              <text x="360" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                27/2
              </text>
              <text x="430" y="195" fontSize="10" fill="#9CA3AF" fontFamily="Lexend">
                1/3
              </text>
            </svg>
            <div className="chart-footer">
              <div className="chart-legend">
                <span className="chart-line" />Quyên góp
              </div>
              <div className="chart-total">Tổng 30 ngày: 847,500,000₫</div>
            </div>
          </div>
        </div>
      </section>

      <section className="why">
        <div className="why-header">
          <div className="section-label">Tại sao DCP</div>
          <h2 className="section-title">Tin tưởng có cơ sở</h2>
          <p className="section-sub">Không chỉ là lời hứa — mọi cam kết đều được thực thi bởi Smart Contract</p>
        </div>
        <div className="why-grid">
          {[
            {
              icon: '🔒',
              title: 'Không thể giả mạo',
              description:
                'Smart Contract tự động thực thi, không ai — kể cả admin — có thể thay đổi dữ liệu giao dịch đã ghi nhận.',
              delay: 0
            },
            {
              icon: '👁',
              title: '100% Minh bạch',
              description: 'Mọi giao dịch đều công khai trên Blockchain. Bất kỳ ai cũng có thể kiểm chứng qua Block Explorer.',
              delay: 0.1
            },
            {
              icon: '✍️',
              title: 'Đa chữ ký an toàn',
              description: 'Cần 2/3 admin ký tên mới có thể giải ngân. Một người không thể tự ý chuyển tiền ra ngoài.',
              delay: 0.2
            },
            {
              icon: '⚡',
              title: 'Quadratic Funding',
              description:
                'Thuật toán QF đảm bảo phân bổ công bằng — dự án được nhiều người ủng hộ sẽ được ưu tiên, không phải chỉ người giàu nhất.',
              delay: 0.3
            }
          ].map(card => (
            <div
              className={`why-card ${visibleCards.why ? 'visible' : ''}`}
              key={card.title}
              style={{ transitionDelay: `${card.delay}s` }}
              data-observe
              data-group="why"
            >
              <span className="why-icon">{card.icon}</span>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="stats" id="stats">
        <div className="section-label">Con số thực tế</div>
        <h2 className="section-title">Tác động thực sự</h2>
        <div className="stats-grid" data-observe data-group="stats">
          {stats.map((stat, index) => (
            <div
              className={`stat-item ${visibleCards.stats ? 'visible' : ''}`}
              key={stat.id}
              style={{ transitionDelay: `${stat.delay ?? 0}s` }}
            >
              <span className="stat-num">
                {formatStatValue(statValues[index] ?? 0, stat.suffix)}
              </span>
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ranking" id="ranking">
        <div className="rank-header">
          <div>
            <div className="section-label">Bảng xếp hạng</div>
            <h2 className="section-title">Top Quadratic Funding</h2>
          </div>
          <a href="#" className="rank-link">
            Xem tất cả →
          </a>
        </div>
        <div className="top3-grid">
          {[
            {
              medal: '🥈',
              title: 'Phẫu thuật tim miễn phí',
              organization: 'Trái Tim Xanh Foundation',
              score: 'QF Score 8.7',
              delay: 0.1
            },
            {
              medal: '🥇',
              title: 'Trường học vùng cao Hà Giang',
              organization: 'Ánh Sáng Việt Nam',
              score: 'QF Score 9.2',
              delay: 0
            },
            {
              medal: '🥉',
              title: 'Tái thiết nhà Quảng Bình',
              organization: 'Cứu Trợ Miền Trung',
              score: 'QF Score 8.1',
              delay: 0.2
            }
          ].map((card, index) => (
            <div
              className={`rank-card ${index === 1 ? 'first' : ''} ${visibleCards.ranking ? 'visible' : ''}`}
              key={card.title}
              style={{ transitionDelay: `${card.delay}s` }}
              data-observe
              data-group="ranking"
            >
              <span className="rank-medal">{card.medal}</span>
              <div className="rank-name">{card.title}</div>
              <div className="rank-org">{card.organization}</div>
              <span className="qf-score-big">{card.score}</span>
            </div>
          ))}
        </div>
        <table className="rank-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Dự án</th>
              <th>Tổ chức</th>
              <th>QF Score</th>
              <th>Đã gây quỹ</th>
              <th>Donors</th>
            </tr>
          </thead>
          <tbody>
            {rankingItems.map(item => (
              <tr key={item.rank}>
                <td className="rank-number">{item.rank}</td>
                <td className="rank-project">{item.name}</td>
                <td className="rank-organization">{item.organization}</td>
                <td>
                  <span className="rank-score">{item.score}</span>
                </td>
                <td>{item.raised}</td>
                <td>{item.donors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="cta-section">
        <h2>
          Bắt đầu hành trình
          <br />
          từ thiện minh bạch
        </h2>
        <p>Tạo tài khoản miễn phí — chỉ cần email hoặc Google, không cần biết về Blockchain</p>
        <div className="cta-actions">
          <button className="btn-white" type="button">
            🚀 Tạo tài khoản miễn phí
          </button>
          <button className="btn-outline-white" type="button">
            🏢 Tôi là tổ chức từ thiện
          </button>
        </div>
      </section>

      <footer>
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="#" className="logo footer-logo">
              <div className="logo-icon">
                <svg viewBox="0 0 24 24" className="footer-logo-icon">
                  <path d="M12 21.7C5.8 17.5 2 13.2 2 9a6 6 0 0112 0 6 6 0 0112 0c0 4.2-3.8 8.5-10 12.7z" />
                </svg>
              </div>
              <div>
                <span className="logo-text">DCP</span>
                <span className="logo-tag">Minh bạch tuyệt đối</span>
              </div>
            </a>
            <p className="footer-desc">
              Nền tảng từ thiện phi tập trung đầu tiên tại Việt Nam, kết hợp Blockchain và hệ thống thanh toán truyền thống.
            </p>
            <div className="social-links">
              <a href="#" className="social-btn">
                𝕏
              </a>
              <a href="#" className="social-btn">
                f
              </a>
              <a href="#" className="social-btn">
                in
              </a>
              <a href="#" className="social-btn">
                ⛓
              </a>
            </div>
          </div>
          <div className="footer-col">
            <h4>Nền tảng</h4>
            <ul>
              <li>
                <a href="#">Dự án đang mở</a>
              </li>
              <li>
                <a href="#">Bảng xếp hạng QF</a>
              </li>
              <li>
                <a href="#">Transparency Dashboard</a>
              </li>
              <li>
                <a href="#">Đăng ký tổ chức</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Về DCP</h4>
            <ul>
              <li>
                <a href="#">Giới thiệu</a>
              </li>
              <li>
                <a href="#">Cách hoạt động</a>
              </li>
              <li>
                <a href="#">Công nghệ</a>
              </li>
              <li>
                <a href="#">Blog</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Hỗ trợ</h4>
            <ul>
              <li>
                <a href="#">Điều khoản sử dụng</a>
              </li>
              <li>
                <a href="#">Chính sách bảo mật</a>
              </li>
              <li>
                <a href="#">Liên hệ</a>
              </li>
              <li>
                <a href="#">FAQ</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2025 DCP — Decentralized Charity Platform. All rights reserved.</span>
          <div className="footer-tech">
            <span className="tech-badge">⛓ Polygon Amoy</span>
            <span className="tech-badge">💳 PayOS</span>
            <span className="tech-badge">🔐 ERC-4337</span>
            <span className="tech-badge">📦 IPFS</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

