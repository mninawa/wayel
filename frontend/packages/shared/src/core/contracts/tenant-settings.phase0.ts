/**
 * Phase 0 contract for institution-side tenant settings.
 *
 * Suggested endpoint (authenticated; tenant scoped via session/subdomain):
 *   GET /api/tenant/settings           → Phase0TenantSettingsDto
 *
 * Or, when an explicit slug is needed (super-admin impersonation, dev tools):
 *   GET /api/tenants/by-slug/{slug}/settings
 *
 * Branding fields overlap with `Phase0PublicTenantBySlugResponse.branding`
 * but include join policy / join code which are not public.
 */

export type Phase0TenantJoinMode = 'invite-only' | 'approval-required' | 'open-join';

export interface Phase0TenantSettingsDto {
  tenantId: string;
  name: string;
  /** Institution kind — same vocabulary as `MockPlatformTenant.type`. */
  type: string;
  timezone: string;
  joinMode: Phase0TenantJoinMode;
  joinCode: string;
  joinCodeActive: boolean;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}
