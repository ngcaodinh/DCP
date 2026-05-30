/**
 * Lớp wrapper cho LocalStorage dùng lưu trữ dữ liệu Guest Wallet.
 * Mục đích: cung cấp interface type-safe để lưu/truy xuất dữ liệu ví guest
 * từ LocalStorage, bao gồm encrypted owner key và session metadata.
 */

/** Key dùng để lưu trữ guest wallet data trong LocalStorage */
const GUEST_WALLET_STORAGE_KEY = 'dcp_guest_wallet';

/**
 * Cấu trúc dữ liệu lưu trong LocalStorage cho Guest Wallet.
 * Chứa owner key đã mã hóa và metadata cần thiết để khôi phục session.
 */
export interface GuestWalletStorageData {
  /** Chuỗi hex của owner key đã được mã hóa AES-256-GCM */
  encryptedOwnerKey: string;
  /** Client salt dùng cho PBKDF2 key derivation (hex) */
  clientSalt: string;
  /** Server salt nhận được từ backend khi tạo session (hex) */
  serverSalt: string;
  /** Initialization vector dùng cho AES-GCM (hex) */
  iv: string;
  /** Địa chỉ ví guest (EIP-55 checksum) */
  walletAddress: string;
  /** ID của session đã tạo với backend */
  sessionId: string;
  /** Thời điểm hết hạn của session (ISO timestamp) */
  expiresAt: string;
  /** Thời điểm tạo wallet (ISO timestamp) */
  createdAt: string;
}

/**
 * Kiểm tra xem guest wallet data có tồn tại trong LocalStorage hay không.
 * @returns true nếu có dữ liệu guest wallet được lưu
 */
export function hasGuestWallet(): boolean {
  try {
    return localStorage.getItem(GUEST_WALLET_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Validate cấu trúc dữ liệu từ LocalStorage có đầy đủ các trường bắt buộc.
 * @param rawData - Dữ liệu thô parse từ JSON
 * @returns true nếu dữ liệu hợp lệ với đầy đủ required fields
 */
function validateStorageData(rawData: unknown): rawData is GuestWalletStorageData {
  if (!rawData || typeof rawData !== 'object') {
    return false;
  }

  const requiredFields: (keyof GuestWalletStorageData)[] = [
    'encryptedOwnerKey',
    'clientSalt',
    'serverSalt',
    'iv',
    'walletAddress',
    'sessionId',
    'expiresAt',
    'createdAt',
  ];

  for (const field of requiredFields) {
    if (!(field in rawData) || typeof (rawData as Record<string, unknown>)[field] !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Load guest wallet data từ LocalStorage.
 * @returns GuestWalletStorageData nếu tồn tại và hợp lệ, null nếu không có hoặc lỗi
 */
export function loadGuestWallet(): GuestWalletStorageData | null {
  try {
    const rawJson = localStorage.getItem(GUEST_WALLET_STORAGE_KEY);
    if (!rawJson) {
      return null;
    }

    const parsedData = JSON.parse(rawJson) as unknown;

    if (!validateStorageData(parsedData)) {
      console.warn('[GuestWalletStorage] Dữ liệu trong LocalStorage không hợp lệ, xóa bỏ.');
      localStorage.removeItem(GUEST_WALLET_STORAGE_KEY);
      return null;
    }

    return parsedData;
  } catch (error) {
    console.error('[GuestWalletStorage] Lỗi khi đọc dữ liệu từ LocalStorage:', error);
    return null;
  }
}

/**
 * Lưu guest wallet data vào LocalStorage.
 * @param data - GuestWalletStorageData cần lưu
 */
export function saveGuestWallet(data: GuestWalletStorageData): void {
  try {
    const jsonString = JSON.stringify(data);
    localStorage.setItem(GUEST_WALLET_STORAGE_KEY, jsonString);
  } catch (error) {
    console.error('[GuestWalletStorage] Lỗi khi lưu dữ liệu vào LocalStorage:', error);
    throw new Error('Không thể lưu dữ liệu guest wallet vào LocalStorage.');
  }
}

/**
 * Xóa toàn bộ guest wallet data khỏi LocalStorage.
 * Dùng khi user logout, claim thành công, hoặc user chủ động xóa.
 */
export function clearGuestWallet(): void {
  try {
    localStorage.removeItem(GUEST_WALLET_STORAGE_KEY);
  } catch (error) {
    console.error('[GuestWalletStorage] Lỗi khi xóa dữ liệu từ LocalStorage:', error);
  }
}

/**
 * Kiểm tra xem session đã hết hạn chưa dựa trên expiresAt.
 * @param data - GuestWalletStorageData cần kiểm tra
 * @returns true nếu session đã hết hạn
 */
export function isSessionExpired(data: GuestWalletStorageData): boolean {
  try {
    const expiryTime = new Date(data.expiresAt).getTime();
    if (Number.isNaN(expiryTime)) {
      return true;
    }
    return Date.now() > expiryTime;
  } catch {
    return true;
  }
}
