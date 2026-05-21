import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';

/** Mirrors API enum serialization (camelCase). */
export type UserNotificationKind =
  | 'subscriptionRequestApproved'
  | 'subscriptionRequestRejected'
  | 'dailyReportPublished'
  | 'subscriptionRequestReceived'
  | 'invitationAccepted';

export interface UserNotificationDto {
  id: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  actionPath: string | null;
  subscriptionRequestId: string | null;
  createdOnUtc: string;
  readOnUtc: string | null;
}

export interface ListMyUserNotificationsResponse {
  items: UserNotificationDto[];
  unreadCount: number;
  /**
   * Opaque cursor for the *next* page (older rows), or `null` when the
   * caller has reached the tail of the inbox. Pass it back via
   * `listMine({ cursor })` to fetch the next page; never decode the value
   * client-side — its shape is owned by the API.
   */
  nextCursor: string | null;
}

export interface MarkAllUserNotificationsReadResponse {
  updated: number;
}

/**
 * In-app inbox backed by `GET/POST /api/v1/me/notifications/*`. The endpoint
 * is role-agnostic so the same service is wired into both shells (parents in
 * customer-portal, staff/tenant-admins in REMOVED).
 */
@Injectable({ providedIn: 'root' })
export class UserNotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  listMine(
    params: {
      take?: number;
      unreadOnly?: boolean;
      cursor?: string | null;
      /**
       * Restrict to a subset of notification kinds. Passed to the API as a
       * comma-separated `?kind=` value; an empty / undefined array means
       * "no filter". Unknown kinds are dropped server-side rather than
       * 400ing — see `MeUserNotificationsEndpoints.ParseKinds`.
       */
      kinds?: readonly UserNotificationKind[];
    } = {},
  ): Observable<ListMyUserNotificationsResponse> {
    let hp = new HttpParams();
    if (params.take != null) {
      hp = hp.set('take', String(params.take));
    }

    if (params.unreadOnly != null) {
      hp = hp.set('unreadOnly', String(params.unreadOnly));
    }

    if (params.cursor) {
      hp = hp.set('cursor', params.cursor);
    }

    if (params.kinds && params.kinds.length > 0) {
      // Backend expects PascalCase enum names (e.g. `DailyReportPublished`),
      // but our DTOs use camelCase wire format. Map here so callers can
      // keep using `UserNotificationKind` literals without thinking about
      // casing — same trick the existing chips do server-side.
      hp = hp.set('kind', params.kinds.map(toServerKind).join(','));
    }

    return this.http.get<ListMyUserNotificationsResponse>(`${this.base()}/api/v1/me/notifications`, {
      params: hp,
    });
  }

  markRead(notificationId: string): Observable<void> {
    return this.http.post<void>(
      `${this.base()}/api/v1/me/notifications/${encodeURIComponent(notificationId)}/read`,
      {},
    );
  }

  /**
   * Bulk-flips every unread row for the signed-in user to read. Returns the
   * count actually updated so the caller can decide whether to surface a
   * "X notifications cleared" toast or stay silent on a no-op click.
   */
  markAllRead(): Observable<MarkAllUserNotificationsReadResponse> {
    return this.http.post<MarkAllUserNotificationsReadResponse>(
      `${this.base()}/api/v1/me/notifications/mark-all-read`,
      {},
    );
  }
}

/**
 * Convert a wire-format camelCase kind back to the API's PascalCase enum
 * name. The mapping is mechanical (capitalise the first letter) but kept
 * explicit so a typo in the union never silently round-trips through.
 */
function toServerKind(kind: UserNotificationKind): string {
  switch (kind) {
    case 'subscriptionRequestApproved':
      return 'SubscriptionRequestApproved';
    case 'subscriptionRequestRejected':
      return 'SubscriptionRequestRejected';
    case 'dailyReportPublished':
      return 'DailyReportPublished';
    case 'subscriptionRequestReceived':
      return 'SubscriptionRequestReceived';
    case 'invitationAccepted':
      return 'InvitationAccepted';
  }
}
