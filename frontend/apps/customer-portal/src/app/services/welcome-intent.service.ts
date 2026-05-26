import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { CustomerAccountApiService } from './customer-account-api.service';
import { CustomerAccountService } from './customer-account.service';

/**
 * Persists the "I'll pay later, take me on the tour first" intent server-side.
 *
 * <p>The intent now lives in MongoDB (collection: <code>pay_later_intents</code>)
 * so it survives device switches, can be cleared automatically when the customer
 * actually pays, and feeds the ops "Onboarding funnel" dashboard. The
 * <code>/account</code> response embeds the live intent so guards can route
 * synchronously on bootstrap.</p>
 *
 * <p>This service is a thin wrapper that:</p>
 * <ul>
 *   <li>reads the flag from the cached account signal,</li>
 *   <li>maintains an optimistic local override so a freshly-clicked
 *       "Pay later" button takes effect before the HTTP round-trip lands,</li>
 *   <li>migrates any pre-existing localStorage flag from earlier builds.</li>
 * </ul>
 *
 * <p>The flag is cleared (server-side) by <c>CompleteSuiteCheckoutCommand</c>
 * the moment Paystack confirms payment, so subsequent guard runs see the
 * intent gone. The <code>clear()</code> method here is mostly for the SPA
 * to mirror that state instantly.</p>
 */
@Injectable({ providedIn: 'root' })
export class WelcomeIntentService {
  private static readonly LEGACY_STORAGE_KEY = 'weyell.onboarding.payLater';

  private readonly api = inject(CustomerAccountApiService);
  private readonly accountSvc = inject(CustomerAccountService);

  /**
   * Optimistic override applied before the server round-trip completes.
   * <code>true</code> after markPayLater, <code>false</code> after clear,
   * <code>null</code> when we should defer to the cached account.
   */
  private readonly override = signal<boolean | null>(null);

  /**
   * Live read: prefer the optimistic override if set, otherwise check the
   * cached account signal. Returns false when no account has loaded yet,
   * which is fine because guards always <code>ensureAccountLoaded()</code>
   * before consulting us.
   */
  readonly hasPayLaterIntent = computed<boolean>(() => {
    const opt = this.override();
    if (opt !== null) return opt;
    const acc = this.accountSvc.account();
    return acc?.onboardingIntent?.kind === 'pay_later';
  });

  /**
   * Record the customer's pay-later choice on the backend and update the
   * cached account so guards see the flag on the very next navigation.
   * <paramref name="planId"/> is optional — when supplied we snapshot it on
   * the server so ops can see which plan the customer was leaning towards.
   */
  markPayLater(planId?: string | null): Observable<void> {
    this.override.set(true);
    return this.api.markPayLaterIntent(planId).pipe(
      // Reload the account so other readers (e.g. dashboard banner) see the
      // new intent. Fire-and-forget — the optimistic override already keeps
      // the current navigation correct.
      tap(() => {
        this.accountSvc.loadAccount().subscribe({
          next: () => this.override.set(null),
          error: () => undefined,
        });
      }),
      map(() => undefined),
      catchError((err) => {
        // Roll back optimistic state so the caller can show an error and
        // the next guard run sees the real (un-marked) account.
        this.override.set(null);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Forget the pay-later intent. Mostly cosmetic on the SPA side —
   * <c>CompleteSuiteCheckoutCommandHandler</c> already resolves the row
   * server-side the moment payment is confirmed. Fire-and-forget so
   * checkout-complete UX isn't blocked by the round-trip.
   */
  clear(): void {
    this.override.set(false);
    this.api.clearPayLaterIntent().subscribe({
      next: () => {
        // Refresh the account so any other reader is consistent with the
        // server-side state. Failures here are benign — the optimistic
        // override is already false.
        this.accountSvc.loadAccount().subscribe({
          next: () => this.override.set(null),
          error: () => undefined,
        });
      },
      error: () => undefined,
    });
  }

  /**
   * Best-effort cleanup of any stale flag left over from the earlier
   * localStorage-only build. Safe to call from any browser context;
   * silently no-ops in SSR or private mode.
   */
  forgetLegacyLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(WelcomeIntentService.LEGACY_STORAGE_KEY);
    } catch {
      // Quota / private mode — accepting the stale key has no behavioural
      // impact now that the server is authoritative.
    }
  }
}
