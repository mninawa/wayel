import { Injectable, inject } from '@angular/core';
import { Observable, defer, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@app/environment';
import type { AppEnvironment } from '../core/environment.types';
import type { Phase0ListAuditQuery } from '../core/contracts/platform-audit.phase0';
import type { MockPlatformAuditEntry, MockPlatformTenant } from '../core/mock/mock-data';
import { MockPlatformAuditService } from './mock-platform-audit.service';
import {
  WayelAdminAuditService,
  type WayelAdminAuditLogQuery,
} from './wayel-admin-audit.service';
import {
  indexTenantsById,
  wayelAuditEntryToMock,
} from './wayel-admin-audit-mappers';
import { PlatformAuditApiService } from './platform-audit-api.service';
import { phase0AuditDtoToMock } from './platform-audit-mappers';

/** Paged audit list — shape mirrors `PlatformTenantListResult`. */
export interface PlatformAuditListResult {
  items: MockPlatformAuditEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
}

function filterMockEntries(
  rows: MockPlatformAuditEntry[],
  q: Phase0ListAuditQuery,
): MockPlatformAuditEntry[] {
  let out = rows;
  if (q.noTenant) out = out.filter((e) => e.tenantId === null);
  else if (q.tenantId) out = out.filter((e) => e.tenantId === q.tenantId);
  if (q.action) out = out.filter((e) => e.action === q.action);
  if (q.actor) {
    const needle = q.actor.toLowerCase();
    out = out.filter((e) => e.actorEmail.toLowerCase().includes(needle));
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class PlatformAuditBridgeService {
  private readonly mock = inject(MockPlatformAuditService);
  private readonly api = inject(PlatformAuditApiService);
  private readonly wayel = inject(WayelAdminAuditService);

  private readonly useWayel: boolean =
    !!(environment as AppEnvironment).useWayelAdminApi && !environment.useMock;

  /**
   * Optional in-memory tenant catalogue used to enrich Wayel.Api
   * audit rows (which only carry `tenantId`) with display names.
   * The platform audit screen already loads the catalogue for its
   * dropdown — it calls `setTenantCatalogue(tenants)` so we can
   * project rich rows without a second round-trip per page.
   *
   * When unset (or not yet loaded), rows fall back to `tenantName:
   * null` and the column shows the raw id, which is still navigable.
   */
  private tenantsById: ReadonlyMap<string, MockPlatformTenant> = new Map();

  /** Push the tenant catalogue from a caller (the platform audit
   *  screen). Cheap; just swaps the cached map. */
  setTenantCatalogue(tenants: ReadonlyArray<MockPlatformTenant>): void {
    this.tenantsById = indexTenantsById(tenants);
  }

  /**
   * @param query Defaults: `page=1`, `pageSize=20`.
   *
   * Wayel.Api audit pagination is **cursor-based**, but the existing
   * audit UI is offset-based. We bridge the two by oversampling: when
   * a caller asks for page N at size S we fetch up to N*S rows in one
   * API call (capped at 500 to keep the response sane) and slice the
   * requested window client-side. This isn't ideal for very deep
   * pages, but the platform audit screen rarely scrolls past page 5
   * and the API holds rows in reverse-chrono order so the latest are
   * at the front of the response.
   */
  loadEntries(query: Phase0ListAuditQuery = {}): Observable<PlatformAuditListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q: Phase0ListAuditQuery = { ...query, page, pageSize };

    if (environment.useMock) {
      const filtered = filterMockEntries([...this.mock.entries()], q);
      const totalCount = filtered.length;
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      return of({ items, totalCount, page, pageSize });
    }
    if (this.useWayel) {
      const apiPageSize = Math.min(500, Math.max(pageSize, page * pageSize));
      const wayelQuery: WayelAdminAuditLogQuery = {
        action: q.action || undefined,
        actorEmail: q.actor || undefined,
        // `noTenant` isn't modelled server-side yet — when the
        // caller asks for "no tenant" we fall back to omitting the
        // filter and post-filter client-side. The server-side
        // `tenantId` filter is the first-class case (slice #4).
        tenantId: q.noTenant ? undefined : q.tenantId || undefined,
        pageSize: apiPageSize,
      };
      return defer(() => from(this.wayel.list(wayelQuery))).pipe(
        map((apiPage) => {
          let rows = apiPage.items.map((e) =>
            wayelAuditEntryToMock(e, this.tenantsById),
          );
          if (q.noTenant) {
            rows = rows.filter((r) => r.tenantId === null);
          }
          const totalCount = rows.length;
          const start = (page - 1) * pageSize;
          const items = rows.slice(start, start + pageSize);
          return { items, totalCount, page, pageSize };
        }),
      );
    }
    return this.api.listAudit(q).pipe(
      map((r) => ({
        items: r.items.map(phase0AuditDtoToMock),
        totalCount: r.totalCount,
        page: r.page,
        pageSize: r.pageSize,
      })),
    );
  }
}
