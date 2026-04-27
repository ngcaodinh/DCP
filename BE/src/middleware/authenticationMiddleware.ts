import { NextFunction, Request, Response } from 'express';
import jsonWebToken from 'jsonwebtoken';
import { getJsonWebTokenSecret } from '../config/jsonWebToken';
import { sendErrorResponse } from '../utils/apiResponse';

type JwtClaims = {
  userId: string;
  role: string;
};

type AuthenticatedRequest = Request & {
  authenticatedUser?: JwtClaims;
};

/**
 * Hàm đọc access token từ header Authorization.
 * Mục đích: chuẩn hóa cách lấy Bearer token cho middleware xác thực.
 */
function extractBearerToken(request: Request): string | null {
  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }
  return authorizationHeader.slice(7).trim();
}

/**
 * Hàm tạo middleware xác thực JWT.
 * Mục đích: bảo vệ endpoint yêu cầu người dùng đăng nhập hợp lệ.
 */
export function createAuthenticationMiddleware() {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction): void => {
    const bearerToken = extractBearerToken(request);

    if (!bearerToken) {
      sendErrorResponse(response, 401, 'Thiếu access token hợp lệ.', 'UNAUTHENTICATED');
      return;
    }

    try {
      const jwtSecret = getJsonWebTokenSecret();
      const decodedPayload = jsonWebToken.verify(bearerToken, jwtSecret) as JwtClaims;
      request.authenticatedUser = {
        userId: decodedPayload.userId,
        role: decodedPayload.role
      };
      next();
    } catch (_error) {
      sendErrorResponse(response, 401, 'Access token không hợp lệ hoặc đã hết hạn.', 'UNAUTHENTICATED');
    }
  };
}

export type { AuthenticatedRequest };
