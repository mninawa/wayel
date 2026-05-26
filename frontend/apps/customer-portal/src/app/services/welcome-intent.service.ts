import { Injectable } from '@angular/core';

/**
 * Tiny persistence wrapper for the "I'll pay later, take me on the tour first"
 * intent set by the onboarding plan picker.
 *
 * <p>Goals:</p>
 * <ul>
 *   <li>A customer who clicks "Pay later" lands on <code>/welcome</code> and
 *       lands there again next time they sign in — until they actually pay.</li>
 *   <li>The flag is per-browser-per-customer (the only customers who can ever
 *       sign in on this device set/clear it). No backend column needed.</li>
 *   <li>Defensive about SSR / privacy modes where <code>localStorage</code>
 *       throws on access; the service then degrades to in-memory.</li>
 * </ul>
 *
 * <p>The flag is cleared by the checkout-complete page once Paystack has
 * confirmed payment, so a renewal-cycle later (suite expired again) the
 * normal onboarding flow resumes.</p>
 */
@Injectable({ providedIn: 'root' })
export class WelcomeIntentService {
  private static readonly STORAGE_KEY = 'weyell.onboarding.payLater';

  /** Process-local mirror used when localStorage isn't available. */
  private inMemory = false;

  /**
   * Remember that the customer chose "pay later" on the plan picker so that
   * future <code>getPostAuthRoute()</code> calls send them to
   * <code>/welcome</code> instead of bouncing back to the plan picker.
   */
  markPayLater(): void {
    this.inMemory = true;
    this.writeStorage('1');
  }

  /**
   * Forget the pay-later intent. Called from the checkout-complete page
   * after a successful payment so the next time the customer's suite ever
   * lapses they go through the normal onboarding flow rather than landing
   * on the welcome tour again.
   */
  clear(): void {
    this.inMemory = false;
    this.writeStorage(null);
  }

  /** True if the customer has opted into the "pay later" tour. */
  hasPayLaterIntent(): boolean {
    if (this.inMemory) return true;
    return this.readStorage() === '1';
  }

  private writeStorage(value: string | null): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (value === null) {
        localStorage.removeItem(WelcomeIntentService.STORAGE_KEY);
      } else {
        localStorage.setItem(WelcomeIntentService.STORAGE_KEY, value);
      }
    } catch {
      // Quota exceeded / private mode / SSR — keep the in-memory mirror so
      // the current tab still behaves correctly even if we can't persist.
    }
  }

  private readStorage(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(WelcomeIntentService.STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
