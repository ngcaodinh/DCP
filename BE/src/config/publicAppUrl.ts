/**
 * Lấy origin frontend dùng cho các URL redirect từ PayOS.
 * Production phải cấu hình APP_URL HTTPS; localhost chỉ được dùng ở môi trường dev.
 * NEXT_PUBLIC_APP_URL được giữ làm tên biến tương thích với các bản triển khai cũ.
 */
export function getPublicAppUrl(): string | null {
  const configuredUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredUrl) {
    return process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000';
  }

  try {
    const parsedUrl = new URL(configuredUrl);
    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && (parsedUrl.protocol !== 'https:' || isLocalHost)) return null;

    return parsedUrl.origin;
  } catch {
    return null;
  }
}
