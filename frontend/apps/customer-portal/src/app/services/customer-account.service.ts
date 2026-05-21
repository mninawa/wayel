import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  delay,
  finalize,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import type { Phase0AuthResponse } from '@wayel/shared/core/contracts/accounts.phase0';
import { environment } from '../../environments/environment';
import {
  assignMockSuite,
  getMockCustomerAccount,
  provisionFullDemoUser,
  provisionGoogleSignUp,
  removeMockDeliveryAddress,
  setDefaultMockDeliveryAddress,
  updateMockNotifications,
  updateMockProfile,
  upsertMockDeliveryAddress,
} from '../data/customer-account.mock';
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
    if (environment.useMock) {
      const mock = getMockCustomerAccount();
      return {
        profileComplete: mock.profileComplete,
        suiteEligible: mock.suiteEligible,
        hasSuite: mock.hasSuite,
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
    const source = environment.useMock
      ? of(getMockCustomerAccount()).pipe(delay(80))
      : this.api.getAccount();

    return source.pipe(
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

  signInWithGoogleMock(
    email = 'new.user@gmail.com',
    displayName = 'New WeYell User',
  ): Observable<CustomerAccount> {
    const acc = provisionGoogleSignUp(email, displayName);
    this.session.setSession(this.toAuthResponse(acc));
    this.account.set(acc);
    return of(acc).pipe(delay(400));
  }

  signInAsFullDemoMock(): Observable<CustomerAccount> {
    const acc = provisionFullDemoUser();
    this.session.setSession(this.toAuthResponse(acc));
    this.account.set(acc);
    return of(acc).pipe(delay(200));
  }

  updateProfile(body: UpdateProfileRequest): Observable<CustomerAccount> {
    if (environment.useMock) {
      updateMockProfile({
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        phone: body.phone.trim(),
        idNumber: body.idNumber.trim(),
        idDocumentType: body.idDocumentType,
        preferredDeliveryMethod: body.preferredDeliveryMethod,
      });
      const next = getMockCustomerAccount();
      this.account.set(next);
      this.syncSessionProfile(next);
      return of(next).pipe(delay(300));
    }
    return this.api.updateProfile(body).pipe(tap((a) => this.applyAccount(a)));
  }

  completeOnboardingProfile(body: UpdateProfileRequest): Observable<CustomerAccount> {
    return this.updateProfile(body);
  }

  saveNotifications(prefs: NotificationPreferences): Observable<CustomerAccount> {
    if (environment.useMock) {
      updateMockNotifications(prefs);
      const next = getMockCustomerAccount();
      this.account.set(next);
      return of(next).pipe(delay(200));
    }
    return this.api.updateNotifications(prefs).pipe(tap((a) => this.applyAccount(a)));
  }

  saveDeliveryAddress(
    id: string | null,
    body: UpsertDeliveryAddressRequest,
  ): Observable<CustomerAccount> {
    if (environment.useMock) {
      upsertMockDeliveryAddress(id, {
        label: body.label,
        fullName: body.fullName,
        phone: body.phone,
        line1: body.line1,
        line2: body.line2,
        city: body.city,
        region: body.region,
        isDefault: body.isDefault,
      });
      const next = getMockCustomerAccount();
      this.account.set(next);
      return of(next).pipe(delay(250));
    }
    return this.api.upsertDeliveryAddress(id, body).pipe(tap((a) => this.applyAccount(a)));
  }

  deleteDeliveryAddress(id: string): Observable<CustomerAccount> {
    if (environment.useMock) {
      removeMockDeliveryAddress(id);
      const next = getMockCustomerAccount();
      this.account.set(next);
      return of(next).pipe(delay(200));
    }
    return this.api.deleteDeliveryAddress(id).pipe(tap((a) => this.applyAccount(a)));
  }

  setDefaultDeliveryAddress(id: string): Observable<CustomerAccount> {
    if (environment.useMock) {
      setDefaultMockDeliveryAddress(id);
      const next = getMockCustomerAccount();
      this.account.set(next);
      return of(next).pipe(delay(150));
    }
    return this.api.setDefaultDeliveryAddress(id).pipe(tap((a) => this.applyAccount(a)));
  }

  activateFirstSuite(planId: string): Observable<CustomerAccount> {
    if (environment.useMock) {
      const num = planId.includes('quarterly')
        ? '24789'
        : String(10000 + Math.floor(Math.random() * 89999));
      assignMockSuite(num);
      const next = getMockCustomerAccount();
      this.account.set(next);
      return of(next).pipe(delay(600));
    }
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

  private toAuthResponse(acc: CustomerAccount): Phase0AuthResponse {
    return {
      account: {
        id: acc.profile.userId,
        role: 'parent',
        email: acc.profile.email,
        displayName: acc.profile.displayName,
        phone: acc.profile.phone || null,
        createdAt: new Date().toISOString(),
        parentId: 'parent_weyell',
      },
      sessionToken: `sess_${acc.profile.userId}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
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
