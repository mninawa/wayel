import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map } from 'rxjs/operators';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { CustomerAccountService } from '../services/customer-account.service';

function signedInOrSignIn(stateUrl: string): true | UrlTree {
  const session = inject(AccountSessionService);
  if (session.isSignedIn()) return true;
  const router = inject(Router);
  return router.createUrlTree(['/sign-in'], { queryParams: { next: stateUrl } });
}

function routeFromAccount(
  journey: CustomerAccountService,
  router: Router,
  stateUrl: string,
  requireSuite: boolean,
): true | UrlTree {
  const snap = journey.getJourneySnapshot();
  if (!snap.profileComplete) {
    return router.createUrlTree(['/onboarding/complete-profile'], {
      queryParams: { next: stateUrl },
    });
  }
  if (requireSuite && !snap.hasSuite) {
    return router.createUrlTree(['/onboarding/choose-suite-plan']);
  }
  return true;
}

function withAccountLoaded(
  stateUrl: string,
  decide: (journey: CustomerAccountService, router: Router) => true | UrlTree,
) {
  const gate = signedInOrSignIn(stateUrl);
  if (gate !== true) return gate;
  const journey = inject(CustomerAccountService);
  const router = inject(Router);
  return journey.ensureAccountLoaded().pipe(map(() => decide(journey, router)));
}

/** Signed-in customers only (any onboarding step). */
export const customerSignedInGuard: CanActivateFn = (_route, state) =>
  signedInOrSignIn(state.url);

export const profileOnboardingGuard: CanActivateFn = (_route, state) =>
  withAccountLoaded(state.url, (journey, router) => {
    const snap = journey.getJourneySnapshot();
    if (snap.profileComplete) {
      return router.createUrlTree([journey.getPostAuthRoute(snap)]);
    }
    return true;
  });

export const suitePlanOnboardingGuard: CanActivateFn = (_route, state) =>
  withAccountLoaded(state.url, (journey, router) => {
    const snap = journey.getJourneySnapshot();
    if (!snap.profileComplete) {
      return router.createUrlTree(['/onboarding/complete-profile']);
    }
    if (snap.hasSuite) {
      return router.createUrlTree(['/dashboard']);
    }
    return true;
  });

export const profileCompleteGuard: CanActivateFn = (_route, state) =>
  withAccountLoaded(state.url, (journey, router) => {
    const snap = journey.getJourneySnapshot();
    if (!snap.profileComplete) {
      return router.createUrlTree(['/onboarding/complete-profile']);
    }
    return true;
  });

export const portalReadyGuard: CanActivateFn = (_route, state) =>
  withAccountLoaded(state.url, (journey, router) =>
    routeFromAccount(journey, router, state.url, true),
  );

export const guestOnlyWithJourneyGuard: CanActivateFn = () => {
  const session = inject(AccountSessionService);
  if (!session.isSignedIn()) return true;
  const journey = inject(CustomerAccountService);
  const router = inject(Router);
  return journey.ensureAccountLoaded().pipe(
    map((acc) =>
      router.createUrlTree([
        journey.getPostAuthRoute({
          profileComplete: acc.profileComplete,
          suiteEligible: acc.suiteEligible,
          hasSuite: acc.hasSuite,
        }),
      ]),
    ),
  );
};
