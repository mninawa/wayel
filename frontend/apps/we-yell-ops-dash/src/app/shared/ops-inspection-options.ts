export const PACKAGING_TYPE_OPTIONS = [
  'Corrugated box',
  'Poly mailer',
  'Envelope',
  'Other',
] as const;

export const CONDITION_OPTIONS = [
  { value: 'GOOD', label: 'Good' },
  { value: 'MINOR_DAMAGE', label: 'Minor damage' },
  { value: 'MAJOR_DAMAGE', label: 'Major damage' },
  { value: 'OTHER', label: 'Other' },
] as const;

export function resolvePackagingTypeForSave(type: string, otherDetail: string): string {
  if (type !== 'Other') return type;
  const detail = otherDetail.trim();
  return detail || 'Other';
}

export function splitPackagingTypeFromApi(value: string | null | undefined): {
  type: string;
  otherDetail: string;
} {
  if (!value) return { type: 'Corrugated box', otherDetail: '' };
  if ((PACKAGING_TYPE_OPTIONS as readonly string[]).includes(value)) {
    return { type: value, otherDetail: '' };
  }
  return { type: 'Other', otherDetail: value };
}
