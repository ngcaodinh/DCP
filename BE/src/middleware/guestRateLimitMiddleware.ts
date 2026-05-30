/**
 * Hybrid Rate Limit cho guest endpoints — 2 lớp bảo vệ:
 *
 * Lớp 1 (In-Memory): Chống DDoS/flooding. Mỗi IP bị giới hạn 20 req/10s.
 * Dùng token bucket đơn giản trong Map RAM. Reject ngay không tốn Redis I/O.
 *
 * Lớp 2 (Redis): Lọc tinh nghiệp vụ trên multi-instance.
 * - guestSessionRateLimit: 5 sessions/IP/hour cho POST /api/guest/session
 * - guestDonationRateLimit: 3 sponsor requests/session cho /api/guest/paymaster/sponsor
 *
 * Không crash khi Redis unavailable — fallback sang Lớp 1 + warning log.
 */
import { Request, Response, NextFunction } from 'express';
import { getRedisClientIfReady } from '../config/redis';
import { getLogger } from '../config/logger';
import { sendErrorResponse } from '../utils/apiResponse';

const logger = getLogger();

/**
 * Token bucket state cho lớp 1 (in-memory anti-DDoS).
 * Key = IP address, value = { tokens, lastRefillTimestamp }
 */
type InMemoryBucket = {
  tokens: number;
  lastRefill: number;
};

const inMemoryBuckets = new Map<string, InMemoryBucket>();

/** Ngưỡng Lớp 1: 20 requests / 10 giây / IP */
const LAYER1_MAX_TOKENS = 20;
const LAYER1_REFILL_RATE = 2; // tokens per second

/**
 * Hàm refill token bucket theo thời gian.
 * Mục đích: mô phỏng token bucket — mỗi giây được thêm 2 tokens, max 20.
 */
function refillBucket(bucket: InMemoryBucket, now: number): InMemoryBucket {
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  const newTokens = Math.min(
    LAYER1_MAX_TOKENS,
    bucket.tokens + elapsedSeconds * LAYER1_REFILL_RATE
  );
  return {
    tokens: Math.floor(newTokens),
    lastRefill: now
  };
}

/**
 * Hàm kiểm tra Lớp 1 (in-memory anti-DDoS).
 * Reject ngay nếu vượt ngưỡng flood — không tốn Redis lookup.
 */
function checkLayer1RateLimit(clientIp: string): { allowed: boolean; bucket: InMemoryBucket } {
  const now = Date.now();
  const existingBucket = inMemoryBuckets.get(clientIp);

  if (!existingBucket) {
    const newBucket: InMemoryBucket = { tokens: LAYER1_MAX_TOKENS - 1, lastRefill: now };
    inMemoryBuckets.set(clientIp, newBucket);
    return { allowed: true, bucket: newBucket };
  }

  const refilledBucket = refillBucket(existingBucket, now);

  if (refilledBucket.tokens <= 0) {
    inMemoryBuckets.set(clientIp, refilledBucket);
    return { allowed: false, bucket: refilledBucket };
  }

  const consumedBucket: InMemoryBucket = {
    tokens: refilledBucket.tokens - 1,
    lastRefill: now
  };
  inMemoryBuckets.set(clientIp, consumedBucket);
  return { allowed: true, bucket: consumedBucket };
}

/**
 * Hàm xóa các bucket đã stale (không hoạt động quá 60 giây).
 * Chạy định kỳ để tránh memory leak khi client ngắt kết nối.
 */
function cleanupStaleBuckets(): void {
  const now = Date.now();
  const staleThreshold = 60_000;
  for (const [ip, bucket] of inMemoryBuckets.entries()) {
    if (now - bucket.lastRefill > staleThreshold) {
      inMemoryBuckets.delete(ip);
    }
  }
}

// Cleanup stale entries mỗi 60 giây
setInterval(cleanupStaleBuckets, 60_000);

/**
 * Hàm tạo middleware rate limit Lớp 1 cho tất cả guest endpoints.
 * Mục đích: chặn flood ngay từ đầu mà không cần Redis.
 */
