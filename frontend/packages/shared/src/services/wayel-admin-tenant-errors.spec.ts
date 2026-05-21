import { describe, expect, it } from 'vitest';
import type { WayelAdminTenantsHttpError } from './wayel-admin-tenants.service';
import { tenantHttpErrorMessage } from './wayel-admin-tenant-errors';

function err(
  status: number,
  code: string | undefined,
  message: string,
): WayelAdminTenantsHttpError {
  const e = new Error(message) as WayelAdminTenantsHttpError;
  e.status = status;
  e.code = code;
  return e;
}

describe('tenantHttpErrorMessage', () => {
  it('rewrites tenant.archived regardless of scope', () => {
    const e = err(409, 'tenant.archived', 'archived');
    expect(tenantHttpErrorMessage(e, 'profile')).toContain('archived');
    expect(tenantHttpErrorMessage(e, 'branding')).toContain('archived');
    expect(tenantHttpErrorMessage(e, 'settings')).toContain('archived');
  });

  it('rewrites tenant.not_found with a reload hint', () => {
    const e = err(404, 'tenant.not_found', 'gone');
    const msg = tenantHttpErrorMessage(e, 'profile');
    expect(msg).toMatch(/no longer exists|reload/i);
  });

  it('rewrites the profile age-range domain code into a human sentence', () => {
    const e = err(400, 'tenant.profile.age_range_invalid', 'bad range');
    expect(tenantHttpErrorMessage(e, 'profile')).toMatch(/non-negative/i);
  });

  it('rewrites the branding colour domain code with a hex example', () => {
    const e = err(400, 'tenant.branding.color_invalid', 'bad colour');
    const msg = tenantHttpErrorMessage(e, 'branding');
    expect(msg).toMatch(/#[0-9A-F]{6}/);
  });

  it('rewrites the settings extension code with the lower-case rule', () => {
    const e = err(400, 'tenant.settings.extension_invalid', 'bad ext');
    const msg = tenantHttpErrorMessage(e, 'settings');
    expect(msg).toMatch(/lower-case/);
    expect(msg).toMatch(/leading dot/);
  });

  it('passes the validation.failed detail through verbatim', () => {
    const e = err(
      400,
      'validation.failed',
      "AgeMaxYears: 'AgeMaxYears' must be greater than or equal to 'AgeMinYears'.",
    );
    expect(tenantHttpErrorMessage(e, 'profile')).toBe(
      "AgeMaxYears: 'AgeMaxYears' must be greater than or equal to 'AgeMinYears'.",
    );
  });

  it('reuses the API detail for unknown codes when the message is short and friendly', () => {
    const e = err(400, 'tenant.something_new', 'A specific human-readable message.');
    expect(tenantHttpErrorMessage(e, 'profile')).toBe('A specific human-readable message.');
  });

  it('returns null for unknown codes when message looks generic', () => {
    const e = err(500, undefined, 'Request failed with HTTP 500.');
    expect(tenantHttpErrorMessage(e, 'profile')).toBeNull();
  });

  it('returns null for non-error inputs (caller falls back to generic helper)', () => {
    expect(tenantHttpErrorMessage(null, 'profile')).toBeNull();
    expect(tenantHttpErrorMessage('boom', 'profile')).toBeNull();
    expect(tenantHttpErrorMessage(new Error('plain'), 'profile')).toBeNull();
  });

  it('scopes tenant.name_required to the form (display name vs tenant name)', () => {
    const e = err(400, 'tenant.name_required', 'name required');
    expect(tenantHttpErrorMessage(e, 'profile')).toMatch(/Display name/);
    expect(tenantHttpErrorMessage(e, 'record')).toMatch(/Tenant name/);
  });
});
