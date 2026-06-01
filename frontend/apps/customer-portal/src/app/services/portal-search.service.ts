import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, of, tap, catchError } from 'rxjs';
import { parcelStatusLabel, type ParcelListItem } from '../models/parcel.models';
import { trackParcelRoute } from '../utils/tracking-links';
import { BorderboxApiService, type QuoteSummaryDto } from './borderbox-api.service';
import { ParcelsService } from './parcels.service';

export type PortalSearchKind = 'parcel' | 'quote' | 'track';

export interface PortalSearchHit {
  kind: PortalSearchKind;
  key: string;
  title: string;
  meta: string;
  icon: string;
  route: string[];
}

@Injectable({ providedIn: 'root' })
export class PortalSearchService {
  private readonly api = inject(BorderboxApiService);
  private readonly parcelsService = inject(ParcelsService);

  private readonly quotes = signal<QuoteSummaryDto[]>([]);
  readonly indexLoaded = signal(false);
  readonly indexLoading = signal(false);

  ensureIndex(): Observable<void> {
    if (this.indexLoaded()) {
      return of(undefined);
    }

    this.indexLoading.set(true);

    const parcels$ =
      this.parcelsService.parcels().length > 0
        ? of(this.parcelsService.parcels())
        : this.parcelsService.loadParcels();

    return forkJoin({
      parcels: parcels$,
      quotes: this.api.listQuotes(),
    }).pipe(
      tap(({ quotes }) => {
        this.quotes.set(quotes);
        this.indexLoaded.set(true);
        this.indexLoading.set(false);
      }),
      map(() => undefined),
      catchError(() => {
        this.indexLoading.set(false);
        return of(undefined);
      }),
    );
  }

  search(query: string, limit = 8): PortalSearchHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      return [];
    }

    const hits: PortalSearchHit[] = [];
    const seen = new Set<string>();

    for (const parcel of this.parcelsService.parcels()) {
      if (!parcelMatches(parcel, q)) {
        continue;
      }

      const trackRoute = trackParcelRoute(parcel);
      const trackingMatch = textIncludes(parcel.trackingNumber, q);

      if (trackRoute && trackingMatch) {
        pushHit(hits, seen, {
          kind: 'track',
          key: `track-${parcel.id}`,
          title: parcel.trackingNumber ?? parcel.itemName,
          meta: `Shipment · ${parcelStatusLabel(parcel.status)}`,
          icon: 'location_on',
          route: trackRoute,
        });
      } else {
        pushHit(hits, seen, {
          kind: 'parcel',
          key: `parcel-${parcel.id}`,
          title: parcel.itemName,
          meta: parcelMeta(parcel),
          icon: 'inventory_2',
          route: ['/parcels', parcel.id],
        });

        if (trackRoute && hits.length < limit) {
          pushHit(hits, seen, {
            kind: 'track',
            key: `track-${parcel.id}`,
            title: `Track ${parcel.trackingNumber ?? parcel.itemName}`,
            meta: parcelStatusLabel(parcel.status),
            icon: 'near_me',
            route: trackRoute,
          });
        }
      }
    }

    for (const quote of this.quotes()) {
      if (!quoteMatches(quote, q)) {
        continue;
      }

      pushHit(hits, seen, {
        kind: 'quote',
        key: `quote-${quote.id}`,
        title: quote.displayNumber,
        meta: `${quote.statusLabel} · ${quote.parcelCount} parcel${quote.parcelCount === 1 ? '' : 's'}`,
        icon: 'request_quote',
        route: ['/quotes', quote.id],
      });
    }

    return hits.slice(0, limit);
  }
}

function pushHit(
  hits: PortalSearchHit[],
  seen: Set<string>,
  hit: PortalSearchHit,
): void {
  if (seen.has(hit.key)) {
    return;
  }
  seen.add(hit.key);
  hits.push(hit);
}

function parcelMatches(parcel: ParcelListItem, q: string): boolean {
  return (
    textIncludes(parcel.trackingNumber, q)
    || textIncludes(parcel.itemName, q)
    || textIncludes(parcel.retailer, q)
    || textIncludes(parcel.category, q)
    || textIncludes(parcel.openQuoteDisplayNumber, q)
    || textIncludes(parcel.id, q)
    || textIncludes(parcelStatusLabel(parcel.status), q)
  );
}

function quoteMatches(quote: QuoteSummaryDto, q: string): boolean {
  return (
    textIncludes(quote.displayNumber, q)
    || textIncludes(quote.statusLabel, q)
    || textIncludes(quote.paymentReference, q)
    || textIncludes(quote.status, q)
  );
}

function parcelMeta(parcel: ParcelListItem): string {
  const parts = [
    parcel.trackingNumber,
    parcel.retailer,
    parcelStatusLabel(parcel.status),
  ].filter(Boolean);
  return parts.join(' · ');
}

function textIncludes(value: string | null | undefined, q: string): boolean {
  return (value ?? '').toLowerCase().includes(q);
}