export function createGuestLayer1RateLimitMiddleware() {
  return (request: Request, response: Response, next: NextFunction): void => {
    const clientIp = request.ip || request.headers['x-forwarded-for']?.toString() || 'unknown';
    const { allowed } = checkLayer1RateLimit(clientIp);

    if (!allowed) {
      sendErrorResponse(
        response,
        429,
        'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
        'GUEST_RATE_LIMIT_EXCEEDED'
      );
      return;
    }

    next();
  };
}

/**
 * Hàm kiểm tra Lớp 2 (Redis) cho guest session creation.
 * Giới hạn: 5 sessions/IP/hour (sliding window).
 */
async function checkGuestSessionRedisLimit(clientIp: string): Promise<boolean> {
  const redisClient = getRedisClientIfReady();
  if (!redisClient) {
    logger.warn('Redis unavailable, skipping Lớp 2 rate limit check.');
    return true;
  }

  const redisKey = `guest:rate:session:${clientIp}`;
  const now = Date.now();
  const windowStart = now - 3_600_000; // 1 giờ

  try {
    // Sliding window: remove old entries + count current
    await redisClient.zRemRangeByScore(redisKey, '0', windowStart.toString());
    const currentCount = await redisClient.zCard(redisKey);

    if (currentCount >= 5) {
      return false;
    }

    // Thêm request hiện tại vào sorted set
    await redisClient.zAdd(redisKey, { score: now, value: `${now}-${Math.random()}` });
    await redisClient.expire(redisKey, 3600); // 1 giờ TTL
    return true;
  } catch (error) {
    logger.warn('Redis rate limit check failed, allowing request.', {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
}

/**
 * Hàm kiểm tra Lớp 2 (Redis) cho donation sponsorship.
 * Giới hạn: 3 sponsor requests/session.
 */
async function checkGuestDonationRedisLimit(sessionId: string): Promise<boolean> {
  const redisClient = getRedisClientIfReady();
  if (!redisClient) {
    logger.warn('Redis unavailable, skipping donation rate limit check.');
    return true;
  }

  const redisKey = `guest:rate:donation:${sessionId}`;

  try {
    const currentCount = await redisClient.incr(redisKey);
    if (currentCount === 1) {
      await redisClient.expire(redisKey, 3600); // 1 giờ TTL
    }

    return currentCount <= 3;
  } catch (error) {
    logger.warn('Redis donation rate limit check failed, allowing request.', {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
}

/**
 * Hàm tạo middleware rate limit Lớp 2 cho session creation.
 * Áp dụng sau Lớp 1 — chỉ chạy khi Lớp 1 đã pass.
 */
export function createGuestSessionRateLimitMiddleware() {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const clientIp = request.ip || request.headers['x-forwarded-for']?.toString() || 'unknown';

    const allowed = await checkGuestSessionRedisLimit(clientIp);
    if (!allowed) {
      sendErrorResponse(
        response,
        429,
        'Bạn đã tạo quá nhiều phiên guest. Vui lòng thử lại sau 1 giờ.',
        'GUEST_SESSION_RATE_LIMIT_EXCEEDED'
      );
      return;
    }

    next();
  };
}

/**
 * Hàm tạo middleware rate limit Lớp 2 cho donation sponsorship.
 * Áp dụng sau guestAuthMiddleware — dùng sessionId từ request.
 */
export function createGuestDonationRateLimitMiddleware() {
  return async (
    request: Request & { guestSession?: { sessionId: string } },
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const sessionId = request.guestSession?.sessionId;
    if (!sessionId) {
      sendErrorResponse(response, 401, 'Vui lòng xác thực guest session trước.', 'GUEST_SESSION_REQUIRED');
      return;
    }

    const allowed = await checkGuestDonationRedisLimit(sessionId);
    if (!allowed) {
      sendErrorResponse(
        response,
        429,
        'Bạn đã gửi quá nhiều yêu cầu tài trợ gas. Vui lòng thử lại sau.',
        'GUEST_DONATION_RATE_LIMIT_EXCEEDED'
      );
      return;
    }

    next();
  };
}
