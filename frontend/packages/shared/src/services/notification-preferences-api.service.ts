import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';

/**
 * Mirrors `Wayel.Domain.Notifications.Preferences.NotificationCategory`.
 * Server serialises enums in PascalCase; the SPA receives the raw string
 * value, hence the union spelling matches the backend exactly.
 */
export type NotificationCategory = 'EnrolmentUpdates' | 'DailyReports';

/** Mirrors `Wayel.Domain.Notifications.Preferences.NotificationChannel`. */
export type NotificationChannel = 'Email' | 'WhatsApp';

export interface NotificationPreferenceEntryDto {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface MyNotificationPreferencesResponse {
  entries: NotificationPreferenceEntryDto[];
  updatedOnUtc: string;
}

/**
 * Per-user notification preferences. Backed by
 * `GET/PUT /api/v1/me/notification-preferences`. The endpoint is
 * universal (any authenticated principal — parent, staff, admin —
 * has exactly one row), so the same service is shared by both shells.
 */
@Injectable({ providedIn: 'root' })
export class NotificationPreferencesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  getMine(): Observable<MyNotificationPreferencesResponse> {
    return this.http.get<MyNotificationPreferencesResponse>(
      `${this.base()}/api/v1/me/notification-preferences`,
    );
  }

  /**
   * Replace the full matrix in one PUT. The backend silently drops
   * unknown (category, channel) pairs, so a stale SPA can submit
   * extra entries without breaking server-side persistence.
   */
  updateMine(
    entries: NotificationPreferenceEntryDto[],
  ): Observable<MyNotificationPreferencesResponse> {
    return this.http.put<MyNotificationPreferencesResponse>(
      `${this.base()}/api/v1/me/notification-preferences`,
      { entries },
    );
  }
}
