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
  | 'MINIMUM_RAISED_NOT_MET'
  | 'MAX_WITHDRAWAL_EXCEEDED'
  | 'DUPLICATE_BENEFICIARY_PENDING'
  | 'REQUEST_EXPIRED'
  | 'ALREADY_SIGNED'
  | 'INTERNAL_ERROR'
  | 'GUEST_SESSION_NOT_FOUND'
  | 'GUEST_SESSION_NOT_ACTIVE'
  | 'GUEST_SESSION_EXPIRED'
  | 'GUEST_DONATION_QUOTA_EXCEEDED'
  | 'GUEST_AMOUNT_LIMIT_EXCEEDED'
  | 'INVALID_CALLDATA'
  | 'DUPLICATE_USEROP'
  | 'GUEST_TOKEN_REQUIRED'
  | 'GUEST_TOKEN_INVALID'
  | 'GUEST_SESSION_REQUIRED'
  | 'GUEST_RENEWAL_LIMIT_EXCEEDED'
  | 'GUEST_SESSION_RATE_LIMIT_EXCEEDED'
  | 'GUEST_DONATION_RATE_LIMIT_EXCEEDED'
  | 'INVALID_WALLET_ADDRESS'
  | 'INVALID_FINGERPRINT';

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

