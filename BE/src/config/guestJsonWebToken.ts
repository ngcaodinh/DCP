/**
 * Cấu hình JWT riêng cho guest session — tách biệt hoàn toàn với JWT của user đã đăng nhập.
 * Guest JWT dùng để authorize Paymaster sponsorship, không chứa thông tin nhạy cảm.
 * TTL 72 giờ phù hợp với luồng donate ẩn danh (dài hơn user session vì guest có thể
 * rời đi và quay lại trong vài ngày trước khi claim).
 */
import jsonwebtoken from 'jsonwebtoken';

/** Cấu hình guest JWT — issuer/audience riêng để tránh cross-use với user JWT. */
type GuestJwtConfig = {
  issuer: string;
  audience: string;
  expiresIn: string;
};

const guestJwtConfig: GuestJwtConfig = {
  issuer: process.env.GUEST_JWT_ISSUER || 'dcp-guest',
  audience: process.env.GUEST_JWT_AUDIENCE || 'dcp-guest-sessions',
  expiresIn: process.env.GUEST_JWT_EXPIRES_IN || '72h'
};

/** Các claims bắt buộc trong guest session token. */
export type GuestSessionClaims = {
  sessionId: string;
  walletAddress: string;
};

/**
 * Hàm lấy khóa bí mật ký guest session token.
 * Mục đích: tách biệt hoàn toàn với JWT_SECRET của user thường.
 */
export function getGuestJwtSecret(): string {
  const secretKey = process.env.GUEST_JWT_SECRET;
  if (!secretKey) {
    throw new Error('GUEST_JWT_SECRET is not configured.');
  }
  if (secretKey.length < 32) {
    throw new Error('GUEST_JWT_SECRET phải có ít nhất 32 ký tự.');
  }
  return secretKey;
}

/**
 * Hàm ký guest session token.
 * Mục đích: tạo JWT để authorize Paymaster sponsorship cho guest wallet.
 */
export function signGuestSessionToken(payload: GuestSessionClaims): string {
  const secret = getGuestJwtSecret();
  // jsonwebtoken types yêu cầu StringValue cho expiresIn (e.g. "72h"), cast rõ ràng để satisfy TS
  const signOptions = {
    issuer: guestJwtConfig.issuer,
    audience: guestJwtConfig.audience,
    expiresIn: guestJwtConfig.expiresIn as jsonwebtoken.SignOptions['expiresIn'],
    algorithm: 'HS256' as const
  };
  return jsonwebtoken.sign(payload, secret, signOptions);
}

/**
 * Hàm xác thực guest session token.
 * Mục đích: kiểm tra tính hợp lệ của token trước khi sponsor paymaster.
 * @returns Payload đã decode nếu token hợp lệ
 * @throws Error nếu token không hợp lệ hoặc đã hết hạn
 */
export function verifyGuestSessionToken(token: string): GuestSessionClaims {
  const secret = getGuestJwtSecret();
  const decoded = jsonwebtoken.verify(token, secret, {
    issuer: guestJwtConfig.issuer,
    audience: guestJwtConfig.audience,
    algorithms: ['HS256']
  });
  return decoded as GuestSessionClaims;
}
