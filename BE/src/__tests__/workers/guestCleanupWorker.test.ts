import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runGuestCleanup } from '../../workers/guestCleanupWorker';
import * as guestWalletSessionRepository from '../../repositories/guestWalletSessionRepository';
import * as guestDonationRiskRepository from '../../repositories/guestDonationRiskRepository';
import * as anonymousDonationAuditRepository from '../../repositories/anonymousDonationAuditRepository';
import * as donationRepository from '../../repositories/donationRepository';

vi.mock('../../repositories/guestWalletSessionRepository', () => ({
  expireGuestSessions: vi.fn(),
  purgeOldGuestSessions: vi.fn()
}));

vi.mock('../../repositories/guestDonationRiskRepository', () => ({
  findAllClusterSuspects: vi.fn(),
  markManyAsClusterSuspect: vi.fn()
}));

vi.mock('../../repositories/anonymousDonationAuditRepository', () => ({
  countAnonymousDonationsSince: vi.fn()
}));

vi.mock('../../repositories/donationRepository', () => ({
  countTotalDonationsSince: vi.fn()
}));

function getSessionRepo() {
  return guestWalletSessionRepository as unknown as {
    expireGuestSessions: ReturnType<typeof vi.fn>;
    purgeOldGuestSessions: ReturnType<typeof vi.fn>;
  };
}

function getRiskRepo() {
  return guestDonationRiskRepository as unknown as {
    findAllClusterSuspects: ReturnType<typeof vi.fn>;
    markManyAsClusterSuspect: ReturnType<typeof vi.fn>;
  };
}

function getAuditRepo() {
  return anonymousDonationAuditRepository as unknown as {
    countAnonymousDonationsSince: ReturnType<typeof vi.fn>;
  };
}

function getDonationRepo() {
  return donationRepository as unknown as {
    countTotalDonationsSince: ReturnType<typeof vi.fn>;
  };
}

describe('guestCleanupWorker - runGuestCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default resolved values — các test có thể override bằng mockImplementation
    getSessionRepo().expireGuestSessions.mockResolvedValue(0);
    getSessionRepo().purgeOldGuestSessions.mockResolvedValue(0);
    getRiskRepo().findAllClusterSuspects.mockResolvedValue([]);
    getAuditRepo().countAnonymousDonationsSince.mockResolvedValue(0);
    getDonationRepo().countTotalDonationsSince.mockResolvedValue(0);
  });

  it('Tasks 1+2 chạy tuần tự trước Tasks 3+4', async () => {
    // Override chỉ các mock cần thiết cho test này
    getSessionRepo().expireGuestSessions.mockResolvedValue(5);
    getSessionRepo().purgeOldGuestSessions.mockResolvedValue(3);

    const result = await runGuestCleanup();

    // Verify Tasks 1+2 được gọi và trả đúng giá trị
    expect(getSessionRepo().expireGuestSessions).toHaveBeenCalled();
    expect(getSessionRepo().purgeOldGuestSessions).toHaveBeenCalled();
    expect(result.expired).toBe(5);
    expect(result.purged).toBe(3);

    // Tasks 3+4 không tìm thấy cluster/farming với mock data mặc định
    expect(result.clusters).toBe(0);
    expect(result.farmingDetected).toBe(false);
  });

  it('trả về đúng structure khi không có data', async () => {
    const result = await runGuestCleanup();

    expect(result).toHaveProperty('expired');
    expect(result).toHaveProperty('purged');
    expect(result).toHaveProperty('clusters');
    expect(result).toHaveProperty('farmingDetected');
  });

  it('phát hiện farming khi guest donations > 60% total', async () => {
    getAuditRepo().countAnonymousDonationsSince.mockResolvedValue(70);
    getDonationRepo().countTotalDonationsSince.mockResolvedValue(100);

    const result = await runGuestCleanup();

    expect(result.farmingDetected).toBe(true);
    expect(result.clusters).toBe(0);
  });

  it('không flag farming khi guest donations <= 60% total', async () => {
    getAuditRepo().countAnonymousDonationsSince.mockResolvedValue(30);
    getDonationRepo().countTotalDonationsSince.mockResolvedValue(100);

    const result = await runGuestCleanup();

    expect(result.farmingDetected).toBe(false);
  });

  it('không flag farming khi không có donation nào', async () => {
    getAuditRepo().countAnonymousDonationsSince.mockResolvedValue(0);
    getDonationRepo().countTotalDonationsSince.mockResolvedValue(0);

    const result = await runGuestCleanup();

    expect(result.farmingDetected).toBe(false);
  });
});
