// Ghi chú: Định nghĩa cấu trúc phiên đăng nhập lưu trong trình duyệt.

export const authenticationSessionUpdatedEventName = "dcpAuthSessionUpdated";

export type AuthenticationSessionPayload = {
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
  refreshSessionId?: string;
  refreshTokenExpiresAt?: string;
};

const accessTokenStorageKey = "dcpAccessToken";
const refreshTokenStorageKey = "dcpRefreshToken";
const csrfTokenStorageKey = "dcpCsrfToken";
const refreshSessionStorageKey = "dcpRefreshSessionId";
const refreshTokenExpiresAtStorageKey = "dcpRefreshTokenExpiresAt";

// Ghi chú: Lưu thông tin đăng nhập vào localStorage theo chuẩn hệ thống.
export function persistAuthSession(payload: AuthenticationSessionPayload): void {
  if (payload.accessToken) {
    window.localStorage.setItem(accessTokenStorageKey, payload.accessToken);
  }

  if (payload.refreshToken) {
    window.localStorage.setItem(refreshTokenStorageKey, payload.refreshToken);
  }

  if (payload.csrfToken) {
    window.localStorage.setItem(csrfTokenStorageKey, payload.csrfToken);
  }

  if (payload.refreshSessionId) {
    window.localStorage.setItem(refreshSessionStorageKey, payload.refreshSessionId);
  }

  if (payload.refreshTokenExpiresAt) {
    window.localStorage.setItem(refreshTokenExpiresAtStorageKey, payload.refreshTokenExpiresAt);
  }

  window.dispatchEvent(new Event(authenticationSessionUpdatedEventName));
}

// Ghi chú: Đọc thông tin phiên từ localStorage để phục vụ refresh token.
export function readAuthSession(): AuthenticationSessionPayload {
  return {
    accessToken: window.localStorage.getItem(accessTokenStorageKey) || "",
    refreshToken: window.localStorage.getItem(refreshTokenStorageKey) || "",
    csrfToken: window.localStorage.getItem(csrfTokenStorageKey) || "",
    refreshSessionId: window.localStorage.getItem(refreshSessionStorageKey) || "",
    refreshTokenExpiresAt: window.localStorage.getItem(refreshTokenExpiresAtStorageKey) || ""
  };
}

// Ghi chú: Xóa thông tin phiên khi refresh thất bại hoặc đăng xuất.
export function clearAuthSession(): void {
  window.localStorage.removeItem(accessTokenStorageKey);
  window.localStorage.removeItem(refreshTokenStorageKey);
  window.localStorage.removeItem(csrfTokenStorageKey);
  window.localStorage.removeItem(refreshSessionStorageKey);
  window.localStorage.removeItem(refreshTokenExpiresAtStorageKey);

  window.dispatchEvent(new Event(authenticationSessionUpdatedEventName));
}

