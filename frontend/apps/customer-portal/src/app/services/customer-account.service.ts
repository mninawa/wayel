import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { BffAuthService } from '@wayel/shared/services/bff-auth.service';
import type {
  CustomerAccount,
  NotificationPreferences,
  UpdateProfileRequest,
  UpsertDeliveryAddressRequest,
} from '../models/customer-account.models';
import { BorderboxApiService } from './borderbox-api.service';
import { CustomerAccountApiService } from './customer-account-api.service';

/** Wayel ProblemDetails `type` for "the signed-in user is no longer in the API". */
const USER_NOT_FOUND_TYPE = 'https://wayel.dev/errors/user.not_found';
const USER_NOT_FOUND_TITLE = 'user.not_found';

export interface JourneySnapshot {
  profileComplete: boolean;
  suiteEligible: boolean;
  hasSuite: boolean;
  /**
   * True when the customer's last action on the plan picker was "Pay later".
   * Read from the server-persisted intent embedded in the /account response.
   */
  hasPayLaterIntent: boolean;
}

@Injectable({ providedIn: 'root' })
export class CustomerAccountService {
  private readonly session = inject(AccountSessionService);
  private readonly api = inject(CustomerAccountApiService);
  private readonly borderboxApi = inject(BorderboxApiService);
  private readonly bffAuth = inject(BffAuthService);

  readonly account = signal<CustomerAccount | null>(null);

  private loadInflight: Observable<CustomerAccount> | null = null;

  /**
   * Set once we've started a force-logout in response to a 404 user.not_found,
   * so concurrent in-flight calls don't each fire their own logout + reload.
   * The reload itself takes the user off the page anyway, but this keeps
   * the network log clean and avoids logging a parade of error toasts.
   */
  private zombieLogoutInflight = false;

  getJourneySnapshot(): JourneySnapshot {
    const acc = this.account();
    if (acc) {
      return {
        profileComplete: acc.profileComplete,
        suiteEligible: acc.suiteEligible,
        hasSuite: acc.hasSuite,
        hasPayLaterIntent: acc.onboardingIntent?.kind === 'pay_later',
      };
    }
    return {
      profileComplete: false,
      suiteEligible: false,
      hasSuite: false,
      hasPayLaterIntent: false,
    };
  }

  /**
   * Decides where to land a signed-in customer based on their current
   * journey state. The "pay later" branch is what lets a customer who chose
   * to defer activation come back to the explanatory <code>/welcome</code>
   * page on subsequent sessions instead of being bounced repeatedly to the
   * plan picker. Once they actually pay, <code>hasSuite</code> flips to true
   * and the welcome detour is bypassed regardless of the flag.
   */
  getPostAuthRoute(snapshot?: JourneySnapshot): string {
    const s = snapshot ?? this.getJourneySnapshot();
    if (!s.profileComplete) return '/onboarding/complete-profile';
    if (!s.hasSuite) {
      return s.hasPayLaterIntent ? '/welcome' : '/onboarding/choose-suite-plan';
    }
    return '/dashboard';
  }

  ensureAccountLoaded(): Observable<CustomerAccount> {
    const current = this.account();
    if (current) {
      return of(current);
    }
    if (this.loadInflight) {
      return this.loadInflight;
    }
    this.loadInflight = this.loadAccount().pipe(
      finalize(() => {
        this.loadInflight = null;
      }),
      shareReplay(1),
    );
    return this.loadInflight;
  }

  loadAccount(): Observable<CustomerAccount> {
    return this.api.getAccount().pipe(
      tap((a) => {
        this.account.set(a);
        this.syncSessionProfile(a);
      }),
      catchError((err) => {
        this.account.set(null);
        // Safety net for zombie sessions: if the API tells us the
        // signed-in user no longer exists (e.g. they were hard-deleted
        // from the ops dashboard while their BFF cookie was still
        // alive), force a clean sign-out + redirect to /sign-in so the
        // SPA isn't stuck in a state where the session signal says
        // "you're signed in" but every API call 404s.
        //
        // The BFF-side fix in /bff/auth/me already handles this on the
        // *next* page load, but anything that fetches the account
        // mid-session (e.g. a navigation that triggers ensureAccountLoaded)
        // still needs this client-side belt-and-braces.
        if (this.isUserNotFound(err)) {
          this.forceLogoutAndRedirect();
        }
        return throwError(() => err);
      }),
    );
  }

