/** WeYell customer account — profile + addresses (Phase 1). */

export type KycStatus = 'NotStarted' | 'Pending' | 'Verified' | 'Rejected';
export type DeliveryMethod = 'Door-to-Door' | 'PUDO';
export type IdDocumentType = 'NationalId' | 'Passport';

export type AuthProvider = 'google' | 'password';

export interface CustomerProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  destinationCountryCode: string;
  destinationCountryLabel: string;
  idNumber: string;
  idDocumentType: IdDocumentType;
  preferredDeliveryMethod: DeliveryMethod;
  kycStatus: KycStatus;
  memberSince: string;
  authProvider: AuthProvider;
}

/** Returns true when required KYC / contact fields are filled. */
export function isProfileComplete(profile: CustomerProfile): boolean {
  return !!(
    profile.firstName.trim() &&
    profile.lastName.trim() &&
    profile.phone.trim() &&
    profile.idNumber.trim() &&
    profile.idDocumentType &&
    profile.preferredDeliveryMethod
  );
}

export interface SuiteAddress {
  suiteNumber: string;
  label: string;
  recipientName: string;
  warehouseName: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  countryCode: string;
  /** Multi-line block for clipboard */
  formatted: string;
}

export interface DeliveryAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  countryCode: string;
  countryLabel: string;
  isDefault: boolean;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  whatsApp: boolean;
  marketing: boolean;
}

export interface CustomerAccount {
  profile: CustomerProfile;
  /** Null until the customer completes suite checkout. */
  suiteAddress: SuiteAddress | null;
  deliveryAddresses: DeliveryAddress[];
  notifications: NotificationPreferences;
  profileComplete: boolean;
  /** Profile is complete and no suite has been assigned yet. */
  suiteEligible: boolean;
  hasSuite: boolean;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
  phone: string;
  idNumber: string;
  idDocumentType: IdDocumentType;
  preferredDeliveryMethod: DeliveryMethod;
}

export interface UpsertDeliveryAddressRequest {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  isDefault: boolean;
}
