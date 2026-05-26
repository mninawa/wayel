import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import type { CustomerAccount, OnboardingIntent } from '../models/customer-account.models';
import { accountFixture } from '../../testing/fixtures';
import { CustomerAccountApiService } from './customer-account-api.service';
import { CustomerAccountService } from './customer-account.service';
import { WelcomeIntentService } from './welcome-intent.service';

/**
 * Contract pinned by these tests:
 *
 *   • <code>hasPayLaterIntent()</code> reads the active intent from the
 *     cached <code>CustomerAccount</code> signal (the source of truth, since
 *     /account embeds it on every load).
 *   • <code>markPayLater()</code> POSTs to the backend AND optimistically
 *     flips the read flag immediately so the very next navigation observes
 *     the choice — important for the inline "pay later → /welcome" jump.
 *   • <code>clear()</code> fires the DELETE and optimistically flips the
 *     flag false. A failed DELETE leaves the optimistic state in place so
 *     the SPA stays consistent with what the user just did.
 *   • A failed POST rolls back the optimistic flag so the next guard run
 *     sees the un-marked account, matching server state.
 */
describe('WelcomeIntentService', () => {
  let api: jasmine.SpyObj<CustomerAccountApiService>;
  let accountSvc: FakeAccountService;
  let service: WelcomeIntentService;

  function intent(): OnboardingIntent {
    return {
      kind: 'pay_later',
      createdAtUtc: '2026-01-01T00:00:00.000Z',
      lastSeenAtUtc: '2026-01-01T00:00:00.000Z',
      planIdAtSignal: null,
      planLabelAtSignal: null,
    };
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<CustomerAccountApiService>(
      'CustomerAccountApiService',
      ['markPayLaterIntent', 'clearPayLaterIntent'],
    );
    accountSvc = new FakeAccountService();

    TestBed.configureTestingModule({
      providers: [
        WelcomeIntentService,
        { provide: CustomerAccountApiService, useValue: api },
        { provide: CustomerAccountService, useValue: accountSvc },
      ],
    });
    service = TestBed.inject(WelcomeIntentService);
  });

  it('returns false when no account is loaded yet', () => {
    expect(service.hasPayLaterIntent()).toBeFalse();
  });

  it('returns false when the account has no pay-later intent', () => {
    accountSvc.setAccount(accountFixture({ journey: 'suitePending' }));
    expect(service.hasPayLaterIntent()).toBeFalse();
  });

  it('returns true when the account carries an active pay-later intent', () => {
    accountSvc.setAccount(
      accountFixture({ journey: 'suitePending', onboardingIntent: intent() }),
    );
    expect(service.hasPayLaterIntent()).toBeTrue();
  });

  it('markPayLater() optimistically flips the flag before the HTTP returns', () => {
    accountSvc.setAccount(accountFixture({ journey: 'suitePending' }));
    const pending = new Subject<OnboardingIntent>();
    api.markPayLaterIntent.and.returnValue(pending.asObservable());

    let completed = false;
    service.markPayLater(null).subscribe({ complete: () => (completed = true) });

    // The optimistic flip is the whole point of this method — without it the
    // user would have to wait a network round-trip before the guards see
    // them as "deferred", which would bounce them back to the plan picker
    // mid-navigation.
    expect(service.hasPayLaterIntent()).toBeTrue();
    expect(completed).toBeFalse();

    pending.next(intent());
    pending.complete();
    expect(completed).toBeTrue();
  });

  it('markPayLater() passes the planId through to the API', () => {
    accountSvc.setAccount(accountFixture({ journey: 'suitePending' }));
    api.markPayLaterIntent.and.returnValue(of(intent()));
    service.markPayLater('plan-123').subscribe();
    expect(api.markPayLaterIntent).toHaveBeenCalledWith('plan-123');
  });

  it('markPayLater() reloads the account so other readers stay consistent', () => {
    accountSvc.setAccount(accountFixture({ journey: 'suitePending' }));
    api.markPayLaterIntent.and.returnValue(of(intent()));
    service.markPayLater(null).subscribe();
    expect(accountSvc.loadAccount).toHaveBeenCalled();
  });

  it('markPayLater() rolls the optimistic flag back when the POST fails', () => {
    accountSvc.setAccount(accountFixture({ journey: 'suitePending' }));
    api.markPayLaterIntent.and.returnValue(throwError(() => new Error('500')));

    let errored = false;
    service.markPayLater(null).subscribe({ error: () => (errored = true) });

    expect(errored).toBeTrue();
    expect(service.hasPayLaterIntent()).toBeFalse();
  });

  it('clear() flips the optimistic flag false immediately', () => {
    accountSvc.setAccount(
      accountFixture({ journey: 'suitePending', onboardingIntent: intent() }),
    );
    // After the DELETE lands, the server-side intent is gone — the post-clear
    // reload publishes an account without an intent. The optimistic flag drop
    // covers the time window between DELETE-sent and reload-arrived.
    accountSvc.setNextLoadedAccount(
      accountFixture({ journey: 'suitePending', onboardingIntent: null }),
    );
    api.clearPayLaterIntent.and.returnValue(of(undefined as void));

    expect(service.hasPayLaterIntent()).toBeTrue();
    service.clear();
    expect(service.hasPayLaterIntent()).toBeFalse();
    expect(api.clearPayLaterIntent).toHaveBeenCalled();
  });

  it('clear() is resilient to network errors', () => {
    accountSvc.setAccount(
      accountFixture({ journey: 'suitePending', onboardingIntent: intent() }),
    );
    api.clearPayLaterIntent.and.returnValue(throwError(() => new Error('500')));

    expect(() => service.clear()).not.toThrow();
    // Optimistic state holds — the customer just paid, so we don't bounce
    // them back to /welcome just because the cleanup DELETE failed.
    expect(service.hasPayLaterIntent()).toBeFalse();
  });

  it('forgetLegacyLocalStorage() removes the old localStorage key', () => {
    try {
      localStorage.setItem('weyell.onboarding.payLater', '1');
      service.forgetLegacyLocalStorage();
      expect(localStorage.getItem('weyell.onboarding.payLater')).toBeNull();
    } catch {
      // SSR / private-mode test runner — the method must still be safe.
      expect(() => service.forgetLegacyLocalStorage()).not.toThrow();
    }
  });
});

/**
 * Minimal account-service stand-in that mirrors the contract the
 * <code>WelcomeIntentService</code> depends on: a cached account signal,
 * and a <code>loadAccount</code> that <em>writes</em> the fresh account
 * into that signal (the real service does this via a <code>tap</code>).
 *
 * Tests stage the post-reload account with {@link setNextLoadedAccount}
 * so they can assert that the service correctly re-derives from the
 * latest server state.
 */
class FakeAccountService {
  private readonly _account = signal<CustomerAccount | null>(null);
  private nextLoaded: CustomerAccount = accountFixture();
  readonly account = this._account;

  readonly loadAccount = jasmine
    .createSpy<() => ReturnType<CustomerAccountService['loadAccount']>>('loadAccount')
    .and.callFake(() => {
      this._account.set(this.nextLoaded);
      return of(this.nextLoaded);
    });

  setAccount(account: CustomerAccount | null): void {
    this._account.set(account);
  }

  /**
   * Override the account that the next (and subsequent) <code>loadAccount</code>
   * call will publish to the signal. Tests use this to simulate the server-side
   * effect of marking or clearing the pay-later intent.
   */
  setNextLoadedAccount(account: CustomerAccount): void {
    this.nextLoaded = account;
  }
}
