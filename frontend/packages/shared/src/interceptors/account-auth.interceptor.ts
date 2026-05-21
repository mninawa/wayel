import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import { AccountSessionService } from '../services/account-session.service';

/**
 * URLs whose body is meant to be unauthenticated (login, register). Even if a
 * stale token sits in localStorage we don't forward it on these — let the
 * server respond as if it were a fresh request. Both the legacy Phase0
 * `/api/accounts/*` paths and the live `/api/v1/auth/*` paths are listed so
 * `useMock` can flip without touching this file.
 */
const SKIP_PATHS: ReadonlyArray<string> = [
  '/api/accounts/register',
  '/api/accounts/login',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/sso/google',
  '/api/v1/auth/refresh',
];

function isApiRequest(url: string, base: string): boolean {
  if (base && url.startsWith(base)) return true;
  return url.includes('/api/');
}

function shouldSkip(url: string): boolean {
  return SKIP_PATHS.some((p) => url.includes(p));
}

/**
 * External-client auth interceptor: stamps `Authorization: Bearer <token>`
 * on every API request when the user is signed in. Pair with
 * `AccountSessionService` (which owns the token).
 */
export const accountAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(AccountSessionService);
  const base = inject(PLATFORM_API_URL);
  const token = session.getSessionToken();
  if (!token || !isApiRequest(req.url, base) || shouldSkip(req.url)) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
