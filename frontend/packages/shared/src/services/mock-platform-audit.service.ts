import { Injectable, computed, signal } from '@angular/core';
import { MOCK_PLATFORM_AUDIT, MockPlatformAuditEntry } from '../core/mock/mock-data';

let auditCounter = MOCK_PLATFORM_AUDIT.length + 1;

export interface AuditQuery {
  /** Restrict by the institution that owns the event. */
  tenantId?: string | null;
  /** Restrict by the entity the event is about (invite id, partner id, …). */
  subjectId?: string | null;
  /** Optional action prefix filter, e.g. `staff_invitation.`. */
  actionPrefix?: string;
  /** Cap the number of returned entries (newest first). */
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class MockPlatformAuditService {
  private readonly _entries = signal<MockPlatformAuditEntry[]>([
    ...MOCK_PLATFORM_AUDIT,
  ]);

  readonly entries = this._entries.asReadonly();

  /**
   * Append a new audit entry to the in-memory log so workspace operations
   * (invitations, partnership changes, etc.) show up under
   * `/audit` immediately. ID + timestamp are auto-generated when omitted.
   */
  record(
    entry: Partial<MockPlatformAuditEntry> &
      Pick<MockPlatformAuditEntry, 'action'>,
  ): void {
    const id = entry.id ?? `pau_run_${++auditCounter}`;
    const occurredAt = entry.occurredAt ?? new Date().toISOString();
    const next: MockPlatformAuditEntry = {
      id,
      occurredAt,
      actorEmail: entry.actorEmail ?? 'staff@example.com',
      tenantId: entry.tenantId ?? null,
      tenantName: entry.tenantName ?? null,
      action: entry.action,
      detail: entry.detail ?? '',
      subjectId: entry.subjectId ?? null,
    };
    this._entries.update((prev) => [next, ...prev]);
  }

  /**
   * Filter the in-memory audit log. Returns newest-first. Results are *not*
   * a signal — callers that need reactivity should derive their own signal
   * from `entries()` so they re-evaluate on every record() call.
   */
  query(q: AuditQuery = {}): MockPlatformAuditEntry[] {
    let out = this._entries();
    if (q.tenantId !== undefined) {
      out = out.filter((e) => e.tenantId === q.tenantId);
    }
    if (q.subjectId !== undefined) {
      out = out.filter((e) => e.subjectId === q.subjectId);
    }
    if (q.actionPrefix) {
      out = out.filter((e) => e.action.startsWith(q.actionPrefix!));
    }
    if (typeof q.limit === 'number' && q.limit >= 0) {
      out = out.slice(0, q.limit);
    }
    return out;
  }

  /**
   * Reactive variant of `query()` — returns a computed signal that
   * re-evaluates whenever the underlying log changes. Useful for templates
   * that want to render a per-subject history without manual subscriptions.
   */
  queryReactive(q: AuditQuery = {}) {
    return computed(() => {
      // Touch the entries signal so the computed re-runs on record().
      void this._entries();
      return this.query(q);
    });
  }
}
