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
import type {
  CustomerAccount,
  NotificationPreferences,
  UpdateProfileRequest,
  UpsertDeliveryAddressRequest,
} from '../models/customer-account.models';
import { BorderboxApiService } from './borderbox-api.service';
import { CustomerAccountApiService } from './customer-account-api.service';

export interface JourneySnapshot {
  profileComplete: boolean;
  suiteEligible: boolean;
  hasSuite: boolean;
}

@Injectable({ providedIn: 'root' })
export class CustomerAccountService {
  private readonly session = inject(AccountSessionService);
  private readonly api = inject(CustomerAccountApiService);
  private readonly borderboxApi = inject(BorderboxApiService);

  readonly account = signal<CustomerAccount | null>(null);

  private loadInflight: Observable<CustomerAccount> | null = null;

  getJourneySnapshot(): JourneySnapshot {
    const acc = this.account();
    if (acc) {
      return {
        profileComplete: acc.profileComplete,
        suiteEligible: acc.suiteEligible,
        hasSuite: acc.hasSuite,
      };
    }
    return { profileComplete: false, suiteEligible: false, hasSuite: false };
  }

  getPostAuthRoute(snapshot?: JourneySnapshot): string {
    const s = snapshot ?? this.getJourneySnapshot();
    if (!s.profileComplete) return '/onboarding/complete-profile';
    if (!s.hasSuite) return '/onboarding/choose-suite-plan';
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
        return throwError(() => err);
      }),
    );
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
