import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '@app/environment';
import type { Phase0PublicTenantBySlugResponse } from '../core/contracts/platform-tenant.phase0';
import { MockTenantPublicLookupService } from './mock-tenant-public-lookup.service';
import { PlatformTenantApiService } from './platform-tenant-api.service';

/**
 * Single entry for `GET /api/tenants/by-slug/{slug}/public` — mock table merge or HTTP.
 */
@Injectable({ providedIn: 'root' })
export class TenantPublicBrandingService {
  private readonly mock = inject(MockTenantPublicLookupService);
  private readonly api = inject(PlatformTenantApiService);

  /** Emits one value (or null). Does not error — failures become null for callers. */
  getBySlug$(slug: string): Observable<Phase0PublicTenantBySlugResponse | null> {
    const s = slug.trim().toLowerCase();
    if (!s) return of(null);
    if (environment.useMock) {
      return of(this.mock.getBySlug(s));
    }
    return this.api.getPublicBySlug(s).pipe(catchError(() => of(null)));
  }
}
