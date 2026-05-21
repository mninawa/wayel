import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the Wayel.Api Programs surface (`/api/v1/programs/...`),
 * proxied through whichever BFF the SPA is hosted under (admin/client/external
 * — the BFFs all forward `/api/{**catch-all}` to the upstream API).
 *
 * Mirrors `Wayel.Api.Endpoints.ProgramsEndpoints` 1:1 and matches the same
 * hand-rolled `fetch` posture we use for the other tenant-scoped consoles
 * (`WayelAdminStaffService`, `WayelAdminTenantsService`, ...) so that 4xx
 * responses surface inline as a `WayelProgramsHttpError` carrying the
 * Wayel error code (e.g. `program.name_taken`). That keeps the per-screen
 * UX targeted instead of bouncing every failure through the global error
 * interceptor.
 *
 * The wire DTOs deliberately mirror the `WorkspaceProgram*` shapes already
 * used by the mock store in `workspace-program.ts`, with the enum casing
 * normalised at the boundary so callers can keep using lower-case
 * `'daycare' | 'session'`, `'full_day' | 'half_day'`, etc.
 */
export type WayelProgramKind = 'daycare' | 'session';
export type WayelProgramSchedule = 'full_day' | 'half_day';
export type WayelProgramFeeCadence = 'month' | 'term' | 'year';
export type WayelProgramStaffRole = 'teacher' | 'assistant';

export interface WayelProgramFee {
  year: number;
  amount: number;
  currency: string;
  cadence: WayelProgramFeeCadence;
  notes: string | null;
  updatedOnUtc: string;
}

export interface WayelProgram {
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
  fees: WayelProgramFee[];
  createdOnUtc: string;
  updatedOnUtc: string;
  archivedOnUtc: string | null;
}

export interface WayelListProgramsQuery {
  /** Defaults to true on the server. Pass false to surface archived rows. */
  activeOnly?: boolean | null;
  kind?: WayelProgramKind | null;
  search?: string | null;
}

export interface WayelCreateProgramRequest {
  name: string;
  description?: string | null;
  kind: WayelProgramKind;
  schedule?: WayelProgramSchedule | null;
  capacity?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
}

/**
 * The PATCH endpoint distinguishes "leave field alone" (omit) from
 * "explicitly set to null" via paired `clearXxx: true` flags. We surface
 * the same affordance here as the `clearXxx` properties.
 */
export interface WayelUpdateProgramRequest {
  name?: string | null;
  description?: string | null;
  clearDescription?: boolean;
  schedule?: WayelProgramSchedule | null;
  clearSchedule?: boolean;
  capacity?: number | null;
  clearCapacity?: boolean;
  ageMin?: number | null;
  clearAgeMin?: boolean;
  ageMax?: number | null;
  clearAgeMax?: boolean;
}

export interface WayelUpsertProgramFeeRequest {
  amount: number;
  currency: string;
  cadence: WayelProgramFeeCadence;
  notes?: string | null;
}

export interface WayelProgramsHttpError extends Error {
  status: number;
  /** Wayel error code, e.g. `program.name_taken`. */
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class WayelProgramsService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async list(query: WayelListProgramsQuery = {}): Promise<WayelProgram[]> {
    const params = new URLSearchParams();
    if (query.activeOnly === false) params.set('activeOnly', 'false');
    if (query.kind) params.set('kind', toApiKind(query.kind));
    if (query.search) params.set('search', query.search);
    const qs = params.toString();
    const url = qs ? `/api/v1/programs?${qs}` : '/api/v1/programs';
    const wire = await this.request<{ items: WireProgram[] }>(url, { method: 'GET' });
    return wire.items.map(fromWireProgram);
  }

  async get(programId: string): Promise<WayelProgram> {
    const wire = await this.request<WireProgram>(
      `/api/v1/programs/${encodeURIComponent(programId)}`,
      { method: 'GET' },
    );
    return fromWireProgram(wire);
  }

  async create(body: WayelCreateProgramRequest): Promise<WayelProgram> {
    const wire = await this.request<WireProgram>('/api/v1/programs', {
      method: 'POST',
      body: JSON.stringify(toCreateWire(body)),
    });
    return fromWireProgram(wire);
  }

  async update(
    programId: string,
    body: WayelUpdateProgramRequest,
  ): Promise<WayelProgram> {
    const wire = await this.request<WireProgram>(
      `/api/v1/programs/${encodeURIComponent(programId)}`,
      { method: 'PATCH', body: JSON.stringify(toUpdateWire(body)) },
    );
    return fromWireProgram(wire);
  }

