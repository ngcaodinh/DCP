import { Request, Response } from 'express';
import {
  loginWithGoogle,
  refreshAccessToken,
  logFailedGoogleLogin,
  revokeAllRefreshSessionsForUser
} from '../services/authService';
import { getLogger } from '../config/logger';

const logger = getLogger();

/**
 * Hàm đọc token đăng nhập từ request.
 * Mục đích: chuẩn hóa cách lấy identity token từ body.
 */
function extractIdentityToken(request: Request): string | null {
  const identityToken = request.body?.idToken;
  if (typeof identityToken !== 'string' || identityToken.trim().length === 0) {
    return null;
  }
  return identityToken.trim();
}

/**
 * Hàm lấy metadata thiết bị từ request.
 * Mục đích: đảm bảo luôn có IP và User-Agent hợp lệ.
 */
function extractRequestMetadata(request: Request): { ipAddress: string; userAgent: string } {
  const ipAddress = request.headers['x-client-ip'];
  const userAgent = request.headers['x-client-user-agent'];

  const normalizedIp = typeof ipAddress === 'string' && ipAddress.trim().length > 0 ? ipAddress.trim() : 'unknown';
  const normalizedUserAgent =
    typeof userAgent === 'string' && userAgent.trim().length > 0 ? userAgent.trim() : 'unknown';

  return { ipAddress: normalizedIp, userAgent: normalizedUserAgent };
}

/**
 * Hàm lấy payload làm mới token.
 * Mục đích: đảm bảo refresh token và session id hợp lệ.
 */
function extractRefreshPayload(request: Request): { refreshSessionId: string; refreshToken: string } | null {
  const refreshSessionId = request.body?.refreshSessionId;
  const refreshToken = request.body?.refreshToken;

  if (typeof refreshSessionId !== 'string' || refreshSessionId.trim().length === 0) {
    return null;
  }

  if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
    return null;
  }

  return {
    refreshSessionId: refreshSessionId.trim(),
    refreshToken: refreshToken.trim()
  };
}


/**
 * Hàm lấy payload đăng xuất tất cả thiết bị.
 * Mục đích: đảm bảo userId hợp lệ.
 */
function extractLogoutAllPayload(request: Request): { userId: string } | null {
  const userId = request.body?.userId;

  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return null;
  }

  return { userId: userId.trim() };
}

/**
 * Hàm xử lý đăng nhập Google.
 * Mục đích: xác thực token, tạo ví blockchain và trả access/refresh token.
 */
export async function handleGoogleLogin(request: Request, response: Response): Promise<void> {
  const identityToken = extractIdentityToken(request);
  const metadata = extractRequestMetadata(request);

  if (!identityToken) {
    logger.warn('Google login request missing identity token.');
    response.status(400).json({
      message: 'Thiếu thông tin xác thực Google.'
    });
    return;
  }

  try {
    const loginResult = await loginWithGoogle(identityToken, metadata.ipAddress, metadata.userAgent);
    logger.info('Google login success.', { correlationId: loginResult.correlationId });

    response.status(200).json({
      accessToken: loginResult.accessToken,
      refreshToken: loginResult.refreshToken,
      csrfToken: loginResult.csrfToken,
      refreshSessionId: loginResult.refreshSessionId,
      expiresAt: loginResult.expiresAt,
      user: loginResult.user,
      correlationId: loginResult.correlationId
    });
  } catch (error) {
    logFailedGoogleLogin(
      null,
      metadata.ipAddress,
      metadata.userAgent,
      (error as Error).message
    );
    logger.error('Google login failed.', {
      errorMessage: (error as Error).message
    });
    response.status(401).json({
      message: 'Đăng nhập Google thất bại. Vui lòng thử lại.'
    });
  }
}

/**
 * Hàm xử lý làm mới access token.
 * Mục đích: xác thực refresh token và trả về token mới.
 */
export async function handleRefreshToken(request: Request, response: Response): Promise<void> {
  const payload = extractRefreshPayload(request);
  const metadata = extractRequestMetadata(request);
  const csrfTokenHeader = request.headers['x-csrf-token'];
  const csrfToken = typeof csrfTokenHeader === 'string' ? csrfTokenHeader.trim() : '';

  if (!payload || csrfToken.length === 0) {
    response.status(400).json({
      message: 'Thiếu thông tin làm mới phiên.'
    });
    return;
  }

  try {
    const refreshResult = await refreshAccessToken(
      payload.refreshSessionId,
      payload.refreshToken,
      csrfToken,
      metadata.ipAddress,
      metadata.userAgent
    );

    response.status(200).json({
      accessToken: refreshResult.accessToken,
      refreshToken: refreshResult.refreshToken,
      csrfToken: refreshResult.csrfToken,
      refreshSessionId: refreshResult.refreshSessionId,
      expiresAt: refreshResult.expiresAt
    });
  } catch (error) {
    logger.error('Refresh token failed.', {
      errorMessage: (error as Error).message
    });
    response.status(401).json({
      message: 'Làm mới token thất bại. Vui lòng đăng nhập lại.'
    });
  }
}

/**
 * Hàm xử lý đăng xuất tất cả thiết bị.
 * Mục đích: thu hồi toàn bộ refresh session theo userId.
 */
export async function handleLogoutAll(request: Request, response: Response): Promise<void> {
  const payload = extractLogoutAllPayload(request);

  if (!payload) {
    response.status(400).json({
      message: 'Thiếu thông tin đăng xuất.'
    });
    return;
  }

  await revokeAllRefreshSessionsForUser(payload.userId);
  response.status(200).json({
    message: 'Đã đăng xuất khỏi tất cả thiết bị.'
  });
}

