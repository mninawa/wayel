import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import type { Phase0AccountRole } from '@wayel/shared/core/contracts/accounts.phase0';
import { environment } from '../../environments/environment';

/**
 * Guard for protected routes in customer-portal.
 *
 * - Not signed in    → redirect to `/login` and remember where the user wanted
 *                      to go via the `next` query param.
 * - Wrong role       → redirect to the role's "home" route. We never bounce
 *                      back to `/login` for a wrong-role hit; that would be
 *                      surprising for a logged-in user.
 *
 * Usage in `app.routes.ts`:
 *   { path: 'parent', canMatch: [accountAuthGuard('parent')], ... }
 */
export const accountAuthGuard = (requiredRole?: Phase0AccountRole): CanActivateFn =>
  (_route, state): boolean | UrlTree => {
    const router = inject(Router);
    const session = inject(AccountSessionService);
    if (!session.isSignedIn()) {
      const next = state.url || '/';
      return router.createUrlTree(['/sign-in'], { queryParams: { next } });
    }
    if (requiredRole && session.role() !== requiredRole) {
      return router.createUrlTree([session.homeRouteForRole()]);
    }
    return true;
  };

/**
 * Inverse guard: keeps already-signed-in users away from `/login` and
 * `/register`. Sends them to their role's home instead.
 */
export const guestOnlyGuard: CanActivateFn = () => {
  const router = inject(Router);
  const session = inject(AccountSessionService);
  if (session.isSignedIn()) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};

/**
 * Guard for routes that exercise the password code path
 * (`/register`, `/login` if you wanted to harden it further). When the
 * SPA is built with `environment.passwordSignInEnabled = false` we
 * redirect to `/login` so the user only ever sees the SSO entry. Pairs
 * with the API which returns 403 `auth.password_login_disabled` for
 * the matching endpoints — the guard just makes the SPA never get
 * close enough to ask.
 */
export const passwordSignInEnabledGuard: CanActivateFn = (): boolean | UrlTree => {
  if (environment.passwordSignInEnabled) return true;
  const router = inject(Router);
  return router.createUrlTree(['/sign-in']);
};