  async archive(programId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/programs/${encodeURIComponent(programId)}/archive`,
      { method: 'POST' },
    );
  }

  async assignStaff(
    programId: string,
    role: WayelProgramStaffRole,
    staffUserId: string | null,
  ): Promise<WayelProgram> {
    const wire = await this.request<WireProgram>(
      `/api/v1/programs/${encodeURIComponent(programId)}/staff/${toApiStaffRole(role)}`,
      { method: 'PUT', body: JSON.stringify({ staffUserId }) },
    );
    return fromWireProgram(wire);
  }

  async upsertFee(
    programId: string,
    year: number,
    body: WayelUpsertProgramFeeRequest,
  ): Promise<WayelProgram> {
    const wire = await this.request<WireProgram>(
      `/api/v1/programs/${encodeURIComponent(programId)}/fees/${year}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          amount: body.amount,
          currency: body.currency,
          cadence: toApiCadence(body.cadence),
          notes: body.notes ?? null,
        }),
      },
    );
    return fromWireProgram(wire);
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const isStateChanging =
      init.method !== undefined &&
      init.method !== 'GET' &&
      init.method !== 'HEAD' &&
      init.method !== 'OPTIONS';

    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...this.baseHeaders,
        ...platformBearerAuthHeaders(),
        ...(isStateChanging ? bffStateChangingHeaders() : {}),
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }

    let detail = `Request failed with HTTP ${response.status}.`;
    let code: string | undefined;
    try {
      const payload = (await response.json()) as {
        title?: string;
        detail?: string;
        type?: string;
        code?: string;
        error?: string;
      };
      detail = payload.detail || payload.title || detail;
      if (payload.code) {
        code = payload.code;
      } else if (payload.error) {
        code = payload.error;
      } else if (payload.title && payload.title.includes('.')) {
        code = payload.title;
      } else if (payload.type) {
        const marker = '/errors/';
        const idx = payload.type.indexOf(marker);
        code = idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as WayelProgramsHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelPrograms = (): WayelProgramsService =>
  inject(WayelProgramsService);

/* ────────────────────────────────────────────────────────────────────────── */
/* Wire <-> domain mapping                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

interface WireProgramFee {
  year: number;
  amount: number;
  currency: string;
  cadence: 'Month' | 'Term' | 'Year';
  notes: string | null;
  updatedOnUtc: string;
}

interface WireProgram {
  programId: string;
  tenantId: string;
  name: string;
  description: string | null;
  kind: 'Daycare' | 'Session';
  schedule: 'FullDay' | 'HalfDay' | null;
  capacity: number | null;
  ageMin: number | null;
  ageMax: number | null;
  isActive: boolean;
  teacherStaffId: string | null;
  assistantStaffId: string | null;
  fees: WireProgramFee[];
  createdOnUtc: string;
  updatedOnUtc: string;
  archivedOnUtc: string | null;
}

function toApiKind(kind: WayelProgramKind): 'Daycare' | 'Session' {
  return kind === 'daycare' ? 'Daycare' : 'Session';
}

function toApiSchedule(s: WayelProgramSchedule | null | undefined): 'FullDay' | 'HalfDay' | null {
  if (s == null) return null;
  return s === 'full_day' ? 'FullDay' : 'HalfDay';
}

function toApiCadence(c: WayelProgramFeeCadence): 'Month' | 'Term' | 'Year' {
  switch (c) {
    case 'month':
      return 'Month';
    case 'term':
      return 'Term';
    case 'year':
      return 'Year';
  }
}

function toApiStaffRole(role: WayelProgramStaffRole): 'Teacher' | 'Assistant' {
  return role === 'teacher' ? 'Teacher' : 'Assistant';
}

function toCreateWire(body: WayelCreateProgramRequest): unknown {
  return {
    name: body.name,
    description: body.description ?? null,
    kind: toApiKind(body.kind),
    schedule: toApiSchedule(body.schedule),
    capacity: body.capacity ?? null,
    ageMin: body.ageMin ?? null,
    ageMax: body.ageMax ?? null,
  };
}

function toUpdateWire(body: WayelUpdateProgramRequest): unknown {
  return {
    name: body.name ?? null,
    description: body.description ?? null,
    clearDescription: body.clearDescription ?? false,
    schedule: toApiSchedule(body.schedule),
    clearSchedule: body.clearSchedule ?? false,
    capacity: body.capacity ?? null,
    clearCapacity: body.clearCapacity ?? false,
    ageMin: body.ageMin ?? null,
    clearAgeMin: body.clearAgeMin ?? false,
    ageMax: body.ageMax ?? null,
    clearAgeMax: body.clearAgeMax ?? false,
  };
}

function fromWireProgram(w: WireProgram): WayelProgram {
  return {
    programId: w.programId,
    tenantId: w.tenantId,
    name: w.name,
    description: w.description,
    kind: w.kind === 'Daycare' ? 'daycare' : 'session',
    schedule:
      w.schedule == null ? null : w.schedule === 'FullDay' ? 'full_day' : 'half_day',
    capacity: w.capacity,
    ageMin: w.ageMin,
    ageMax: w.ageMax,
    isActive: w.isActive,
    teacherStaffId: w.teacherStaffId,
    assistantStaffId: w.assistantStaffId,
    fees: w.fees.map(fromWireFee),
    createdOnUtc: w.createdOnUtc,
    updatedOnUtc: w.updatedOnUtc,
    archivedOnUtc: w.archivedOnUtc,
  };
}

function fromWireFee(w: WireProgramFee): WayelProgramFee {
  return {
    year: w.year,
    amount: w.amount,
    currency: w.currency,
    cadence:
      w.cadence === 'Month' ? 'month' : w.cadence === 'Term' ? 'term' : 'year',
    notes: w.notes,
    updatedOnUtc: w.updatedOnUtc,
  };
}
