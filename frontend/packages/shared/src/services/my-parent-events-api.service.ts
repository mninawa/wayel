import { Injectable, inject } from '@angular/core';

/**
 * HTTP client for the parent-facing calendar surface, mirroring
 * `Wayel.Api.Endpoints.MeParentEventsEndpoints`:
 *
 * - `GET /api/v1/me/events?from=&to=&categories=&institutionId=&search=&includeCancelled=`
 *   — every published event the signed-in parent can see across
 *     every institution any of their children currently attend
 *     (active subscriptions). Cancelled rows ride along by default
 *     so the SPA can render a strike-through instead of vanishing
 *     a row the family already had on their calendar.
 *
 * The handler is the authoritative authoriser: it fans out across
 * the parent's enrolments and only ever returns events targeted at
 * the parent audience — there is no caller-supplied tenant id.
 */

export type SchoolEventStatus =
  | 'Draft'
  | 'PendingApproval'
  | 'Published'
  | 'Cancelled'
  | 'Rejected';

export type SchoolEventAudience = 'Unknown' | 'Parents' | 'Staff' | 'Both';

export type SchoolEventOrganiserKind = 'School' | 'PreferredPartner';

export interface SchoolEventOrganiserDto {
  kind: SchoolEventOrganiserKind;
  preferredPartnerId: string | null;
  displayName: string;
}

export interface SchoolEventAttachmentDto {
  mediaAssetId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}

export interface SchoolEventReminderDto {
  id: string;
  offsetMinutesBeforeStart: number;
  dispatchedOnUtc: string | null;
}

/**
 * Wire shape of one row returned by `/me/events`. Mirrors the
 * server-side `SchoolEventSummary` 1:1 — every consumer that
 * wraps it (today: the parent calendar, tomorrow: the staff
 * workspace + partner portal) shares the same shape.
 */
export interface SchoolEventSummary {
  schoolEventId: string;
  tenantId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  isAllDay: boolean;
  categoryCode: string;
  audience: SchoolEventAudience;
  status: SchoolEventStatus;
  isUrgent: boolean;
  organiser: SchoolEventOrganiserDto;
  attachments: SchoolEventAttachmentDto[];
  reminders: SchoolEventReminderDto[];
  createdByUserId: string;
  createdOnUtc: string;
  updatedOnUtc: string;
  publishedOnUtc: string | null;
  cancelledOnUtc: string | null;
  cancellationReason: string | null;
  cancelledByUserId: string | null;
  approvedOnUtc: string | null;
  approvedByUserId: string | null;
  rejectedOnUtc: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
}

/**
 * One event row tailored for the parent calendar — wraps the
 * shared `SchoolEventSummary` with the institution display name
 * + accent colour so the SPA can colour-code per curator without
 * a follow-up tenant lookup.
 */
export interface MyEventDto {
  event: SchoolEventSummary;
  institutionName: string;
  institutionAccentColor: string | null;
}

/** Filter-chip metadata for the institution toggle row. */
export interface MyEventInstitutionDto {
  institutionId: string;
  name: string;
  accentColor: string | null;
}

export interface ListMyEventsResponse {
  items: MyEventDto[];
  institutions: MyEventInstitutionDto[];
}

export interface ListMyEventsParams {
  /** Inclusive lower bound on `startsAtUtc` — used for "next 30 days" queries. */
  fromUtc?: string | null;
  /** Exclusive upper bound on `startsAtUtc`. */
  toUtc?: string | null;
  /** Upper-snake-case category codes; `null` / empty means "all categories". */
  categoryCodes?: string[] | null;
  /** Optional single-institution filter (chip toggle). */
  institutionId?: string | null;
  /** Optional case-insensitive substring match against title / description / location. */
  search?: string | null;
  /** Defaults to `true`; set to `false` to hide cancelled rows entirely. */
  includeCancelled?: boolean;
}

export interface MyParentEventsHttpError extends Error {
  status: number;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class MyParentEventsApiService {
  async list(params: ListMyEventsParams = {}): Promise<ListMyEventsResponse> {
    const qs = new URLSearchParams();
    if (params.fromUtc) qs.set('from', params.fromUtc);
    if (params.toUtc) qs.set('to', params.toUtc);
    if (params.categoryCodes && params.categoryCodes.length > 0) {
      qs.set('categories', params.categoryCodes.join(','));
    }
    if (params.institutionId) qs.set('institutionId', params.institutionId);
    if (params.search) qs.set('search', params.search);
    if (params.includeCancelled !== undefined) {
      qs.set('includeCancelled', params.includeCancelled ? 'true' : 'false');
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const response = await fetch(`/api/v1/me/events${suffix}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const text = await response.text();
      return text
        ? (JSON.parse(text) as ListMyEventsResponse)
        : { items: [], institutions: [] };
    }

    throw await this.toHttpError(response);
  }

  private async toHttpError(
    response: Response,
  ): Promise<MyParentEventsHttpError> {
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
      else if (payload.type) {
        try {
          const url = new URL(payload.type);
          const last = url.pathname.split('/').filter(Boolean).pop();
          if (last) code = last;
        } catch {
          // 'type' wasn't a real URL — ignore.
        }
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as MyParentEventsHttpError;
    err.status = response.status;
    err.code = code;
    return err;
  }
}

export const useMyParentEvents = (): MyParentEventsApiService =>
  inject(MyParentEventsApiService);
