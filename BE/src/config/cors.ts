const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:3000';

/**
 * Hàm parse danh sách origin CORS từ biến môi trường.
 * CORS_ALLOWED_ORIGINS là tên chuẩn; legacyOrigin giữ tương thích với các
 * môi trường production đang dùng CORS_ALLOWED_ORIGIN.
 */
export function parseAllowedCorsOrigins(primaryOriginList?: string, legacyOrigin?: string): string[] {
  const configuredOriginList = primaryOriginList || legacyOrigin || DEFAULT_ALLOWED_ORIGIN;

  return configuredOriginList
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

/** Hàm lấy danh sách origin CORS từ runtime environment của backend. */
export function getAllowedCorsOriginsFromEnvironment(): string[] {
  return parseAllowedCorsOrigins(process.env.CORS_ALLOWED_ORIGINS, process.env.CORS_ALLOWED_ORIGIN);
}
