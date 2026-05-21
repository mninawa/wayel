import { Injectable } from '@angular/core';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the Wayel.Api cross-tenant admin-users surface
 * (`/api/v1/admin/users/...`). Mirrors `Wayel.Api.Endpoints.AdminUsersEndpoints`
 * 1:1 and replaces the SPA's MOCK_PLATFORM_USERS + per-tenant staff
 * scan + MOCK_PARENTS synthesis on `/users`.
 *
 * Hand-rolled `fetch` (rather than `HttpClient`) so the SuperAdmin
 * `/users` screen can render targeted errors inline instead of being
 * bounced through the global `httpErrorInterceptor`. `credentials:
 * 'include'` keeps the request on the BFF's HttpOnly cookie session.
 *
 * Enums on the Wayel.Api side are serialised as PascalCase strings via
 * `JsonStringEnumConverter`, so `AdminUserKind` arrives as
 * `"Platform"` / `"InstitutionAdmin"` / `"Staff"` / `"Parent"` and
 * `AdminUserStatus` as `"Active"` / `"Invited"` / `"Suspended"` /
 * `"Inactive"`.
 */
export type WayelAdminUserKind =
  | 'Platform'
  | 'InstitutionAdmin'
  | 'Staff'
  | 'Parent';

export type WayelAdminUserStatus =
  | 'Active'
  | 'Invited'
  | 'Suspended'
  | 'Inactive';

export interface WayelAdminUserSummary {
  id: string;
  kind: WayelAdminUserKind;
  email: string;
  displayName: string;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
  status: WayelAdminUserStatus;
  lastLoginUtc: string | null;
  createdOnUtc: string;
}

export interface WayelAdminUsersKpiSummary {
  total: number;
  platform: number;
  institutionAdmin: number;
  staff: number;
  parent: number;
}

export interface WayelAdminUsersListResponse {
  items: WayelAdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
  kpis: WayelAdminUsersKpiSummary;
}

export interface WayelAdminListUsersQuery {
  search?: string | null;
  kind?: WayelAdminUserKind | null;
  status?: WayelAdminUserStatus | null;
  tenantId?: string | null;
  includeDisabled?: boolean | null;
  page?: number | null;
  pageSize?: number | null;
}

export interface WayelAdminUsersHttpError extends Error {
  status: number;
  /** Wayel error code, e.g. `admin_user.not_found`. */
  code?: string;
}

const BASE = '/api/v1/admin/users';

@Injectable({ providedIn: 'root' })
export class WayelAdminUsersService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  list(query: WayelAdminListUsersQuery = {}): Promise<WayelAdminUsersListResponse> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.kind) params.set('kind', query.kind);
    if (query.status) params.set('status', query.status);
    if (query.tenantId) params.set('tenantId', query.tenantId);
    if (query.includeDisabled != null) {
      params.set('includeDisabled', String(query.includeDisabled));
    }
    if (query.page != null) params.set('page', String(query.page));
    if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    const url = qs ? `${BASE}?${qs}` : BASE;
    return this.request<WayelAdminUsersListResponse>(url, { method: 'GET' });
  }

  get(id: string): Promise<WayelAdminUserSummary> {
    return this.request<WayelAdminUserSummary>(
      `${BASE}/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...this.baseHeaders,
        ...platformBearerAuthHeaders(),
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

    const err = new Error(detail) as WayelAdminUsersHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}
