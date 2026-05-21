import type { MockPlatformAuditEntry } from '../core/mock/mock-data';
import type { Phase0PlatformAuditEntryDto } from '../core/contracts/platform-audit.phase0';

export function phase0AuditDtoToMock(d: Phase0PlatformAuditEntryDto): MockPlatformAuditEntry {
  return {
    id: d.id,
    occurredAt: d.occurredAt,
    actorEmail: d.actorEmail,
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    action: d.action,
    detail: d.detail,
  };
}
