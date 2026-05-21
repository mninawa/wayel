import { Injectable } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the Wayel.Api admin audit log surface
 * (`GET /api/v1/admin/audit/`), proxied through the admin BFF cookie
 * session. Mirrors `Wayel.Api.Endpoints.AdminAuditEndpoints` 1:1.
 *
 * Uses the same hand-rolled `fetch` posture as
 * `WayelAdminTenantsService` (credentials: 'include' so the BFF
 * forwards the user's bearer token, surface 401/403 inline rather
 * than bouncing through the global interceptor).
 *
 * Pagination is **cursor-based** on the wire (`continuationToken`),
 * not page/offset. The bridge layer adapts this back to the
 * page/offset shape the existing audit screen expects, but consumers
 * of this service work in cursor terms.
 */

/**
 * Outcome of an audited action. Mirrors `Wayel.Domain.Auditing.AuditOutcome`.
 * Serialised as a PascalCase string by `JsonStringEnumConverter`.
 */
export type WayelAuditOutcome = 'Success' | 'Failure';

export interface WayelAdminAuditLogQuery {
  from?: string;
  to?: string;
  action?: string;
  actorEmail?: string;
  actorUserId?: string;
  tenantId?: string;
  outcome?: WayelAuditOutcome;
  pageSize?: number;
  continuationToken?: string;
}

export interface WayelAdminAuditEntry {
  action: string;
  outcome: WayelAuditOutcome;
  occurredOnUtc: string;
  actorUserId: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  audience: string | null;
  ip: string | null;
  userAgent: string | null;
  reason: string | null;
  metadata: Record<string, string | null> | null;
}

export interface WayelAdminAuditPage {
  items: WayelAdminAuditEntry[];
  nextContinuationToken: string | null;
}

export interface WayelAdminAuditHttpError extends Error {
  status: number;
  /** Wayel error code (rare for this read-only endpoint, but possible). */
  code?: string;
}

const BASE = '/api/v1/admin/audit';

@Injectable({ providedIn: 'root' })
export class WayelAdminAuditService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
  };

  list(query: WayelAdminAuditLogQuery = {}): Promise<WayelAdminAuditPage> {
    const params = new URLSearchParams();
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.action) params.set('action', query.action);
    if (query.actorEmail) params.set('actorEmail', query.actorEmail);
    if (query.actorUserId) params.set('actorUserId', query.actorUserId);
    if (query.tenantId) params.set('tenantId', query.tenantId);
    if (query.outcome) params.set('outcome', query.outcome);
    if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
    if (query.continuationToken)
      params.set('continuationToken', query.continuationToken);
    const qs = params.toString();
    // Endpoint is registered with a trailing slash on the route group
    // (`MapGet("/", ...)`) — keep it explicit so the BFF reverse-proxy
    // doesn't 308-redirect away from `credentials: 'include'`.
    const url = qs ? `${BASE}/?${qs}` : `${BASE}/`;
    return this.request<WayelAdminAuditPage>(url, { method: 'GET' });
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
      };
      detail = payload.detail || payload.title || detail;
      if (payload.code) {
        code = payload.code;
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

    const err = new Error(detail) as WayelAdminAuditHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}
