import type { MockPlatformAuditEntry, MockPlatformTenant } from '../core/mock/mock-data';
import type { WayelAdminAuditEntry } from './wayel-admin-audit.service';

/**
 * Project a Wayel.Api `AuditLogItemResponse` into the
 * `MockPlatformAuditEntry` shape the existing platform-audit screen
 * consumes. The Wayel shape is richer (Outcome, IP, UserAgent,
 * Reason, Metadata) than what the screen currently surfaces, so we
 * collapse the extra context into the `detail` field and synthesise
 * the bits the SPA needs but the API doesn't carry:
 *
 *  - `id`: there's no first-class id on the wire, so we hash the
 *    occurredOnUtc + action + actor into a stable enough string for
 *    `*ngFor track-by`. Two entries with identical action + actor +
 *    timestamp are *already* indistinguishable from the user's point
 *    of view, so collisions are harmless.
 *  - `tenantName`: looked up from the platform tenant catalogue the
 *    audit screen already loads. Falls back to the tenant id if the
 *    catalogue doesn't contain a match.
 *  - `actorEmail`: the API may emit `null` (system actions), but the
 *    SPA contract is non-null. Substitute `'system'` so the column
 *    renders something meaningful instead of an empty cell.
 */
export function wayelAuditEntryToMock(
  entry: WayelAdminAuditEntry,
  tenantsById: ReadonlyMap<string, MockPlatformTenant>,
): MockPlatformAuditEntry {
  const tenant = entry.tenantId ? tenantsById.get(entry.tenantId) ?? null : null;
  return {
    id: synthAuditId(entry),
    occurredAt: entry.occurredOnUtc,
    actorEmail: entry.actorEmail ?? 'system',
    tenantId: entry.tenantId,
    tenantName: tenant?.name ?? null,
    action: entry.action,
    detail: composeDetail(entry),
  };
}

/**
 * Build a stable id for an audit row that has no native one. We
 * concatenate the natural key (action + actor + occurredOnUtc) and
 * keep it readable so debugging is easy when something goes wrong.
 * No need to hash — the resulting string is short enough to drop
 * straight into a DOM `id` / Angular `track by`.
 */
function synthAuditId(e: WayelAdminAuditEntry): string {
  const parts = [
    e.occurredOnUtc,
    e.action,
    e.actorEmail ?? e.actorUserId ?? 'sys',
    e.tenantId ?? 'no-tenant',
  ];
  return parts.join('|');
}

/**
 * Compress the rich Wayel audit row into a one-line `detail` string
 * suitable for the existing audit screen's "what happened" column.
 * Reason wins over outcome wins over audience — most actions don't
 * carry all three so the priority ordering keeps the column tidy.
 */
function composeDetail(e: WayelAdminAuditEntry): string {
  const bits: string[] = [];
  if (e.outcome === 'Failure') bits.push('Failure');
  if (e.reason && e.reason.trim().length > 0) bits.push(e.reason.trim());
  if (e.audience && e.audience.trim().length > 0) bits.push(`audience=${e.audience.trim()}`);
  if (bits.length === 0) return '—';
  return bits.join(' · ');
}

/**
 * Build a `Map<tenantId, tenant>` from the platform tenant
 * catalogue. Convenience wrapper so callers don't sprinkle
 * `new Map(...)` everywhere.
 */
export function indexTenantsById(
  tenants: ReadonlyArray<MockPlatformTenant>,
): Map<string, MockPlatformTenant> {
  const m = new Map<string, MockPlatformTenant>();
  for (const t of tenants) m.set(t.id, t);
  return m;
}
