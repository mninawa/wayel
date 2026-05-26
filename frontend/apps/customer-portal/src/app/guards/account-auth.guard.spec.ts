import { TestBed } from '@angular/core/testing';
import { Router, type CanActivateFn, type RouterStateSnapshot } from '@angular/router';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { FakeAccountSessionService } from '../../testing/fixtures';
import {
  accountAuthGuard,
  guestOnlyGuard,
  passwordSignInEnabledGuard,
} from './account-auth.guard';

function runGuard(
  guard: CanActivateFn,
  url = '/dashboard',
): boolean | import('@angular/router').UrlTree {
  const state = { url } as RouterStateSnapshot;
  const route = {} as Parameters<CanActivateFn>[0];
  return TestBed.runInInjectionContext(() => guard(route, state) as boolean | import('@angular/router').UrlTree);
}

describe('accountAuthGuard', () => {
  let session: FakeAccountSessionService;
  let router: Router;

  beforeEach(() => {
    session = new FakeAccountSessionService();
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountSessionService, useValue: session },
        Router,
      ],
    });
    router = TestBed.inject(Router);
  });

  it('redirects unauthenticated requests to /sign-in with a `next` query param', () => {
    session.setSignedIn(false);
    const result = runGuard(accountAuthGuard(), '/parcels');
    expect(result).toEqual(router.createUrlTree(['/sign-in'], { queryParams: { next: '/parcels' } }));
  });

  it('lets signed-in users pass when no role is required', () => {
    session.setSignedIn(true);
    expect(runGuard(accountAuthGuard())).toBeTrue();
  });

  it('lets the right role through', () => {
    session.setSignedIn(true);
    session.setRole('parent');
    expect(runGuard(accountAuthGuard('parent'))).toBeTrue();
  });

  it('redirects mismatched roles to the role home, not /sign-in', () => {
    session.setSignedIn(true);
    session.setRole('staff');
    const result = runGuard(accountAuthGuard('parent'));
    expect(result).toEqual(router.createUrlTree(['/staff/institution']));
  });
});

describe('guestOnlyGuard', () => {
  let session: FakeAccountSessionService;
  let router: Router;

  beforeEach(() => {
    session = new FakeAccountSessionService();
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountSessionService, useValue: session },
        Router,
      ],
    });
    router = TestBed.inject(Router);
  });

  it('returns true when not signed in', () => {
    session.setSignedIn(false);
    expect(runGuard(guestOnlyGuard)).toBeTrue();
  });

  it('sends signed-in customers to /dashboard', () => {
    session.setSignedIn(true);
    expect(runGuard(guestOnlyGuard)).toEqual(router.createUrlTree(['/dashboard']));
  });
});

describe('passwordSignInEnabledGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [Router] });
  });

  it('returns true when password sign-in is enabled in the active environment', () => {
    // environment.ts (dev default) ships with passwordSignInEnabled: true.
    // We assert the live behaviour here so a flip in environments/environment.ts
    // gets caught — the prod build (passwordSignInEnabled: false) is exercised
    // by the build-time fileReplacement and not this spec.
    const result = runGuard(passwordSignInEnabledGuard);
    expect(result).toBeTrue();
  });
});
