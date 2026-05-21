import type { Phase0TenantDto } from '../core/contracts/platform-tenant.phase0';
import type { MockPlatformTenant } from '../core/mock/mock-data';

/** Maps API DTO to the UI model used across platform tenant screens. */
export function phase0TenantDtoToMock(d: Phase0TenantDto): MockPlatformTenant {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    slug: d.slug,
    plan: d.plan,
    status: d.status,
    timezone: d.timezone,
    createdAt: d.createdAt,
    firstAdminEmail: d.firstAdminEmail,
    firstAdminFirstName: d.firstAdminFirstName,
    firstAdminLastName: d.firstAdminLastName,
    onboardedByUserId: d.onboardedByUserId,
    activatedAt: d.activatedAt,
    suspendedAt: d.suspendedAt,
    settings: d.maxChildren != null ? { maxChildren: d.maxChildren } : null,
  };
}
