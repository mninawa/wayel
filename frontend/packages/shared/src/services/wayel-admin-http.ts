import { readStoredAccountAccessToken } from './account-session.service';
import { readStoredPlatformAccessToken } from './platform-session.service';

/**
 * Shared fetch helper for the REMOVED API surface
 * (`/api/v1/...`). Centralizes auth (cookie credentials), default
 * headers, and ProblemDetails-style error parsing so each
 * `WayelAdmin*Service` doesn't have to re-implement it.
 *
 * Errors are surfaced as {@link WayelAdminHttpError} so call sites can
 * branch on `.status` (e.g. show a "no permission" banner on 403) and
 * `.code` (server-side error tag like `partnership.duplicate`).
 */
export interface WayelAdminHttpError extends Error {
  status: number;
  code?: string;
}

const baseHeaders: HeadersInit = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * For raw `fetch` callers — same token {@link platformAuthInterceptor} adds
 * for HttpClient. Reads the REMOVED's `sessionStorage` bearer first
 * (super-admins / institution-users coming through REMOVED), then
 * falls back to the customer-portal's `localStorage` account-session
 * bearer. The fallback covers staff who sign into customer-portal via the
 * regular `/login` path and then drill into a workspace surface — without
 * it those calls go out anonymously and the BFF gate returns **HTTP 401**
 * even though the SPA holds a valid token.
 */
export function platformBearerAuthHeaders(): Record<string, string> {
  const t = readStoredPlatformAccessToken() ?? readStoredAccountAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Read the BFF's non-HttpOnly `XSRF-TOKEN` cookie. Returns `null` outside
 * a browser context (e.g. SSR / unit tests) or when the cookie hasn't
 * been issued yet — callers will then send the request without the
 * header and the BFF will reject it, surfacing the CSRF error to the UI.
 */
function readXsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='));
  if (!match) return null;
  return decodeURIComponent(match.slice('XSRF-TOKEN='.length));
}

export async function wayelAdminFetch<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  // The admin BFF runs `BffAntiforgeryMiddleware`, which rejects any
  // state-changing call under `/api/...` that doesn't echo the
  // `XSRF-TOKEN` cookie back as the `X-XSRF-TOKEN` header (double-submit
  // pattern). Angular's HttpClient handles that automatically, but this
  // helper uses raw `fetch`, so we have to read the cookie and inject
  // the header ourselves on every non-safe method.
  const method = (init.method ?? 'GET').toUpperCase();
  const xsrfHeader: Record<string, string> = {};
  if (!SAFE_METHODS.has(method)) {
    const xsrf = readXsrfCookie();
    if (xsrf) {
      xsrfHeader['X-XSRF-TOKEN'] = xsrf;
    }
  }

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...baseHeaders,
      ...platformBearerAuthHeaders(),
      ...xsrfHeader,
      ...(init.headers ?? {}),
    },
  });

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  let detail = `Request failed with HTTP ${response.status}.`;
  let code: string | undefined;
  try {
    const payload = (await response.json()) as {
      title?: string;
      detail?: string;
      type?: string;
      code?: string;
      error?: string;
    };
    detail = payload.detail || payload.title || detail;
    if (payload.code) {
      code = payload.code;
    } else if (payload.error) {
      code = payload.error;
    } else if (payload.title && payload.title.includes('.')) {
      code = payload.title;
    } else if (payload.type) {
      const marker = '/errors/';
      const idx = payload.type.indexOf(marker);
      code = idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
    }
  } catch {
    // Body wasn't JSON — keep the default detail.
  }

  const err = new Error(detail) as WayelAdminHttpError;
  err.status = response.status;
  err.code = code;
  throw err;
}
