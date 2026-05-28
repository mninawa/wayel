/** Session storage for warehouse Google auth. */
export const OPS_TOKEN_STORAGE = 'weyell.ops.accessToken';
export const OPS_USER_STORAGE = 'weyell.ops.user';
export const OPS_EXPIRES_STORAGE = 'weyell.ops.expiresAtUtc';

export interface StoredOpsUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  regions?: string[];
}

/** True when the ops JWT or stored expiry indicates the session is no longer valid. */
export function isOpsAccessTokenExpired(token: string | null, expiresAtUtc?: string | null): boolean {
  if (!token?.trim()) {
    return true;
  }

  if (expiresAtUtc) {
    const expiresMs = Date.parse(expiresAtUtc);
    if (!Number.isNaN(expiresMs) && expiresMs <= Date.now() + 30_000) {
      return true;
    }
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true;
    }
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000 <= Date.now() + 30_000;
    }
  } catch {
    return true;
  }

  return false;
}

export function getStoredOpsExpiresAtUtc(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(OPS_EXPIRES_STORAGE);
}

export function getStoredOpsToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const token = sessionStorage.getItem(OPS_TOKEN_STORAGE);
  const expiresAtUtc = getStoredOpsExpiresAtUtc();
  if (isOpsAccessTokenExpired(token, expiresAtUtc)) {
    return null;
  }
  return token;
}

export function getStoredOpsUser(): StoredOpsUser | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(OPS_USER_STORAGE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredOpsUser;
  } catch {
    return null;
  }
}

export function storeOpsAuth(token: string, user: StoredOpsUser, expiresAtUtc?: string): void {
  sessionStorage.setItem(OPS_TOKEN_STORAGE, token);
  sessionStorage.setItem(OPS_USER_STORAGE, JSON.stringify(user));
  if (expiresAtUtc) {
    sessionStorage.setItem(OPS_EXPIRES_STORAGE, expiresAtUtc);
  }
}

export function clearStoredOpsAuth(): void {
  sessionStorage.removeItem(OPS_TOKEN_STORAGE);
  sessionStorage.removeItem(OPS_USER_STORAGE);
  sessionStorage.removeItem(OPS_EXPIRES_STORAGE);
}

/** Remove stale ops session when token expired but user record remains. */
export function purgeExpiredOpsAuth(): void {
  if (typeof sessionStorage === 'undefined') return;
  const token = sessionStorage.getItem(OPS_TOKEN_STORAGE);
  const expiresAtUtc = getStoredOpsExpiresAtUtc();
  if (token && isOpsAccessTokenExpired(token, expiresAtUtc)) {
    clearStoredOpsAuth();
  }
}
