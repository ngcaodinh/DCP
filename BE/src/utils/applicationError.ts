export type ApplicationErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'ACTIVE_PROJECT_LIMIT_EXCEEDED'
  | 'CHAIN_MISMATCH'
  | 'TRANSACTION_TIMEOUT'
  | 'TRANSACTION_REVERTED'
  | 'EVENT_NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_NOT_ACTIVE'
  | 'AMOUNT_INVALID'
  | 'UNAUTHORIZED_RELAYER'
  | 'CONTRACT_REVERTED'
  | 'SMART_ACCOUNT_MISMATCH'
  | 'INSUFFICIENT_TOKEN_BALANCE'
  | 'PAYMASTER_POLICY_MISMATCH'
  | 'INTERNAL_ERROR';

/**
 * Hàm lớp lỗi nghiệp vụ dùng chung.
 * Mục đích: chuẩn hóa mã lỗi và HTTP status cho toàn bộ ứng dụng.
 */
export class ApplicationError extends Error {
  public readonly statusCode: number;

  public readonly errorCode: ApplicationErrorCode;

  constructor(message: string, statusCode: number, errorCode: ApplicationErrorCode) {
    super(message);
    this.name = 'ApplicationError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

