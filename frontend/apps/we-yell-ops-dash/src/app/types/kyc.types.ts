export type KycReviewTab = 'Pending' | 'Verified' | 'Rejected';
export type KycRiskLevel = 'Low' | 'Medium' | 'High';

export interface KycApplicantRow {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  countryCode: string;
  countryLabel: string;
  idDocumentType: string;
  idNumber: string;
  kycStatus: string;
  submittedOnUtc: string | null;
  suiteNumber: string | null;
  memberSinceUtc: string | null;
  riskLevel: KycRiskLevel;
}

const COUNTRY_FLAGS: Record<string, string> = {
  SZ: '🇸🇿',
  BW: '🇧🇼',
  NA: '🇳🇦',
  ZA: '🇿🇦',
};

const CHECK_LABELS: Record<string, string> = {
  DocumentUploaded: 'Document uploaded',
  FaceMatch: 'Face match',
  AddressProof: 'Address proof',
  SanctionsScreening: 'Sanctions screening',
  PepScreening: 'PEP screening',
  AdverseMedia: 'Adverse media',
  ExpiryCheck: 'Expiry check',
};

export function countryFlag(code: string): string {
  return COUNTRY_FLAGS[code.toUpperCase()] ?? '🏳️';
}

export function applicantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Normalises the server-provided risk string (Low/Medium/High) onto the
 * narrowed UI union. Falls back to "Low" for any unexpected value so the
 * dashboard never renders an empty risk pill.
 */
export function toRiskLevel(value: string | null | undefined): KycRiskLevel {
  if (value === 'High' || value === 'Medium' || value === 'Low') return value;
  return 'Low';
}

export function riskTone(level: KycRiskLevel): string {
  if (level === 'Low') return 'green';
  if (level === 'Medium') return 'amber';
  return 'red';
}

export function kycStatusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === 'verified') return 'green';
  if (s === 'pending') return 'amber';
  if (s === 'rejected') return 'red';
  return 'gray';
}

export function checkLabel(type: string): string {
  return CHECK_LABELS[type] ?? type.replace(/([A-Z])/g, ' $1').trim();
}

export function checkStatusClass(status: string): 'pass' | 'warn' | 'fail' {
  const s = status.toLowerCase();
  if (s === 'pass') return 'pass';
  if (s === 'warn') return 'warn';
  return 'fail';
}

export function fromPendingDto(item: {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  idDocumentType: string;
  idNumber: string;
  kycStatus: string;
  submittedOnUtc: string;
  riskLevel?: string | null;
}): KycApplicantRow {
  return {
    userId: item.userId,
    displayName: item.displayName,
    email: item.email,
    phone: item.phone,
    countryCode: 'SZ',
    countryLabel: 'Eswatini',
    idDocumentType: item.idDocumentType,
    idNumber: item.idNumber,
    kycStatus: item.kycStatus,
    submittedOnUtc: item.submittedOnUtc,
    suiteNumber: null,
    memberSinceUtc: null,
    riskLevel: toRiskLevel(item.riskLevel),
  };
}

export function fromAccountListItem(item: {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  destinationCountryCode: string;
  destinationCountryLabel: string;
  kycStatus: string;
  suiteNumber: string | null;
  memberSinceUtc: string;
  riskLevel?: string | null;
}): KycApplicantRow {
  return {
    userId: item.userId,
    displayName: item.displayName,
    email: item.email,
    phone: item.phone,
    countryCode: item.destinationCountryCode,
    countryLabel: item.destinationCountryLabel,
    idDocumentType: 'National ID',
    idNumber: '—',
    kycStatus: item.kycStatus,
    submittedOnUtc: null,
    suiteNumber: item.suiteNumber,
    memberSinceUtc: item.memberSinceUtc,
    riskLevel: toRiskLevel(item.riskLevel),
  };
}

export function riskFromChecks(checks: { type: string; status: string }[]): KycRiskLevel {
  if (checks.some((c) => c.type === 'AdverseMedia' && c.status === 'warn')) return 'Medium';
  if (checks.some((c) => c.status === 'fail')) return 'High';
  if (checks.every((c) => c.status === 'pass')) return 'Low';
  return 'Medium';
}
