import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the tenant-scoped milestones surface
 * (`/api/v1/milestones/...`), proxied through whichever BFF the SPA is
 * hosted under (the BFFs all forward `/api/{**catch-all}` to the upstream
 * API).
 *
 * Mirrors `Wayel.Api.Endpoints.MilestonesEndpoints` 1:1. Every call is
 * implicitly scoped to the caller's tenant — there is no tenant override
 * argument. Errors surface as `WayelMilestonesHttpError` carrying the
 * Wayel error code (e.g. `milestone.title_required`) so callers can
 * render targeted UX instead of bouncing through the global error
 * interceptor.
 */
export type WayelMilestoneVisibility =
  | 'internal'
  | 'parentVisible'
  | 'parentAndVault';

export interface WayelMilestone {
  milestoneId: string;
  tenantId: string;
  childName: string;
  title: string;
  /** ISO 8601 calendar date — `YYYY-MM-DD`. */
  achievedOn: string;
  visibility: WayelMilestoneVisibility;
  notes: string | null;
  createdOnUtc: string;
  updatedOnUtc: string;
}

export interface WayelListMilestonesQuery {
  search?: string | null;
  visibility?: WayelMilestoneVisibility | null;
  /** `YYYY-MM-DD`. */
  fromDate?: string | null;
  /** `YYYY-MM-DD`. */
  toDate?: string | null;
}

export interface WayelRecordMilestoneRequest {
  childName: string;
  title: string;
  /** `YYYY-MM-DD`. */
  achievedOn: string;
  visibility: WayelMilestoneVisibility;
  notes?: string | null;
}

/**
 * The PATCH endpoint distinguishes "leave field alone" (omit) from
 * "explicitly set to null" via the paired `clearNotes` flag. Every other
 * field is a straight overwrite when present.
 */
export interface WayelUpdateMilestoneRequest {
  childName?: string | null;
  title?: string | null;
  /** `YYYY-MM-DD`. */
  achievedOn?: string | null;
  visibility?: WayelMilestoneVisibility | null;
  notes?: string | null;
  clearNotes?: boolean;
}

export interface WayelMilestonesHttpError extends Error {
  status: number;
  /** Wayel error code, e.g. `milestone.title_required`. */
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class WayelMilestonesService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async list(query: WayelListMilestonesQuery = {}): Promise<WayelMilestone[]> {
    const url = appendQuery('/api/v1/milestones', {
      search: query.search ?? undefined,
      visibility: query.visibility ? toWireVisibility(query.visibility) : undefined,
      from: query.fromDate ?? undefined,
      to: query.toDate ?? undefined,
    });
    const wire = await this.request<{ items: WireMilestone[] }>(url, {
      method: 'GET',
    });
    return wire.items.map(fromWireMilestone);
  }

  async getById(id: string): Promise<WayelMilestone> {
    const wire = await this.request<WireMilestone>(
      `/api/v1/milestones/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    return fromWireMilestone(wire);
  }

  async record(body: WayelRecordMilestoneRequest): Promise<WayelMilestone> {
    const wire = await this.request<WireMilestone>('/api/v1/milestones', {
      method: 'POST',
      body: JSON.stringify({
        childName: body.childName,
        title: body.title,
        achievedOn: body.achievedOn,
        visibility: toWireVisibility(body.visibility),
        notes: body.notes ?? null,
      }),
    });
    return fromWireMilestone(wire);
  }

  async update(
    id: string,
    body: WayelUpdateMilestoneRequest,
  ): Promise<WayelMilestone> {
    const wire = await this.request<WireMilestone>(
      `/api/v1/milestones/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          childName: body.childName ?? null,
          title: body.title ?? null,
          achievedOn: body.achievedOn ?? null,
          visibility: body.visibility ? toWireVisibility(body.visibility) : null,
          notes: body.notes ?? null,
          clearNotes: body.clearNotes ?? false,
        }),
      },
    );
    return fromWireMilestone(wire);
  }

  async remove(id: string): Promise<void> {
    await this.request<void>(
      `/api/v1/milestones/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
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

    const err = new Error(detail) as WayelMilestonesHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelMilestones = (): WayelMilestonesService =>
  inject(WayelMilestonesService);

/* ────────────────────────────────────────────────────────────────────────── */
/* Wire <-> domain mapping                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

interface WireMilestone {
  milestoneId: string;
  tenantId: string;
  childName: string;
  title: string;
  achievedOn: string;
  visibility: 'Internal' | 'ParentVisible' | 'ParentAndVault';
  notes: string | null;
  createdOnUtc: string;
  updatedOnUtc: string;
}

function fromWireVisibility(
  v: WireMilestone['visibility'],
): WayelMilestoneVisibility {
  switch (v) {
    case 'ParentVisible':
      return 'parentVisible';
    case 'ParentAndVault':
      return 'parentAndVault';
    default:
      return 'internal';
  }
}

function toWireVisibility(
  v: WayelMilestoneVisibility,
): WireMilestone['visibility'] {
  switch (v) {
    case 'parentVisible':
      return 'ParentVisible';
    case 'parentAndVault':
      return 'ParentAndVault';
    default:
      return 'Internal';
  }
}

function fromWireMilestone(w: WireMilestone): WayelMilestone {
  return {
    milestoneId: w.milestoneId,
    tenantId: w.tenantId,
    childName: w.childName,
    title: w.title,
    achievedOn: w.achievedOn,
    visibility: fromWireVisibility(w.visibility),
    notes: w.notes,
    createdOnUtc: w.createdOnUtc,
    updatedOnUtc: w.updatedOnUtc,
  };
}

function appendQuery(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
