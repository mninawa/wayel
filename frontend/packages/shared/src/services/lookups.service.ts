import { Injectable, inject } from '@angular/core';
import {
  Observable,
  ReplaySubject,
  catchError,
  map,
  of,
  shareReplay,
  switchMap,
  throwError,
} from 'rxjs';
import { LookupsApiService, type LookupOption } from './lookups-api.service';

/**
 * Caching facade over {@link LookupsApiService}. The lookup
 * catalogue is read-mostly — every SPA pulls the same set of
 * intents on every page load, so memoising per session avoids
 * pointless network traffic and keeps the upload dropdown snappy
 * even on a flaky connection.
 *
 * <para>
 * Cache shape: per-intent {@link ReplaySubject} of length 1 that
 * holds the last successful response. Failures are NOT cached;
 * the next subscriber retriggers the network call so a transient
 * 500 doesn't stick around forever.
 * </para>
 */
@Injectable({ providedIn: 'root' })
export class LookupsService {
  private readonly api = inject(LookupsApiService);

  private readonly intents = new Map<string, Observable<LookupOption[]>>();

  /**
   * List active lookup values for one intent (e.g.
   * <c>DOCUMENT_CATEGORY</c>). Cached for the lifetime of the
   * Angular app — pull a fresh list with {@link refresh} if you
   * just edited the catalogue from an admin surface.
   */
  listByIntent(intent: string): Observable<LookupOption[]> {
    if (!intent) return of([]);
    const key = intent.trim().toUpperCase();
    let cached = this.intents.get(key);
    if (cached) return cached;

    cached = this.api.listByIntent(key).pipe(
      // Drop the cache entry on error so the next subscriber
      // retries instead of replaying the failure forever.
      catchError((err) => {
        this.intents.delete(key);
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.intents.set(key, cached);
    return cached;
  }

  /**
   * Resolve a single option from the cached intent list — saves a
   * round-trip and keeps the contract symmetric with the API
   * surface (which accepts `(intent, code)` lookups).
   */
  getOption(intent: string, code: string): Observable<LookupOption | null> {
    if (!intent || !code) return of(null);
    const wantedCode = code.trim().toUpperCase();
    return this.listByIntent(intent).pipe(
      map((options) => options.find((o) => o.code === wantedCode) ?? null),
      switchMap((option) =>
        // Fallback to the dedicated endpoint when the local list
        // doesn't carry the row — covers the inactive case (the
        // list endpoint hides them by default).
        option
          ? of(option)
          : this.api.getOption(intent, wantedCode),
      ),
    );
  }

  /**
   * Drop every cached intent (or just one) so the next
   * {@link listByIntent} call hits the network again. Use this
   * after an admin-side catalogue mutation lands.
   */
  refresh(intent?: string): void {
    if (intent) {
      this.intents.delete(intent.trim().toUpperCase());
    } else {
      this.intents.clear();
    }
  }
}

export type { LookupOption };
