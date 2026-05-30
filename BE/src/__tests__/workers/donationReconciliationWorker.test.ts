import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as anonymousDonationAuditRepository from '../../repositories/anonymousDonationAuditRepository';
import * as guestWalletSessionRepository from '../../repositories/guestWalletSessionRepository';

// vi.hoisted đảm bảo biến được hoist cùng vi.mock — mockBalanceOf sẵn sàng
// khi ethers module được mock trước khi donationReconciliationWorker load
const { mockBalanceOf } = vi.hoisted(() => ({ mockBalanceOf: vi.fn() }));

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn().mockImplementation(() => ({})),
    Contract: vi.fn().mockReturnValue({ balanceOf: mockBalanceOf })
  }
}));

vi.mock('../../repositories/anonymousDonationAuditRepository', () => ({
  findUnindexedAudits: vi.fn(),
  findAuditsBySessionId: vi.fn()
}));

vi.mock('../../repositories/guestWalletSessionRepository', () => ({
  findGuestWalletSessionById: vi.fn(),
  updateGuestWalletSession: vi.fn()
}));

import { reconcileSession, resetModuleState } from '../../workers/donationReconciliationWorker';

function getAuditRepo() {
  return anonymousDonationAuditRepository as unknown as {
    findAuditsBySessionId: ReturnType<typeof vi.fn>;
  };
}

function getSessionRepo() {
  return guestWalletSessionRepository as unknown as {
    findGuestWalletSessionById: ReturnType<typeof vi.fn>;
    updateGuestWalletSession: ReturnType<typeof vi.fn>;
  };
}

describe('donationReconciliationWorker - reconcileSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBalanceOf.mockReset();
    resetModuleState();
  });

  it('set hasPendingDonation = true khi ERC-20 balance > 0', async () => {
    const mockSession = {
      sessionId: 'session-001',
      walletAddress: '0x1234567890123456789012345678901234567890',
      status: 'ACTIVE' as const,
      donationCount: 0,
      totalDonatedAmount: 0,
      hasPendingDonation: false
    };
    const mockAudits = [{
      sessionId: 'session-001',
      onChainTxHash: null,
      paymasterSponsoredGas: true
    }];

    getSessionRepo().findGuestWalletSessionById.mockResolvedValue(mockSession);
    getAuditRepo().findAuditsBySessionId.mockResolvedValue(mockAudits);
    getSessionRepo().updateGuestWalletSession.mockResolvedValue({
      ...mockSession,
      hasPendingDonation: true
    });

    vi.stubEnv('BLOCKCHAIN_RPC_URL', 'https://rpc.example.com');
    vi.stubEnv('CHARITY_TOKEN_CONTRACT_ADDRESS', '0x1234567890123456789012345678901234567890');

    mockBalanceOf.mockResolvedValue(BigInt(1000000));

    const result = await reconcileSession('session-001');

    expect(getSessionRepo().updateGuestWalletSession).toHaveBeenCalledWith(
      'session-001',
      expect.objectContaining({ hasPendingDonation: true })
    );
    expect(result).toBe(true);
  });

  it('không set flag khi session không tồn tại', async () => {
    getSessionRepo().findGuestWalletSessionById.mockResolvedValue(null);

    const result = await reconcileSession('nonexistent-session');

    expect(getSessionRepo().updateGuestWalletSession).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('không set flag khi session status không phải ACTIVE', async () => {
    const mockSession = {
      sessionId: 'session-002',
      walletAddress: '0x1234567890123456789012345678901234567890',
      status: 'EXPIRED' as const
    };
    getSessionRepo().findGuestWalletSessionById.mockResolvedValue(mockSession);

    const result = await reconcileSession('session-002');

    expect(getSessionRepo().updateGuestWalletSession).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('không set flag khi không có audit records', async () => {
    const mockSession = {
      sessionId: 'session-003',
      walletAddress: '0x1234567890123456789012345678901234567890',
      status: 'ACTIVE' as const
    };
    getSessionRepo().findGuestWalletSessionById.mockResolvedValue(mockSession);
    getAuditRepo().findAuditsBySessionId.mockResolvedValue([]);

    const result = await reconcileSession('session-003');

    expect(getSessionRepo().updateGuestWalletSession).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('không set flag khi audit đã có onChainTxHash (đã indexed)', async () => {
    const mockSession = {
      sessionId: 'session-004',
      walletAddress: '0x1234567890123456789012345678901234567890',
      status: 'ACTIVE' as const
    };
    const mockAudits = [{
      sessionId: 'session-004',
      onChainTxHash: '0xtxhash123',
      paymasterSponsoredGas: true
    }];
    getSessionRepo().findGuestWalletSessionById.mockResolvedValue(mockSession);
    getAuditRepo().findAuditsBySessionId.mockResolvedValue(mockAudits);

    const result = await reconcileSession('session-004');

    expect(getSessionRepo().updateGuestWalletSession).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('không set flag khi audit không có paymasterSponsoredGas', async () => {
    const mockSession = {
      sessionId: 'session-005',
      walletAddress: '0x1234567890123456789012345678901234567890',
      status: 'ACTIVE' as const
    };
    const mockAudits = [{
      sessionId: 'session-005',
      onChainTxHash: null,
      paymasterSponsoredGas: false
    }];
    getSessionRepo().findGuestWalletSessionById.mockResolvedValue(mockSession);
    getAuditRepo().findAuditsBySessionId.mockResolvedValue(mockAudits);

    const result = await reconcileSession('session-005');

    expect(getSessionRepo().updateGuestWalletSession).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('không set flag khi ERC-20 balance === 0', async () => {
    const mockSession = {
      sessionId: 'session-006',
      walletAddress: '0x1234567890123456789012345678901234567890',
      status: 'ACTIVE' as const,
      donationCount: 0,
      hasPendingDonation: false
    };
    const mockAudits = [{
      sessionId: 'session-006',
      onChainTxHash: null,
      paymasterSponsoredGas: true
    }];

    getSessionRepo().findGuestWalletSessionById.mockResolvedValue(mockSession);
    getAuditRepo().findAuditsBySessionId.mockResolvedValue(mockAudits);

    vi.stubEnv('BLOCKCHAIN_RPC_URL', 'https://rpc.example.com');
    vi.stubEnv('CHARITY_TOKEN_CONTRACT_ADDRESS', '0x1234567890123456789012345678901234567890');

    // Balance === 0 — token đã được donate hết, không cần resume
    mockBalanceOf.mockResolvedValue(BigInt(0));

    const result = await reconcileSession('session-006');

    expect(getSessionRepo().updateGuestWalletSession).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
