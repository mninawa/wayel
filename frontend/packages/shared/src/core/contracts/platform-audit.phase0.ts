import type { Phase0PagedResult } from './platform-tenant.phase0';

/** GET /api/platform/audit */
export interface Phase0PlatformAuditEntryDto {
  id: string;
  occurredAt: string;
  actorEmail: string;
  tenantId: string | null;
  tenantName: string | null;
  action: string;
  detail: string;
}

export interface Phase0ListAuditQuery {
  page?: number;
  pageSize?: number;
  tenantId?: string;
  /** Restrict to entries with no tenant scope (`tenantId === null`). Mutually exclusive with `tenantId`. */
  noTenant?: boolean;
  /** Exact action match, e.g. `tenant.suspended`. */
  action?: string;
  /** Substring match against `actorEmail` (case-insensitive). */
  actor?: string;
}

export type Phase0PlatformAuditListResult = Phase0PagedResult<Phase0PlatformAuditEntryDto>;
