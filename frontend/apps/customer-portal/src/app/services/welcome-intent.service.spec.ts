import { TestBed } from '@angular/core/testing';
import { WelcomeIntentService } from './welcome-intent.service';

/**
 * Contract pinned by these tests:
 *
 *   • <code>markPayLater()</code> persists across re-instantiations of the
 *     service inside the same browser, since Angular destroys and recreates
 *     the singleton across page loads in production.
 *   • <code>clear()</code> truly removes the flag (so the customer's next
 *     post-payment sign-in goes through the normal getPostAuthRoute branch).
 *   • A privacy-mode browser that throws on localStorage access must not
 *     crash the SPA — the service stays usable in-memory for the current
 *     tab.
 */
describe('WelcomeIntentService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    // Wipe any stray value left over from a previous spec.
    try {
      localStorage.removeItem('weyell.onboarding.payLater');
    } catch {
      /* no-op */
    }
  });

  it('returns false by default with no flag set', () => {
    const service = TestBed.inject(WelcomeIntentService);
    expect(service.hasPayLaterIntent()).toBeFalse();
  });

  it('markPayLater() flips the read flag to true', () => {
    const service = TestBed.inject(WelcomeIntentService);
    service.markPayLater();
    expect(service.hasPayLaterIntent()).toBeTrue();
  });

  it('persists across new service instances (i.e. survives reload)', () => {
    const first = TestBed.inject(WelcomeIntentService);
    first.markPayLater();

    // Fresh injector mimics a page reload — the second instance must see
    // the persisted flag, otherwise customers would bounce back to the
    // plan picker every time they sign in.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const second = TestBed.inject(WelcomeIntentService);
    expect(second.hasPayLaterIntent()).toBeTrue();
  });

  it('clear() drops the flag from storage and the in-memory mirror', () => {
    const service = TestBed.inject(WelcomeIntentService);
    service.markPayLater();
    service.clear();
    expect(service.hasPayLaterIntent()).toBeFalse();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const second = TestBed.inject(WelcomeIntentService);
    expect(second.hasPayLaterIntent()).toBeFalse();
  });

  it('stays usable when localStorage.setItem throws (private mode)', () => {
    const original = localStorage.setItem.bind(localStorage);
    const setter = spyOn(Storage.prototype, 'setItem').and.throwError(
      new DOMException('QuotaExceededError'),
    );

    const service = TestBed.inject(WelcomeIntentService);
    expect(() => service.markPayLater()).not.toThrow();
    // In-memory fallback still reports the intent even though we couldn't
    // persist — important so the current navigation continues to /welcome.
    expect(service.hasPayLaterIntent()).toBeTrue();

    setter.and.callFake((k: string, v: string) => original(k, v));
  });
});
