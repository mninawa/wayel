import { Injectable, inject } from '@angular/core';
import { wayelAdminFetch } from './wayel-admin-http';

/**
 * HTTP client for the programs surface (`/api/v1/programs/...`),
 * called from the REMOVED tenant workspace.
 *
 * Uses the SuperAdmin `?tenantId=` override pattern: every list / get
 * request includes the workspace tenant id in the query string and the
 * API enforces SuperAdmin-only access via the `EffectiveTenant`
 * resolver server-side. Mutations (create/patch/archive/staff/fees)
 * still come in over the same endpoints — see Phase AP.3.3.
 */
export type WayelProgramKind = 'Daycare' | 'Session';
export type WayelProgramSchedule = 'FullDay' | 'HalfDay';
export type WayelProgramFeeCadence = 'Month' | 'Term' | 'Year';
export type WayelProgramStaffRole = 'Teacher' | 'Assistant';

export interface WayelProgramFeeDto {
  year: number;
  amount: number;
  currency: string;
  cadence: WayelProgramFeeCadence;
  notes: string | null;
  updatedOnUtc: string;
}

export interface WayelProgramSummary {
  /**
   * Backend wire field — the ASP.NET `ProgramSummary` record exposes
   * `ProgramId` and serialises it as camelCase (`programId`). We mirror the
   * exact wire name here so the wire DTO is the single source of truth and
   * we don't silently drop the field when consumers read `id`.
   */
  programId: string;
  tenantId: string;
  name: string;
  description: string | null;
  kind: WayelProgramKind;
  schedule: WayelProgramSchedule | null;
  capacity: number | null;
  ageMin: number | null;
  ageMax: number | null;
  isActive: boolean;
  teacherStaffId: string | null;
  assistantStaffId: string | null;
  fees: WayelProgramFeeDto[];
  createdOnUtc: string;
  updatedOnUtc: string;
  archivedOnUtc: string | null;
}

export interface WayelListProgramsResponse {
  items: WayelProgramSummary[];
}

export interface WayelListProgramsQuery {
  search?: string | null;
  kind?: WayelProgramKind | null;
  activeOnly?: boolean | null;
}

export interface WayelCreateProgramBody {
  name: string;
  description?: string | null;
  kind: WayelProgramKind;
  schedule?: WayelProgramSchedule | null;
  capacity?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
}

export interface WayelUpdateProgramBody {
  name?: string | null;
  description?: string | null;
  schedule?: WayelProgramSchedule | null;
  capacity?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  isActive?: boolean | null;
}

export interface WayelUpsertProgramFeeBody {
  amount: number;
  currency: string;
  cadence: WayelProgramFeeCadence;
  notes?: string | null;
}

export interface WayelAssignProgramStaffBody {
  staffUserId: string | null;
}

const base = '/api/v1/programs';

@Injectable({ providedIn: 'root' })
export class WayelAdminProgramsService {
  list(
    tenantId: string,
    query: WayelListProgramsQuery = {},
  ): Promise<WayelListProgramsResponse> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    if (query.search) params.set('search', query.search);
    if (query.kind) params.set('kind', query.kind);
    if (query.activeOnly != null) params.set('activeOnly', String(query.activeOnly));
    return wayelAdminFetch<WayelListProgramsResponse>(
      `${base}?${params.toString()}`,
      { method: 'GET' },
    );
  }

  get(tenantId: string, programId: string): Promise<WayelProgramSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelProgramSummary>(
      `${base}/${encodeURIComponent(programId)}?${params.toString()}`,
      { method: 'GET' },
    );
  }

  // Mutations (create/update/archive/staff/fees) all accept the
  // SuperAdmin `?tenantId=` override server-side so the platform tenant
  // workspace can act across tenants. The body shape is identical across
  // tenant admins (who must omit it) and SuperAdmins (who must pass it).
  // See ProgramsEndpoints + EffectiveTenant.Resolve on the backend.

  create(
    tenantId: string,
    body: WayelCreateProgramBody,
  ): Promise<WayelProgramSummary> {
    return wayelAdminFetch<WayelProgramSummary>(
      `${base}${queryWithTenant(tenantId)}`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  update(
    programId: string,
    body: WayelUpdateProgramBody,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelProgramSummary> {
    return wayelAdminFetch<WayelProgramSummary>(
      `${base}/${encodeURIComponent(programId)}${queryWithTenant(options.tenantId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  archive(
    programId: string,
    options: { tenantId?: string | null } = {},
  ): Promise<void> {
    return wayelAdminFetch<void>(
      `${base}/${encodeURIComponent(programId)}/archive${queryWithTenant(options.tenantId)}`,
      { method: 'POST' },
    );
  }

  assignStaff(
    programId: string,
    role: WayelProgramStaffRole,
    body: WayelAssignProgramStaffBody,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelProgramSummary> {
    return wayelAdminFetch<WayelProgramSummary>(
      `${base}/${encodeURIComponent(programId)}/staff/${encodeURIComponent(role)}${queryWithTenant(options.tenantId)}`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
  }

  upsertFee(
    programId: string,
    year: number,
    body: WayelUpsertProgramFeeBody,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelProgramSummary> {
    return wayelAdminFetch<WayelProgramSummary>(
      `${base}/${encodeURIComponent(programId)}/fees/${year}${queryWithTenant(options.tenantId)}`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
  }

  removeFee(
    programId: string,
    year: number,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelProgramSummary> {
    return wayelAdminFetch<WayelProgramSummary>(
      `${base}/${encodeURIComponent(programId)}/fees/${year}${queryWithTenant(options.tenantId)}`,
      { method: 'DELETE' },
    );
  }
}

function queryWithTenant(tenantId?: string | null): string {
  if (!tenantId) return '';
  const params = new URLSearchParams();
  params.set('tenantId', tenantId);
  return `?${params.toString()}`;
}

export const useWayelAdminPrograms = (): WayelAdminProgramsService =>
  inject(WayelAdminProgramsService);
