import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '@app/environment';
import type { Phase0TenantSettingsDto } from '../core/contracts/tenant-settings.phase0';
import { MOCK_TENANT_SETTINGS, MockTenantSettings } from '../core/mock/mock-data';
import { MockTenantService } from './mock-tenant.service';
import { TenantResolutionService } from './tenant-resolution.service';
import { TenantSettingsApiService } from './tenant-settings-api.service';

/**
 * Switches between mock institution settings and `TenantSettingsApiService`
 * based on `environment.useMock`. Live mode prefers the session-scoped
 * endpoint, falling back to the resolved slug if available.
 */
@Injectable({ providedIn: 'root' })
export class TenantSettingsBridgeService {
  private readonly mock = inject(MockTenantService);
  private readonly api = inject(TenantSettingsApiService);
  private readonly resolution = inject(TenantResolutionService);

  /** Subtitle line for the settings panel. */
  readonly dataSourceLine: string = environment.useMock
    ? 'In-memory mock (institution settings).'
    : environment.platformApiUrl
      ? `Backed by ${environment.platformApiUrl}.`
      : 'Live API (same origin).';

  /** Emits one value (or null on failure). Does not throw. */
  getSettings$(): Observable<MockTenantSettings | null> {
    if (environment.useMock) {
      return this.mock.getSettings().pipe(map((s) => s ?? null));
    }

    const live$ = this.api.getCurrentTenantSettings();
    return live$.pipe(
      map(toMockShape),
      catchError(() => {
        const slug = this.resolution.resolvedSlug();
        if (!slug) return of(null);
        return this.api.getTenantSettingsBySlug(slug).pipe(
          map(toMockShape),
          catchError(() => of(null)),
        );
      }),
    );
  }
}

/** Phase 0 DTO uses the same field names as the legacy mock — keep UI stable. */
function toMockShape(dto: Phase0TenantSettingsDto): MockTenantSettings {
  return {
    tenantId: dto.tenantId,
    name: dto.name,
    type: dto.type,
    timezone: dto.timezone,
    joinMode: dto.joinMode,
    joinCode: dto.joinCode,
    joinCodeActive: dto.joinCodeActive,
    primaryColor: dto.primaryColor,
    accentColor: dto.accentColor,
    logoUrl: dto.logoUrl,
  };
}

/** Legacy seed export — kept so callers that imported from this module still compile. */
export const SEED_TENANT_SETTINGS = MOCK_TENANT_SETTINGS;
