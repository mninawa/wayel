import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { accountFixture, FakeAccountSessionService } from '../../testing/fixtures';
import type { CustomerAccount, OnboardingIntent } from '../models/customer-account.models';
import { BorderboxApiService } from './borderbox-api.service';
import { CustomerAccountApiService } from './customer-account-api.service';
import { CustomerAccountService } from './customer-account.service';

/** Mint a freshly-stamped pay-later intent for journey tests. */
function payLaterIntent(): OnboardingIntent {
  return {
    kind: 'pay_later',
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    lastSeenAtUtc: '2026-01-01T00:00:00.000Z',
    planIdAtSignal: null,
    planLabelAtSignal: null,
  };
}

describe('CustomerAccountService', () => {
  let api: jasmine.SpyObj<CustomerAccountApiService>;
  let borderbox: jasmine.SpyObj<BorderboxApiService>;
  let session: FakeAccountSessionService;
  let service: CustomerAccountService;

  beforeEach(() => {
    api = jasmine.createSpyObj<CustomerAccountApiService>('CustomerAccountApiService', [
      'getAccount',
      'updateProfile',
      'updateNotifications',
      'submitKyc',
      'upsertDeliveryAddress',
      'deleteDeliveryAddress',
      'setDefaultDeliveryAddress',
    ]);
    borderbox = jasmine.createSpyObj<BorderboxApiService>('BorderboxApiService', ['activateSuite']);
    session = new FakeAccountSessionService();

    TestBed.configureTestingModule({
      providers: [
        CustomerAccountService,
        { provide: CustomerAccountApiService, useValue: api },
        { provide: BorderboxApiService, useValue: borderbox },
        { provide: AccountSessionService, useValue: session },
      ],
    });
    service = TestBed.inject(CustomerAccountService);
  });

  describe('journey snapshot', () => {
    it('returns all-false defaults when no account is loaded', () => {
      expect(service.getJourneySnapshot()).toEqual({
        profileComplete: false,
        suiteEligible: false,
        hasSuite: false,
        hasPayLaterIntent: false,
      });
    });

    it('reflects the loaded account flags', () => {
      service.account.set(accountFixture({ journey: 'suitePending' }));
      expect(service.getJourneySnapshot()).toEqual({
        profileComplete: true,
        suiteEligible: true,
        hasSuite: false,
        hasPayLaterIntent: false,
      });
    });

    it('surfaces a pay-later intent from the account DTO', () => {
      service.account.set(
        accountFixture({ journey: 'suitePending', onboardingIntent: payLaterIntent() }),
      );
      expect(service.getJourneySnapshot().hasPayLaterIntent).toBeTrue();
    });
  });

  describe('post-auth routing', () => {
    it('sends incomplete profiles to /onboarding/complete-profile', () => {
      service.account.set(accountFixture({ journey: 'profileIncomplete' }));
      expect(service.getPostAuthRoute()).toBe('/onboarding/complete-profile');
    });

    it('sends profile-complete-no-suite users to choose-suite-plan', () => {
      service.account.set(accountFixture({ journey: 'suitePending' }));
      expect(service.getPostAuthRoute()).toBe('/onboarding/choose-suite-plan');
    });

    it('sends profile-complete-no-suite users to /welcome when they chose pay-later', () => {
      // Critical: customers who clicked "Pay later" on the onboarding plan
      // page must NOT be bounced back to that page on subsequent sign-ins —
      // otherwise the choice was meaningless. The intent is cleared by the
      // backend on successful payment.
      service.account.set(
        accountFixture({ journey: 'suitePending', onboardingIntent: payLaterIntent() }),
      );
      expect(service.getPostAuthRoute()).toBe('/welcome');
    });

    it('ignores a stale pay-later intent once the suite is active', () => {
      // The backend resolves the intent the moment payment lands; this
      // guards against a brief window where both states are visible.
      service.account.set(accountFixture({ onboardingIntent: payLaterIntent() }));
      expect(service.getPostAuthRoute()).toBe('/dashboard');
    });

    it('sends ready accounts to /dashboard', () => {
      service.account.set(accountFixture());
      expect(service.getPostAuthRoute()).toBe('/dashboard');
    });

    it('accepts an explicit snapshot argument over the cached one', () => {
      service.account.set(accountFixture()); // ready
      const route = service.getPostAuthRoute({
        profileComplete: false,
        suiteEligible: false,
        hasSuite: false,
        hasPayLaterIntent: false,
      });
      expect(route).toBe('/onboarding/complete-profile');
    });
  });

  describe('ensureAccountLoaded', () => {
    it('returns the cached account synchronously when already loaded', (done) => {
      const cached = accountFixture();
      service.account.set(cached);
      service.ensureAccountLoaded().subscribe((value) => {
        expect(value).toBe(cached);
        expect(api.getAccount).not.toHaveBeenCalled();
        done();
      });
    });

    it('dedupes concurrent loads to a single API call', () => {
      const subject = new Subject<CustomerAccount>();
      api.getAccount.and.returnValue(subject.asObservable());

      let first: CustomerAccount | undefined;
      let second: CustomerAccount | undefined;
      service.ensureAccountLoaded().subscribe((value) => (first = value));
      service.ensureAccountLoaded().subscribe((value) => (second = value));
      expect(api.getAccount).toHaveBeenCalledTimes(1);

      const payload = accountFixture();
      subject.next(payload);
      subject.complete();

      expect(first).toBe(payload);
      expect(second).toBe(payload);
      expect(service.account()).toBe(payload);
    });

    it('re-queries the API after a successful load + signal clear', () => {
      api.getAccount.and.returnValue(of(accountFixture()));
      service.ensureAccountLoaded().subscribe();
      service.account.set(null);
      service.ensureAccountLoaded().subscribe();
      expect(api.getAccount).toHaveBeenCalledTimes(2);
    });
  });

  describe('loadAccount', () => {
    it('updates the signal and syncs the session profile on success', () => {
      const acc = accountFixture();
      api.getAccount.and.returnValue(of(acc));
      session.setAccount({ displayName: 'Old', phone: null, email: 'old@example.com' });

      service.loadAccount().subscribe();

      expect(service.account()).toBe(acc);
      expect(session.currentAccount()).toEqual({
        displayName: acc.profile.displayName,
        phone: acc.profile.phone,
        email: acc.profile.email,
      });
    });

    it('clears the signal and propagates the error on failure', () => {
      service.account.set(accountFixture());
      api.getAccount.and.returnValue(throwError(() => new Error('boom')));

      let err: unknown;
      service.loadAccount().subscribe({ error: (e) => (err = e) });

      expect(service.account()).toBeNull();
      expect(err).toEqual(jasmine.any(Error));
    });

    it('does not patch the session when no session account exists', () => {
      api.getAccount.and.returnValue(of(accountFixture()));
      session.setAccount(null);
      service.loadAccount().subscribe();
      expect(session.currentAccount()).toBeNull();
    });
  });

  describe('mutations write through to the signal', () => {
    it('saveNotifications updates the cached account', () => {
      const updated = accountFixture({
        notifications: { email: false, sms: false, whatsApp: false, marketing: false },
      });
      api.updateNotifications.and.returnValue(of(updated));
      service.saveNotifications(updated.notifications).subscribe();
      expect(service.account()).toBe(updated);
    });

    it('saveDeliveryAddress passes the id through and stores the response', () => {
      const updated = accountFixture();
      api.upsertDeliveryAddress.and.returnValue(of(updated));
      const payload = {
        branchId: 'b1',
        label: 'Home',
        fullName: 'Sandile',
        phone: '+27',
        isDefault: false,
      };
      service.saveDeliveryAddress('addr-1', payload).subscribe();
      expect(api.upsertDeliveryAddress).toHaveBeenCalledWith('addr-1', payload);
      expect(service.account()).toBe(updated);
    });

    it('activateFirstSuite reloads the account after the suite mutation', () => {
      const refreshed = accountFixture();
      borderbox.activateSuite.and.returnValue(of({} as never));
      api.getAccount.and.returnValue(of(refreshed));

      service.activateFirstSuite('starter').subscribe();

      expect(borderbox.activateSuite).toHaveBeenCalledWith('starter');
      expect(api.getAccount).toHaveBeenCalled();
      expect(service.account()).toBe(refreshed);
    });
  });

  describe('helpers', () => {
    it('kycLabel maps known statuses', () => {
      expect(service.kycLabel('Verified')).toBe('Verified');
      expect(service.kycLabel('Pending')).toBe('Pending review');
      expect(service.kycLabel('NotStarted')).toBe('Not started');
      expect(service.kycLabel('Rejected')).toBe('Rejected');
    });

    it('kycLabel falls back to the raw status for unknown values', () => {
      expect(service.kycLabel('SomeOther')).toBe('SomeOther');
    });

    it('copySuiteAddress resolves false when no suite is set', (done) => {
      service.account.set(accountFixture({ suiteAddress: null }));
      service.copySuiteAddress().subscribe((ok) => {
        expect(ok).toBeFalse();
        done();
      });
    });

    it('copySuiteAddress writes the formatted block to the clipboard when available', (done) => {
      const account = accountFixture();
      service.account.set(account);
      const writeText = jasmine
        .createSpy('writeText')
        .and.returnValue(Promise.resolve());
      // We mutate the navigator clipboard only for the duration of this test.
      const original = (navigator as { clipboard?: unknown }).clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      service.copySuiteAddress().subscribe((ok) => {
        expect(ok).toBeTrue();
        expect(writeText).toHaveBeenCalledWith(account.suiteAddress!.formatted);
        if (original === undefined) {
          delete (navigator as { clipboard?: unknown }).clipboard;
        } else {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: original,
          });
        }
        done();
      });
    });
  });
});
