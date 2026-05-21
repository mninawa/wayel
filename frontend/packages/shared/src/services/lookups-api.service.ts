import { Injectable } from '@angular/core';
import { Observable, defer, from, map, of } from 'rxjs';
import { wayelAdminFetch } from './wayel-admin-http';

/**
 * Wire shape for a single lookup row returned by
 * `GET /api/v1/lookups`. Mirrors the backend `LookupOptionDto`
 * exactly — keeping the names aligned means downstream services can
 * reproject without renaming fields.
 */
export interface LookupOption {
  intent: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
}

interface ListLookupsResponse {
  intent: string;
  items: LookupOption[];
}

interface LookupIntentSummary {
  intent: string;
  activeCount: number;
  totalCount: number;
}

interface ListLookupIntentsResponse {
  items: LookupIntentSummary[];
}

/**
 * Thin HTTP client for the read-only lookup catalogue surface
 * exposed at `/api/v1/lookups`. Wraps the shared
 * {@link wayelAdminFetch} helper so XSRF, credentials, and
 * ProblemDetails parsing all match the rest of the SPA.
 *
 * <para>
 * Caching is intentionally NOT done here — that's the job of the
 * higher-level {@link import('./lookups.service').LookupsService}
 * facade. The api service hands back a fresh {@link Observable}
 * for every call so unit tests can assert the wire contract
 * deterministically.
 * </para>
 */
@Injectable({ providedIn: 'root' })
export class LookupsApiService {
  /**
   * List active lookup values for one intent. Pass
   * `includeInactive: true` if a future admin surface needs the
   * full catalogue (deactivated rows included).
   */
  listByIntent(
    intent: string,
    options: { includeInactive?: boolean } = {},
  ): Observable<LookupOption[]> {
    if (!intent) return of([]);
    const params = new URLSearchParams({ intent });
    if (options.includeInactive) params.set('includeInactive', 'true');
    return defer(() =>
      from(
        wayelAdminFetch<ListLookupsResponse>(
          `/api/v1/lookups?${params.toString()}`,
          { method: 'GET' },
        ),
      ),
    ).pipe(map((res) => res?.items ?? []));
  }

  /** Single lookup row — resolves to `null` on 404. */
  getOption(intent: string, code: string): Observable<LookupOption | null> {
    if (!intent || !code) return of(null);
    return defer(() =>
      from(
        wayelAdminFetch<LookupOption>(
          `/api/v1/lookups/${encodeURIComponent(intent)}/${encodeURIComponent(code)}`,
          { method: 'GET' },
        ).catch((err: unknown) => {
          if (
            typeof err === 'object'
            && err !== null
            && 'status' in err
            && (err as { status?: number }).status === 404
          ) {
            return null;
          }
          throw err;
        }),
      ),
    );
  }

  /** Distinct intents with active + total counts. */
  listIntents(): Observable<LookupIntentSummary[]> {
    return defer(() =>
      from(
        wayelAdminFetch<ListLookupIntentsResponse>(
          '/api/v1/lookups/intents',
          { method: 'GET' },
        ),
      ),
    ).pipe(map((res) => res?.items ?? []));
  }
}

export type { LookupIntentSummary };
