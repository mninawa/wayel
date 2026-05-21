/**
 * Validators shared between the staff-invitation compose form and the
 * mock bridge `create()` path. Keeping them as plain functions (no DI)
 * lets us unit-test them in isolation and reuse the same rules from any
 * future API-side validator port.
 *
 * All validators return `null` for the "valid" case, and a short,
 * user-facing string otherwise. The empty/blank input case is intentionally
 * treated as "required" — callers wanting a "skip when blank" rule should
 * branch before calling.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Emails: trimmed, must look like `local@host.tld`. */
export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Email is required.';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address.';
  return null;
}

/** Role string: required, at least 2 visible characters. */
export function validateRole(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Role is required.';
  if (v.length < 2) return 'Role looks too short.';
  return null;
}

/**
 * Phone: optional unless the chosen channel needs WhatsApp. When present
 * we want at least 7 digits (any formatting allowed) to catch obvious
 * typos like "0821" without blocking real-world spacing or `+` prefixes.
 */
export function validatePhone(
  value: string,
  channel: 'email' | 'whatsapp' | 'both',
): string | null {
  const v = value.trim();
  if ((channel === 'whatsapp' || channel === 'both') && !v) {
    return 'Phone is required to send via WhatsApp.';
  }
  if (v && v.replace(/[^\d]/g, '').length < 7) {
    return 'Enter a full phone number including country code.';
  }
  return null;
}

/** Convenience used by the bridge — true when a string is a valid email. */
export function isValidEmail(value: string): boolean {
  return validateEmail(value) === null;
}
