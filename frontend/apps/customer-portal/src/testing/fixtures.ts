/**
 * Shared test fixtures and lightweight stubs for the customer-portal specs.
 *
 * Tests stay focused on behaviour by importing pre-built `CustomerAccount`
 * objects + a minimal `AccountSessionService` fake instead of repeating
 * payload boilerplate in every spec.
 */

import { computed, signal } from '@angular/core';
import type {
  CustomerAccount,
  CustomerProfile,
  DeliveryAddress,
  NotificationPreferences,
  SuiteAddress,
  SuiteTrial,
} from '../app/models/customer-account.models';

/** Stable identity for tests that don't care about the user id. */
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/** Notification toggle defaults (all on but marketing) mirror the prod default. */
export function notificationsFixture(
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  return {
    email: true,
    sms: false,
    whatsApp: true,
    marketing: false,
    ...overrides,
  };
}

export function profileFixture(overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  return {
    userId: DEFAULT_USER_ID,
    email: 'sandile@example.com',
    firstName: 'Sandile',
    lastName: 'Mahlangu',
    displayName: 'Sandile Mahlangu',
    phone: '+27821234567',
    destinationCountryCode: 'SZ',
    destinationCountryLabel: 'Eswatini',
    idNumber: '8001015009087',
    idDocumentType: 'NationalId',
    preferredDeliveryMethod: 'PUDO',
    kycStatus: 'Verified',
    kycRejectionReason: null,
    memberSince: '2025-01-01T00:00:00Z',
    authProvider: 'google',
    ...overrides,
  };
}

export function suiteAddressFixture(overrides: Partial<SuiteAddress> = {}): SuiteAddress {
  return {
    suiteNumber: 'SUI-12345',
    label: 'Sandile @ WeYell',
    recipientName: 'Sandile Mahlangu',
    warehouseName: 'Sandton Warehouse',
    line1: '1 Maude St',
    line2: 'Suite SUI-12345',
    city: 'Sandton',
    province: 'Gauteng',
    postalCode: '2196',
    country: 'South Africa',
    countryCode: 'ZA',
    formatted: 'Sandile Mahlangu\nSuite SUI-12345\nSandton Warehouse, 1 Maude St\nSandton 2196 ZA',
    ...overrides,
  };
}

export function deliveryAddressFixture(overrides: Partial<DeliveryAddress> = {}): DeliveryAddress {
  return {
    id: 'addr-1',
    branchId: 'branch-mbabane',
    branchName: 'Mbabane WeYell branch',
    label: 'Home pickup',
    fullName: 'Sandile Mahlangu',
    phone: '+27821234567',
    line1: 'Mall pickup desk',
    line2: null,
    city: 'Mbabane',
    region: 'Hhohho',
    countryCode: 'SZ',
    countryLabel: 'Eswatini',
    isDefault: true,
    ...overrides,
  };
}

export function suiteTrialFixture(overrides: Partial<SuiteTrial> = {}): SuiteTrial {
  return {
    featureEnabled: true,
    durationDays: 30,
    eligible: false,
    isActive: false,
    expiresAtUtc: null,
    ...overrides,
  };
}

/**
 * Defaults are a fully-onboarded customer with an active suite — pass
 * `journey: 'profileIncomplete' | 'suitePending'` to roll back stages.
 */
export function accountFixture(
  overrides: Partial<CustomerAccount> & {
    journey?: 'ready' | 'profileIncomplete' | 'suitePending';
  } = {},
): CustomerAccount {
  const journey = overrides.journey ?? 'ready';
  const base: CustomerAccount = {
    profile: profileFixture(),
    suiteAddress: suiteAddressFixture(),
    deliveryAddresses: [deliveryAddressFixture()],
    notifications: notificationsFixture(),
    profileComplete: true,
    suiteEligible: false,
    hasSuite: true,
    onboardingIntent: null,
    suiteTrial: suiteTrialFixture(),
  };

  if (journey === 'profileIncomplete') {
    base.profile = profileFixture({ phone: '', idNumber: '' });
    base.suiteAddress = null;
    base.deliveryAddresses = [];
    base.profileComplete = false;
    base.suiteEligible = false;
    base.hasSuite = false;
    base.suiteTrial = suiteTrialFixture({ eligible: false });
  }

  if (journey === 'suitePending') {
    base.suiteAddress = null;
    base.deliveryAddresses = [];
    base.profileComplete = true;
    base.suiteEligible = true;
    base.hasSuite = false;
    base.suiteTrial = suiteTrialFixture({ eligible: true });
  }

  // Apply any explicit overrides on top of the journey preset.
  const { journey: _drop, ...rest } = overrides;
  return { ...base, ...rest };
}

/**
 * Minimal `AccountSessionService` stub that lets a test toggle signed-in
 * state and role without dragging the real implementation (which talks
 * to localStorage / fetch) into the test bed.
 */
export class FakeAccountSessionService {
  private readonly _signedIn = signal(true);
  private readonly _role = signal<'parent' | 'staff' | 'admin' | null>('parent');
  private readonly _account = signal<{ displayName: string; phone: string | null; email: string } | null>(
    { displayName: 'Sandile', phone: '+27821234567', email: 'sandile@example.com' },
  );

  readonly currentAccount = computed(() => this._account());
  readonly isSignedIn = computed(() => this._signedIn());
  readonly role = computed(() => this._role());

  setSignedIn(value: boolean): void {
    this._signedIn.set(value);
  }

  setRole(role: 'parent' | 'staff' | 'admin' | null): void {
    this._role.set(role);
  }

  setAccount(account: { displayName: string; phone: string | null; email: string } | null): void {
    this._account.set(account);
  }

  patchAccount(account: { displayName: string; phone: string | null; email: string }): void {
    this._account.set(account);
  }

  homeRouteForRole(): string {
    switch (this._role()) {
      case 'staff':
        return '/staff/institution';
      case 'admin':
        return '/admin';
      default:
        return '/dashboard';
    }
  }
}
