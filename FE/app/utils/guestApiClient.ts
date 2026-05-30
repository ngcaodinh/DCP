/**
 * API Client cho Guest Wallet endpoints.
 * Mục đích: cung cấp interface type-safe để gọi các guest session APIs từ frontend.
 * Tất cả các methods đều throw typed errors (ApiErrorResponse) khi có lỗi.
 */
import { buildApiUrl, fetchApi, ApiErrorResponse } from './apiClient';

/* ============================================================
 * REQUEST / RESPONSE TYPES
 * ============================================================ */

/**
 * Payload tạo guest session từ frontend.
 */
export interface CreateGuestSessionRequest {
  walletAddress: string;
  deviceFingerprintHash: string;
}

/**
 * Response khi tạo guest session thành công.
 */
export interface CreateGuestSessionResponse {
  sessionId: string;
  guestSessionToken: string;
  expiresAt: string;
  serverSalt: string;
  donationQuota: number;
}

/**
 * Payload refresh guest session.
 */
export interface RefreshGuestSessionRequest {
  sessionId: string;
  guestSessionToken: string;
}

/**
 * Response khi refresh guest session thành công.
 */
export interface RefreshGuestSessionResponse {
  guestSessionToken: string;
  expiresAt: string;
  renewalCount: number;
}

/**
 * Response lấy trạng thái guest session.
 */
export interface GuestSessionStatusResponse {
  sessionId: string;
  walletAddress: string;
  status: string;
  donationCount: number;
  totalDonatedAmount: number;
  expiresAt: string;
  remainingDonations: number;
}

/**
 * Payload yêu cầu sponsor Paymaster.
 * @remarks unsignedUserOp chứa đầy đủ fields theo ZeroDev/Kernel spec.
 */
export interface RequestPaymasterSponsorshipRequest {
  unsignedUserOp: {
    sender: string;
    nonce: string | number;
    initCode: string;
    callData: string;
    callGasLimit?: string | number;
    verificationGasLimit?: string | number;
    preVerificationGas?: string | number;
    maxFeePerGas?: string | number;
    maxPriorityFeePerGas?: string | number;
    paymasterAndData?: string;
    signature?: string;
  };
  projectId: string;
  amount: number;
  sessionId: string;
}

/**
 * Response khi sponsor Paymaster thành công.
 */
export interface RequestPaymasterSponsorshipResponse {
  paymasterAndData: string;
  userOpHash: string;
  sponsorshipId: string;
  paymasterType: 'FREE' | 'TOKEN';
  paymasterSponsoredGas: boolean;
  trustMultiplier: number;
  riskScore: number;
  gasChargeAmount?: number;
  gasChargeWarning?: boolean;
}

/**
 * Payload prepare claim — gọi khi user đã đăng nhập và muốn claim guest wallet.
 * @remarks Auth: registered user JWT (authToken), không phải guestSessionToken.
 */
export interface PrepareClaimRequest {
  guestSessionToken: string;
  guestWalletAddress: string;
  authToken: string;
}

/**
 * Response từ prepare claim endpoint.
 */
export interface PrepareClaimResponse {
  claimEOAAddress: string;
  claimNonce: string;
}

/**
 * Payload execute claim — gọi sau khi client đã ký UserOp bằng guest owner key.
 * @remarks Auth: registered user JWT (authToken).
 */
export interface ExecuteClaimRequest {
  guestSessionToken: string;
  guestWalletAddress: string;
  authToken: string;
  claimNonce: string;
  signedUserOp: string;
}

/**
 * Response từ execute claim endpoint.
 */
export interface ExecuteClaimResponse {
  changeOwnerTxHash: string;
  claimId: string;
  claimType: 'NEW_ACCOUNT' | 'EXISTING_ACCOUNT' | 'PARTIAL_CLAIM';
  donatedCount: number;
}

/**
 * Response trạng thái pending donation cho Frontend Sweeper.
 */
export interface PendingDonationStatusResponse {
  hasPendingDonation: boolean;
  pendingAmount?: number;
  pendingProjectId?: string;
}

