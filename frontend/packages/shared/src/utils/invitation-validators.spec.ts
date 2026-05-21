import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  validateEmail,
  validatePhone,
  validateRole,
} from './invitation-validators';

describe('validateEmail()', () => {
  it.each([
    ['teacher@school.edu'],
    ['a.b+plus@example.co.za'],
    ['x@y.z'],
  ])('accepts %s', (input) => {
    expect(validateEmail(input)).toBeNull();
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateEmail('  teacher@school.edu  ')).toBeNull();
  });

  it.each([
    ['', 'Email is required.'],
    ['   ', 'Email is required.'],
    ['no-at-sign.example.com', 'Enter a valid email address.'],
    ['missing@tld', 'Enter a valid email address.'],
    ['has space@example.com', 'Enter a valid email address.'],
  ])('rejects %s', (input, expected) => {
    expect(validateEmail(input)).toBe(expected);
  });
});

describe('isValidEmail()', () => {
  it('returns true for valid addresses and false otherwise', () => {
    expect(isValidEmail('teacher@school.edu')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('validateRole()', () => {
  it('accepts plausible role labels', () => {
    expect(validateRole('Teacher')).toBeNull();
    expect(validateRole('Coach / instructor')).toBeNull();
  });

  it('rejects empty/whitespace and one-character labels', () => {
    expect(validateRole('')).toBe('Role is required.');
    expect(validateRole('   ')).toBe('Role is required.');
    expect(validateRole('A')).toBe('Role looks too short.');
  });
});

describe('validatePhone()', () => {
  it('treats blank phone as optional when channel is email', () => {
    expect(validatePhone('', 'email')).toBeNull();
  });

  it('requires a phone when channel is whatsapp or both', () => {
    expect(validatePhone('', 'whatsapp')).toBe(
      'Phone is required to send via WhatsApp.',
    );
    expect(validatePhone('', 'both')).toBe(
      'Phone is required to send via WhatsApp.',
    );
  });

  it('accepts well-formed numbers regardless of formatting', () => {
    expect(validatePhone('+27 82 555 0123', 'whatsapp')).toBeNull();
    expect(validatePhone('0825550123', 'both')).toBeNull();
    expect(validatePhone('(027) 11-555-0100', 'email')).toBeNull();
  });

  it('rejects numbers with too few digits, even on email channel', () => {
    expect(validatePhone('123', 'email')).toBe(
      'Enter a full phone number including country code.',
    );
    expect(validatePhone('+27 82', 'whatsapp')).toBe(
      'Enter a full phone number including country code.',
    );
  });
});
