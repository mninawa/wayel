import { Injectable, computed, signal } from '@angular/core';

const FLAG_KEY = 'nk_platform_session_v1';
/** Exported for fetch-based API clients that cannot use HttpInterceptors. */
export const PLATFORM_ACCESS_TOKEN_STORAGE_KEY = 'nk_platform_access_token_v1';
const TOKEN_KEY = PLATFORM_ACCESS_TOKEN_STORAGE_KEY;
const USER_KEY = 'nk_platform_session_user_v1';

/** Bearer persisted by password / token sign-in — same backing store as {@link PlatformSessionService#getAccessToken}. */
export function readStoredPlatformAccessToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const t = sessionStorage.getItem(TOKEN_KEY)?.trim();
  return t || null;
}

/**
 * High-level role for someone signed into the REMOVED.
 *
 *   - `super_admin`: Wayel platform operator. Sees every tenant, every
 *     platform user, the audit log, etc.
 *   - `support`: Wayel support staff. Same UI as `super_admin` for now,
 *     but represented as a distinct role so we can lock down destructive
 *     actions later (e.g. "support cannot delete tenants").
 *   - `institution_user`: Tenant-side staff (admin / manager / etc.) who
 *     signs into the REMOVED to manage *their* institution. They are
 *     scoped to a single `homeTenantId` and cannot reach platform-wide
 *     pages like `/tenants` (catalogue), `/users`, or `/audit`.
 */
export type PlatformSessionRole = 'super_admin' | 'support' | 'institution_user';

/**
 * Identity attached to the active platform session.
 *
 * Persisted to `sessionStorage` so a page reload doesn't kick the user
 * out, but cleared when the browser tab closes (matching the existing
 * `signedIn` flag's storage strategy).
 */
export interface PlatformSessionUser {
  id: string;
  email: string;
  displayName: string;
  role: PlatformSessionRole;
  /** When set, the user is bound to one institution (institution_user). */
  homeTenantId: string | null;
  homeTenantName: string | null;
}

/**
 * Platform operator session: signed-in flag, optional bearer token, and
 * the identity of whoever is currently using the REMOVED.
 *
 * Replace with full JWT refresh + claims-based identity once the backend
 * issues real platform-side tokens.
 */
@Injectable({ providedIn: 'root' })
export class PlatformSessionService {
  private readonly _signedIn = signal(this.readSignedIn());
  private readonly _user = signal<PlatformSessionUser | null>(this.readUser());

  /** Read-only signal wrappers for templates / computed callers. */
  readonly signedIn = this._signedIn.asReadonly();
  readonly currentUser = this._user.asReadonly();

  /** True when the active user has a super-user role (admin or support). */
  readonly isSuperUser = computed(() => {
    const u = this._user();
    return u?.role === 'super_admin' || u?.role === 'support';
  });

  /** True when the active user is bound to a single institution. */
  readonly isInstitutionUser = computed(
    () => this._user()?.role === 'institution_user',
  );

  isSignedIn(): boolean {
    return this._signedIn();
  }

  /** Bearer token for `Authorization` on platform API calls (when set). */
  getAccessToken(): string | null {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_KEY);
  }

  /**
   * Persist (or clear, when blank) the bearer token used by the
   * platform-auth interceptor. Separated from the `signInAs*` methods
   * so a live login can do `setAccessToken` + `signInAsSuperUser`
   * without coupling the token-storage policy into every sign-in
   * variant.
   */
  setAccessToken(accessToken: string | null): void {
    if (typeof sessionStorage === 'undefined') return;
    const t = (accessToken ?? '').trim();
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  /**
   * Sign in as a Wayel super-user (platform admin / support). Persists
   * the identity so the shell can show it after a reload.
   */
  signInAsSuperUser(user: {
    id: string;
    email: string;
    displayName: string;
    role: 'super_admin' | 'support';
  }): void {
    this.persistSession({
      ...user,
      homeTenantId: null,
      homeTenantName: null,
    });
  }

  /**
   * Sign in as a tenant-side institution user. The home tenant scopes
   * the session to a single workspace.
   */
  signInAsInstitutionUser(user: {
    id: string;
    email: string;
    displayName: string;
    homeTenantId: string;
    homeTenantName: string;
  }): void {
    this.persistSession({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: 'institution_user',
      homeTenantId: user.homeTenantId,
      homeTenantName: user.homeTenantName,
    });
  }

  /**
   * Legacy mock sign-in (no identity). Kept for backward compatibility
   * with code paths that still call the old API; sets a synthetic
   * "Demo super-admin" identity so the shell has *something* to render.
   */
  signIn(): void {
    this.signInAsSuperUser({
      id: 'user_platform_demo',
      email: 'demo@wayel.example',
      displayName: 'Demo super-admin',
      role: 'super_admin',
    });
  }

  /** Sign in with API access token (live mode). */
  signInWithToken(accessToken: string): void {
    const t = accessToken.trim();
    if (typeof sessionStorage !== 'undefined') {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
    }
    this.signIn();
  }

  signOut(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(FLAG_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
    this._signedIn.set(false);
    this._user.set(null);
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private persistSession(user: PlatformSessionUser): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(FLAG_KEY, '1');
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    this._user.set(user);
    this._signedIn.set(true);
  }

  private readSignedIn(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    if (sessionStorage.getItem(FLAG_KEY) === '1') return true;
    const tok = sessionStorage.getItem(TOKEN_KEY);
    return !!tok && tok.length > 0;
  }

  private readUser(): PlatformSessionUser | null {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PlatformSessionUser;
      if (
        typeof parsed?.id === 'string' &&
        typeof parsed?.email === 'string' &&
        (parsed.role === 'super_admin' ||
          parsed.role === 'support' ||
          parsed.role === 'institution_user')
      ) {
        return parsed;
      }
    } catch {
      /* fall-through */
    }
    return null;
  }
}