/* ============================================================
 * ERROR MAPPING — HTTP Code → Typed Error
 * ============================================================ */

/**
 * Danh sách mã lỗi có thể nhận từ guest endpoints.
 * Dùng cho typed error handling ở caller.
 */
export type GuestApiErrorCode =
  | 'INVALID_WALLET_ADDRESS'
  | 'INVALID_FINGERPRINT'
  | 'GUEST_SESSION_LIMIT_EXCEEDED'
  | 'GUEST_SESSION_NOT_FOUND'
  | 'GUEST_SESSION_EXCEEDED'
  | 'GUEST_SESSION_NOT_ACTIVE'
  | 'GUEST_DONATION_QUOTA_EXCEEDED'
  | 'GUEST_AMOUNT_LIMIT_EXCEEDED'
  | 'GUEST_DONATION_RATE_LIMIT_EXCEEDED'
  | 'INVALID_CALLDATA'
  | 'DUPLICATE_USEROP'
  | 'PAYMASTER_POLICY_MISMATCH'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'GUEST_TOKEN_REQUIRED'
  | 'GUEST_TOKEN_INVALID'
  | 'GUEST_SESSION_REQUIRED'
  | 'GUEST_RENEWAL_LIMIT_EXCEEDED'
  | 'GUEST_SESSION_RATE_LIMIT_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR'
  | 'INVALID_RESPONSE';

/**
 * Error wrapper cho guest API errors.
 * Khi API trả lỗi, method sẽ throw instance này.
 */
export class GuestApiError extends Error {
  public readonly statusCode: number;

  public readonly errorCode: GuestApiErrorCode;

  public readonly details?: Array<{ field: string; message: string }>;

  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.name = 'GuestApiError';
    this.statusCode = response.statusCode ?? 500;
    this.errorCode = (response.errorCode as GuestApiErrorCode) ?? 'UNKNOWN_ERROR';
    this.details = response.details;
  }
}

/**
 * Helper unwrap API result — throw GuestApiError khi fail.
 */
function unwrap<T>(promise: Promise<{ success: true; data: T }>): Promise<T> {
  return promise.then((response) => {
    if (!response.success) {
      throw new GuestApiError({
        success: false,
        message: 'Phản hồi API không hợp lệ.',
        errorCode: 'INVALID_RESPONSE',
        statusCode: 500
      });
    }
    return response.data;
  });
}

/* ============================================================
 * API METHODS
 * ============================================================ */

/**
 * Tạo guest session mới.
 * Endpoint: POST /api/guest/session
 *
 * @param payload - walletAddress (EIP-55) và deviceFingerprintHash (SHA-256 hex)
 * @returns Thông tin session, JWT token, serverSalt, và donation quota
 * @throws GuestApiError khi validate thất bại hoặc rate limit
 */
