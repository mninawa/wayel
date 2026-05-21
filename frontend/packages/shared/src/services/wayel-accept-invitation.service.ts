import { Injectable } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';

/**
 * Posts the post-SSO acceptance call against the new Wayel.Api surface
 * (`POST /api/v1/staff-invitations/accept`), proxied through whichever BFF
 * the host SPA is wired against.
 *
 * Design notes:
 *
 *   - We use `fetch` (not `HttpClient`) for the same reason the admin
 *     `WayelInvitationsService` does: the shared `httpErrorInterceptor`
 *     bounces on every 401, but the accept page wants to *show* a 401 as
 *     "you need to sign in first, redirecting to Google…" rather than
 *     dropping the token on the floor.
 *
 *   - `credentials: 'include'` rides the BFF cookie. The BFF then mints a
 *     JWT and forwards the call to the API.
 *
 *   - The BFF's antiforgery middleware requires `X-XSRF-TOKEN` for every
 *     state-changing request — see `bffStateChangingHeaders()` for the
 *     double-submit dance.
 *
 *   - We deliberately keep this service in the shared package (rather than
 *     duplicating it per portal) so that audience-specific UIs all see the
 *     same response codes and error shape.
 */
export interface WayelAcceptInvitationResult {
  invitationId: string;
  email: string;
  role: string;
  acceptedOnUtc: string;
}

/**
 * Domain-shaped error so callers can branch on `code` ("invitation.expired",
 * "invitation.email_mismatch", "invitation.authentication_required", etc.)
 * without parsing free-form strings.
 */
export interface WayelAcceptInvitationError extends Error {
  status: number;
  code?: string;
}

/**
 * Anonymous invitation preview, returned by
 * <c>GET /api/v1/staff-invitations/preview?token=...</c>. Used by the
 * accept page so we can show "you're joining X as Staff" without
 * forcing a sign-in first.
 */
export interface WayelInvitationPreview {
  invitationId: string;
  email: string;
  role: string;
  channel: string;
  expiresOnUtc: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  /** "Pending" | "Expired" | "Accepted" | "Revoked" */
  status: string;
}

/**
 * Result of accepting via the password flow. Mirrors the API's
 * <c>AuthSession</c> shape — same fields the BFF would have surfaced
 * via the cookie session, but here we just consume it locally and
 * navigate to the workspace home.
 */
export interface WayelAcceptInvitationWithPasswordResult {
  accessToken: string;
  accessTokenExpiresOnUtc: string;
  refreshToken: string;
  refreshTokenExpiresOnUtc: string;
  sessionId: string;
  userId: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: string;
}

const ACCEPT_PATH = '/api/v1/staff-invitations/accept';
const PREVIEW_PATH = '/api/v1/staff-invitations/preview';
// Routed through the BFF wrapper (`/bff/invitations/accept-password`)
// rather than directly at the API: the wrapper sets the BFF cookie
// session on success, so the SPA's next call to /api/v1/... is
// authenticated via the relay middleware. Hitting the API path
// directly would still create the user but leave the SPA in a
// half-signed-in state where every API call 401s.
const ACCEPT_PASSWORD_PATH = '/bff/invitations/accept-password';

@Injectable({ providedIn: 'root' })
export class WayelAcceptInvitationService {
  /**
   * Sends the token to the API. Returns the acceptance result on success.
   * On failure throws a `WayelAcceptInvitationError` carrying the API's
   * `code` so callers can map known cases ("expired", "email_mismatch",
   * "authentication_required") to specific UI copy.
   */
  async accept(token: string): Promise<WayelAcceptInvitationResult> {
    const response = await fetch(ACCEPT_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...bffStateChangingHeaders(),
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      const text = await response.text();
      return text
        ? (JSON.parse(text) as WayelAcceptInvitationResult)
        : ({ invitationId: '', email: '', role: '', acceptedOnUtc: '' });
    }

    throw await toError(response);
  }

  /**
   * Anonymous "what is this token?" lookup. Used by the accept page so
   * we can show the recipient's email + tenant name *before* asking
   * them to sign in or set a password. Returns `null` when the token
   * is missing/invalid (we treat 4xx as "no preview" rather than an
   * error so the page can fall back gracefully — domain-specific 4xx
   * codes still fail the actual accept call later).
   */
  async preview(token: string): Promise<WayelInvitationPreview | null> {
    const url = `${PREVIEW_PATH}?token=${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const text = await response.text();
      return text ? (JSON.parse(text) as WayelInvitationPreview) : null;
    }

    if (response.status >= 400 && response.status < 500) {
      return null;
    }

    throw await toError(response);
  }

  /**
   * Accept the invitation by setting a brand-new password. Anonymous —
   * no cookie, no XSRF (the BFF middleware bypasses this path).
   * Throws `WayelAcceptInvitationError` for every non-2xx response so
   * the accept page can branch on the same `code` shape it already
   * uses for the SSO path.
   */
  async acceptWithPassword(
    token: string,
    password: string,
    displayName: string | null,
  ): Promise<WayelAcceptInvitationWithPasswordResult> {
    const response = await fetch(ACCEPT_PASSWORD_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, displayName: displayName || null }),
    });

    if (response.ok) {
      const text = await response.text();
      return JSON.parse(text) as WayelAcceptInvitationWithPasswordResult;
    }

    throw await toError(response);
  }
}

/**
 * Shared error-shape mapper for the three accept-related calls.
 * Wayel.Api maps `Error.Code` (e.g. "invitation.email_mismatch") onto
 * ProblemDetails.title, with the same value also encoded into `type`
 * as `https://wayel.dev/errors/<code>`. We prefer the explicit `code`
 * field when present, then `title` (which is exactly the code), then
 * strip the prefix off `type` as a last-ditch fallback.
 */
async function toError(response: Response): Promise<WayelAcceptInvitationError> {
  let detail = `Acceptance failed with HTTP ${response.status}.`;
  let code: string | undefined;
  try {
    const payload = (await response.json()) as {
      title?: string;
      detail?: string;
      code?: string;
      type?: string;
    };
    detail = payload.detail || payload.title || detail;
    if (payload.code) {
      code = payload.code;
    } else if (payload.title && payload.title.includes('.')) {
      code = payload.title;
    } else if (payload.type) {
      const marker = '/errors/';
      const idx = payload.type.indexOf(marker);
      code = idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
    }
  } catch {
    // Body wasn't JSON — fall back to the default.
  }

  const err = new Error(detail) as WayelAcceptInvitationError;
  err.status = response.status;
  err.code = code;
  return err;
}

/**
 * Centralised storage key for the in-flight invitation token.
 *
 * The acceptance flow is "open the link → bounce to Google → come back".
 * The token therefore needs to survive a full document navigation. We use
 * `sessionStorage` (not `localStorage`) so it's automatically scoped to
 * the tab and gets purged when the user closes it.
 */
export const NOREX_INVITATION_TOKEN_STORAGE_KEY = 'wayel.invitation.pending_token';

export function rememberPendingInvitationToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(NOREX_INVITATION_TOKEN_STORAGE_KEY, token);
  } catch {
    // Private browsing on iOS occasionally throws on sessionStorage writes.
    // Losing the token just means the user has to click the link again
    // post-login — annoying but not broken.
  }
}

export function consumePendingInvitationToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = window.sessionStorage.getItem(NOREX_INVITATION_TOKEN_STORAGE_KEY);
    if (token) {
      window.sessionStorage.removeItem(NOREX_INVITATION_TOKEN_STORAGE_KEY);
    }
    return token;
  } catch {
    return null;
  }
}
