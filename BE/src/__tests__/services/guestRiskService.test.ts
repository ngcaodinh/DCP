import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computeRiskLevelAndMultiplier } from '../../repositories/guestDonationRiskRepository';

describe('guestDonationRiskRepository - computeRiskLevelAndMultiplier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Risk Level Classification', () => {
    it('phân loại SAFE khi riskScore <= 25', () => {
      const testScores = [0, 10, 25];
      testScores.forEach(score => {
        const result = computeRiskLevelAndMultiplier(score);
        expect(result.riskLevel).toBe('SAFE');
        expect(result.trustMultiplier).toBe(1.0);
      });
    });

    it('phân loại LOW khi riskScore 26-50', () => {
      const testScores = [26, 30, 40, 50];
      testScores.forEach(score => {
        const result = computeRiskLevelAndMultiplier(score);
        expect(result.riskLevel).toBe('LOW');
        expect(result.trustMultiplier).toBe(0.8);
      });
    });

    it('phân loại MEDIUM khi riskScore 51-69', () => {
      const testScores = [51, 60, 65, 69];
      testScores.forEach(score => {
        const result = computeRiskLevelAndMultiplier(score);
        expect(result.riskLevel).toBe('MEDIUM');
        expect(result.trustMultiplier).toBe(0.5);
      });
    });

    it('phân loại HIGH khi riskScore 70-90', () => {
      const testScores = [70, 71, 75, 80, 85, 90];
      testScores.forEach(score => {
        const result = computeRiskLevelAndMultiplier(score);
        expect(result.riskLevel).toBe('HIGH');
        expect(result.trustMultiplier).toBe(0.2);
      });
    });

    it('phân loại CRITICAL khi riskScore > 90', () => {
      const testScores = [91, 95, 100, 150, 1000];
      testScores.forEach(score => {
        const result = computeRiskLevelAndMultiplier(score);
        expect(result.riskLevel).toBe('CRITICAL');
        expect(result.trustMultiplier).toBe(0.2);
      });
    });
  });

  describe('Trust Multiplier Calculation', () => {
    it('trustMultiplier giảm theo risk level tăng', () => {
      const boundaries = [0, 25, 50, 69, 70, 90, 100];
      const expectedMultipliers = [1.0, 1.0, 0.8, 0.5, 0.2, 0.2, 0.2];

      boundaries.forEach((score, index) => {
        const result = computeRiskLevelAndMultiplier(score);
        expect(result.trustMultiplier).toBe(expectedMultipliers[index]);
      });
    });

    it('HIGH và CRITICAL có cùng trustMultiplier = 0.2', () => {
      const highResult = computeRiskLevelAndMultiplier(85);
      const criticalResult = computeRiskLevelAndMultiplier(95);

      expect(highResult.trustMultiplier).toBe(0.2);
      expect(criticalResult.trustMultiplier).toBe(0.2);
    });
  });

  describe('Edge Cases', () => {
    it('xử lý riskScore = 0', () => {
      const result = computeRiskLevelAndMultiplier(0);
      expect(result.riskLevel).toBe('SAFE');
      expect(result.trustMultiplier).toBe(1.0);
    });

    it('xử lý negative riskScore', () => {
      const result = computeRiskLevelAndMultiplier(-10);
      expect(result.riskLevel).toBe('SAFE');
      expect(result.trustMultiplier).toBe(1.0);
    });

    it('xử lý very large riskScore', () => {
      const result = computeRiskLevelAndMultiplier(999999);
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.trustMultiplier).toBe(0.2);
    });
  });
});
