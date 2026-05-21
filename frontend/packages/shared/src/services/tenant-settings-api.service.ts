import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type { Phase0TenantSettingsDto } from '../core/contracts/tenant-settings.phase0';

/**
 * HTTP client for institution-side tenant settings (Phase 0).
 * Use when `environment.useMock` is false.
 */
@Injectable({ providedIn: 'root' })
export class TenantSettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  /** Settings for the tenant resolved by the current session (cookie/header/subdomain). */
  getCurrentTenantSettings(): Observable<Phase0TenantSettingsDto> {
    return this.http.get<Phase0TenantSettingsDto>(`${this.base()}/api/tenant/settings`);
  }

  /** Settings for an explicit slug — handy for dev tools / impersonation flows. */
  getTenantSettingsBySlug(slug: string): Observable<Phase0TenantSettingsDto> {
    return this.http.get<Phase0TenantSettingsDto>(
      `${this.base()}/api/tenants/by-slug/${encodeURIComponent(slug)}/settings`,
    );
  }
}
