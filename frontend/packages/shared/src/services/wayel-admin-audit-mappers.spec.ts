import { describe, expect, it } from 'vitest';
import type { MockPlatformTenant } from '../core/mock/mock-data';
import {
  indexTenantsById,
  wayelAuditEntryToMock,
} from './wayel-admin-audit-mappers';
import type { WayelAdminAuditEntry } from './wayel-admin-audit.service';

function entry(over: Partial<WayelAdminAuditEntry> = {}): WayelAdminAuditEntry {
  return {
    action: 'tenant.created',
    outcome: 'Success',
    occurredOnUtc: '2026-04-17T07:55:00.000Z',
    actorUserId: '00000000-0000-0000-0000-000000000001',
    actorEmail: 'platform@wayel.example',
    tenantId: '11111111-1111-1111-1111-111111111111',
    audience: 'admin',
    ip: '127.0.0.1',
    userAgent: 'vitest',
    reason: null,
    metadata: { tenant_id: '11111111-1111-1111-1111-111111111111' },
    ...over,
  };
}

function tenant(id: string, name: string): MockPlatformTenant {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    type: 'PRESCHOOL',
    plan: 'starter',
    status: 'active',
    timezone: 'Africa/Johannesburg',
    createdAt: '2026-04-17T07:55:00.000Z',
  } as MockPlatformTenant;
}

describe('wayelAuditEntryToMock', () => {
  it('hydrates tenantName from the catalogue when the tenantId matches', () => {
    const cat = indexTenantsById([
      tenant('11111111-1111-1111-1111-111111111111', 'Sun Valley'),
    ]);
    const got = wayelAuditEntryToMock(entry(), cat);
    expect(got.tenantName).toBe('Sun Valley');
    expect(got.action).toBe('tenant.created');
    expect(got.actorEmail).toBe('platform@wayel.example');
  });

  it('falls back to null tenantName when the catalogue is empty', () => {
    const got = wayelAuditEntryToMock(entry(), new Map());
    expect(got.tenantName).toBeNull();
  });

  it('substitutes "system" when the actor email is null', () => {
    const got = wayelAuditEntryToMock(
      entry({ actorEmail: null, actorUserId: null }),
      new Map(),
    );
    expect(got.actorEmail).toBe('system');
  });

  it('synthesises a stable id from the natural key', () => {
    const a = wayelAuditEntryToMock(entry(), new Map());
    const b = wayelAuditEntryToMock(entry(), new Map());
    expect(a.id).toBe(b.id);
    const c = wayelAuditEntryToMock(
      entry({ occurredOnUtc: '2026-04-17T07:56:00.000Z' }),
      new Map(),
    );
    expect(c.id).not.toBe(a.id);
  });

  it('composes the detail from outcome + reason + audience', () => {
    expect(
      wayelAuditEntryToMock(entry({ reason: 'manual override' }), new Map()).detail,
    ).toBe('manual override · audience=admin');

    expect(
      wayelAuditEntryToMock(
        entry({ outcome: 'Failure', reason: 'unauthorised' }),
        new Map(),
      ).detail,
    ).toBe('Failure · unauthorised · audience=admin');
  });

  it('emits an em-dash when there is nothing to say in the detail', () => {
    expect(
      wayelAuditEntryToMock(
        entry({ outcome: 'Success', reason: null, audience: null }),
        new Map(),
      ).detail,
    ).toBe('—');
  });

  it('emits null tenantId / tenantName for system-wide entries', () => {
    const got = wayelAuditEntryToMock(
      entry({ tenantId: null, audience: null }),
      new Map(),
    );
    expect(got.tenantId).toBeNull();
    expect(got.tenantName).toBeNull();
  });
});
