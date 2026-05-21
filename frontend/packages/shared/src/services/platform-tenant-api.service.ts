import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import {
  Phase0ListTenantsQuery,
  Phase0OnboardTenantRequest,
  Phase0OnboardTenantResponse,
  Phase0PagedResult,
  Phase0PatchTenantStatusRequest,
  Phase0PublicTenantBySlugResponse,
  Phase0TenantDto,
} from '../core/contracts/platform-tenant.phase0';

/**
 * HTTP client for Phase 0 platform tenant endpoints (use when `environment.useMock` is false).
 */
@Injectable({ providedIn: 'root' })
export class PlatformTenantApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  listTenants(query: Phase0ListTenantsQuery = {}): Observable<Phase0PagedResult<Phase0TenantDto>> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    if (query.slug) params = params.set('slug', query.slug);
    if (query.status) params = params.set('status', query.status);
    if (query.plan) params = params.set('plan', query.plan);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null) params = params.set('pageSize', String(query.pageSize));
    return this.http.get<Phase0PagedResult<Phase0TenantDto>>(`${this.base()}/api/platform/tenants`, {
      params,
    });
  }

  getTenant(id: string): Observable<Phase0TenantDto> {
    return this.http.get<Phase0TenantDto>(`${this.base()}/api/platform/tenants/${encodeURIComponent(id)}`);
  }

  onboard(body: Phase0OnboardTenantRequest): Observable<Phase0OnboardTenantResponse> {
    return this.http.post<Phase0OnboardTenantResponse>(
      `${this.base()}/api/platform/tenants/onboard`,
      body,
    );
  }

  patchStatus(id: string, body: Phase0PatchTenantStatusRequest): Observable<void> {
    return this.http.patch<void>(
      `${this.base()}/api/platform/tenants/${encodeURIComponent(id)}/status`,
      body,
    );
  }

  /** Unauthenticated — login / branding resolution. */
  getPublicBySlug(slug: string): Observable<Phase0PublicTenantBySlugResponse> {
    return this.http.get<Phase0PublicTenantBySlugResponse>(
      `${this.base()}/api/tenants/by-slug/${encodeURIComponent(slug)}/public`,
    );
  }
}
