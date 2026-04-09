'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl, fetchApi } from './utils/apiClient';
import { authenticationSessionUpdatedEventName, clearAuthSession, readAuthSession } from './utils/authSession';


type HomeSupportProject = {
  projectId: string;
  name: string;
  description: string;
  goalAmount: number;
  status: string;
  updatedAt: string;
  createdAt: string;
};

type HomeSupportProjectDetail = {
  projectId: string;
  name: string;
  description: string;
  goalAmount: number;
  status: string;
  updatedAt: string;
  evidenceCids: string[];
};

type HomeDonationCampaignDetail = {
  projectId: string;
  name: string;
  description: string;
  goalAmount: number;
  donatedAmount: number;
  donationCount: number;
  status: string;
  deadline?: string;
};

type HomeDepositSidebarResponse = {
  tokenBalance: number;
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

const projectCardIconList = ['🏫', '🏥', '🌊', '👶', '💧', '🌱'];
const projectCardBackgroundList = [
  'linear-gradient(135deg,#E6F7F4,#B2EEE4)',
  'linear-gradient(135deg,#FEF3C7,#FDE68A)',
  'linear-gradient(135deg,#EDE9FE,#C4B5FD)',
  'linear-gradient(135deg,#FEE2E2,#FCA5A5)',
  'linear-gradient(135deg,#DBEAFE,#93C5FD)',
  'linear-gradient(135deg,#DCFCE7,#86EFAC)'
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

/** Hàm định dạng số tiền theo chuẩn tiền Việt. Mục đích: hiển thị mục tiêu gây quỹ rõ ràng cho người dùng. */
const formatCurrencyVnd = (amountValue: number): string => {
  return new Intl.NumberFormat('vi-VN').format(amountValue);
};

/** Hàm định dạng thời gian cập nhật. Mục đích: hiển thị mốc cập nhật gần nhất của dự án ở section homepage. */
const formatUpdatedTime = (updatedAtIso: string): string => {
  const parsedUpdatedAt = new Date(updatedAtIso);

  if (Number.isNaN(parsedUpdatedAt.getTime())) {
    return 'Không xác định';
  }

  return parsedUpdatedAt.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/** Hàm kiểm tra campaign còn hạn donate. Mục đích: chặn thao tác quyên góp với dự án đã hết hạn. */
const isCampaignBeforeDeadline = (deadlineIso?: string): boolean => {
  if (!deadlineIso) {
    return true;
  }

  const parsedDeadline = new Date(deadlineIso);
  if (Number.isNaN(parsedDeadline.getTime())) {
    return true;
  }

  return parsedDeadline.getTime() >= Date.now();
};

/** Hàm kiểm tra campaign đủ điều kiện donate. Mục đích: gom rule nghiệp vụ UC3.1 tại Home. */
const isCampaignEligibleForDonation = (campaignItem: HomeDonationCampaignDetail): boolean => {
  return campaignItem.status === 'ACTIVE' && isCampaignBeforeDeadline(campaignItem.deadline);
};

/** Hàm chuẩn hóa projectId cho relay. Mục đích: hỗ trợ cả mã thuần số và mã có chứa số như PRJ-1001. */
const resolveRelayProjectId = (projectId: string): string => {
  const normalizedProjectId = projectId.trim();
  if (/^[0-9]+$/.test(normalizedProjectId)) {
    return normalizedProjectId;
  }

  const numericPartMatch = normalizedProjectId.match(/([0-9]+)/);
  if (numericPartMatch?.[1]) {
    return numericPartMatch[1];
  }

  return '';
};

/** Hàm map lỗi donation sang thông điệp dễ hiểu. Mục đích: phân loại lỗi đúng ngữ cảnh cho luồng relay backend. */
const mapDonationErrorMessage = (error: unknown): string => {
  const apiError = error as { statusCode?: number; message?: string; errorCode?: string };
  if (apiError?.statusCode === 401) return 'Bạn chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại để quyên góp.';
  if (apiError?.errorCode === 'CHAIN_MISMATCH') return 'Hệ thống relay đang ở sai mạng blockchain. Vui lòng thử lại sau.';
  if (apiError?.errorCode === 'TRANSACTION_TIMEOUT') return 'Giao dịch đang pending quá lâu. Vui lòng đợi thêm hoặc thử lại sau.';
  if (apiError?.errorCode === 'TRANSACTION_REVERTED') return 'Giao dịch bị từ chối trên blockchain. Vui lòng kiểm tra lại số dư token.';
  if (apiError?.errorCode === 'PAYMASTER_POLICY_MISMATCH') return 'Hệ thống tài trợ phí gas chưa cấu hình policy phù hợp cho giao dịch quyên góp. Vui lòng liên hệ quản trị viên.';
  if (apiError?.errorCode === 'VALIDATION_ERROR') {
    return apiError.message || 'Dữ liệu quyên góp không hợp lệ. Vui lòng kiểm tra lại thông tin.';
  }
  return apiError?.message || (error as Error)?.message || 'Không thể gửi giao dịch quyên góp lúc này. Vui lòng thử lại sau.';
};
/** Hàm hiển thị nhãn trạng thái dự án thân thiện. Mục đích: chuẩn hóa trạng thái kỹ thuật thành tiếng Việt dễ hiểu. */
const getPublicProjectStatusLabel = (statusValue: string): string => {
  if (statusValue === 'ACTIVE') {
    return 'Đang hoạt động';
  }

  if (statusValue === 'PENDING_APPROVAL') {
    return 'Chờ duyệt';
  }

  return statusValue;
};

/** Hàm kiểm tra CID IPFS cơ bản. Mục đích: chỉ cho phép render link với CID hợp lệ để tránh URL rác. */
const isValidIpfsCid = (cidValue: string): boolean => {
  const normalizedCidValue = cidValue.trim();
  const cidVersionZeroRegex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
  const cidVersionOneRegex = /^b[a-z2-7]{20,}$/;
  return cidVersionZeroRegex.test(normalizedCidValue) || cidVersionOneRegex.test(normalizedCidValue);
};

/** Hàm tạo URL gateway IPFS an toàn. Mục đích: chỉ trả link khi CID hợp lệ, ngược lại trả chuỗi rỗng. */
const buildIpfsGatewayUrl = (cidValue: string): string => {
  if (!isValidIpfsCid(cidValue)) {
    return '';
  }

  return `https://gateway.pinata.cloud/ipfs/${cidValue}`;
};


/** Hàm lấy icon và nền card theo vị trí. Mục đích: giữ giao diện đồng nhất khi dữ liệu dự án đến từ API thật. */
const getProjectVisualByIndex = (indexNumber: number): { icon: string; background: string } => {
  const normalizedIndexNumber = Math.abs(indexNumber);
  const icon = projectCardIconList[normalizedIndexNumber % projectCardIconList.length] || '📌';
  const background =
    projectCardBackgroundList[normalizedIndexNumber % projectCardBackgroundList.length] ||
    'linear-gradient(135deg,#E5E7EB,#D1D5DB)';

  return { icon, background };
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
  const [supportProjectList, setSupportProjectList] = useState<HomeSupportProject[]>([]);
  const [isSupportProjectsLoading, setIsSupportProjectsLoading] = useState(true);
  const [supportProjectsErrorMessage, setSupportProjectsErrorMessage] = useState('');
  const [isShowingAllSupportProjects, setIsShowingAllSupportProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isProjectDetailModalVisible, setIsProjectDetailModalVisible] = useState(false);
  const [isProjectDetailLoading, setIsProjectDetailLoading] = useState(false);
  const [projectDetailErrorMessage, setProjectDetailErrorMessage] = useState('');
  const [selectedProjectDetail, setSelectedProjectDetail] = useState<HomeSupportProjectDetail | null>(null);
  const [isDonationModalVisible, setIsDonationModalVisible] = useState(false);
  const [selectedDonationCampaignDetail, setSelectedDonationCampaignDetail] = useState<HomeDonationCampaignDetail | null>(null);
  const [selectedDonationProjectId, setSelectedDonationProjectId] = useState('');
  const [donationAmountInput, setDonationAmountInput] = useState('');
  const [donationErrorMessage, setDonationErrorMessage] = useState('');
  const [donationSuccessMessage, setDonationSuccessMessage] = useState('');
  const [isDonationDataLoading, setIsDonationDataLoading] = useState(false);
  const [isDonationSubmitting, setIsDonationSubmitting] = useState(false);
  const [isDonationConfirmModalVisible, setIsDonationConfirmModalVisible] = useState(false);
  const [pendingDonationAmount, setPendingDonationAmount] = useState<number | null>(null);
  const [userTokenBalance, setUserTokenBalance] = useState(0);
  const [isLoginRequiredDialogVisible, setIsLoginRequiredDialogVisible] = useState(false);
  const [statValues, setStatValues] = useState(() => stats.map(() => 0));
  const [transactions, setTransactions] = useState<TransactionItem[]>(initialTransactions);
  const [authenticatedUserName, setAuthenticatedUserName] = useState('');
  const [isUserMenuVisible, setIsUserMenuVisible] = useState(false);
  const userMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const logoutMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const projectDetailCacheRef = useRef<Map<string, HomeSupportProjectDetail | null>>(new Map());
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

  /** Hàm tải danh sách dự án hỗ trợ. Mục đích: cho phép lấy dữ liệu preview hoặc toàn bộ danh sách theo hành động người dùng. */
  const loadSupportProjectList = useCallback(async (shouldLoadAllProjects: boolean) => {
    setIsSupportProjectsLoading(true);
    setSupportProjectsErrorMessage('');

    try {
      const supportProjectApiPath = shouldLoadAllProjects ? '/projects/public-support?limit=12' : '/projects/public-support?limit=6';
      const supportProjectsResponse = await fetchApi<HomeSupportProject[]>(buildApiUrl(supportProjectApiPath), {
        method: 'GET',
        cache: 'no-store'
      });

      setSupportProjectList(supportProjectsResponse.data);
    } catch (error) {
      const fallbackErrorMessage = 'Không thể tải danh sách dự án cần hỗ trợ. Vui lòng thử lại sau.';
      const normalizedErrorMessage = error instanceof Error ? error.message : fallbackErrorMessage;
      console.error('Fetch support projects failed.', error);
      setSupportProjectsErrorMessage(normalizedErrorMessage || fallbackErrorMessage);
      setSupportProjectList([]);
    } finally {
      setIsSupportProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSupportProjectList(false);
  }, [loadSupportProjectList]);

  /** Hàm xử lý mở toàn bộ danh sách dự án hỗ trợ. Mục đích: chuyển từ chế độ preview sang hiển thị đầy đủ ngay trên Home. */
  const handleShowAllSupportProjects = async () => {
    // Ghi chú logic UI quan trọng: tránh bấm lặp khi đang tải để không tạo request chồng chéo.
    if (isSupportProjectsLoading || isShowingAllSupportProjects) {
      return;
    }

    setIsShowingAllSupportProjects(true);
    await loadSupportProjectList(true);
  };


  /** Hàm tải số dư token từ backend. Mục đích: phục vụ validate số token trước khi gửi giao dịch donate. */
  const loadUserTokenBalance = useCallback(async (): Promise<number> => {
    const authSession = readAuthSession();
    if (!authSession.accessToken) {
      setUserTokenBalance(0);
      return 0;
    }

    /** Hàm chuẩn hóa token balance từ nhiều kiểu payload sidebar. Mục đích: tương thích response có bọc `data` và response object trực tiếp. */
    const resolveTokenBalanceFromSidebarPayload = (sidebarPayload: unknown): number => {
      const payloadRecord = sidebarPayload as { tokenBalance?: number; data?: { tokenBalance?: number } };
      const resolvedTokenBalance = Number(payloadRecord?.data?.tokenBalance ?? payloadRecord?.tokenBalance ?? 0);
      return Number.isFinite(resolvedTokenBalance) ? resolvedTokenBalance : 0;
    };

    /** Hàm gọi 1 endpoint sidebar và trả token balance. Mục đích: tái sử dụng cho nhiều endpoint tương thích môi trường. */
    const loadTokenBalanceFromSingleEndpoint = async (endpointPath: string): Promise<number> => {
      const response = await fetch(buildApiUrl(endpointPath), {
        method: 'GET',
        headers: { Authorization: `Bearer ${authSession.accessToken}` },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Không thể tải số dư token.');
      }

      const responsePayload = (await response.json().catch(() => null)) as unknown;
      return resolveTokenBalanceFromSidebarPayload(responsePayload);
    };

    try {
      // Ghi chú logic phức tạp: ưu tiên endpoint đang được trang Deposit sử dụng thực tế.
      const normalizedTokenBalance = await loadTokenBalanceFromSingleEndpoint('/api/deposit/sidebar');
      setUserTokenBalance(normalizedTokenBalance);
      return normalizedTokenBalance;
    } catch (_primaryError) {
      try {
        const normalizedTokenBalance = await loadTokenBalanceFromSingleEndpoint('/deposits/sidebar');
        setUserTokenBalance(normalizedTokenBalance);
        return normalizedTokenBalance;
      } catch (_secondaryError) {
        try {
          const normalizedTokenBalance = await loadTokenBalanceFromSingleEndpoint('/deposit/sidebar');
          setUserTokenBalance(normalizedTokenBalance);
          return normalizedTokenBalance;
        } catch (_fallbackError) {
          setUserTokenBalance(0);
          return 0;
        }
      }
    }
  }, []);

  /** Hàm tải chi tiết campaign donate. Mục đích: hiển thị số đã quyên góp và kiểm tra điều kiện ACTIVE trước khi gửi giao dịch. */
  const loadDonationCampaignDetail = useCallback(async (projectId: string): Promise<HomeDonationCampaignDetail | null> => {
    const campaignResponse = await fetchApi<HomeDonationCampaignDetail | null>(buildApiUrl(`/donations/campaigns/${projectId}`), {
      method: 'GET',
      cache: 'no-store'
    });

    return campaignResponse.data;
  }, []);

  /** Hàm gửi donation qua relay backend. Mục đích: gửi giao dịch on-chain mà không cần MetaMask trên frontend. */
  const submitDonationViaRelay = useCallback(async (projectId: string, amount: number) => {
    const authSession = readAuthSession();
    if (!authSession.accessToken) {
      throw { statusCode: 401, message: 'Bạn chưa đăng nhập. Vui lòng đăng nhập để quyên góp.' };
    }

    const relayProjectId = resolveRelayProjectId(projectId);
    if (!relayProjectId) {
      throw { statusCode: 400, errorCode: 'VALIDATION_ERROR', message: 'Mã dự án không hợp lệ để gửi giao dịch.' };
    }

    return fetchApi<{ transactionHash: string }>(buildApiUrl('/donations/one-click'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${authSession.accessToken}` },
      body: JSON.stringify({ projectId: relayProjectId, amount, isAnonymous: false })
    });
  }, []);

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

  /** Hàm đóng modal chi tiết dự án. Mục đích: reset trạng thái mở modal theo mọi cách đóng (nút, overlay, Escape). */
  const closeProjectDetailModal = () => {
    setIsProjectDetailModalVisible(false);
    setIsProjectDetailLoading(false);
    setProjectDetailErrorMessage('');
    setSelectedProjectId('');
  };

  /** Hàm đóng modal quyên góp Home. Mục đích: reset toàn bộ input và trạng thái giao dịch của luồng donate tại chỗ. */
  const closeDonationModal = () => {
    setIsDonationModalVisible(false);
    setIsDonationConfirmModalVisible(false);
    setPendingDonationAmount(null);
    setSelectedDonationProjectId('');
    setSelectedDonationCampaignDetail(null);
    setDonationAmountInput('');
    setDonationErrorMessage('');
    setDonationSuccessMessage('');
    setIsDonationDataLoading(false);
    setIsDonationSubmitting(false);
  };

  /** Hàm điều hướng đến trang đăng nhập. Mục đích: xử lý tập trung thao tác chuyển trang từ hộp thoại yêu cầu đăng nhập. */
  const redirectToLoginPage = () => {
    window.location.assign('/login');
  };

  /** Hàm đóng hộp thoại yêu cầu đăng nhập. Mục đích: cho phép người dùng ở lại Home mà không chuyển trang. */
  const closeLoginRequiredDialog = () => {
    setIsLoginRequiredDialogVisible(false);
  };

  /** Hàm mở modal donate tại Home. Mục đích: nạp dữ liệu campaign + số dư token mà không điều hướng route. */
  const handleOpenDonationModal = async (projectId: string, projectPreview?: HomeSupportProject) => {
    const authSession = readAuthSession();
    const hasAccessToken = Boolean(authSession.accessToken?.trim());

    // Ghi chú logic phức tạp: chặn toàn bộ flow donate khi chưa đăng nhập và hiển thị hộp thoại UI thay vì alert thô.
    if (!hasAccessToken) {
      setIsLoginRequiredDialogVisible(true);
      return;
    }

    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return;
    }

    setIsDonationModalVisible(true);
    setSelectedDonationProjectId(normalizedProjectId);
    setDonationAmountInput('');
    setDonationErrorMessage('');
    setDonationSuccessMessage('');
    setIsDonationDataLoading(true);

    const fallbackProject =
      projectPreview || supportProjectList.find(projectItem => projectItem.projectId === normalizedProjectId) || null;

    if (fallbackProject) {
      setSelectedDonationCampaignDetail({
        projectId: fallbackProject.projectId,
        name: fallbackProject.name,
        description: fallbackProject.description,
        goalAmount: fallbackProject.goalAmount,
        donatedAmount: 0,
        donationCount: 0,
        status: fallbackProject.status
      });
    }

    try {
      await loadUserTokenBalance();

      const campaignDetail = await loadDonationCampaignDetail(normalizedProjectId);
      if (campaignDetail) {
        setSelectedDonationCampaignDetail(campaignDetail);
        return;
      }

      setDonationErrorMessage('Không tìm thấy dữ liệu campaign từ hệ thống.');
      if (!fallbackProject) {
        setSelectedDonationCampaignDetail(null);
      }
    } catch (error) {
      // Ghi chú logic phức tạp: vẫn hiển thị modal với fallback để không vỡ UX, nhưng luôn báo lỗi rõ ràng khi API trả lỗi.
      setDonationErrorMessage(mapDonationErrorMessage(error));
      if (!fallbackProject) {
        setSelectedDonationCampaignDetail(null);
      }
    } finally {
      setIsDonationDataLoading(false);
    }
  };

  /** Hàm mở modal và lấy chi tiết dự án. Mục đích: chỉ gọi API khi người dùng bấm nút “Chi tiết”. */
  const handleOpenProjectDetailModal = async (projectId: string) => {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return;
    }

    setSelectedProjectId(normalizedProjectId);
    setIsProjectDetailModalVisible(true);
    setIsProjectDetailLoading(true);
    setProjectDetailErrorMessage('');
    setSelectedProjectDetail(null);

    if (projectDetailCacheRef.current.has(normalizedProjectId)) {
      const cachedProjectDetail = projectDetailCacheRef.current.get(normalizedProjectId) || null;
      setSelectedProjectDetail(cachedProjectDetail);
      setIsProjectDetailLoading(false);
      return;
    }

    try {
      const projectDetailResponse = await fetchApi<HomeSupportProjectDetail | null>(
        buildApiUrl(`/projects/public-support/${normalizedProjectId}`),
        {
          method: 'GET',
          cache: 'no-store'
        }
      );

      projectDetailCacheRef.current.set(normalizedProjectId, projectDetailResponse.data);
      setSelectedProjectDetail(projectDetailResponse.data);
    } catch (error) {
      const fallbackErrorMessage = 'Không thể tải chi tiết dự án. Vui lòng thử lại sau.';
      const normalizedErrorMessage = error instanceof Error ? error.message : fallbackErrorMessage;
      console.error('Fetch support project detail failed.', error);
      setProjectDetailErrorMessage(normalizedErrorMessage || fallbackErrorMessage);
      setSelectedProjectDetail(null);
    } finally {
      setIsProjectDetailLoading(false);
    }
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

  useEffect(() => {
    /** Hàm xử lý phím Escape cho modal chi tiết. Mục đích: đóng modal nhanh bằng bàn phím theo UX chuẩn. */
    const handleEscapeForProjectDetailModal = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isProjectDetailModalVisible) {
        return;
      }

      closeProjectDetailModal();
    };

    window.addEventListener('keydown', handleEscapeForProjectDetailModal);
    return () => {
      window.removeEventListener('keydown', handleEscapeForProjectDetailModal);
    };
  }, [isProjectDetailModalVisible]);

  useEffect(() => {
    /** Hàm xử lý phím Escape cho modal quyên góp. Mục đích: đóng modal donate nhanh bằng bàn phím khi chưa gửi giao dịch. */
    const handleEscapeForDonationModal = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isDonationModalVisible || isDonationSubmitting) {
        return;
      }

      closeDonationModal();
    };

    window.addEventListener('keydown', handleEscapeForDonationModal);
    return () => {
      window.removeEventListener('keydown', handleEscapeForDonationModal);
    };
  }, [isDonationModalVisible, isDonationSubmitting]);

  /** Hàm kiểm tra dữ liệu donation trước khi mở xác nhận. Mục đích: gom validate để tái sử dụng cho nhiều bước submit. */
  const validateDonationInput = (): number | null => {
    const normalizedAmount = Number(donationAmountInput);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setDonationErrorMessage('Vui lòng nhập số token lớn hơn 0.');
      return null;
    }

    if (!selectedDonationCampaignDetail?.projectId) {
      setDonationErrorMessage('Không tìm thấy thông tin dự án để quyên góp.');
      return null;
    }

    if (!isCampaignEligibleForDonation(selectedDonationCampaignDetail)) {
      setDonationErrorMessage('Dự án hiện không đủ điều kiện nhận quyên góp.');
      return null;
    }

    if (normalizedAmount > userTokenBalance) {
      setDonationErrorMessage('Số token quyên góp vượt quá số dư hiện có của bạn.');
      return null;
    }

    return normalizedAmount;
  };

  /** Hàm mở modal xác nhận donation. Mục đích: đảm bảo người dùng chỉ xác nhận đúng 1 lần trước khi gửi giao dịch. */
  const handleOpenDonationConfirmModal = () => {
    const validatedAmount = validateDonationInput();
    if (validatedAmount === null) {
      return;
    }

    setPendingDonationAmount(validatedAmount);
    setIsDonationConfirmModalVisible(true);
  };

  /** Hàm đóng modal xác nhận donation. Mục đích: xóa trạng thái xác nhận tạm để tránh gửi nhầm dữ liệu cũ. */
  const handleCloseDonationConfirmModal = () => {
    setIsDonationConfirmModalVisible(false);
    setPendingDonationAmount(null);
  };

  /** Hàm gửi giao dịch donation sau khi xác nhận. Mục đích: submit đúng một lần qua relay backend và đồng bộ dữ liệu sau giao dịch. */
  const handleConfirmDonationSubmit = async () => {
    // Ghi chú logic phức tạp: chặn double-submit tuyệt đối khi người dùng bấm xác nhận liên tiếp.
    if (isDonationSubmitting) {
      return;
    }

    if (!selectedDonationCampaignDetail?.projectId || pendingDonationAmount === null) {
      setDonationErrorMessage('Không tìm thấy thông tin dự án để quyên góp.');
      handleCloseDonationConfirmModal();
      return;
    }

    setDonationErrorMessage('');
    setDonationSuccessMessage('');
    setIsDonationSubmitting(true);

    try {
      handleCloseDonationConfirmModal();

      const submitResponse = await submitDonationViaRelay(selectedDonationCampaignDetail.projectId, pendingDonationAmount);
      const transactionHash = String(submitResponse.data.transactionHash || '');

      const refreshedCampaignDetailPromise = loadDonationCampaignDetail(selectedDonationCampaignDetail.projectId);
      const refreshedBalancePromise = loadUserTokenBalance();

      await Promise.all([loadSupportProjectList(isShowingAllSupportProjects), refreshedCampaignDetailPromise, refreshedBalancePromise]);

      const refreshedCampaignDetail = await refreshedCampaignDetailPromise;
      if (refreshedCampaignDetail) {
        setSelectedDonationCampaignDetail(refreshedCampaignDetail);
      }

      setDonationSuccessMessage(`Quyên góp thành công. TxHash: ${transactionHash}`);
      window.setTimeout(() => {
        closeDonationModal();
      }, 500);
    } catch (error) {
      setDonationErrorMessage(mapDonationErrorMessage(error));
    } finally {
      setIsDonationSubmitting(false);
    }
  };

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
          {isSupportProjectsLoading && (
            <div className="pcard visible" data-observe data-group="projects">
              <div className="pcard-body">
                <div className="pcard-title">Đang tải dữ liệu dự án...</div>
                <div className="pcard-desc">Hệ thống đang lấy dữ liệu thật từ server.</div>
              </div>
            </div>
          )}

          {!isSupportProjectsLoading && supportProjectsErrorMessage && (
            <div className="pcard visible" data-observe data-group="projects">
              <div className="pcard-body">
                <div className="pcard-title">Không thể tải danh sách dự án</div>
                <div className="pcard-desc">{supportProjectsErrorMessage}</div>
              </div>
            </div>
          )}

          {!isSupportProjectsLoading && !supportProjectsErrorMessage && supportProjectList.length === 0 && (
            <div className="pcard visible" data-observe data-group="projects">
              <div className="pcard-body">
                <div className="pcard-title">Chưa có dự án cần hỗ trợ</div>
                <div className="pcard-desc">Hiện tại chưa có dự án đang hoạt động để hiển thị.</div>
              </div>
            </div>
          )}

          {!isSupportProjectsLoading &&
            !supportProjectsErrorMessage &&
            supportProjectList.map((project, projectIndex) => {
              const projectVisual = getProjectVisualByIndex(projectIndex);
              return (
                <div
                  className="pcard visible"
                  key={project.projectId}
                  style={{ transitionDelay: `${projectIndex * 0.1}s` }}
                  data-observe
                  data-group="projects"
                >
                  <div className="pcard-img">
                    <div className="pcard-img-bg" style={{ background: projectVisual.background }}>
                      {projectVisual.icon}
                    </div>
                    <div className="pcard-status status-active">● {getPublicProjectStatusLabel(project.status)}</div>
                  </div>
                  <div className="pcard-body">
                    <div className="pcard-org">✅ Dự án đã xác minh</div>
                    <div className="pcard-title">{project.name}</div>
                    <div className="pcard-desc">{project.description}</div>
                    <div className="progress-wrap">
                      <div className="progress-label">
                        <span className="progress-value">Mục tiêu {formatCurrencyVnd(project.goalAmount)}₫</span>
                        <span>Cập nhật {formatUpdatedTime(project.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="pcard-meta">
                      <span>Trạng thái: {getPublicProjectStatusLabel(project.status)}</span>
                      <span>Cập nhật: {formatUpdatedTime(project.updatedAt)}</span>
                    </div>
                    <div className="pcard-actions">
                      <button className="btn-donate" type="button" onClick={() => void handleOpenDonationModal(project.projectId, project)}>
                        💛 Quyên góp ngay
                      </button>
                      <button className="btn-detail" type="button" onClick={() => void handleOpenProjectDetailModal(project.projectId)}>
                        Chi tiết
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        <div className="projects-footer">
          {!isShowingAllSupportProjects ? (
            <button
              type="button"
              className="btn-ghost btn-ghost-large"
              onClick={() => void handleShowAllSupportProjects()}
              disabled={isSupportProjectsLoading}
            >
              {isSupportProjectsLoading ? 'Đang tải danh sách dự án...' : 'Xem tất cả dự án →'}
            </button>
          ) : (
            <span className="btn-ghost btn-ghost-large" aria-live="polite">
              Đang hiển thị toàn bộ dự án
            </span>
          )}
        </div>
      </section>

      {isLoginRequiredDialogVisible && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0f172a]/55 p-4 backdrop-blur-[3px]" role="presentation" onClick={closeLoginRequiredDialog}>
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[#b7e4d6] bg-white shadow-[0_28px_70px_rgba(14,124,107,0.24)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-required-dialog-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#0e7c6b] via-[#10b981] to-[#34d399] px-5 py-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#d1fae5]">Yêu cầu đăng nhập</p>
              <h3 id="login-required-dialog-title" className="mt-1 text-lg font-bold">
                Vui lòng đăng nhập để tiếp tục quyên góp
              </h3>
            </div>

            <div className="space-y-3 px-5 py-4">
              <p className="text-sm leading-6 text-[#334155]">
                Bạn cần đăng nhập trước khi thực hiện giao dịch quyên góp để hệ thống ghi nhận đúng số dư và lịch sử đóng góp.
              </p>
              <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-xs text-[#166534]">
                Sau khi đăng nhập thành công, bạn quay lại Home và bấm <span className="font-semibold">💛 Quyên góp ngay</span> để tiếp tục.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#d1fae5] bg-[#f0fdf4] px-5 py-3">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#a7f3d0] px-4 text-sm font-semibold text-[#065f46] transition hover:bg-white"
                onClick={closeLoginRequiredDialog}
              >
                Ở lại trang
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-[#0e7c6b] to-[#10b981] px-4 text-sm font-semibold text-white transition hover:opacity-95"
                onClick={redirectToLoginPage}
              >
                Đến trang đăng nhập
              </button>
            </div>
          </div>
        </div>
      )}

      {isDonationModalVisible && (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[2px] md:p-5"
          role="presentation"
          onClick={() => {
            if (!isDonationSubmitting) {
              closeDonationModal();
            }
          }}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-[#d1e7e2] bg-white shadow-[0_28px_70px_rgba(14,124,107,0.2)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-donation-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="border-b border-[#e6f3f0] px-4 py-3 md:px-5 md:py-4">
              <h3 id="home-donation-modal-title" className="text-lg font-bold text-[#0d1117]">
                Quyên góp ngay tại Home
              </h3>
              <p className="mt-1 text-sm text-[#4b5563]">Hoàn tất giao dịch mà không rời khỏi trang hiện tại.</p>
            </div>

            <div className="space-y-3 px-4 py-3 md:px-5 md:py-4">
              {isDonationDataLoading && <p className="text-sm text-[#4b5563]">Đang tải dữ liệu quyên góp...</p>}

              {!isDonationDataLoading && selectedDonationCampaignDetail && (
                <>
                  <div className="rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3">
                    <p className="text-xs text-[#6b7280]">Dự án</p>
                    <p className="mt-1 text-sm font-semibold text-[#111827]">{selectedDonationCampaignDetail.name}</p>
                    <p className="mt-2 text-xs text-[#6b7280]">
                      Tổng tiền quyên góp đến hiện tại: {Number(selectedDonationCampaignDetail.donatedAmount || 0).toLocaleString('vi-VN')} token · Số lượt quyên góp:{' '}
                      {Number(selectedDonationCampaignDetail.donationCount || 0).toLocaleString('vi-VN')}
                    </p>
                    <p className="mt-1 text-xs text-[#6b7280]">Số dư của bạn: {Number(userTokenBalance).toLocaleString('vi-VN')} token</p>
                  </div>

                  <div>
                    <label htmlFor="homeDonationAmountInput" className="text-sm font-semibold text-[#111827]">
                      Số token muốn quyên góp
                    </label>
                    <input
                      id="homeDonationAmountInput"
                      className="mt-2 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#0e7c6b] focus:ring-2 focus:ring-[#0e7c6b]/20"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={donationAmountInput}
                      onChange={event => setDonationAmountInput(event.target.value)}
                      disabled={isDonationSubmitting}
                      placeholder="Ví dụ: 100"
                    />
                  </div>
                </>
              )}

              {!isDonationDataLoading && !selectedDonationCampaignDetail && !donationErrorMessage && (
                <p className="rounded-lg border border-[#e5e7eb] bg-[#f8fafc] p-3 text-sm text-[#4b5563]">Không có dữ liệu campaign để quyên góp.</p>
              )}

              {donationErrorMessage && <p className="rounded-lg border border-[#fecaca] bg-[#fff1f2] p-3 text-sm text-[#b91c1c]">{donationErrorMessage}</p>}
              {donationSuccessMessage && <p className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-sm text-[#166534]">{donationSuccessMessage}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#e6f3f0] px-4 py-3 md:px-5">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d1d5db] px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={closeDonationModal}
                disabled={isDonationSubmitting}
              >
                Hủy
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0e7c6b] px-4 text-sm font-semibold text-white transition hover:bg-[#0b6759] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleOpenDonationConfirmModal}
                disabled={isDonationSubmitting || isDonationDataLoading || !selectedDonationCampaignDetail}
              >
                Quyên góp
              </button>
            </div>

            {isDonationConfirmModalVisible && (
              <div
                className="fixed inset-0 z-[126] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[1px] md:p-5"
                role="presentation"
                onClick={() => {
                  if (!isDonationSubmitting) {
                    handleCloseDonationConfirmModal();
                  }
                }}
              >
                <div
                  className="w-full max-w-md rounded-xl border border-[#d1e7e2] bg-white shadow-[0_20px_50px_rgba(14,124,107,0.2)]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="home-donation-confirm-modal-title"
                  onClick={event => event.stopPropagation()}
                >
                  <div className="border-b border-[#e6f3f0] px-4 py-3">
                    <h4 id="home-donation-confirm-modal-title" className="text-base font-bold text-[#0d1117]">
                      Xác nhận quyên góp
                    </h4>
                  </div>

                  <div className="px-4 py-4">
                    <p className="text-sm text-[#374151]">
                      Bạn muốn quyên góp {Number(pendingDonationAmount || 0).toLocaleString('vi-VN')} token cho dự án này?
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-[#e6f3f0] px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d1d5db] px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={handleCloseDonationConfirmModal}
                      disabled={isDonationSubmitting}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0e7c6b] px-4 text-sm font-semibold text-white transition hover:bg-[#0b6759] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleConfirmDonationSubmit()}
                      disabled={isDonationSubmitting}
                    >
                      {isDonationSubmitting ? 'Đang xử lý...' : 'xác nhận'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {isProjectDetailModalVisible && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] md:p-5"
          role="presentation"
          onClick={closeProjectDetailModal}
        >
          <div
            className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#d1e7e2] bg-white shadow-[0_28px_70px_rgba(14,124,107,0.2)] md:max-h-[calc(100vh-2.5rem)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-detail-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#e6f3f0] px-4 py-3 md:px-5 md:py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#0e7c6b]">Thông tin công khai</p>
                <h3 id="project-detail-modal-title" className="mt-1 text-lg font-bold text-[#0d1117] md:text-xl">
                  Chi tiết dự án
                </h3>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7ebe7] text-base font-semibold text-[#0e7c6b] transition hover:bg-[#f1faf8]"
                onClick={closeProjectDetailModal}
                aria-label="Đóng hộp thoại chi tiết dự án"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
              {isProjectDetailLoading && (
                <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-5 text-center" aria-live="polite">
                  <div className="project-detail-modal-spinner mx-auto" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-[#4b5563]">Đang tải chi tiết dự án...</p>
                </div>
              )}

              {!isProjectDetailLoading && projectDetailErrorMessage && (
                <div className="rounded-xl border border-[#fecaca] bg-[#fff1f2] p-4" role="alert">
                  <p className="text-sm font-medium text-[#b91c1c]">{projectDetailErrorMessage}</p>
                </div>
              )}

              {!isProjectDetailLoading && !projectDetailErrorMessage && !selectedProjectDetail && (
                <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                  <p className="text-sm text-[#4b5563]">Không tìm thấy dữ liệu chi tiết cho dự án {selectedProjectId}.</p>
                </div>
              )}

              {!isProjectDetailLoading && !projectDetailErrorMessage && selectedProjectDetail && (
                <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr] lg:gap-4">
                  <section className="rounded-xl border border-[#e3efec] bg-[#fbfefd] p-3 md:p-4">
                    <h4 className="mb-3 text-sm font-semibold text-[#0e7c6b]">Thông tin chính</h4>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-lg bg-white p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Tên dự án</p>
                        <p className="mt-1 text-sm font-semibold text-[#111827]">{selectedProjectDetail.name}</p>
                      </div>
                      <div className="rounded-lg bg-white p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Trạng thái</p>
                        <p className="mt-1 text-sm font-semibold text-[#111827]">{getPublicProjectStatusLabel(selectedProjectDetail.status)}</p>
                      </div>
                      <div className="rounded-lg bg-white p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Mục tiêu</p>
                        <p className="mt-1 text-sm font-semibold text-[#111827]">{formatCurrencyVnd(selectedProjectDetail.goalAmount)}₫</p>
                      </div>
                      <div className="rounded-lg bg-white p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">Cập nhật</p>
                        <p className="mt-1 text-sm font-semibold text-[#111827]">{formatUpdatedTime(selectedProjectDetail.updatedAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border border-[#e5e7eb] bg-white p-3">
                      <h5 className="text-sm font-semibold text-[#0e7c6b]">Mô tả dự án</h5>
                      <p className="mt-1.5 text-sm leading-5 text-[#374151] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5] overflow-hidden">
                        {selectedProjectDetail.description}
                      </p>
                      <div className="mt-3 border-t border-[#eef2f7] pt-3">
                        <a
                          href={`/donors?projectId=${encodeURIComponent(selectedProjectDetail.projectId)}`}
                          className="inline-flex items-center text-sm font-semibold text-[#0e7c6b] transition hover:text-[#0b6759] hover:underline"
                        >
                          Xem danh sách nhà hảo tâm đã quyên góp →
                        </a>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-[#e3efec] bg-[#fbfefd] p-3 md:p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[#0e7c6b]">Bằng chứng IPFS</h4>
                      <span className="rounded-full bg-[#e6f7f4] px-2 py-0.5 text-xs font-semibold text-[#0e7c6b]">
                        {selectedProjectDetail.evidenceCids.length}
                      </span>
                    </div>
                    {selectedProjectDetail.evidenceCids.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[#d1d5db] bg-white p-3 text-sm text-[#6b7280]">Chưa có bằng chứng IPFS.</p>
                    ) : (
                      <ul className="space-y-2">
                        {selectedProjectDetail.evidenceCids.slice(0, 4).map(evidenceCid => {
                          const ipfsGatewayUrl = buildIpfsGatewayUrl(evidenceCid);

                          // Ghi chú logic phức tạp: chỉ render link khi CID hợp lệ, CID không hợp lệ sẽ hiển thị dạng cảnh báo để không phá layout.
                          if (!ipfsGatewayUrl) {
                            return (
                              <li key={`invalid-${evidenceCid}`} className="rounded-lg border border-[#fecaca] bg-[#fff1f2] p-2.5 text-xs text-[#b91c1c]">
                                CID không hợp lệ: {evidenceCid}
                              </li>
                            );
                          }

                          return (
                            <li key={evidenceCid} className="rounded-lg border border-[#dbe4f0] bg-white p-2.5">
                              <a
                                href={ipfsGatewayUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="block truncate text-xs font-medium text-[#1d4ed8] hover:underline"
                              >
                                {evidenceCid}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {selectedProjectDetail.evidenceCids.length > 4 && (
                      <p className="mt-2 text-xs text-[#6b7280]">+{selectedProjectDetail.evidenceCids.length - 4} CID khác.</p>
                    )}
                  </section>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-[#e6f3f0] px-4 py-3 md:px-5 md:py-3.5">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#0e7c6b] px-4 text-sm font-semibold text-white transition hover:bg-[#0b6759]"
                onClick={closeProjectDetailModal}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}


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