  /**
   * Returns true when the HTTP error is a 404 carrying the canonical
   * `user.not_found` ProblemDetails type — i.e. the API refuses to
   * recognise the signed-in user. Tolerates both the fully-qualified
   * `type` URI and the short `title` so renames don't silently break.
   */
  private isUserNotFound(err: unknown): boolean {
    if (!(err instanceof HttpErrorResponse)) return false;
    if (err.status !== 404) return false;
    const body = err.error as { type?: string; title?: string } | null;
    return body?.type === USER_NOT_FOUND_TYPE || body?.title === USER_NOT_FOUND_TITLE;
  }

  private forceLogoutAndRedirect(): void {
    if (this.zombieLogoutInflight) return;
    this.zombieLogoutInflight = true;
    void this.bffAuth
      .signOut()
      .catch(() => undefined) // signOut already swallows network errors; belt-and-braces.
      .finally(() => {
        if (typeof window !== 'undefined') {
          // Use replace() so the back button can't bounce the user
          // straight back into the zombie state.
          window.location.replace('/sign-in');
        }
      });
  }

  updateProfile(body: UpdateProfileRequest): Observable<CustomerAccount> {
    return this.api.updateProfile(body).pipe(tap((a) => this.applyAccount(a)));
  }

  completeOnboardingProfile(body: UpdateProfileRequest): Observable<CustomerAccount> {
    return this.updateProfile(body);
  }

  saveNotifications(prefs: NotificationPreferences): Observable<CustomerAccount> {
    return this.api.updateNotifications(prefs).pipe(tap((a) => this.applyAccount(a)));
  }

  submitKyc(): Observable<CustomerAccount> {
    return this.api.submitKyc().pipe(tap((a) => this.applyAccount(a)));
  }

  saveDeliveryAddress(
    id: string | null,
    body: UpsertDeliveryAddressRequest,
  ): Observable<CustomerAccount> {
    return this.api.upsertDeliveryAddress(id, body).pipe(tap((a) => this.applyAccount(a)));
  }

  deleteDeliveryAddress(id: string): Observable<CustomerAccount> {
    return this.api.deleteDeliveryAddress(id).pipe(tap((a) => this.applyAccount(a)));
  }

  setDefaultDeliveryAddress(id: string): Observable<CustomerAccount> {
    return this.api.setDefaultDeliveryAddress(id).pipe(tap((a) => this.applyAccount(a)));
  }

  activateFirstSuite(planId: string): Observable<CustomerAccount> {
    return this.borderboxApi.activateSuite(planId).pipe(switchMap(() => this.loadAccount()));
  }

  copySuiteAddress(): Observable<boolean> {
    const formatted = this.account()?.suiteAddress?.formatted ?? '';
    if (!formatted) return of(false);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      return new Observable((sub) => {
        void navigator.clipboard.writeText(formatted).then(
          () => {
            sub.next(true);
            sub.complete();
          },
          () => {
            sub.next(false);
            sub.complete();
          },
        );
      });
    }
    return of(false);
  }

  kycLabel(status: string): string {
    const map: Record<string, string> = {
      NotStarted: 'Not started',
      Pending: 'Pending review',
      Verified: 'Verified',
      Rejected: 'Rejected',
    };
    return map[status] ?? status;
  }

  private applyAccount(account: CustomerAccount): void {
    this.account.set(account);
    this.syncSessionProfile(account);
  }

  private syncSessionProfile(account: CustomerAccount): void {
    const current = this.session.currentAccount();
    if (!current) return;
    this.session.patchAccount({
      ...current,
      displayName: account.profile.displayName,
      phone: account.profile.phone || null,
      email: account.profile.email,
    });
  }
}
