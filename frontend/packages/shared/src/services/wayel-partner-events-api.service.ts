import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import {
  type SchoolEventAudience,
  type SchoolEventStatus,
  type SchoolEventSummary,
} from './my-parent-events-api.service';
import type { PreferredPartnerSummary } from './wayel-preferred-partners-api.service';

/**
 * HTTP client for the preferred-partner submission surface — the
 * server-side endpoints that let a partner-portal user propose
 * events at one of the institutions that has approved them.
 *
 * Mirrors the partner-only endpoints exposed by
 * `Wayel.Api.Endpoints.SchoolEventsEndpoints`:
 *
 * - `POST /api/v1/partner-events/submissions { ...command }`
 * - `GET  /api/v1/partner-events/submissions?from=&to=&statuses=&search=`
 *
 * Plus the anonymous accept-invitation funnel in
 * `Wayel.Api.Endpoints.PreferredPartnersEndpoints`:
 *
 * - `POST /api/v1/preferred-partners/invitations/accept`
 *
 * All other partner data flows (e.g. directory updates) are
 * driven by the same `WayelPreferredPartnersApiService` the
 * tenant-admin staff portal uses — partner-portal users have
 * read access to their own partner record via that surface
 * naturally.
 */

export interface SubmitPartnerSchoolEventBody {
  /** Tenant the partner is proposing the event to. */
  targetTenantId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  isAllDay: boolean;
  categoryCode: string;
  audience: SchoolEventAudience;
  isUrgent: boolean;
  attachments: Array<{
    mediaAssetId: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  }> | null;
  reminderOffsetMinutes: number[] | null;
}

export interface ListMyPartnerSubmissionsParams {
  fromUtc?: string | null;
  toUtc?: string | null;
  statuses?: SchoolEventStatus[] | null;
  search?: string | null;
}

export interface ListMyPartnerSubmissionsResponse {
  items: SchoolEventSummary[];
}

/**
 * Anonymous request body for
 * `POST /api/v1/preferred-partners/invitations/accept`. The plaintext
 * token is the value the email link carried; the contact picks a
 * display name + password during the accept flow and we mint /
 * reuse a partner-portal user behind the scenes.
 */
export interface AcceptPreferredPartnerInvitationBody {
  token: string;
  displayName: string;
  password: string;
}

export interface AcceptPreferredPartnerInvitationResponse {
  userId: string;
  preferredPartnerId: string;
  email: string;
  displayName: string;
}

export interface WayelPartnerEventsHttpError extends Error {
  status: number;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class WayelPartnerEventsApiService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  submit(body: SubmitPartnerSchoolEventBody): Promise<SchoolEventSummary> {
    return this.request<SchoolEventSummary>(
      '/api/v1/partner-events/submissions',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  listSubmissions(
    params: ListMyPartnerSubmissionsParams = {},
  ): Promise<ListMyPartnerSubmissionsResponse> {
    const qs = new URLSearchParams();
    if (params.fromUtc) qs.set('from', params.fromUtc);
    if (params.toUtc) qs.set('to', params.toUtc);
    if (params.statuses && params.statuses.length > 0) {
      qs.set('statuses', params.statuses.join(','));
    }
    if (params.search) qs.set('search', params.search);
    const url = qs.toString()
      ? `/api/v1/partner-events/submissions?${qs.toString()}`
      : '/api/v1/partner-events/submissions';
    return this.request<ListMyPartnerSubmissionsResponse>(url, { method: 'GET' });
  }

  acceptInvitation(
    body: AcceptPreferredPartnerInvitationBody,
  ): Promise<AcceptPreferredPartnerInvitationResponse> {
    return this.request<AcceptPreferredPartnerInvitationResponse>(
      '/api/v1/preferred-partners/invitations/accept',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /**
   * Resolves the bound `PreferredPartner` for the signed-in partner-
   * portal user via `GET /api/v1/me/partner`. Returns the same
   * `PreferredPartnerSummary` shape the staff directory exposes — the
   * key field for the SPA is the `tenantId` (the institution the
   * partner is approved at) which is the `targetTenantId` every
   * submission must carry.
   */
  getMyPartner(): Promise<PreferredPartnerSummary> {
    return this.request<PreferredPartnerSummary>('/api/v1/me/partner', {
      method: 'GET',
    });
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
      if (payload.code) code = payload.code;
      else if (payload.error) code = payload.error;
      else if (payload.title && payload.title.includes('.')) code = payload.title;
      else if (payload.type) {
        const marker = '/errors/';
        const idx = payload.type.indexOf(marker);
        code = idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as WayelPartnerEventsHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelPartnerEvents = (): WayelPartnerEventsApiService =>
  inject(WayelPartnerEventsApiService);
