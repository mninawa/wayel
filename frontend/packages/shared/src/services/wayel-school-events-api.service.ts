import { Injectable, inject } from '@angular/core';
import { wayelAdminFetch, type WayelAdminHttpError } from './wayel-admin-http';
import {
  type SchoolEventAudience,
  type SchoolEventStatus,
  type SchoolEventSummary,
} from './my-parent-events-api.service';

/**
 * HTTP client for the staff / tenant-admin events surface, mirroring
 * `Wayel.Api.Endpoints.SchoolEventsEndpoints`:
 *
 * - `GET /api/v1/events`   — list events for the caller's tenant
 *   (filter by date / status / category / audience / search)
 * - `GET /api/v1/events/{id}`
 * - `POST /api/v1/events`  — create (TenantStaffOrAbove)
 * - `PATCH /api/v1/events/{id}`
 * - `DELETE /api/v1/events/{id}`
 * - `POST /api/v1/events/{id}/publish`
 * - `POST /api/v1/events/{id}/cancel { reason }`
 * - `POST /api/v1/events/{id}/approve`
 * - `POST /api/v1/events/{id}/reject  { reason }`
 *
 * Uses the same hand-rolled fetch + BFF cookie / antiforgery
 * pattern as the other admin services so 401/403 surface inline.
 */

export {
  type SchoolEventAudience,
  type SchoolEventStatus,
  type SchoolEventSummary,
} from './my-parent-events-api.service';

export interface ListSchoolEventsParams {
  fromUtc?: string | null;
  toUtc?: string | null;
  statuses?: SchoolEventStatus[] | null;
  categoryCodes?: string[] | null;
  audiences?: SchoolEventAudience[] | null;
  search?: string | null;
}

export interface ListSchoolEventsResponse {
  items: SchoolEventSummary[];
}

export interface CreateSchoolEventAttachmentBody {
  mediaAssetId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}

export interface CreateSchoolEventBody {
  title: string;
  description: string | null;
  location: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  isAllDay: boolean;
  categoryCode: string;
  audience: SchoolEventAudience;
  isUrgent: boolean;
  publishImmediately: boolean;
  attachments: CreateSchoolEventAttachmentBody[] | null;
  reminderOffsetMinutes: number[] | null;
}

export interface UpdateSchoolEventBody {
  title?: string | null;
  description?: string | null;
  clearDescription?: boolean;
  location?: string | null;
  clearLocation?: boolean;
  startsAtUtc?: string | null;
  endsAtUtc?: string | null;
  isAllDay?: boolean | null;
  categoryCode?: string | null;
  audience?: SchoolEventAudience | null;
  isUrgent?: boolean | null;
  attachments?: CreateSchoolEventAttachmentBody[] | null;
  reminderOffsetMinutes?: number[] | null;
}

/**
 * Re-exported as a friendly local alias so existing call sites can keep
 * referring to `WayelSchoolEventsHttpError`. The shape is identical to
 * {@link WayelAdminHttpError} (status + optional Wayel `code`).
 */
export type WayelSchoolEventsHttpError = WayelAdminHttpError;

const BASE = '/api/v1/events';

@Injectable({ providedIn: 'root' })
export class WayelSchoolEventsApiService {
  list(params: ListSchoolEventsParams = {}): Promise<ListSchoolEventsResponse> {
    const qs = new URLSearchParams();
    if (params.fromUtc) qs.set('from', params.fromUtc);
    if (params.toUtc) qs.set('to', params.toUtc);
    if (params.statuses && params.statuses.length > 0) {
      qs.set('statuses', params.statuses.join(','));
    }
    if (params.categoryCodes && params.categoryCodes.length > 0) {
      qs.set('categories', params.categoryCodes.join(','));
    }
    if (params.audiences && params.audiences.length > 0) {
      qs.set('audiences', params.audiences.join(','));
    }
    if (params.search) qs.set('search', params.search);
    const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;
    return wayelAdminFetch<ListSchoolEventsResponse>(url, { method: 'GET' });
  }

  get(id: string): Promise<SchoolEventSummary> {
    return wayelAdminFetch<SchoolEventSummary>(
      `${BASE}/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
  }

  create(body: CreateSchoolEventBody): Promise<SchoolEventSummary> {
    return wayelAdminFetch<SchoolEventSummary>(BASE, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  update(id: string, body: UpdateSchoolEventBody): Promise<SchoolEventSummary> {
    return wayelAdminFetch<SchoolEventSummary>(
      `${BASE}/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  delete(id: string): Promise<void> {
    return wayelAdminFetch<void>(
      `${BASE}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  }

  publish(id: string): Promise<SchoolEventSummary> {
    return wayelAdminFetch<SchoolEventSummary>(
      `${BASE}/${encodeURIComponent(id)}/publish`,
      { method: 'POST', body: '{}' },
    );
  }

  cancel(id: string, reason: string): Promise<SchoolEventSummary> {
    return wayelAdminFetch<SchoolEventSummary>(
      `${BASE}/${encodeURIComponent(id)}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }

  approve(id: string): Promise<SchoolEventSummary> {
    return wayelAdminFetch<SchoolEventSummary>(
      `${BASE}/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: '{}' },
    );
  }

  reject(id: string, reason: string): Promise<SchoolEventSummary> {
    return wayelAdminFetch<SchoolEventSummary>(
      `${BASE}/${encodeURIComponent(id)}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }
}

export const useWayelSchoolEvents = (): WayelSchoolEventsApiService =>
  inject(WayelSchoolEventsApiService);
