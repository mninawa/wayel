import { Injectable, inject } from '@angular/core';
import { Phase0PublicTenantBySlugResponse } from '../core/contracts/platform-tenant.phase0';
import { MOCK_TENANT_SETTINGS } from '../core/mock/mock-data';
import { MockPlatformTenantService } from './mock-platform-tenant.service';

const DEFAULT_BRANDING = {
  primaryColor: '#1e3a5f',
  accentColor: '#f59e0b',
  logoUrl: null as string | null,
};

/**
 * Mock for `GET /tenants/by-slug/{slug}/public` — merges platform registry rows with
 * `MOCK_TENANT_SETTINGS` when `tenantId` matches (Little Stars).
 */
@Injectable({ providedIn: 'root' })
export class MockTenantPublicLookupService {
  private readonly platform = inject(MockPlatformTenantService);

  getBySlug(slug: string): Phase0PublicTenantBySlugResponse | null {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return null;

    const t = this.platform.tenants().find((row) => row.slug.toLowerCase() === normalized);
    if (!t || t.status !== 'active') return null;

    const fromSettings =
      t.id === MOCK_TENANT_SETTINGS.tenantId
        ? {
            displayName: MOCK_TENANT_SETTINGS.name,
            primaryColor: MOCK_TENANT_SETTINGS.primaryColor,
            accentColor: MOCK_TENANT_SETTINGS.accentColor,
            logoUrl: MOCK_TENANT_SETTINGS.logoUrl,
          }
        : {
            displayName: t.name,
            primaryColor: DEFAULT_BRANDING.primaryColor,
            accentColor: DEFAULT_BRANDING.accentColor,
            logoUrl: DEFAULT_BRANDING.logoUrl,
          };

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      branding: fromSettings,
    };
  }
}
