/**
 * Middleware xác thực guest session token (JWT) cho các endpoint liên quan đến guest wallet.
 * Luồng: extract Bearer token → verify JWT → fetch session từ DB → check status + expiry.
 *
 * Error codes:
 * - GUEST_TOKEN_REQUIRED: không có token trong header
 * - GUEST_TOKEN_INVALID: token không hợp lệ hoặc không decode được
 * - GUEST_SESSION_NOT_FOUND: session không tồn tại trong DB
 * - GUEST_SESSION_EXPIRED: session đã hết hạn hoặc bị vô hiệu hóa
 */
import { NextFunction, Request, Response } from 'express';
import { verifyGuestSessionToken, type GuestSessionClaims } from '../config/guestJsonWebToken';
import { findGuestWalletSessionById } from '../repositories/guestWalletSessionRepository';
import { sendErrorResponse } from '../utils/apiResponse';
import { extractBearerToken } from '../utils/tokenExtractor';
import { getLogger } from '../config/logger';

const logger = getLogger();

/** Request type mở rộng để chứa guest session data. */
export type GuestSessionRequest = Request & {
  guestSession?: {
    sessionId: string;
    walletAddress: string;
    status: string;
    expiresAt: Date;
  };
};

/**
 * Hàm tạo middleware xác thực guest session.
 * Mục đích: bảo vệ endpoint yêu cầu guest wallet hợp lệ.
 */
export function createGuestAuthMiddleware() {
  return async (
    request: GuestSessionRequest,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const bearerToken = extractBearerToken(request.headers.authorization);

    if (!bearerToken) {
      sendErrorResponse(response, 401, 'Thiếu guest session token.', 'GUEST_TOKEN_REQUIRED');
      return;
    }

    let claims: GuestSessionClaims;
    try {
      claims = verifyGuestSessionToken(bearerToken);
    } catch {
      sendErrorResponse(response, 401, 'Guest session token không hợp lệ.', 'GUEST_TOKEN_INVALID');
      return;
    }

    let session;
    try {
      session = await findGuestWalletSessionById(claims.sessionId);
    } catch (error) {
      logger.error('[guestAuthMiddleware] Lỗi khi truy vấn guest session từ DB.', {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      sendErrorResponse(response, 500, 'Lỗi hệ thống khi xác thực phiên.', 'INTERNAL_SERVER_ERROR');
      return;
    }

    if (!session) {
      sendErrorResponse(response, 401, 'Guest session không tồn tại.', 'GUEST_SESSION_NOT_FOUND');
      return;
    }

    if (session.status !== 'ACTIVE') {
      sendErrorResponse(
        response,
        401,
        'Guest session đã hết hạn hoặc bị vô hiệu hóa.',
        'GUEST_SESSION_EXPIRED'
      );
      return;
    }

    const now = new Date();
    if (session.expiresAt < now) {
      sendErrorResponse(
        response,
        401,
        'Guest session đã hết hạn. Vui lòng tạo phiên mới.',
        'GUEST_SESSION_EXPIRED'
      );
      return;
    }

    request.guestSession = {
      sessionId: session.sessionId,
      walletAddress: session.walletAddress,
      status: session.status,
      expiresAt: session.expiresAt
    };

    next();
  };
}
