import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the Wayel.Api admin staff directory surface
 * (`/api/v1/admin/tenants/{tenantId}/staff/...`), proxied through the
 * admin BFF cookie session. Mirrors `Wayel.Api.Endpoints.AdminStaffEndpoints`
 * 1:1.
 *
 * Same hand-rolled `fetch` posture as `WayelAdminTenantsService` and
 * `WayelAdminOutboxService` — surfaces 4xx inline so the staff panel
 * can render targeted messages (404 unknown tenant, validation errors
 * on role assignment, etc) instead of bouncing through the global
 * error interceptor.
 */
export type WayelUserRole = 'Unknown' | 'SuperAdmin' | 'TenantAdmin' | 'Staff' | 'Parent';

/**
 * Subset of {@link WayelUserRole} that the staff directory is allowed to
 * mint or assign. SuperAdmin is intentionally excluded — platform admins
 * are seeded out-of-band, not created through the tenant surface.
 */
export type WayelAssignableStaffRole = 'TenantAdmin' | 'Staff' | 'Parent';

export type WayelInvitationChannel = 'Email' | 'WhatsApp' | 'Both';

/**
 * Per-tenant lifecycle of a staff member's relationship to the
 * institution they're listed under. Distinct from `isDisabled`
 * (platform-wide kill switch). Mirrors
 * `Wayel.Domain.Users.TenantMembershipStatus` 1:1.
 *
 * Suspending only affects the current tenant — a staff member who
 * belongs to multiple institutions stays active everywhere else.
 * Archive is the terminal soft-delete used when their tenure ends.
 */
export type WayelStaffMembershipStatus = 'Active' | 'Suspended' | 'Archived';

export interface WayelStaffSummary {
  userId: string;
  email: string;
  displayName: string;
  role: WayelUserRole;
  /** Platform-wide kill switch (SuperAdmin-only). */
  isDisabled: boolean;
  /** Per-tenant lifecycle. See {@link WayelStaffMembershipStatus}. */
  membershipStatus: WayelStaffMembershipStatus;
  membershipStatusChangedOnUtc: string | null;
  membershipStatusReason: string | null;
  createdOnUtc: string;
  lastLoginUtc: string | null;
}

export interface WayelListStaffPage {
  items: WayelStaffSummary[];
  nextPageToken: string | null;
}

export interface WayelListStaffQuery {
  search?: string | null;
  role?: WayelUserRole | null;
  pageSize?: number | null;
  pageToken?: string | null;
  /**
   * Opt-in to surface archived rows in the listing. Defaults to false
   * — archived staff are hidden from the directory until the operator
   * toggles "Show archived" on the staff page.
   */
  includeArchived?: boolean | null;
}

export interface WayelSetStaffMembershipStatusRequest {
  status: WayelStaffMembershipStatus;
  /** Optional freeform context (≤ 500 chars). */
  reason?: string | null;
}

export interface WayelSetStaffMembershipStatusResponse {
  userId: string;
  membershipStatus: WayelStaffMembershipStatus;
  membershipStatusChangedOnUtc: string | null;
  membershipStatusReason: string | null;
}

export interface WayelChangeStaffRoleRequest {
  role: WayelAssignableStaffRole;
}

export interface WayelChangeStaffRoleResponse {
  userId: string;
  role: WayelUserRole;
}

export interface WayelInviteStaffRequest {
  email: string;
  role: string;
  channel: WayelInvitationChannel;
  phone?: string | null;
  message?: string | null;
}

export interface WayelInviteStaffResponse {
  invitationId: string;
  email: string;
  role: string;
  channel: WayelInvitationChannel;
  expiresOnUtc: string;
  /** Plaintext invitation token. Shown once, never re-fetchable. */
  token: string;
  /**
   * Server-composed accept URL — the same string baked into the
   * email/SMS the recipient just received. Null when no
   * `NotificationOptions.AcceptUrlBase` is configured for the role;
   * callers fall back to the SPA-side `buildInvitationAcceptUrl(token)`
   * helper, which uses `window.origin`.
   */
  acceptUrl: string | null;
}

export interface WayelAdminStaffHttpError extends Error {
  status: number;
  /** Wayel error code, e.g. `staff.not_found`. */
  code?: string;
}

const tenantBase = (tenantId: string): string =>
  `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/staff`;

@Injectable({ providedIn: 'root' })
export class WayelAdminStaffService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  list(
    tenantId: string,
    query: WayelListStaffQuery = {},
  ): Promise<WayelListStaffPage> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.role) params.set('role', query.role);
    if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
    if (query.pageToken) params.set('pageToken', query.pageToken);
    if (query.includeArchived) params.set('includeArchived', 'true');
    const qs = params.toString();
    const url = qs ? `${tenantBase(tenantId)}?${qs}` : `${tenantBase(tenantId)}/`;
    return this.request<WayelListStaffPage>(url, { method: 'GET' });
  }

  /**
   * Move a staff member's tenant-scoped membership through
   * Active / Suspended / Archived. Returns the new lifecycle so the
   * caller can update the row in place without re-listing.
   *
   * Tenant-scoped: archiving / suspending here never touches the
   * staff member's record at any other institution they belong to —
   * see {@link WayelStaffMembershipStatus}.
   */
  setMembershipStatus(
    tenantId: string,
    userId: string,
    body: WayelSetStaffMembershipStatusRequest,
  ): Promise<WayelSetStaffMembershipStatusResponse> {
    return this.request<WayelSetStaffMembershipStatusResponse>(
      `${tenantBase(tenantId)}/${encodeURIComponent(userId)}/status`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /**
   * Promote / demote a staff member within a tenant. Idempotent on the
   * server — calling this with the user's existing role is a no-op and
   * still resolves with the current role, so the UI can render an
   * optimistic update without special-casing.
   */
  changeRole(
    tenantId: string,
    userId: string,
    body: WayelChangeStaffRoleRequest,
  ): Promise<WayelChangeStaffRoleResponse> {
    return this.request<WayelChangeStaffRoleResponse>(
      `${tenantBase(tenantId)}/${encodeURIComponent(userId)}/role`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /**
   * Mint a staff invitation for a tenant on behalf of a SuperAdmin.
   * The plaintext invitation token in the response is shown once — we
   * surface it directly in the UI so the operator can copy/share it
   * out-of-band when needed.
   */
  invite(
    tenantId: string,
    body: WayelInviteStaffRequest,
  ): Promise<WayelInviteStaffResponse> {
    return this.request<WayelInviteStaffResponse>(
      `${tenantBase(tenantId)}/invitations`,
      { method: 'POST', body: JSON.stringify(body) },
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
      // Wayel.Api uses `title = error.code` and `type = https://wayel.dev/errors/<code>`.
      // Same heuristic chain as the tenants/outbox services so error UX stays consistent.
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

    const err = new Error(detail) as WayelAdminStaffHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelAdminStaff = (): WayelAdminStaffService =>
  inject(WayelAdminStaffService);
