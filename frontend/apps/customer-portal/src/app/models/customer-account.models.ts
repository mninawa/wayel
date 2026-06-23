/** WeYell customer account — profile + addresses (Phase 1). */

export type KycStatus = 'NotStarted' | 'Pending' | 'Verified' | 'Rejected';
/** Ship-out is pick-up (PUDO) only. Legacy accounts may still have Door-to-Door stored. */
export type DeliveryMethod = 'PUDO' | 'Door-to-Door';
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
  kycRejectionReason?: string | null;
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

export interface PickupBranch {
  id: string;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  description: string;
  poBox?: string | null;
  postalCode?: string;
  countryCode?: string;
  phone?: string | null;
  phoneAlt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
}

export interface DeliveryAddress {
  id: string;
  branchId: string;
  branchName: string;
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

export interface OnboardingIntent {
  /** Currently the only kind. Discriminator left as a string for future expansion. */
  kind: 'pay_later';
  createdAtUtc: string;
  lastSeenAtUtc: string;
  planIdAtSignal: string | null;
  planLabelAtSignal: string | null;
}

export interface SuiteTrial {
  featureEnabled: boolean;
  durationDays: number;
  eligible: boolean;
  isActive: boolean;
  expiresAtUtc: string | null;
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
  /**
   * Server-persisted onboarding intent. Today this is only the "pay later"
   * branch — set when a customer defers suite payment during onboarding and
   * cleared automatically by the suite-checkout completion handler. Null when
   * there is no active intent (the SPA suppresses resolved intents).
   */
  onboardingIntent: OnboardingIntent | null;
  /** Free-trial onboarding snapshot from the API (toggle + eligibility). */
  suiteTrial: SuiteTrial | null;
  /** When false, customer KYC upload UI is hidden. */
  kycEnabled: boolean;
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
  branchId: string;
  label: string;
  fullName: string;
  phone: string;
  isDefault: boolean;
}

export type KycDocumentSide = 'front' | 'back' | 'selfie';

export interface KycDocumentUploadTicket {
  documentId: string;
  side: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAtUtc: string;
}

export interface KycDocumentInfo {
  documentId: string;
  side: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAtUtc: string;
  confirmed: boolean;
  downloadUrl: string | null;
}

export interface CustomerKycStatus {
  enabled: boolean;
  kycStatus: KycStatus;
  rejectionReason: string | null;
  canSubmit: boolean;
  canUploadDocuments: boolean;
  requiredSides: string[];
  documents: KycDocumentInfo[];
  submittedAtUtc: string | null;
}
