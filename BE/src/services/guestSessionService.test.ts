import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock các dependencies trước khi import service.
 */

// Mock config/logger - trả về noop logger
vi.mock('../config/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

// Mock repositories/guestWalletSessionRepository
vi.mock('../repositories/guestWalletSessionRepository', () => ({
  createGuestWalletSession: vi.fn(),
  findGuestWalletSessionById: vi.fn(),
  findGuestWalletSessionByWalletAddress: vi.fn(),
  updateGuestWalletSession: vi.fn(),
  countRecentSessionsByFingerprint: vi.fn(),
  countRecentSessionsByIp: vi.fn()
}));

// Mock repositories/guestDonationRiskRepository
vi.mock('../repositories/guestDonationRiskRepository', () => ({
  upsertGuestDonationRisk: vi.fn(),
  computeRiskLevelAndMultiplier: vi.fn()
}));

// Mock services/guestRiskService
vi.mock('./guestRiskService', () => ({
  evaluateAndSaveGuestRisk: vi.fn()
}));

// Mock config/guestJsonWebToken
vi.mock('../config/guestJsonWebToken', () => ({
  signGuestSessionToken: vi.fn()
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-session-id-12345')
}));

// Import sau khi đã mock xong
import {
  createNewGuestSession,
  refreshExistingSession,
  getSessionStatus
} from './guestSessionService';
import {
  createGuestWalletSession,
  findGuestWalletSessionById,
  findGuestWalletSessionByWalletAddress,
  updateGuestWalletSession,
  countRecentSessionsByFingerprint,
  countRecentSessionsByIp
} from '../repositories/guestWalletSessionRepository';
import {
  upsertGuestDonationRisk,
  computeRiskLevelAndMultiplier
} from '../repositories/guestDonationRiskRepository';
import { evaluateAndSaveGuestRisk } from './guestRiskService';
import { signGuestSessionToken } from '../config/guestJsonWebToken';

/** Mock session data dùng chung cho các test case. */
const mockSessionData = {
  sessionId: 'test-session-id',
  walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f5c21a',
  deviceFingerprintHash: 'fp-hash-abc123',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 Test Browser',
  status: 'ACTIVE' as const,
  donationCount: 0,
  totalDonatedAmount: 0,
  totalSponsoredGas: 0,
  renewalCount: 0,
  claimedByUserId: null,
  serverSalt: 'mock-server-salt-64-chars-hexadecimal-0123456789abcdef',
  hasPendingDonation: false,
  pendingAlertSentAt: null,
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date()
};

/** Real implementation của computeRiskLevelAndMultiplier (pure function). */
function realComputeRiskLevelAndMultiplier(riskScore: number): {
  riskLevel: string;
  trustMultiplier: number;
} {
  if (riskScore <= 25) {
    return { riskLevel: 'SAFE', trustMultiplier: 1.0 };
  }
  if (riskScore <= 50) {
    return { riskLevel: 'LOW', trustMultiplier: 0.8 };
  }
  if (riskScore < 70) {
    return { riskLevel: 'MEDIUM', trustMultiplier: 0.5 };
  }
  if (riskScore <= 90) {
    return { riskLevel: 'HIGH', trustMultiplier: 0.2 };
  }
  return { riskLevel: 'CRITICAL', trustMultiplier: 0.2 };
}

describe('guestSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set default mock implementations
    (countRecentSessionsByFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (createGuestWalletSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessionData);
    (evaluateAndSaveGuestRisk as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (upsertGuestDonationRisk as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (computeRiskLevelAndMultiplier as ReturnType<typeof vi.fn>).mockImplementation(realComputeRiskLevelAndMultiplier);
    (signGuestSessionToken as ReturnType<typeof vi.fn>).mockReturnValue('mock-jwt-token');
    (updateGuestWalletSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessionData);
  });

  // -------------------------------------------------------------------------
  // createNewGuestSession
  // -------------------------------------------------------------------------
  describe('createNewGuestSession', () => {
    it('tạo session thành công với đầy đủ params hợp lệ', async () => {
      const result = await createNewGuestSession(
        mockSessionData.walletAddress,
        mockSessionData.deviceFingerprintHash,
        mockSessionData.ipAddress,
        mockSessionData.userAgent
      );

      // Verify kết quả trả về có đầy đủ fields
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('guestSessionToken');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('serverSalt');
      expect(result).toHaveProperty('donationQuota');

      // Verify JWT được ký
      expect(signGuestSessionToken).toHaveBeenCalledWith({
        sessionId: 'mock-session-id-12345',
        walletAddress: mockSessionData.walletAddress.toLowerCase()
      });

      // Verify donationQuota luôn là 3
      expect(result.donationQuota).toBe(3);
    });

    it('gọi createGuestWalletSession với đúng params và status ACTIVE', async () => {
      await createNewGuestSession(
        mockSessionData.walletAddress,
        mockSessionData.deviceFingerprintHash,
        mockSessionData.ipAddress,
        mockSessionData.userAgent
      );

      expect(createGuestWalletSession).toHaveBeenCalledTimes(1);
      expect(createGuestWalletSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'mock-session-id-12345',
          walletAddress: mockSessionData.walletAddress.toLowerCase(),
          deviceFingerprintHash: mockSessionData.deviceFingerprintHash,
          ipAddress: mockSessionData.ipAddress,
          userAgent: mockSessionData.userAgent,
          status: 'ACTIVE',
          donationCount: 0,
          totalDonatedAmount: 0,
          totalSponsoredGas: 0,
          renewalCount: 0,
          claimedByUserId: null,
          hasPendingDonation: false,
          pendingAlertSentAt: null
        })
      );
    });

    it('normalizes walletAddress thành lowercase trước khi lưu', async () => {
      const upperCaseWallet = '0x742D35Cc6634C0532925a3b844Bc9e7595f5C21a';
      await createNewGuestSession(
        upperCaseWallet,
        mockSessionData.deviceFingerprintHash,
        mockSessionData.ipAddress,
        mockSessionData.userAgent
      );

      expect(createGuestWalletSession).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: '0x742d35cc6634c0532925a3b844bc9e7595f5c21a'
        })
      );
    });

    it('ném error khi fingerprint count >= 3 trong 24h', async () => {
      (countRecentSessionsByFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      await expect(
        createNewGuestSession(
          mockSessionData.walletAddress,
          mockSessionData.deviceFingerprintHash,
          mockSessionData.ipAddress,
          mockSessionData.userAgent
        )
      ).rejects.toThrow('Đã đạt giới hạn tạo phiên');
    });

    it('ném error khi IP burst >= 3 sessions trong 1h', async () => {
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      await expect(
        createNewGuestSession(
          mockSessionData.walletAddress,
          mockSessionData.deviceFingerprintHash,
          mockSessionData.ipAddress,
          mockSessionData.userAgent
        )
      ).rejects.toThrow('Phát hiện nhiều phiên từ cùng địa chỉ IP');
    });

    it('vẫn tạo session thành công khi evaluateAndSaveGuestRisk throw error (graceful degradation)', async () => {
      (evaluateAndSaveGuestRisk as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('RPC error')
      );

      const result = await createNewGuestSession(
        mockSessionData.walletAddress,
        mockSessionData.deviceFingerprintHash,
        mockSessionData.ipAddress,
        mockSessionData.userAgent
      );

      // Session vẫn được tạo thành công
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('guestSessionToken');

      // Fallback risk được upsert với SAFE level
      expect(upsertGuestDonationRisk).toHaveBeenCalledWith(
        'mock-session-id-12345',
        expect.objectContaining({
          sessionId: 'mock-session-id-12345',
          riskScore: 0,
          riskLevel: 'SAFE',
          trustMultiplier: 1.0,
          blocked: false
        })
      );
    });

    it('gọi evaluateAndSaveGuestRisk sau khi tạo session thành công', async () => {
      await createNewGuestSession(
        mockSessionData.walletAddress,
        mockSessionData.deviceFingerprintHash,
        mockSessionData.ipAddress,
        mockSessionData.userAgent
      );

      expect(evaluateAndSaveGuestRisk).toHaveBeenCalledTimes(1);
      expect(evaluateAndSaveGuestRisk).toHaveBeenCalledWith(
        {
          sessionId: 'mock-session-id-12345',
          walletAddress: mockSessionData.walletAddress.toLowerCase(),
          deviceFingerprintHash: mockSessionData.deviceFingerprintHash
        },
        mockSessionData.ipAddress
      );
    });
  });

  // -------------------------------------------------------------------------
  // refreshExistingSession
  // -------------------------------------------------------------------------
  describe('refreshExistingSession', () => {
    it('refresh thành công và trả về token mới', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSessionData,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // còn 1h nữa mới hết hạn
      });

      const result = await refreshExistingSession(
        mockSessionData.sessionId,
        mockSessionData.walletAddress
      );

      expect(result).toHaveProperty('guestSessionToken');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('renewalCount');
      expect(signGuestSessionToken).toHaveBeenCalled();
    });

    it('tăng renewalCount lên 1 khi refresh lần đầu', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSessionData,
        renewalCount: 0,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });

      const result = await refreshExistingSession(
        mockSessionData.sessionId,
        mockSessionData.walletAddress
      );

      expect(result.renewalCount).toBe(1);
      expect(updateGuestWalletSession).toHaveBeenCalledWith(
        mockSessionData.sessionId,
        expect.objectContaining({
          renewalCount: 1,
          expiresAt: expect.any(Date)
        })
      );
    });

    it('ném error khi session không tồn tại', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        refreshExistingSession(mockSessionData.sessionId, mockSessionData.walletAddress)
      ).rejects.toThrow('Guest session không tồn tại');
    });

    it('ném error khi walletAddress không khớp', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessionData);

      await expect(
        refreshExistingSession(mockSessionData.sessionId, '0xDifferentWalletAddress')
      ).rejects.toThrow('Wallet address không khớp với session');
    });

    it('ném error khi session status không phải ACTIVE', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSessionData,
        status: 'EXPIRED'
      });

      await expect(
        refreshExistingSession(mockSessionData.sessionId, mockSessionData.walletAddress)
      ).rejects.toThrow('Guest session đã hết hạn hoặc bị vô hiệu hóa');
    });

    it('ném error khi session đã hết hạn (expiresAt < now)', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSessionData,
        expiresAt: new Date(Date.now() - 1000) // đã hết hạn
      });

      await expect(
        refreshExistingSession(mockSessionData.sessionId, mockSessionData.walletAddress)
      ).rejects.toThrow('Guest session đã hết hạn');
    });

    it('ném error khi đã đạt giới hạn refresh (renewalCount >= 5)', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSessionData,
        renewalCount: 5,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });

      await expect(
        refreshExistingSession(mockSessionData.sessionId, mockSessionData.walletAddress)
      ).rejects.toThrow('Đã đạt giới hạn làm mới phiên');
    });
  });

  // -------------------------------------------------------------------------
  // getSessionStatus
  // -------------------------------------------------------------------------
  describe('getSessionStatus', () => {
    it('trả về session status khi tìm thấy', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSessionData,
        donationCount: 1,
        totalDonatedAmount: 5000,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
      });

      const result = await getSessionStatus(mockSessionData.sessionId);

      expect(result).toEqual({
        sessionId: mockSessionData.sessionId,
        walletAddress: mockSessionData.walletAddress,
        status: 'ACTIVE',
        donationCount: 1,
        totalDonatedAmount: 5000,
        expiresAt: expect.any(String),
        remainingDonations: 2 // MAX_DONATIONS_PER_SESSION (3) - donationCount (1)
      });
    });

    it('trả về remainingDonations = 0 khi đã donate đủ 3 lần', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockSessionData,
        donationCount: 3,
        totalDonatedAmount: 15000,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
      });

      const result = await getSessionStatus(mockSessionData.sessionId);

      expect(result.remainingDonations).toBe(0);
    });

    it('ném error khi session không tồn tại', async () => {
      (findGuestWalletSessionById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        getSessionStatus(mockSessionData.sessionId)
      ).rejects.toThrow('Guest session không tồn tại');
    });
  });
});
