import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CustomerInAppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkPath: string | null;
  createdAtUtc: string;
  readAtUtc: string | null;
}

export interface CustomerInAppNotificationsResponse {
  items: CustomerInAppNotification[];
  unreadCount: number;
}

@Injectable({ providedIn: 'root' })
export class CustomerInAppNotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.useBffAuth
    ? '/api/v1'
    : `${environment.platformApiUrl || ''}/api/v1`.replace(/\/$/, '') || '/api/v1';

  list(limit = 20): Observable<CustomerInAppNotificationsResponse> {
    return this.http.get<CustomerInAppNotificationsResponse>(
      `${this.base}/borderbox/account/in-app-notifications`,
      { params: { limit } },
    );
  }

  unreadCount(): Observable<{ unreadCount: number }> {
    return this.http.get<{ unreadCount: number }>(
      `${this.base}/borderbox/account/in-app-notifications/unread-count`,
    );
  }

  markRead(notificationId: string): Observable<void> {
    return this.http.post<void>(
      `${this.base}/borderbox/account/in-app-notifications/${encodeURIComponent(notificationId)}/read`,
      null,
    );
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>(
      `${this.base}/borderbox/account/in-app-notifications/read-all`,
      null,
    );
  }
}
