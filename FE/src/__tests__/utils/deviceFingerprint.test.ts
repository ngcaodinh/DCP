import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateDeviceFingerprint, resetCanvasFingerprintCache } from '@/app/utils/deviceFingerprint';

// Reset canvas fingerprint cache giữa các tests để tránh order-dependent failures
function resetCanvasCache() {
  resetCanvasFingerprintCache();
}

describe('generateDeviceFingerprint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCanvasCache();
  });

  it('should return a hex string on success', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      language: 'vi-VN',
      platform: 'Win32',
      hardwareConcurrency: 8,
    });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });

    const fingerprint = await generateDeviceFingerprint();

    expect(typeof fingerprint).toBe('string');
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should be deterministic for the same browser attributes', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      language: 'vi-VN',
      platform: 'Win32',
      hardwareConcurrency: 8,
    });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });

    const first = await generateDeviceFingerprint();
    const second = await generateDeviceFingerprint();

    expect(first).toBe(second);
  });

  it('should return empty string when crypto.subtle.digest throws', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      language: 'vi-VN',
      platform: 'Win32',
      hardwareConcurrency: 8,
    });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockRejectedValue(new Error('Digest failed')),
      },
    });

    const fingerprint = await generateDeviceFingerprint();

    expect(fingerprint).toBe('');
  });

  it('should handle missing optional navigator properties gracefully', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'TestBrowser/1.0',
    });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });

    const fingerprint = await generateDeviceFingerprint();

    expect(typeof fingerprint).toBe('string');
    expect(fingerprint.length).toBeGreaterThan(0);
  });

  it('should return empty string silently when Web Crypto is unavailable', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('navigator', {
      userAgent: 'TestBrowser/1.0',
      language: 'en-US',
      platform: 'Linux',
    });
    vi.stubGlobal('crypto', {
      subtle: undefined,
    });

    const fingerprint = await generateDeviceFingerprint();

    expect(fingerprint).toBe('');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
