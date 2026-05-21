import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the Wayel.Api outbox operator surface
 * (`/api/v1/admin/outbox/...`), proxied through the admin BFF cookie
 * session. Mirrors `Wayel.Api.Endpoints.AdminOutboxEndpoints` 1:1.
 *
 * Same hand-rolled `fetch` posture as `WayelAdminTenantsService` —
 * surfaces 4xx inline so the Outbox panel can render targeted messages
 * (404 "unknown id", 409 "not dead-lettered") instead of bouncing
 * through the global error interceptor.
 */
export interface WayelOutboxDeadLetterPreview {
  messageId: string;
  typeName: string;
  occurredOnUtc: string;
  deadLetteredOnUtc: string;
  attempts: number;
  /** Truncated to ~200 chars by the server. */
  lastErrorPreview: string | null;
}

export interface WayelOutboxSnapshot {
  pending: number;
  dispatchedInWindow: number;
  dispatchedWindowMinutes: number;
  deadLettered: number;
  oldestPendingOccurredOnUtc: string | null;
  oldestPendingAgeSeconds: number | null;
  recentDeadLetters: WayelOutboxDeadLetterPreview[];
}

export type WayelOutboxRequeueOutcome =
  | 'Requeued'
  | 'NotFound'
  | 'NotDeadLettered';

export interface WayelOutboxRequeueResult {
  messageId: string;
  outcome: WayelOutboxRequeueOutcome;
}

export interface WayelAdminOutboxHttpError extends Error {
  status: number;
  /** Wayel error code, e.g. `outbox.message_not_found`. */
  code?: string;
}

const BASE = '/api/v1/admin/outbox';

@Injectable({ providedIn: 'root' })
export class WayelAdminOutboxService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  /**
   * @param dispatchedWindowMinutes 1..1440. Server clamps; we forward as-is.
   * @param recentDeadLetterLimit   1..50. Server clamps; we forward as-is.
   */
  snapshot(opts: {
    dispatchedWindowMinutes?: number;
    recentDeadLetterLimit?: number;
  } = {}): Promise<WayelOutboxSnapshot> {
    const params = new URLSearchParams();
    if (opts.dispatchedWindowMinutes != null) {
      params.set('dispatchedWindowMinutes', String(opts.dispatchedWindowMinutes));
    }
    if (opts.recentDeadLetterLimit != null) {
      params.set('recentDeadLetterLimit', String(opts.recentDeadLetterLimit));
    }
    const qs = params.toString();
    const url = qs ? `${BASE}?${qs}` : BASE;
    return this.request<WayelOutboxSnapshot>(url, { method: 'GET' });
  }

  /**
   * Requeue a dead-lettered message. Resolves with the outcome string
   * (`'Requeued' | 'NotFound' | 'NotDeadLettered'`). 404 + 409 responses
   * still throw — the inline panel cares about the error code, not the
   * 200-only fast path.
   */
  requeue(messageId: string): Promise<WayelOutboxRequeueResult> {
    return this.request<WayelOutboxRequeueResult>(
      `${BASE}/${encodeURIComponent(messageId)}/requeue`,
      { method: 'POST', body: '{}' },
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
      // The /requeue 404 + 409 responses use a `{ error: 'outbox.X' }`
      // shape rather than full ProblemDetails — fall back to that when
      // present so the UI can still pattern-match.
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

    const err = new Error(detail) as WayelAdminOutboxHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelAdminOutbox = (): WayelAdminOutboxService =>
  inject(WayelAdminOutboxService);
