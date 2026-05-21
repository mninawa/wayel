import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the Wayel.Api notification observability surface
 * (`/api/v1/admin/notifications/...`), proxied through the admin BFF
 * cookie session. Mirrors `Wayel.Api.Endpoints.AdminNotificationsEndpoints`
 * 1:1 — outbound delivery log + suppression list management.
 *
 * Same hand-rolled `fetch` posture as the outbox service: surfaces HTTP
 * errors inline so the page can render targeted messages instead of
 * bouncing through the global error interceptor.
 */
export type NotificationOutboundStatus = 'Sent' | 'Failed' | 'Suppressed';
export type NotificationChannel = 'Email' | 'WhatsApp';
export type NotificationSuppressionReason =
  | 'HardBounce'
  | 'Complaint'
  | 'WhatsAppFailed'
  | 'ManualBlock';

export interface WayelAdminOutboundEntry {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  kind: string;
  status: NotificationOutboundStatus;
  providerMessageId: string | null;
  failureReason: string | null;
  sentOnUtc: string;
}

export interface WayelAdminOutboundList {
  items: WayelAdminOutboundEntry[];
  /**
   * Cursor for the page after this one. Both fields populated together
   * or both null — pass them straight back into `listOutbound` to
   * fetch the next slice. Null means "no further pages".
   */
  nextBefore: string | null;
  nextBeforeId: string | null;
}

export interface WayelAdminSuppression {
  channel: NotificationChannel;
  recipient: string;
  reason: NotificationSuppressionReason;
  source: string | null;
  /**
   * Server-side field is `occurredOnUtc` (matches the
   * `NotificationSuppression` record on the API). Older callers may
   * still encounter `suppressedOnUtc` from a stale build cache —
   * leave both readable but only `occurredOnUtc` is canonical.
   */
  occurredOnUtc: string;
}

export interface WayelAdminSuppressionList {
  items: WayelAdminSuppression[];
  nextBefore: string | null;
  nextBeforeKey: string | null;
}

/** Cursor handed back from a previous outbound page. */
export interface WayelAdminOutboundCursor {
  before: string;
  beforeId: string;
}

/** Cursor handed back from a previous suppression page. */
export interface WayelAdminSuppressionCursor {
  before: string;
  beforeKey: string;
}

export interface WayelAdminNotificationsHttpError extends Error {
  status: number;
}

const BASE = '/api/v1/admin/notifications';

@Injectable({ providedIn: 'root' })
export class WayelAdminNotificationsService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  listOutbound(
    take = 100,
    cursor: WayelAdminOutboundCursor | null = null,
  ): Promise<WayelAdminOutboundList> {
    const params = new URLSearchParams({ take: String(take) });
    if (cursor) {
      params.set('before', cursor.before);
      params.set('beforeId', cursor.beforeId);
    }
    return this.request<WayelAdminOutboundList>(
      `${BASE}/outbound?${params.toString()}`,
      { method: 'GET' },
    );
  }

  listSuppressions(
    take = 100,
    cursor: WayelAdminSuppressionCursor | null = null,
  ): Promise<WayelAdminSuppressionList> {
    const params = new URLSearchParams({ take: String(take) });
    if (cursor) {
      params.set('before', cursor.before);
      params.set('beforeKey', cursor.beforeKey);
    }
    return this.request<WayelAdminSuppressionList>(
      `${BASE}/suppressions?${params.toString()}`,
      { method: 'GET' },
    );
  }

  unsuppress(channel: NotificationChannel, recipient: string): Promise<void> {
    return this.request<void>(
      `${BASE}/suppressions/${encodeURIComponent(channel)}/${encodeURIComponent(recipient)}`,
      { method: 'DELETE' },
    );
  }

  manuallySuppress(input: {
    channel: NotificationChannel;
    recipient: string;
    reason?: string | null;
  }): Promise<void> {
    return this.request<void>(`${BASE}/suppressions`, {
      method: 'POST',
      body: JSON.stringify(input),
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
    try {
      const payload = (await response.json()) as { title?: string; detail?: string };
      detail = payload.detail || payload.title || detail;
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as WayelAdminNotificationsHttpError;
    err.status = response.status;
    throw err;
  }
}
