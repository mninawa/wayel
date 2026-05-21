import type { Phase0PagedResult } from './platform-tenant.phase0';

/** GET /api/platform/users */
export type Phase0PlatformUserRole = 'platform_admin' | 'support';

export interface Phase0PlatformUserDto {
  id: string;
  email: string;
  displayName: string;
  role: Phase0PlatformUserRole;
  homeTenantId: string | null;
  homeTenantName: string | null;
  status: 'active' | 'invited' | 'suspended';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Phase0ListUsersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  /** Restrict to a single tenant's users (SuperAdmin only). */
  tenantId?: string;
}

export type Phase0PlatformUserListResult = Phase0PagedResult<Phase0PlatformUserDto>;
