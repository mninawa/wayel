/** South Africa: +27 + 9 digits (e.g. +27733039541). */
const SOUTH_AFRICA = /^\+27\d{9}$/;

/** Eswatini: +268 + 8 digits (e.g. +26876909291). */
const ESWATINI = /^\+268\d{8}$/;

export const CUSTOMER_PHONE_HINT =
  'Use one number: +27 followed by 9 digits (South Africa) or +268 followed by 8 digits (Eswatini).';

/** Keep only a leading + and digits (blocks letters and "or" text). */
export function sanitizeCustomerPhoneInput(raw: string): string {
  let out = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch;
    } else if (ch === '+' && out.length === 0) {
      out = '+';
    }
  }
  return out.length > 12 ? out.slice(0, 12) : out;
}

export function normalizeCustomerPhone(raw: string): string | null {
  const stripped = sanitizeCustomerPhoneInput(raw.trim());
  if (!stripped) {
    return null;
  }

  let normalized = stripped;

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (!normalized.startsWith('+')) {
    if (normalized.startsWith('0') && normalized.length === 10) {
      normalized = `+27${normalized.slice(1)}`;
    } else if (normalized.startsWith('27') && normalized.length === 11) {
      normalized = `+${normalized}`;
    } else if (normalized.startsWith('0') && normalized.length === 9) {
      normalized = `+268${normalized.slice(1)}`;
    } else if (normalized.startsWith('268') && normalized.length === 11) {
      normalized = `+${normalized}`;
    } else if (normalized.length === 9 && /^[678]/.test(normalized)) {
      normalized = `+27${normalized}`;
    } else if (normalized.length === 8 && normalized.startsWith('7')) {
      normalized = `+268${normalized}`;
    } else {
      return null;
    }
  }

  if (SOUTH_AFRICA.test(normalized) || ESWATINI.test(normalized)) {
    return normalized;
  }

  return null;
}

export function validateCustomerPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'Phone number is required.';
  }
  if (/[a-zA-Z]/.test(trimmed) || /[,;\/|]|\bor\b/i.test(trimmed)) {
    return 'Enter one phone number only.';
  }
  if (normalizeCustomerPhone(trimmed)) {
    return null;
  }
  return CUSTOMER_PHONE_HINT;
}

export function isValidCustomerPhone(raw: string): boolean {
  return validateCustomerPhone(raw) === null;
}
