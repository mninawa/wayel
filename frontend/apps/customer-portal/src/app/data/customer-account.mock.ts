import type {
  CustomerAccount,
  CustomerProfile,
  DeliveryAddress,
  NotificationPreferences,
  SuiteAddress,
} from '../models/customer-account.models';
import { isProfileComplete } from '../models/customer-account.models';

const FULL_PROFILE: CustomerProfile = {
  userId: 'acct_sabelo_weyell',
  email: 'sabelo@weyell.demo',
  firstName: 'Sabelo',
  lastName: 'Dlamini',
  displayName: 'Sabelo Dlamini',
  phone: '+268 76 123 4567',
  destinationCountryCode: 'SZ',
  destinationCountryLabel: 'Eswatini',
  idNumber: '8001011234567',
  idDocumentType: 'NationalId',
  preferredDeliveryMethod: 'Door-to-Door',
  kycStatus: 'Verified',
  memberSince: '1 Jun 2025',
  authProvider: 'password',
};

function formatSuiteAddress(suite: Omit<SuiteAddress, 'formatted'>, name: string): string {
  return [
    name,
    `WeYell – Suite ${suite.suiteNumber}`,
    suite.warehouseName,
    suite.line1,
    [suite.line2, suite.city, suite.province, suite.postalCode].filter(Boolean).join(', '),
    suite.country,
  ].join('\n');
}

let assignedSuiteNumber = '24789';

function suiteBase(): Omit<SuiteAddress, 'formatted' | 'label'> & { label: string } {
  return {
    suiteNumber: assignedSuiteNumber,
    label: `WeYell – Suite ${assignedSuiteNumber}`,
    recipientName: profile.displayName,
    warehouseName: 'Shoprite Checkers Crowthorne',
    line1: 'Cnr Old Pretoria Road & Crowthorne Drive',
    line2: 'Crowthorne',
    city: 'Midrand',
    province: 'Gauteng',
    postalCode: '1685',
    country: 'South Africa',
    countryCode: 'ZA',
  };
}

let profile: CustomerProfile = { ...FULL_PROFILE };
let hasSuiteAssigned = true;
let deliveryAddresses: DeliveryAddress[] = [
  {
    id: 'addr_home',
    label: 'Home',
    fullName: 'Sabelo Dlamini',
    phone: '+268 76 123 4567',
    line1: 'Plot 42, Matsapha Industrial Site',
    line2: null,
    city: 'Manzini',
    region: 'Manzini Region',
    countryCode: 'SZ',
    countryLabel: 'Eswatini',
    isDefault: true,
  },
];

let notifications: NotificationPreferences = {
  email: true,
  sms: true,
  whatsApp: true,
  marketing: false,
};

function buildSuiteAddress(): SuiteAddress {
  const base = suiteBase();
  return {
    ...base,
    formatted: formatSuiteAddress(base, profile.displayName),
  };
}

function buildAccount(): CustomerAccount {
  const complete = isProfileComplete(profile);
  return {
    profile: { ...profile },
    suiteAddress: hasSuiteAssigned ? buildSuiteAddress() : null,
    deliveryAddresses: deliveryAddresses.map((a) => ({ ...a })),
    notifications: { ...notifications },
    profileComplete: complete,
    suiteEligible: complete && !hasSuiteAssigned,
    hasSuite: hasSuiteAssigned,
  };
}

export function getMockCustomerAccount(): CustomerAccount {
  return buildAccount();
}

/** Simulates Google SSO sign-up — identity only, profile incomplete, no suite. */
export function provisionGoogleSignUp(email: string, displayName: string): CustomerAccount {
  const parts = displayName.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ') || '';
  profile = {
    userId: `acct_google_${Date.now()}`,
    email: email.trim().toLowerCase(),
    firstName,
    lastName,
    displayName: displayName.trim() || email,
    phone: '',
    destinationCountryCode: 'SZ',
    destinationCountryLabel: 'Eswatini',
    idNumber: '',
    idDocumentType: 'NationalId',
    preferredDeliveryMethod: 'Door-to-Door',
    kycStatus: 'NotStarted',
    memberSince: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    authProvider: 'google',
  };
  hasSuiteAssigned = false;
  deliveryAddresses = [];
  return buildAccount();
}

/** Full demo user with profile + suite (dev shortcut). */
export function provisionFullDemoUser(): CustomerAccount {
  profile = { ...FULL_PROFILE };
  hasSuiteAssigned = true;
  deliveryAddresses = [
    {
      id: 'addr_home',
      label: 'Home',
      fullName: profile.displayName,
      phone: profile.phone,
      line1: 'Plot 42, Matsapha Industrial Site',
      line2: null,
      city: 'Manzini',
      region: 'Manzini Region',
      countryCode: 'SZ',
      countryLabel: 'Eswatini',
      isDefault: true,
    },
  ];
  return buildAccount();
}

export function assignMockSuite(suiteNumber = '24789'): void {
  hasSuiteAssigned = true;
  assignedSuiteNumber = suiteNumber;
  if (profile.kycStatus === 'NotStarted') {
    profile = { ...profile, kycStatus: 'Pending' };
  }
}

export function updateMockProfile(patch: Partial<CustomerProfile>): CustomerProfile {
  const first = patch.firstName ?? profile.firstName;
  const last = patch.lastName ?? profile.lastName;
  profile = {
    ...profile,
    ...patch,
    firstName: first,
    lastName: last,
    displayName: `${first} ${last}`.trim(),
    kycStatus:
      isProfileComplete({ ...profile, firstName: first, lastName: last })
        ? profile.kycStatus === 'NotStarted'
          ? 'Pending'
          : profile.kycStatus
        : profile.kycStatus,
  };
  return profile;
}

export function updateMockNotifications(prefs: NotificationPreferences): void {
  notifications = { ...prefs };
}

export function upsertMockDeliveryAddress(
  id: string | null,
  input: Omit<DeliveryAddress, 'id' | 'countryCode' | 'countryLabel'>,
): DeliveryAddress {
  if (input.isDefault) {
    deliveryAddresses = deliveryAddresses.map((a) => ({ ...a, isDefault: false }));
  }
  if (id) {
    const idx = deliveryAddresses.findIndex((a) => a.id === id);
    if (idx >= 0) {
      deliveryAddresses[idx] = {
        ...deliveryAddresses[idx],
        ...input,
        id,
        countryCode: 'SZ',
        countryLabel: 'Eswatini',
      };
      return deliveryAddresses[idx];
    }
  }
  const created: DeliveryAddress = {
    id: `addr_${Date.now()}`,
    ...input,
    countryCode: 'SZ',
    countryLabel: 'Eswatini',
  };
  deliveryAddresses = [...deliveryAddresses, created];
  return created;
}

export function removeMockDeliveryAddress(id: string): void {
  const removed = deliveryAddresses.find((a) => a.id === id);
  deliveryAddresses = deliveryAddresses.filter((a) => a.id !== id);
  if (removed?.isDefault && deliveryAddresses.length > 0) {
    deliveryAddresses[0] = { ...deliveryAddresses[0], isDefault: true };
  }
}

export function setDefaultMockDeliveryAddress(id: string): void {
  deliveryAddresses = deliveryAddresses.map((a) => ({
    ...a,
    isDefault: a.id === id,
  }));
}
