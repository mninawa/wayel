import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from, map } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0ListUsersQuery,
  Phase0PlatformUserDto,
  Phase0PlatformUserListResult,
  Phase0PlatformUserRole,
} from '../core/contracts/platform-users.phase0';
import type { WorkspaceStaffMember, WorkspaceStaffRole, WorkspaceStaffStatus } from './workspace-staff';

// Live wire types — match Wayel.Api `AdminUsersEndpoints` 1:1. We model them
// inline (rather than reusing WayelAdminUsersService) so the Phase-0 contract
// stays the public surface for every existing consumer of this service.
interface WayelAdminUserSummaryWire {
  id: string;
  kind: 'Platform' | 'InstitutionAdmin' | 'Staff' | 'Parent';
  email: string;
  displayName: string;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
  status: 'Active' | 'Invited' | 'Suspended' | 'Inactive';
  lastLoginUtc: string | null;
  createdOnUtc: string;
}

interface WayelAdminUsersListWire {
  items: WayelAdminUserSummaryWire[];
  total: number;
  page: number;
  pageSize: number;
}

/** Wire shape for <c>GET /api/v1/admin/tenants/{tenantId}/staff</c> (ListStaffResponse). */
interface WayelTenantStaffListWire {
  items: WayelTenantStaffRow[];
  nextPageToken: string | null;
}

interface WayelTenantStaffRow {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  isDisabled: boolean;
  createdOnUtc: string;
  lastLoginUtc: string | null;
}

function toPhase0Status(s: WayelAdminUserSummaryWire['status']): Phase0PlatformUserDto['status'] {
  // Phase-0 contract has no `inactive`; collapse to `suspended` so the badge
  // renders in the closest-meaning slot rather than producing an unknown enum.
  switch (s) {
    case 'Active':
      return 'active';
    case 'Invited':
      return 'invited';
    case 'Suspended':
    case 'Inactive':
      return 'suspended';
  }
}

function toPhase0Role(wire: WayelAdminUserSummaryWire): Phase0PlatformUserRole {
  // The Phase-0 mock vocabulary only knows two platform roles. Anything from
  // the live directory (institution admin / staff / parent / arbitrary
  // tenant role names) lands as `support`, which the dashboard treats as a
  // generic non-superuser bucket. SuperAdmin operators pivot off Kind in the
  // live UI anyway; this mapping just keeps the Phase-0-only consumers safe.
  if (wire.kind === 'Platform') {
    return wire.role.toLowerCase().includes('admin') ? 'platform_admin' : 'support';
  }
  return 'support';
}

function toPhase0Dto(w: WayelAdminUserSummaryWire): Phase0PlatformUserDto {
  return {
    id: w.id,
    email: w.email,
    displayName: w.displayName,
    role: toPhase0Role(w),
    homeTenantId: w.tenantId,
    homeTenantName: w.tenantName,
    status: toPhase0Status(w.status),
    lastLoginAt: w.lastLoginUtc,
    createdAt: w.createdOnUtc,
  };
}

