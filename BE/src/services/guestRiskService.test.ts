import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Mock các dependencies trước khi import service.
 */
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();

  return {
    ...actual,
    JsonRpcProvider: vi.fn().mockImplementation(() => ({
      getCode: vi.fn().mockResolvedValue('0xdeployed'),
      destroy: vi.fn()
    }))
  };
});

vi.mock('../config/zeroDev', () => ({
  getZeroDevConfig: vi.fn().mockReturnValue({
    projectId: 'test-project',
    rpcUrl: 'https://test.rpc.url',
    bundlerUrl: 'https://test.bundler.url',
    paymasterUrl: 'https://test.paymaster.url',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
  })
}));

vi.mock('../config/logger', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('../repositories/guestDonationRiskRepository', () => ({
  findGuestDonationRiskBySessionId: vi.fn(),
  upsertGuestDonationRisk: vi.fn(),
  computeRiskLevelAndMultiplier: vi.fn()
}));

vi.mock('../repositories/guestWalletSessionRepository', () => ({
  countRecentSessionsByIp: vi.fn(),
  countRecentSessionsByFingerprint: vi.fn(),
  findGuestWalletSessionsByIp: vi.fn()
}));

vi.mock('../repositories/anonymousDonationAuditRepository', () => ({
  findAuditsBySessionId: vi.fn()
}));

// Import sau khi đã mock xong
import {
  evaluateGuestRisk,
  evaluateAndSaveGuestRisk
} from './guestRiskService';
import {
  upsertGuestDonationRisk,
  computeRiskLevelAndMultiplier
} from '../repositories/guestDonationRiskRepository';
import {
  countRecentSessionsByIp,
  countRecentSessionsByFingerprint,
  findGuestWalletSessionsByIp
} from '../repositories/guestWalletSessionRepository';
import { findAuditsBySessionId } from '../repositories/anonymousDonationAuditRepository';

/** Helper mock session data cho các test case. */
const mockSession = {
  sessionId: 'test-session-123',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f5C21a',
  deviceFingerprintHash: 'fp-hash-abc123'
};

/**
 * Real implementation của computeRiskLevelAndMultiplier (pure function).
 */
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

describe('guestRiskService', () => {
  beforeEach(() => {
    // Clear all mocks first
    vi.clearAllMocks();
    
    // Set default mock implementations
    (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (countRecentSessionsByFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (findAuditsBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (findGuestWalletSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (computeRiskLevelAndMultiplier as ReturnType<typeof vi.fn>).mockImplementation(realComputeRiskLevelAndMultiplier);
  });

  // -------------------------------------------------------------------------
  // checkIPBurst
  // -------------------------------------------------------------------------
  describe('checkIPBurst', () => {
    it('trả về +0 khi IP có <3 sessions gần đây', async () => {
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.ipBurstScore).toBe(0);
    });

    it('trả về +30 khi IP có ≥3 sessions gần đây', async () => {
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.ipBurstScore).toBe(30);
    });
  });

  // -------------------------------------------------------------------------
  // checkFingerprintReuse
  // -------------------------------------------------------------------------
  describe('checkFingerprintReuse', () => {
    it('trả về +0 khi fingerprint có <3 sessions gần đây', async () => {
      (countRecentSessionsByFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.fingerprintReuseScore).toBe(0);
    });

    it('trả về +25 khi fingerprint có ≥3 sessions gần đây', async () => {
      (countRecentSessionsByFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.fingerprintReuseScore).toBe(25);
    });
  });

  // -------------------------------------------------------------------------
  // checkDonationPattern
  // -------------------------------------------------------------------------
  describe('checkDonationPattern', () => {
    it('trả về +0 khi không có audit record nào', async () => {
      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.donationPatternScore).toBe(0);
    });

    it('trả về +0 khi chỉ có 1 audit record', async () => {
      (findAuditsBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue([
        { amount: 100, sessionId: mockSession.sessionId }
      ]);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.donationPatternScore).toBe(0);
    });

    it('trả về +15 khi tất cả donations cùng amount', async () => {
      (findAuditsBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue([
        { amount: 100, sessionId: mockSession.sessionId },
        { amount: 100, sessionId: mockSession.sessionId }
      ]);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.donationPatternScore).toBe(15);
    });

    it('trả về +0 khi donations có amounts khác nhau', async () => {
      (findAuditsBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue([
        { amount: 100, sessionId: mockSession.sessionId },
        { amount: 200, sessionId: mockSession.sessionId }
      ]);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.donationPatternScore).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // checkSessionVelocity
  // -------------------------------------------------------------------------
  describe('checkSessionVelocity', () => {
    it('trả về +0 khi không có session nào gần đây', async () => {
      // checkSessionVelocity uses countRecentSessionsByIp
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.sessionVelocityScore).toBe(0);
    });

    it('trả về +10 khi có session được tạo trong vòng 60 giây', async () => {
      // checkSessionVelocity uses countRecentSessionsByIp - return 1 = has recent session
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.sessionVelocityScore).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Risk level classification
  // -------------------------------------------------------------------------
  describe('computeRiskLevelAndMultiplier - integration', () => {
    it('SAFE khi không có suspicious factors', async () => {
      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.riskLevel).toBe('SAFE');
      expect(result.trustMultiplier).toBe(1.0);
    });

    it('LOW khi riskScore = 40 (IP burst + session velocity)', async () => {
      // countRecentSessionsByIp = 3 triggers:
      // - IP burst check: >= 3 → +30
      // - Session velocity check: count > 0 → +10
      // Total = 40
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.riskScore).toBe(40);
      expect(result.riskLevel).toBe('LOW');
      expect(result.trustMultiplier).toBe(0.8);
    });

    it('MEDIUM khi riskScore = 65 (IP burst + fingerprint + velocity)', async () => {
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      (countRecentSessionsByFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      // IP burst = 30, velocity = 10 (same mock), fingerprint = 25 = 65
      expect(result.riskScore).toBe(65);
      expect(result.riskLevel).toBe('MEDIUM');
      expect(result.trustMultiplier).toBe(0.5);
    });

    it('HIGH khi riskScore = 80 (IP + fingerprint + donation pattern + velocity)', async () => {
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      (countRecentSessionsByFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      (findAuditsBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue([
        { amount: 100 }, { amount: 100 }
      ]);

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      // IP burst = 30, velocity = 10, fingerprint = 25, donation = 15 = 80
      expect(result.riskScore).toBe(80);
      expect(result.riskLevel).toBe('HIGH');
      expect(result.trustMultiplier).toBe(0.2);
    });
  });

  // -------------------------------------------------------------------------
  // evaluateGuestRisk - tổng hợp
  // -------------------------------------------------------------------------
  describe('evaluateGuestRisk - tổng hợp', () => {
    it('trả về đầy đủ factors và blocked = false', async () => {
      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');

      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe('SAFE');
      expect(result.blocked).toBe(false);
      expect(result.factors).toEqual({
        walletAgeScore: 0,
        ipBurstScore: 0,
        fingerprintReuseScore: 0,
        donationPatternScore: 0,
        sessionVelocityScore: 0
      });
    });
  });

  // -------------------------------------------------------------------------
  // evaluateAndSaveGuestRisk
  // -------------------------------------------------------------------------
  describe('evaluateAndSaveGuestRisk', () => {
    it('gọi upsertGuestDonationRisk sau khi evaluate', async () => {
      (countRecentSessionsByIp as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      // sessionVelocityScore will also be 10 since same function returns 3

      const mockUpsertedRecord = {
        sessionId: mockSession.sessionId,
        walletAddress: mockSession.walletAddress,
        riskScore: 40, // 30 (IP burst) + 10 (velocity)
        riskLevel: 'LOW',
        trustMultiplier: 0.8,
        factors: {
          walletAgeScore: 0,
          ipBurstScore: 30,
          fingerprintReuseScore: 0,
          donationPatternScore: 0,
          sessionVelocityScore: 10
        },
        blocked: false,
        blockedAt: null as Date | null,
        blockedReason: null as string | null,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      (upsertGuestDonationRisk as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpsertedRecord);

      const result = await evaluateAndSaveGuestRisk(mockSession, '192.168.1.1');

      expect(upsertGuestDonationRisk).toHaveBeenCalledTimes(1);
      expect(upsertGuestDonationRisk).toHaveBeenCalledWith(
        mockSession.sessionId,
        expect.objectContaining({
          sessionId: mockSession.sessionId,
          riskScore: 40,
          riskLevel: 'LOW',
          blocked: false
        })
      );
      expect(result).toEqual(mockUpsertedRecord);
    });

    it('blockedAt và blockedReason là null khi không block', async () => {
      (upsertGuestDonationRisk as ReturnType<typeof vi.fn>).mockResolvedValue({
        sessionId: mockSession.sessionId,
        walletAddress: mockSession.walletAddress,
        riskScore: 0,
        riskLevel: 'SAFE',
        trustMultiplier: 1.0
      });

      await evaluateAndSaveGuestRisk(mockSession, '192.168.1.1');

      expect(upsertGuestDonationRisk).toHaveBeenCalledWith(
        mockSession.sessionId,
        expect.objectContaining({
          blocked: false,
          blockedAt: null,
          blockedReason: null
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('Error handling', () => {
    it('checkDonationPattern trả về 0 khi findAuditsBySessionId throw', async () => {
      (findAuditsBySessionId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      const result = await evaluateGuestRisk(mockSession, '192.168.1.1');
      expect(result.factors.donationPatternScore).toBe(0);
    });

    // NOTE: checkIPBurst không có try-catch nên khi countRecentSessionsByIp throw,
    // Promise.all sẽ reject ngay lập tức. checkSessionVelocity không thể test riêng
    // lẻ vì nó cùng dùng countRecentSessionsByIp với checkIPBurst.
    // Đây là limitation của service design hiện tại.
  });
});
