import { Injectable, computed, signal } from '@angular/core';
import type {
  Phase0Account,
  Phase0AuthResponse,
} from '../core/contracts/accounts.phase0';

/**
 * Exported for raw-`fetch` callers that can't go through the
 * `accountAuthInterceptor` (e.g. the shared `WayelAdmin*` fetch helpers).
 * Lets those clients attach the same `Authorization: Bearer …` value the
 * Angular `HttpClient` path does for customer-portal users.
 */
export const ACCOUNT_SESSION_TOKEN_STORAGE_KEY = 'nk_account_session_v1';
const TOKEN_KEY = ACCOUNT_SESSION_TOKEN_STORAGE_KEY;
const ACCOUNT_KEY = 'nk_account_profile_v1';
const EXPIRES_KEY = 'nk_account_expires_v1';
// Optional companion to TOKEN_KEY: the refresh token issued by the live
// backend. Stored separately so older builds (mock-only, no refresh token)
// keep round-tripping cleanly.
const REFRESH_KEY = 'nk_account_refresh_v1';

/**
 * Bearer persisted by the customer-portal password / register sign-in. Used
 * by raw-`fetch` API clients (e.g. {@link platformBearerAuthHeaders}) when
 * the REMOVED sessionStorage token is absent — that's the case for
 * staff users who sign into customer-portal through the regular `/login`
 * path and then drill into a workspace surface backed by the shared admin
 * fetch helpers. Returns `null` outside a browser (SSR / unit tests) and
 * when the persisted entry is past its expiry.
 */
export function readStoredAccountAccessToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const expiresAt = localStorage.getItem(EXPIRES_KEY);
  if (expiresAt && Date.parse(expiresAt) < Date.now()) {
    return null;
  }
  const token = localStorage.getItem(TOKEN_KEY)?.trim();
  return token || null;
}

interface PersistedSession {
  account: Phase0Account;
  sessionToken: string;
  expiresAt: string;
  refreshToken?: string;
}

/**
 * Authoritative client-side store of "who is signed into customer-portal right now".
 *
 * - Persists to `localStorage` so a page reload doesn't kick the user out.
 * - Exposes signals (`currentAccount`, `isSignedIn`, `role`) the shells and
 *   guards can react to with no manual subscription bookkeeping.
 * - Used by `accountAuthInterceptor` to attach the bearer token, and by
 *   `AccountsBridgeService` to write the profile after register/login.
 */
@Injectable({ providedIn: 'root' })
export class AccountSessionService {
  private readonly _session = signal<PersistedSession | null>(this.read());

  readonly currentAccount = computed(() => this._session()?.account ?? null);
  readonly isSignedIn = computed(() => this._session() !== null);
  readonly role = computed(() => this._session()?.account.role ?? null);

  /** Bearer token for outbound requests, or `null` if signed out. */
  getSessionToken(): string | null {
    return this._session()?.sessionToken ?? null;
  }

  /**
   * Refresh token paired with the access token, when the live backend
   * issued one. `null` for mock sessions (which only mint a single opaque
   * token) and for the BFF-cookie path (where the refresh token never
   * touches the SPA).
   */
  getRefreshToken(): string | null {
    return this._session()?.refreshToken ?? null;
  }

  /** Persist the auth response and flip the signed-in signal on. */
  setSession(resp: Phase0AuthResponse): void {
    const refreshToken = (resp as Phase0AuthResponse & { refreshToken?: string })
      .refreshToken;
    const persisted: PersistedSession = {
      account: resp.account,
      sessionToken: resp.sessionToken,
      expiresAt: resp.expiresAt,
      ...(refreshToken ? { refreshToken } : {}),
    };
    this.write(persisted);
    this._session.set(persisted);
  }

  /** Refresh the cached account (e.g. after a profile change) without touching the token. */
  patchAccount(account: Phase0Account): void {
    const current = this._session();
    if (!current) return;
    const next = { ...current, account };
    this.write(next);
    this._session.set(next);
  }

  /** Sign out locally — caller is responsible for hitting the logout endpoint. */
  clear(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
      localStorage.removeItem(EXPIRES_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
    this._session.set(null);
  }

  /** Returns the home route for the currently signed-in role. */
  homeRouteForRole(): string {
    const r = this.role();
    if (r === 'staff') return '/staff/institution';
    if (r === 'parent') return '/parent/children';
    if (r === 'partner') return '/partner/events';
    return '/';
  }

  private read(): PersistedSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const accountRaw = localStorage.getItem(ACCOUNT_KEY);
      const expiresAt = localStorage.getItem(EXPIRES_KEY);
      const refreshToken = localStorage.getItem(REFRESH_KEY) ?? undefined;
      if (!token || !accountRaw || !expiresAt) return null;
      if (Date.parse(expiresAt) < Date.now()) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ACCOUNT_KEY);
        localStorage.removeItem(EXPIRES_KEY);
        localStorage.removeItem(REFRESH_KEY);
        return null;
      }
      const account = JSON.parse(accountRaw) as Phase0Account;
      return {
        account,
        sessionToken: token,
        expiresAt,
        ...(refreshToken ? { refreshToken } : {}),
      };
    } catch {
      return null;
    }
  }

  private write(s: PersistedSession): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, s.sessionToken);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s.account));
    localStorage.setItem(EXPIRES_KEY, s.expiresAt);
    if (s.refreshToken) {
      localStorage.setItem(REFRESH_KEY, s.refreshToken);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  }
}
