import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectBrowserCompatibility } from '@/app/utils/browserCompat';

describe('detectBrowserCompatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return SAFE when all checks pass', async () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {}),
      getItem: vi.fn(() => '1'),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      brave: undefined,
      storage: undefined,
    });

    const result = await detectBrowserCompatibility();

    expect(result.riskLevel).toBe('SAFE');
    expect(result.details).toHaveLength(0);
  });

  it('should return CRITICAL when LocalStorage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {}),
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      brave: undefined,
      storage: undefined,
    });

    const result = await detectBrowserCompatibility();

    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.details).toContain(
      'Trình duyệt không hỗ trợ LocalStorage. Dữ liệu ví sẽ không được lưu giữ.'
    );
  });

  it('should return WARNING when Brave Strict mode is detected', async () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {}),
      getItem: vi.fn(() => '1'),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      brave: { isBrave: vi.fn().mockResolvedValue(true) },
      storage: undefined,
    });

    const result = await detectBrowserCompatibility();

    expect(result.riskLevel).toBe('WARNING');
    expect(result.details).toContain(
      'Brave Strict mode đang bật. Một số tính năng bảo mật có thể bị ảnh hưởng.'
    );
  });

  it('should return WARNING when only Safari Private Mode is detected', async () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {}),
      getItem: vi.fn(() => '1'),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      brave: undefined,
      storage: { estimate: vi.fn().mockResolvedValue({ quota: 500_000 }) },
    });

    const result = await detectBrowserCompatibility();

    expect(result.riskLevel).toBe('WARNING');
    expect(result.details).toContain(
      'Phát hiện chế độ Private của Safari. Dữ liệu ví có thể không được lưu lâu dài.'
    );
  });

  it('should return CRITICAL when two issues are detected', async () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {}),
      getItem: vi.fn(() => '1'),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      brave: { isBrave: vi.fn().mockResolvedValue(true) },
      storage: { estimate: vi.fn().mockResolvedValue({ quota: 500_000 }) },
    });

    const result = await detectBrowserCompatibility();

    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.details).toContain(
      'Brave Strict mode đang bật. Một số tính năng bảo mật có thể bị ảnh hưởng.'
    );
    expect(result.details).toContain(
      'Phát hiện chế độ Private của Safari. Dữ liệu ví có thể không được lưu lâu dài.'
    );
  });

  it('should use randomized key for LocalStorage test', async () => {
    const mockSetItem = vi.fn(() => {});
    const mockGetItem = vi.fn(() => '1');
    const mockRemoveItem = vi.fn();
    vi.stubGlobal('localStorage', {
      setItem: mockSetItem,
      getItem: mockGetItem,
      removeItem: mockRemoveItem,
    });
    vi.stubGlobal('navigator', {
      brave: undefined,
      storage: undefined,
    });
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('test-uuid-123'),
      subtle: {},
    });

    await detectBrowserCompatibility();

    expect(mockSetItem).toHaveBeenCalledWith('__dcp_ls_test_test-uuid-123__', '1');
    expect(mockRemoveItem).toHaveBeenCalledWith('__dcp_ls_test_test-uuid-123__');
  });
});
