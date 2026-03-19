import { Request, Response, NextFunction } from 'express';

type RateLimitState = {
  requestCount: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitState>();

/**
 * Hàm tạo middleware rate limit.
 * Mục đích: giới hạn số lần gọi API theo IP để chống brute-force.
 */
export function createRateLimitMiddleware(maxRequests: number, timeWindowInMs: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const clientIpAddress = request.ip || 'unknown';
    const currentTimestamp = Date.now();
    const existingState = rateLimitStore.get(clientIpAddress);

    if (!existingState || existingState.resetAt <= currentTimestamp) {
      rateLimitStore.set(clientIpAddress, {
        requestCount: 1,
        resetAt: currentTimestamp + timeWindowInMs
      });
      next();
      return;
    }

    const updatedCount = existingState.requestCount + 1;
    rateLimitStore.set(clientIpAddress, {
      requestCount: updatedCount,
      resetAt: existingState.resetAt
    });

    if (updatedCount > maxRequests) {
      response.status(429).json({
        message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.'
      });
      return;
    }

    next();
  };
}

