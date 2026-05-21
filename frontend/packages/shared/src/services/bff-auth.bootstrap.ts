import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { BffAuthService } from './bff-auth.service';

/**
 * Provider that runs `BffAuthService.bootstrap()` once before the first
 * route activation, so `platformAuthGuard` sees a hydrated
 * `PlatformSessionService` on a refreshed page that already has a valid BFF
 * cookie.
 *
 * Wired into a host app via:
 *
 *   providers: [
 *     ...
 *     provideBffAuthBootstrap(),
 *   ],
 *
 * The initializer never throws — `bootstrap()` swallows network errors and
 * returns `null` on 401 — so a temporarily-down BFF can't deadlock the app
 * from rendering its sign-in page.
 */
export function provideBffAuthBootstrap(): Provider {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      const bff = inject(BffAuthService);
      return async () => {
        // Two-step bootstrap:
        //   1. Pre-paint from the visitor's host header so the SPA
        //      shell wears the tenant's branding *before* the first
        //      paint of the route tree (no flash-of-unbranded chrome).
        //      Returns null for the platform's own hostnames and any
        //      transient blip; in either case we just stay on the
        //      platform default palette.
        //   2. Hit `/bff/auth/me` to hydrate the session. If the user
        //      is signed in, the session sink repaints with the
        //      home-tenant branding (which may differ from the host
        //      tenant — that's the source of truth post-login).
        // Pre-paint failures must never block sign-in, so we await
        // it inside a try and swallow rejections.
        try {
          await bff.prepaintBrandingFromHost();
        } catch {
          // Already swallowed by the service, but defensive belt-and-braces.
        }
        await bff.bootstrap();
      };
    },
  };
}
