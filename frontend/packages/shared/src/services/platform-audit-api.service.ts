import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0ListAuditQuery,
  Phase0PlatformAuditListResult,
} from '../core/contracts/platform-audit.phase0';

@Injectable({ providedIn: 'root' })
export class PlatformAuditApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  listAudit(query: Phase0ListAuditQuery = {}): Observable<Phase0PlatformAuditListResult> {
    let params = new HttpParams();
    if (query.tenantId) params = params.set('tenantId', query.tenantId);
    if (query.noTenant) params = params.set('noTenant', 'true');
    if (query.action) params = params.set('action', query.action);
    if (query.actor) params = params.set('actor', query.actor);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null) params = params.set('pageSize', String(query.pageSize));
    return this.http.get<Phase0PlatformAuditListResult>(`${this.base()}/api/platform/audit`, {
      params,
    });
  }
}