@Injectable({ providedIn: 'root' })
export class PlatformUserApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  /**
   * Calls the live `/api/v1/admin/users` (SuperAdmin-only) endpoint and
   * adapts the response to the Phase-0 paged shape the bridge consumes.
   * Phase-0 had `/api/platform/users`; the live API never shipped that path.
   */
  listUsers(query: Phase0ListUsersQuery = {}): Observable<Phase0PlatformUserListResult> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null) params = params.set('pageSize', String(query.pageSize));
    if (query.tenantId) params = params.set('tenantId', query.tenantId);

    return this.http
      .get<WayelAdminUsersListWire>(`${this.base()}/api/v1/admin/users`, { params })
      .pipe(
        map((r) => ({
          items: r.items.map(toPhase0Dto),
          totalCount: r.total,
          page: r.page,
          pageSize: r.pageSize,
        })),
      );
  }

  getUser(id: string): Observable<Phase0PlatformUserDto> {
    return this.http
      .get<WayelAdminUserSummaryWire>(
        `${this.base()}/api/v1/admin/users/${encodeURIComponent(id)}`,
      )
      .pipe(map(toPhase0Dto));
  }

  /**
   * Fetches all Staff + InstitutionAdmin users for a single tenant and maps
   * them to the {@link WorkspaceStaffMember} shape expected by the workspace.
   * Uses `pageSize=500` so one call covers any realistic staff roster.
   */
  listTenantStaff(tenantId: string): Observable<WorkspaceStaffMember[]> {
    return from(this.collectTenantStaffPages(tenantId));
  }

  /**
   * Follows cursor pages until exhaustion (Mongo caps page-size at 100).
   */
  private async collectTenantStaffPages(tenantId: string): Promise<WorkspaceStaffMember[]> {
    const aggregated: WorkspaceStaffMember[] = [];
    let pageToken: string | null | undefined;
    while (true) {
      let params = new HttpParams().set('pageSize', '100');
      if (pageToken) {
        params = params.set('pageToken', pageToken);
      }
      const page = await firstValueFrom(
        this.http.get<WayelTenantStaffListWire>(
          `${this.base()}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/staff`,
          { params },
        ),
      );
      for (const row of page.items) {
        aggregated.push(tenantStaffRowToMember(row));
      }
      pageToken = page.nextPageToken;
      if (!pageToken || page.items.length === 0) {
        break;
      }
    }
    return aggregated;
  }

  /**
   * SuperAdmin-only: change a single staff member's role inside a tenant.
   * Maps the workspace `roles[]` shape (multi-select for the future) onto
   * the live single-role API by picking the highest-privilege role we
   * recognise — TenantAdmin > Staff. Returns the new role echoed by the
   * API so the workspace can refresh its local cache without re-listing.
   */
  changeStaffRole(
    tenantId: string,
    userId: string,
    role: 'TenantAdmin' | 'Staff',
  ): Observable<{ userId: string; role: string }> {
    return this.http.patch<{ userId: string; role: string }>(
      `${this.base()}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/staff/${encodeURIComponent(userId)}/role`,
      { role },
    );
  }

  /**
   * SuperAdmin-only: rename, suspend, or reactivate a staff member. Each
   * field is optional — null means "leave as-is", set means "apply this
   * value". Pass <c>isDisabled: true</c> to suspend, <c>false</c> to
   * reactivate.
   */
  updateStaffMember(
    tenantId: string,
    userId: string,
    body: { displayName?: string | null; isDisabled?: boolean | null },
  ): Observable<{ userId: string; displayName: string; isDisabled: boolean }> {
    return this.http.patch<{ userId: string; displayName: string; isDisabled: boolean }>(
      `${this.base()}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/staff/${encodeURIComponent(userId)}`,
      body,
    );
  }

  /**
   * SuperAdmin-only: re-issue a staff invitation. Backend treats this as a
   * fresh invite (the email gets a new join link); the existing record is
   * superseded so a previously-issued link can't be reused. Channel
   * defaults to <c>Email</c> which is what the workspace footer offers.
   */
  resendStaffInvite(
    tenantId: string,
    body: { email: string; role: string; phone?: string | null; message?: string | null },
  ): Observable<{ invitationId: string }> {
    return this.http.post<{ invitationId: string }>(
      `${this.base()}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/staff/invitations`,
      {
        email: body.email,
        role: body.role,
        channel: 'Email',
        phone: body.phone ?? null,
        message: body.message ?? null,
      },
    );
  }
}

function tenantStaffRowToMember(row: WayelTenantStaffRow): WorkspaceStaffMember {
  const pseudoSummary: WayelAdminUserSummaryWire = {
    id: row.userId,
    kind: row.role === 'TenantAdmin' ? 'InstitutionAdmin' : 'Staff',
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    tenantId: null,
    tenantName: null,
    status: row.isDisabled ? 'Suspended' : 'Active',
    lastLoginUtc: row.lastLoginUtc,
    createdOnUtc: row.createdOnUtc,
  };
  return wireToStaffMember(pseudoSummary);
}

function wireRoleToWorkspaceRole(wire: WayelAdminUserSummaryWire): WorkspaceStaffRole {
  const r = wire.role?.toLowerCase() ?? '';
  if (r.includes('tenantadmin') || r.includes('admin')) return 'TenantAdmin';
  return 'Viewer';
}

function wireStatusToStaffStatus(s: WayelAdminUserSummaryWire['status']): WorkspaceStaffStatus {
  switch (s) {
    case 'Active':
      return 'active';
    case 'Invited':
      return 'invited';
    case 'Suspended':
    case 'Inactive':
      return 'inactive';
  }
}

function wireToStaffMember(w: WayelAdminUserSummaryWire): WorkspaceStaffMember {
  const parts = (w.displayName ?? '').trim().split(/\s+/);
  const firstName = parts[0] ?? w.displayName ?? '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return {
    id: w.id,
    firstName,
    lastName,
    displayName: w.displayName ?? w.email,
    email: w.email,
    phone: null,
    title: w.kind === 'InstitutionAdmin' ? 'Tenant Administrator' : '',
    roles: [wireRoleToWorkspaceRole(w)],
    directPermissions: [],
    status: wireStatusToStaffStatus(w.status),
    lastLoginAt: w.lastLoginUtc,
    createdAt: w.createdOnUtc,
    photoUrl: null,
  };
}
