import { TestBed } from '@angular/core/testing';
import {
  Router,
  type CanActivateFn,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { accountFixture, FakeAccountSessionService } from '../../testing/fixtures';
import { CustomerAccountService } from '../services/customer-account.service';
import {
  customerSignedInGuard,
  guestOnlyWithJourneyGuard,
  portalReadyGuard,
  profileCompleteGuard,
  profileOnboardingGuard,
  suitePlanOnboardingGuard,
} from './customer-journey.guard';

function runGuard(guard: CanActivateFn, url = '/dashboard'): boolean | UrlTree | Observable<unknown> {
  const state = { url } as RouterStateSnapshot;
  const route = {} as Parameters<CanActivateFn>[0];
  return TestBed.runInInjectionContext(() => guard(route, state) as never);
}

async function resolveResult(value: boolean | UrlTree | Observable<unknown>): Promise<unknown> {
  if (value instanceof Observable) {
    return new Promise((resolve) => value.subscribe((v) => resolve(v)));
  }
  return value;
}

describe('customer-journey guards', () => {
  let session: FakeAccountSessionService;
  let journey: jasmine.SpyObj<CustomerAccountService> & {
    account: ReturnType<typeof TestBed.inject>;
  };
  let router: Router;

  beforeEach(() => {
    session = new FakeAccountSessionService();
    journey = jasmine.createSpyObj<CustomerAccountService>(
      'CustomerAccountService',
      ['ensureAccountLoaded', 'getJourneySnapshot', 'getPostAuthRoute'],
    ) as jasmine.SpyObj<CustomerAccountService> & {
      account: ReturnType<typeof TestBed.inject>;
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AccountSessionService, useValue: session },
        { provide: CustomerAccountService, useValue: journey },
        Router,
      ],
    });
    router = TestBed.inject(Router);
  });

  describe('customerSignedInGuard', () => {
    it('returns true for signed-in users', () => {
      session.setSignedIn(true);
      expect(runGuard(customerSignedInGuard)).toBeTrue();
    });

    it('redirects guests to /sign-in with the current URL preserved', () => {
      session.setSignedIn(false);
      const result = runGuard(customerSignedInGuard, '/parcels/abc');
      expect(result).toEqual(
        router.createUrlTree(['/sign-in'], { queryParams: { next: '/parcels/abc' } }),
      );
    });
  });

  describe('profileOnboardingGuard', () => {
    it('redirects to /sign-in when the visitor is not signed in', () => {
      session.setSignedIn(false);
      const result = runGuard(profileOnboardingGuard, '/onboarding/complete-profile');
      expect(result).toEqual(
        router.createUrlTree(['/sign-in'], {
          queryParams: { next: '/onboarding/complete-profile' },
        }),
      );
    });

    it('allows access while the profile is still incomplete', async () => {
      const acc = accountFixture({ journey: 'profileIncomplete' });
      journey.ensureAccountLoaded.and.returnValue(of(acc));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: false,
        suiteEligible: false,
        hasSuite: false,
      });

      const result = await resolveResult(runGuard(profileOnboardingGuard));
      expect(result).toBeTrue();
    });

    it('boots fully-onboarded users back to the post-auth route', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture()));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: true,
        suiteEligible: false,
        hasSuite: true,
      });
      journey.getPostAuthRoute.and.returnValue('/dashboard');

      const result = await resolveResult(runGuard(profileOnboardingGuard));
      expect(result).toEqual(router.createUrlTree(['/dashboard']));
    });
  });

  describe('suitePlanOnboardingGuard', () => {
    it('redirects to complete-profile when the profile is incomplete', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture({ journey: 'profileIncomplete' })));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: false,
        suiteEligible: false,
        hasSuite: false,
      });

      const result = await resolveResult(runGuard(suitePlanOnboardingGuard));
      expect(result).toEqual(router.createUrlTree(['/onboarding/complete-profile']));
    });

    it('redirects to dashboard once a suite has been chosen', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture()));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: true,
        suiteEligible: false,
        hasSuite: true,
      });

      const result = await resolveResult(runGuard(suitePlanOnboardingGuard));
      expect(result).toEqual(router.createUrlTree(['/dashboard']));
    });

    it('lets users pick a plan when eligible', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture({ journey: 'suitePending' })));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: true,
        suiteEligible: true,
        hasSuite: false,
      });

      const result = await resolveResult(runGuard(suitePlanOnboardingGuard));
      expect(result).toBeTrue();
    });
  });

  describe('profileCompleteGuard', () => {
    it('blocks users without a complete profile', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture({ journey: 'profileIncomplete' })));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: false,
        suiteEligible: false,
        hasSuite: false,
      });

      const result = await resolveResult(runGuard(profileCompleteGuard));
      expect(result).toEqual(router.createUrlTree(['/onboarding/complete-profile']));
    });

    it('allows users with a complete profile through', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture()));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: true,
        suiteEligible: false,
        hasSuite: true,
      });

      const result = await resolveResult(runGuard(profileCompleteGuard));
      expect(result).toBeTrue();
    });
  });

  describe('portalReadyGuard', () => {
    it('requires both a complete profile and an active suite', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture({ journey: 'suitePending' })));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: true,
        suiteEligible: true,
        hasSuite: false,
      });

      const result = await resolveResult(runGuard(portalReadyGuard));
      expect(result).toEqual(router.createUrlTree(['/onboarding/choose-suite-plan']));
    });

    it('lets fully-onboarded users into the dashboard', async () => {
      journey.ensureAccountLoaded.and.returnValue(of(accountFixture()));
      journey.getJourneySnapshot.and.returnValue({
        profileComplete: true,
        suiteEligible: false,
        hasSuite: true,
      });

      const result = await resolveResult(runGuard(portalReadyGuard));
      expect(result).toBeTrue();
    });
  });

  describe('guestOnlyWithJourneyGuard', () => {
    it('lets visitors view marketing routes', () => {
      session.setSignedIn(false);
      expect(runGuard(guestOnlyWithJourneyGuard)).toBeTrue();
    });

    it('redirects signed-in users to their journey home route', async () => {
      session.setSignedIn(true);
      const acc = accountFixture({ journey: 'suitePending' });
      journey.ensureAccountLoaded.and.returnValue(of(acc));
      journey.getPostAuthRoute.and.returnValue('/onboarding/choose-suite-plan');

      const result = await resolveResult(runGuard(guestOnlyWithJourneyGuard));
      expect(result).toEqual(router.createUrlTree(['/onboarding/choose-suite-plan']));
      expect(journey.getPostAuthRoute).toHaveBeenCalledWith({
        profileComplete: acc.profileComplete,
        suiteEligible: acc.suiteEligible,
        hasSuite: acc.hasSuite,
      });
    });
  });
});
