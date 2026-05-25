import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ConnectivityService } from '../services/connectivity.service';
import { ToastService } from '../services/toast.service';

const SKIP_TOAST_PATHS: ReadonlyArray<string> = [
  '/api/accounts/login',
  '/api/accounts/register',
  '/api/staff-invitations/lookup/',
  '/api/platform/auth/login',
];

export interface HttpErrorInterceptorConfig {
  /** Where to send the user after a 401 (token expired / unauthorized). */
  loginUrl: string;
  /**
   * Where to send the user *first* on a 401 — the polished session-
   * expired splash page that explains what happened before handing
   * off to {@link loginUrl}. Defaults to `/session-expired`. Pass
   * `null` to opt out (the interceptor then redirects straight to
   * `loginUrl?reason=session-expired` to preserve the legacy banner
   * UX).
   */
  sessionExpiredUrl?: string | null;
  /** Optional: invoked before redirecting on 401 so callers can wipe sessions. */
  onUnauthorized?: () => void;
}

/**
 * Provided per-app via `{ provide: HTTP_ERROR_CONFIG, useFactory: () => ({...}) }`.
 *
 * The factory may safely call `inject(...)` because it runs in the root
 * injection context, exposing the app's session service to the interceptor.
 */
export const HTTP_ERROR_CONFIG = new InjectionToken<HttpErrorInterceptorConfig>(
  'HTTP_ERROR_CONFIG',
);

/**
 * Module-scoped latch: once a 401 has fired the redirect-to-login flow,
 * subsequent 401s from in-flight parallel requests are silently swallowed
 * until the navigation lands on the login page.
 *
 * Without this latch, a dashboard with N parallel API calls produces N
 * stacked "Signed out" toasts and N redirect calls — visually clumsy and
 * functionally wasteful (the second navigation kicks the first one's
 * `returnTo` query off the URL). Reset on the next pageload (the latch
 * lives at module scope and the SPA reloads on a hard navigation back to
 * `/login`).
 */
let unauthorizedHandled = false;

/**
 * `HttpInterceptorFn` that:
 *  - Toasts a friendly message on 5xx (server errors) and network failures.
 *  - On the *first* 401 of a session, invokes `onUnauthorized()` and
 *    redirects to `loginUrl?returnTo=…&reason=session-expired`. The login
 *    page renders an inline "Session expired" banner when that reason is
 *    present — no toast pile-up.
 *  - Re-throws the error so call-sites that handle it locally still can.
 *
 * Each app provides `HTTP_ERROR_CONFIG` and adds this fn to
 * `withInterceptors([httpErrorInterceptor, ...])`.
 */
export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(HTTP_ERROR_CONFIG);
  const toasts = inject(ToastService);
  const router = inject(Router);
  const connectivity = inject(ConnectivityService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);

      const skipToast = SKIP_TOAST_PATHS.some((p) => req.url.includes(p));

      if (err.status === 401) {
        const isLoginAttempt = req.url.includes('/login');
        if (!isLoginAttempt && !unauthorizedHandled) {
          unauthorizedHandled = true;
          try {
            config.onUnauthorized?.();
          } catch (e) {
            console.error('[http-error-interceptor] onUnauthorized threw', e);
          }
          // Wipe any pre-existing toasts so the login screen is clean
          // when the redirect lands. Defends against a stray toast that
          // a peer service might have raised between the first 401 and
          // the redirect landing — the banner on the login page is
          // the new single source of truth.
          toasts.clear();

          const here = router.url || '/';
          // Don't carry a returnTo when the user was already on the login
          // page — that would loop them back to /login on success. Same
          // for the auth/* cluster (accept-invite, forgot, etc) and the
          // session-expired splash itself (no point looping back to it
          // after re-auth).
          const isAuthRoute =
            here.startsWith('/login') ||
            here.startsWith('/auth/') ||
            here.startsWith('/accept') ||
            here.startsWith('/session-expired');
          const params = new URLSearchParams();
          params.set('reason', 'session-expired');
          if (!isAuthRoute && here !== '/') {
            params.set('returnTo', here);
          }

          // Prefer the polished session-expired splash; opt out by
          // passing `sessionExpiredUrl: null` to keep the legacy
          // login-banner flow.
          const target =
            config.sessionExpiredUrl === null
              ? config.loginUrl
              : (config.sessionExpiredUrl ?? '/session-expired');
          const sep = target.includes('?') ? '&' : '?';
          void router.navigateByUrl(`${target}${sep}${params.toString()}`);
        }
      } else if (err.status === 0) {
        connectivity.markServerUnreachable();
        if (!skipToast) {
          const offline =
            typeof navigator !== 'undefined' && navigator.onLine === false;
          toasts.error(
            offline
              ? 'You appear to be offline. Connect to the internet and try again.'
              : 'Could not reach the server. Check your connection and try again.',
            { title: offline ? 'No internet' : 'Network error' },
          );
        }
      } else if (err.status >= 500 && !skipToast) {
        toasts.error(
          'The server hit an unexpected error. Please try again in a moment.',
          { title: `Server error · ${err.status}` },
        );
      }

      return throwError(() => err);
    }),
  );
};

/**
 * Resets the once-per-session 401 latch. Apps call this from their
 * login-success path (or on any explicit "user is now authenticated"
 * signal) so a *future* token expiry can re-trigger the redirect flow.
 *
 * Without this, the second time a user's session expires in the same
 * browser tab the interceptor would silently swallow the 401s and the
 * SPA would just sit on a half-loaded page.
 */
export function resetHttpErrorUnauthorizedLatch(): void {
  unauthorizedHandled = false;
}