export async function createGuestSession(
  payload: CreateGuestSessionRequest
): Promise<CreateGuestSessionResponse> {
  return unwrap(
    fetchApi<CreateGuestSessionResponse>(buildApiUrl('/api/guest/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

/**
 * Refresh guest session token.
 * Endpoint: POST /api/guest/session/refresh
 *
 * @param payload - sessionId và guestSessionToken
 * @returns Token mới và expiry time
 * @throws GuestApiError khi session hết hạn hoặc vượt renewal limit
 */
export async function refreshGuestSession(
  payload: RefreshGuestSessionRequest
): Promise<RefreshGuestSessionResponse> {
  return unwrap(
    fetchApi<RefreshGuestSessionResponse>(buildApiUrl('/api/guest/session/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payload.guestSessionToken}`
      },
      body: JSON.stringify({ sessionId: payload.sessionId })
    })
  );
}

/**
 * Lấy trạng thái hiện tại của guest session.
 * Endpoint: GET /api/guest/session/status
 *
 * @param token - guestSessionToken (Bearer)
 * @returns Trạng thái session, số donation đã thực hiện, số donation còn lại
 * @throws GuestApiError khi session không hợp lệ hoặc đã hết hạn
 */
export async function getGuestSessionStatus(token: string): Promise<GuestSessionStatusResponse> {
  return unwrap(
    fetchApi<GuestSessionStatusResponse>(buildApiUrl('/api/guest/session/status'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
  );
}

/**
 * Yêu cầu Paymaster sponsorship cho guest donation.
 * Endpoint: POST /api/guest/paymaster/sponsor
 *
 * @param payload - unsignedUserOp, projectId, amount, sessionId
 * @param token - guestSessionToken (Bearer)
 * @returns Paymaster data để sign và submit UserOp
 * @throws GuestApiError khi quota hết, amount vượt limit, hoặc Paymaster reject
 */
export async function requestPaymasterSponsorship(
  payload: RequestPaymasterSponsorshipRequest,
  token: string
): Promise<RequestPaymasterSponsorshipResponse> {
  return unwrap(
    fetchApi<RequestPaymasterSponsorshipResponse>(buildApiUrl('/api/guest/paymaster/sponsor'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
  );
}

/**
 * Prepare claim — bước 1 của Keyless Claim flow.
 * Endpoint: POST /api/guest/claim/prepare
 *
 * @param payload - guestSessionToken (để xác minh guest wallet ownership) và
 *                 authToken (registered user JWT để authorize claim action)
 * @returns claimEOAAddress (backend-generated EOA) và claimNonce (TTL 10 phút)
 * @throws GuestApiError khi user chưa đăng nhập hoặc guest session không hợp lệ
 */
export async function prepareGuestClaim(
  payload: PrepareClaimRequest
): Promise<PrepareClaimResponse> {
  return unwrap(
    fetchApi<PrepareClaimResponse>(buildApiUrl('/api/guest/claim/prepare'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payload.authToken}`
      },
      body: JSON.stringify({
        guestSessionToken: payload.guestSessionToken,
        guestWalletAddress: payload.guestWalletAddress
      })
    })
  );
}

/**
 * Execute claim — bước 2 của Keyless Claim flow.
 * Endpoint: POST /api/guest/claim/execute
 *
 * @param payload - guestSessionToken, guestWalletAddress, authToken,
 *                 claimNonce (từ prepareClaim), signedUserOp (đã ký bằng guest owner key)
 * @returns changeOwnerTxHash, claimId, claimType, donatedCount
 * @throws GuestApiError khi nonce hết hạn hoặc transaction thất bại
 */
export async function executeGuestClaim(
  payload: ExecuteClaimRequest
): Promise<ExecuteClaimResponse> {
  return unwrap(
    fetchApi<ExecuteClaimResponse>(buildApiUrl('/api/guest/claim/execute'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payload.authToken}`
      },
      body: JSON.stringify({
        guestSessionToken: payload.guestSessionToken,
        guestWalletAddress: payload.guestWalletAddress,
        claimNonce: payload.claimNonce,
        signedUserOp: payload.signedUserOp
      })
    })
  );
}

/**
 * Lấy trạng thái pending donation (Frontend Sweeper).
 * Endpoint: GET /api/guest/pending-donation
 *
 * @param token - guestSessionToken (Bearer)
 * @returns Trạng thái pending donation để hiển thị resume modal
 * @throws GuestApiError khi session không hợp lệ
 */
export async function getPendingDonationStatus(
  token: string
): Promise<PendingDonationStatusResponse> {
  return unwrap(
    fetchApi<PendingDonationStatusResponse>(buildApiUrl('/api/guest/pending-donation'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
  );
}

/**
 * Xóa flag pending donation sau khi đã resume thành công.
 * Endpoint: POST /api/guest/pending-donation/clear
 *
 * @param token - guestSessionToken (Bearer)
 * @throws GuestApiError khi session không hợp lệ
 */
export async function clearPendingDonation(token: string): Promise<void> {
  const response = await fetchApi<Record<string, never>>(
    buildApiUrl('/api/guest/pending-donation/clear'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  void response;
}
