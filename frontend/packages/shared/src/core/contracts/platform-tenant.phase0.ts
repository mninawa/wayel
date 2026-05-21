/**
 * Phase 0 API sketch for ASP.NET + PostgreSQL — mirrors SecureDocs-style
 * tenant management + public slug resolution for login/branding.
 *
 * Suggested base path: `/api/platform/tenants` (super-admin) and
 * `/api/tenants` for public read models, or a single API with auth layers.
 */

export type Phase0TenantPlan = 'starter' | 'professional' | 'enterprise';
export type Phase0TenantStatus = 'pending' | 'active' | 'suspended' | 'archived';

/** Super-admin list (paged). */
export interface Phase0PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface Phase0ListTenantsQuery {
  search?: string;
  /** Exact match on normalized slug (lowercase); use for uniqueness checks. */
  slug?: string;
  status?: Phase0TenantStatus;
  plan?: Phase0TenantPlan;
  page?: number;
  pageSize?: number;
}

export interface Phase0OnboardTenantRequest {
  name: string;
  slug: string;
  plan: Phase0TenantPlan;
  /** Institution kind — same values as mock `MockPlatformTenant.type` (e.g. PRESCHOOL). */
  type: string;
  timezone: string;
  initialStatus: Exclude<Phase0TenantStatus, 'archived'>;
  firstAdminEmail?: string | null;
  firstAdminFirstName?: string | null;
  firstAdminLastName?: string | null;
}

export interface Phase0OnboardTenantResponse {
  tenantId: string;
  slug: string;
  status: Phase0TenantStatus;
  createdAt: string;
}

export interface Phase0PatchTenantStatusRequest {
  status: Phase0TenantStatus;
  /** Required when suspending — audit trail. */
  reason?: string | null;
}

export interface Phase0TenantDto {
  id: string;
  name: string;
  type: string;
  slug: string;
  plan: Phase0TenantPlan;
  status: Phase0TenantStatus;
  timezone: string;
  createdAt: string;
  firstAdminEmail: string | null;
  firstAdminFirstName: string | null;
  firstAdminLastName: string | null;
  onboardedByUserId: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  maxChildren: number | null;
}

/**
 * Unauthenticated — used before login when resolving tenant by subdomain or `?tenant=slug`.
 * Aligns with SecureDocs `GET .../by-slug/{slug}/public` (trim secrets).
 */
export interface Phase0PublicTenantBranding {
  displayName: string | null;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface Phase0PublicTenantBySlugResponse {
  id: string;
  name: string;
  slug: string;
  branding: Phase0PublicTenantBranding;
}

/**
 * Route cheat sheet
 * - GET    /platform/tenants?search=&slug=&status=&plan=&page=&pageSize=
 * - GET    /platform/tenants/{id}
 * - POST   /platform/tenants/onboard
 * - PATCH  /platform/tenants/{id}/status
 * - GET    /platform/tenants/{tenantId}/documents
 * - GET    /platform/users?search=&page=&pageSize=
 * - GET    /platform/users/{id}
 * - GET    /platform/audit?tenantId=&page=&pageSize=
 * - GET    /tenants/by-slug/{slug}/public   (no auth; 404 if unknown or not active)
 */
