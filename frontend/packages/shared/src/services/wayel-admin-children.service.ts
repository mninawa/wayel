import { Injectable, inject } from '@angular/core';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the institution-children surface (`/api/v1/children/...`),
 * called from the REMOVED tenant workspace.
 *
 * Uses the SuperAdmin `?tenantId=` override pattern: every list / get
 * request includes the workspace tenant id in the query string, and the
 * API enforces SuperAdmin-only access to that override server-side via the
 * `EffectiveTenant` resolver.
 *
 * The pattern intentionally piggybacks on the same endpoint that
 * tenant-staff already use (no separate `/admin/tenants/{id}/children`
 * tree) so we keep one source of truth for the children surface and only
 * add the override on the read path.
 */
export type WayelMembershipState =
  | 'Pending'
  | 'Active'
  | 'OnHold'
  | 'Withdrawn'
  | 'Removed';

/** Nested object on `GET /api/v1/children/{id}` — mirrors {@link InstitutionChildCurrentSubscription}. */
export interface WayelChildCurrentSubscription {
  id: string;
  /** Open {@link SubscriptionPeriod} id when one exists for this roster row. */
  subscriptionPeriodId?: string | null;
  state: string;
  enrolledAt: string | null;
  classroom: string | null;
}

export interface WayelChildSummary {
  id: string;
  parentChildId: string | null;
  displayName: string;
  dateOfBirth: string; // yyyy-MM-dd
  membershipState: WayelMembershipState;
  classroom: string | null;
  guardianDisplayName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  enrolledOnUtc: string | null;
  withdrawnOnUtc: string | null;
  otherSubscriptionsCount: number;
  notes: string | null;
  /**
   * Parent-uploaded portrait surfaced on the staff list. `null` when
   * the row is unlinked or the parent has not uploaded a photo — the
   * UI then falls back to a deterministic placeholder.
   */
  photoUrl?: string | null;
}

export interface WayelListChildrenPage {
  items: WayelChildSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WayelListChildrenQuery {
  search?: string | null;
  membershipState?: WayelMembershipState | null;
  page?: number | null;
  pageSize?: number | null;
}

export interface WayelChildDetail extends WayelChildSummary {
  /** Present on detail responses; lists omit this. */
  currentSubscription?: WayelChildCurrentSubscription | null;
  // The detail payload mirrors the summary plus the parent-aggregate
  // join the workspace child-detail card needs. The server-side handler
  // resolves these by following the institution child's `ParentId`
  // link, OR (for staff-created walk-ins with no link) by matching
  // guardian-name + child-name against the parent roster — see
  // InstitutionChildDetail.
  parentDisplayName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  /** ISO timestamp of when the parent first signed up. */
  parentJoinedOnUtc?: string | null;
  /**
   * Institution-side guardian roster. When no parent account is linked,
   * the workspace renders this list as the fallback contact info.
   */
  guardians?: WayelChildGuardian[];
  parentId?: string | null;
  /**
   * Parent-owned portrait projected for linked children (read-only).
   * Populated server-side when the roster row resolves to a {@link ParentChild}.
   */
  photoUrl?: string | null;
}

export interface WayelChildGuardian {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  relationship: string;
}

export interface WayelAdminChildrenHttpError extends Error {
  status: number;
  code?: string;
}

const base = '/api/v1/children';

@Injectable({ providedIn: 'root' })
export class WayelAdminChildrenService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  /**
   * List children for the workspace tenant. The `tenantId` argument is
   * appended as `?tenantId=...` and routed through the SuperAdmin override
   * resolver server-side.
   */
  list(
    tenantId: string,
    query: WayelListChildrenQuery = {},
  ): Promise<WayelListChildrenPage> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    if (query.search) params.set('search', query.search);
    if (query.membershipState) params.set('membershipState', query.membershipState);
    if (query.page != null) params.set('page', String(query.page));
    if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
    return this.request<WayelListChildrenPage>(
      `${base}?${params.toString()}`,
      { method: 'GET' },
    );
  }

  /** Fetch the detail view for a single child within the workspace tenant. */
  get(tenantId: string, childId: string): Promise<WayelChildDetail> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return this.request<WayelChildDetail>(
      `${base}/${encodeURIComponent(childId)}?${params.toString()}`,
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
        error?: string;
      };
      detail = payload.detail || payload.title || detail;
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

    const err = new Error(detail) as WayelAdminChildrenHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelAdminChildren = (): WayelAdminChildrenService =>
  inject(WayelAdminChildrenService);
