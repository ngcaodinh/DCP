import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/authenticationMiddleware', () => ({
  createAuthenticationMiddleware: () => (requestObject: express.Request, _responseObject: express.Response, nextFunction: express.NextFunction) => {
    (requestObject as express.Request & { authenticatedUser?: { userId: string; role: string } }).authenticatedUser = {
      userId: 'admin-1',
      role: 'admin'
    };
    nextFunction();
  }
}));

vi.mock('../../middleware/roleAuthorizationMiddleware', () => ({
  createRoleAuthorizationMiddleware: () => (_requestObject: express.Request, _responseObject: express.Response, nextFunction: express.NextFunction) => {
    nextFunction();
  }
}));

vi.mock('../../middleware/rateLimitMiddleware', () => ({
  createRateLimitMiddleware: () => (_requestObject: express.Request, _responseObject: express.Response, nextFunction: express.NextFunction) => {
    nextFunction();
  }
}));

vi.mock('../../services/rankingService', () => ({
  recalculateRankingSnapshot: vi.fn(),
  getCurrentRankingSnapshotPaginated: vi.fn()
}));

import { createRankingRoutes } from '../../routes/rankingRoutes';
import * as rankingService from '../../services/rankingService';

/** Hàm tạo app test cho ranking route. Mục đích: tái sử dụng cấu hình express trong các test case. */
function createTestApplication() {
  const testApplication = express();
  testApplication.use(express.json());
  testApplication.use('/rankings', createRankingRoutes());
  return testApplication;
}

describe('rankingRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /rankings trả 400 khi sortBy không hợp lệ', async () => {
    const testApplication = createTestApplication();
    const response = await request(testApplication).get('/rankings?sortBy=unknown&sortDirection=asc');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('GET /rankings trả dữ liệu thành công', async () => {
    const rankingServiceMock = rankingService as unknown as { getCurrentRankingSnapshotPaginated: ReturnType<typeof vi.fn> };
    rankingServiceMock.getCurrentRankingSnapshotPaginated.mockResolvedValue({
      snapshot: { calculatedAt: new Date().toISOString(), calculationWindowHours: 24, totalValidDonations: 3 },
      items: [{ projectId: 'P1', rankPosition: 1, projectName: 'Project One' }],
      metadata: { totalItems: 1, totalPages: 1, currentPage: 1, pageSize: 10 }
    });

    const testApplication = createTestApplication();
    const response = await request(testApplication).get('/rankings?sortBy=rankPosition&sortDirection=asc');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
  });

  it('POST /rankings/recalculate trả thành công cho admin', async () => {
    const rankingServiceMock = rankingService as unknown as { recalculateRankingSnapshot: ReturnType<typeof vi.fn> };
    rankingServiceMock.recalculateRankingSnapshot.mockResolvedValue({ snapshotId: 'ranking:1', rankingItems: [] });

    const testApplication = createTestApplication();
    const response = await request(testApplication).post('/rankings/recalculate').send({ windowHours: 12 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(rankingServiceMock.recalculateRankingSnapshot).toHaveBeenCalledWith(12);
  });
});
