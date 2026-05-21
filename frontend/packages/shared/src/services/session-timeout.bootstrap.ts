import { DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionTimeoutService } from './session-timeout.service';

/**
 * Convenience helper for the most common wiring: start the service
 * with sensible defaults and an `onExpired` that runs `teardown()`
 * (typically the local session clear + BFF sign-out) and then
 * navigates to `/session-expired` with `returnTo` preserved.
 *
 * Lives in a separate file from `SessionTimeoutService` so the
 * service module stays free of `@angular/router`. That keeps the
 * service trivially testable under Vitest's `node` environment
 * (importing `Router` transitively pulls in `PlatformLocation`,
 * which requires the JIT compiler at runtime).
 *
 * Usage from an authenticated shell component:
 *
 * ```ts
 * constructor() {
 *   wireSessionTimeoutForShell({
 *     teardown: () => this.bffAuth.signOut(),
 *     reason: 'idle-timeout',
 *   });
 * }
 * ```
 *
 * The helper auto-stops the service when the calling component is
 * destroyed, so wiring at the shell level cleanly tears down on
 * sign-out (which navigates the shell away). It must run inside an
 * Angular injection context — call it from a constructor or a
 * `runInInjectionContext` block.
 */
export function wireSessionTimeoutForShell(args: {
  teardown: () => void | Promise<void>;
  /** Reason code for the splash page. */
  reason?: 'idle-timeout' | 'session-expired';
  /** Override the 25-minute default. */
  idleMs?: number;
  /** Override the 60-second default. */
  warningMs?: number;
  /** Override the splash route — defaults to `/session-expired`. */
  expiredRoute?: string;
}): SessionTimeoutService {
  const service = inject(SessionTimeoutService);
  const router = inject(Router);
  const destroyRef = inject(DestroyRef);

  service.start({
    idleMs: args.idleMs ?? 25 * 60 * 1000,
    warningMs: args.warningMs ?? 60 * 1000,
    onExpired: () => {
      try {
        void Promise.resolve(args.teardown()).catch((err) => {
          console.error('[SessionTimeoutService] teardown rejected', err);
        });
      } catch (err) {
        console.error('[SessionTimeoutService] teardown threw', err);
      }
      const here = router.url || '/';
      const params = new URLSearchParams();
      params.set('reason', args.reason ?? 'idle-timeout');
      const isAuthRoute =
        here.startsWith('/login') ||
        here.startsWith('/auth/') ||
        here.startsWith('/accept') ||
        here.startsWith('/session-expired');
      if (!isAuthRoute && here !== '/') {
        params.set('returnTo', here);
      }
      const target = args.expiredRoute ?? '/session-expired';
      const sep = target.includes('?') ? '&' : '?';
      void router.navigateByUrl(`${target}${sep}${params.toString()}`);
    },
  });

  destroyRef.onDestroy(() => service.stop());
  return service;
}
