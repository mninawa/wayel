import {
  normalizeCustomerPhone,
  sanitizeCustomerPhoneInput,
  validateCustomerPhone,
} from './customer-phone';

describe('customer-phone', () => {
  it('accepts South Africa E.164', () => {
    expect(normalizeCustomerPhone('+27733039541')).toBe('+27733039541');
    expect(validateCustomerPhone('+27733039541')).toBeNull();
  });

  it('accepts Eswatini E.164', () => {
    expect(normalizeCustomerPhone('+26876909291')).toBe('+26876909291');
    expect(validateCustomerPhone('+26876909291')).toBeNull();
  });

  it('normalizes local South African format', () => {
    expect(normalizeCustomerPhone('0733039541')).toBe('+27733039541');
  });

  it('normalizes local Eswatini format', () => {
    expect(normalizeCustomerPhone('076909291')).toBe('+26876909291');
  });

  it('rejects multiple numbers or stray text', () => {
    expect(validateCustomerPhone('0733039541 or')).toMatch(/one phone number/i);
    expect(normalizeCustomerPhone('0733039541 or')).toBeNull();
  });

  it('strips non-digit characters except leading plus', () => {
    expect(sanitizeCustomerPhoneInput('0733039541 or')).toBe('0733039541');
    expect(sanitizeCustomerPhoneInput('+27 73 303 9541')).toBe('+27733039541');
  });

  it('rejects wrong length or country code', () => {
    expect(validateCustomerPhone('+271234')).not.toBeNull();
    expect(validateCustomerPhone('+26812345')).not.toBeNull();
  });
});
