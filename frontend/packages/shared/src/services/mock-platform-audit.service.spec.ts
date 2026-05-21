import { describe, expect, it } from 'vitest';
import { MockPlatformAuditService } from './mock-platform-audit.service';

/**
 * The audit service is a thin wrapper around an Angular `signal()` and uses
 * no DI in its constructor, so we can instantiate it directly. Each test
 * gets its own instance to avoid bleeding state.
 */
function svc(): MockPlatformAuditService {
  return new MockPlatformAuditService();
}

describe('MockPlatformAuditService.record()', () => {
  it('appends new entries to the front (newest-first)', () => {
    const a = svc();
    const before = a.entries().length;
    a.record({
      action: 'demo.created',
      tenantId: 't1',
      tenantName: 'Tenant 1',
      actorEmail: 'a@b.c',
      detail: 'first',
      subjectId: 'subj-1',
    });
    expect(a.entries().length).toBe(before + 1);
    expect(a.entries()[0]).toMatchObject({
      action: 'demo.created',
      detail: 'first',
      subjectId: 'subj-1',
      tenantId: 't1',
    });
  });

  it('auto-generates id and timestamp when omitted', () => {
    const a = svc();
    a.record({ action: 'demo.auto' });
    const head = a.entries()[0];
    expect(head.id).toMatch(/^pau_run_/);
    expect(() => new Date(head.occurredAt).toISOString()).not.toThrow();
    expect(head.actorEmail).toBe('staff@example.com');
    expect(head.tenantId).toBeNull();
    expect(head.tenantName).toBeNull();
    expect(head.detail).toBe('');
    expect(head.subjectId).toBeNull();
  });

  it('respects caller-supplied id and timestamp', () => {
    const a = svc();
    a.record({
      id: 'pau_custom',
      occurredAt: '2026-01-01T00:00:00.000Z',
      action: 'demo.custom',
    });
    const head = a.entries()[0];
    expect(head.id).toBe('pau_custom');
    expect(head.occurredAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('MockPlatformAuditService.query()', () => {
  it('filters by tenantId, including null (platform-only events)', () => {
    const a = svc();
    a.record({ action: 'tenant.x', tenantId: 't1' });
    a.record({ action: 'tenant.y', tenantId: 't2' });
    a.record({ action: 'platform.z', tenantId: null });

    expect(a.query({ tenantId: 't1' }).every((e) => e.tenantId === 't1')).toBe(
      true,
    );
    expect(a.query({ tenantId: null }).every((e) => e.tenantId === null)).toBe(
      true,
    );
  });

  it('filters by subjectId', () => {
    const a = svc();
    a.record({ action: 'invite.created', subjectId: 'inv_1' });
    a.record({ action: 'invite.revoked', subjectId: 'inv_1' });
    a.record({ action: 'invite.created', subjectId: 'inv_2' });

    const out = a.query({ subjectId: 'inv_1' });
    expect(out.length).toBe(2);
    expect(out.every((e) => e.subjectId === 'inv_1')).toBe(true);
  });

  it('filters by action prefix', () => {
    const a = svc();
    a.record({ action: 'staff_invitation.created' });
    a.record({ action: 'staff_invitation.revoked' });
    a.record({ action: 'partnership.requested' });

    const out = a.query({ actionPrefix: 'staff_invitation.' });
    expect(out.length).toBe(2);
    expect(out.every((e) => e.action.startsWith('staff_invitation.'))).toBe(
      true,
    );
  });

  it('caps the results to limit', () => {
    const a = svc();
    for (let i = 0; i < 5; i++) {
      a.record({ action: `demo.${i}`, subjectId: 'subj' });
    }
    expect(a.query({ subjectId: 'subj', limit: 3 }).length).toBe(3);
    expect(a.query({ subjectId: 'subj', limit: 0 }).length).toBe(0);
  });

  it('returns newest first (most recently recorded at index 0)', () => {
    const a = svc();
    a.record({ action: 'first', subjectId: 's' });
    a.record({ action: 'second', subjectId: 's' });
    const [head, next] = a.query({ subjectId: 's' });
    expect(head.action).toBe('second');
    expect(next.action).toBe('first');
  });
});

describe('MockPlatformAuditService.queryReactive()', () => {
  it('re-evaluates whenever record() is called', () => {
    const a = svc();
    const view = a.queryReactive({ subjectId: 'subj' });
    expect(view().length).toBe(0);

    a.record({ action: 'x', subjectId: 'subj' });
    expect(view().length).toBe(1);

    a.record({ action: 'y', subjectId: 'subj' });
    expect(view().length).toBe(2);
    expect(view()[0].action).toBe('y');
  });
});
