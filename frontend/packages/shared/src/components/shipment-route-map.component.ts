import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { MapLatLng } from '../pickup/shipment-route.constants';
import {
  WEYELL_SA_ORIGIN,
  WEYELL_SZ_DESTINATION,
  corridorPoint,
} from '../pickup/shipment-route.constants';
import { GoogleMapsLoaderService } from '../services/google-maps-loader.service';

const REFERRER_HELP =
  'Add https://www.weyell.co.za/* and https://weyell.co.za/* to your Google Maps API key HTTP referrers.';

/**
 * Full-bleed Google Maps route view (GlobeTrans-style).
 * Draws origin → destination with travelled (dashed) and remaining (solid) segments.
 */
@Component({
  selector: 'nk-shipment-route-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="route-map" role="img" [attr.aria-label]="ariaLabel()">
      <div #mapHost class="map-host"></div>
      @if (loadError()) {
        <div class="map-error">
          <span class="material-icons-outlined">map</span>
          <p>{{ loadError() }}</p>
        </div>
      }
    </div>
  `,
  styles: `
    .route-map {
      position: absolute;
      inset: 0;
      background: var(--nk-pickup-map-bg, #eef0f2);
    }
    .map-host {
      width: 100%;
      height: 100%;
    }
    .map-error {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--nk-muted, #6b7280);
      font-size: 0.85rem;
      background: rgba(248, 248, 248, 0.92);
    }
    .map-error .material-icons-outlined {
      font-size: 2rem !important;
      color: var(--nk-text, #292928);
    }
    .map-error p { margin: 0; max-width: 280px; text-align: center; line-height: 1.45; }
  `,
})
export class ShipmentRouteMapComponent {
  private readonly mapsLoader = inject(GoogleMapsLoaderService);

  private mapsApi: typeof google | null = null;
  private mapInstance: google.maps.Map | null = null;
  private travelledLine: google.maps.Polyline | null = null;
  private remainingLine: google.maps.Polyline | null = null;
  private originMarker: google.maps.Marker | null = null;
  private destMarker: google.maps.Marker | null = null;
  private currentMarker: google.maps.Marker | null = null;
  private routeReady = false;
  private initGeneration = 0;

  readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');
  readonly apiKey = input<string | null | undefined>(null);
  readonly origin = input<MapLatLng>(WEYELL_SA_ORIGIN);
  readonly destination = input<MapLatLng>(WEYELL_SZ_DESTINATION);
  /** 0–1 progress along the corridor; drives current-position marker. */
  readonly progress = input(0.35);
  readonly ariaLabel = input('Shipment route map');

  readonly loadError = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const host = this.mapHost()?.nativeElement;
      const key = this.apiKey();
      if (!host || !key?.trim()) {
        this.loadError.set(key?.trim() ? null : 'Add a Google Maps API key to see the route map.');
        return;
      }

      if (!host.isConnected || !(host instanceof HTMLElement)) {
        return;
      }

      this.loadError.set(null);
      const generation = ++this.initGeneration;

      let cancelled = false;
      let restoreAuthFailure: (() => void) | undefined;

      onCleanup(() => {
        cancelled = true;
        restoreAuthFailure?.();
        this.disposeMap();
      });

      restoreAuthFailure = this.installAuthFailureHandler(() => {
        if (cancelled || generation !== this.initGeneration) {
          return;
        }
        this.loadError.set(`Google Maps blocked this site. ${REFERRER_HELP}`);
        this.disposeMap();
      });

      void this.mapsLoader
        .load(key, ['maps'])
        .then((g) => {
          if (cancelled || generation !== this.initGeneration) {
            return;
          }
          if (!host.isConnected || !(host instanceof HTMLElement)) {
            return;
          }

          try {
            this.resetMapHost(host);
            this.mapsApi = g;

            const origin = this.origin();
            const destination = this.destination();
            const progress = this.progress();
            const current = corridorPoint(origin, destination, progress);

            this.mapInstance = new g.maps.Map(host, {
              center: current,
              zoom: 6,
              disableDefaultUI: true,
              zoomControl: true,
              fullscreenControl: true,
              mapTypeControl: false,
              streetViewControl: false,
              styles: [
                { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e9e9e9' }] },
              ],
            });

            g.maps.event.addListenerOnce(this.mapInstance, 'idle', () => {
              if (cancelled || generation !== this.initGeneration || !this.mapInstance) {
                return;
              }
              this.routeReady = true;
              this.syncRoute(origin, destination, progress);
            });
          } catch {
            this.loadError.set(`Could not initialize Google Maps. ${REFERRER_HELP}`);
            this.disposeMap();
          }
        })
        .catch(() => {
          if (!cancelled && generation === this.initGeneration) {
            this.loadError.set('Could not load Google Maps.');
          }
        });
    });

    effect(() => {
      const origin = this.origin();
      const destination = this.destination();
      const progress = this.progress();
      if (!this.routeReady || !this.mapInstance || !this.mapsApi) {
        return;
      }

      this.syncRoute(origin, destination, progress);
    });
  }

  private installAuthFailureHandler(onFailure: () => void): () => void {
    if (typeof window === 'undefined') {
      return () => undefined;
    }

    const w = window as Window & { gm_authFailure?: () => void };
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => {
      previous?.();
      onFailure();
    };

    return () => {
      w.gm_authFailure = previous;
    };
  }

  private resetMapHost(host: HTMLElement): void {
    host.replaceChildren();
  }

  private syncRoute(origin: MapLatLng, destination: MapLatLng, progress: number): void {
    const g = this.mapsApi;
    const map = this.mapInstance;
    if (!g || !map || !this.routeReady) {
      return;
    }

    try {
      const current = corridorPoint(origin, destination, progress);
      const bounds = new g.maps.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      bounds.extend(current);

      this.travelledLine?.setMap(null);
      this.travelledLine = new g.maps.Polyline({
        path: [origin, current],
        geodesic: true,
        strokeColor: '#292928',
        strokeOpacity: 0,
        strokeWeight: 3,
        icons: [
          {
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3, strokeColor: '#292928' },
            offset: '0',
            repeat: '12px',
          },
        ],
        map,
      });

      this.remainingLine?.setMap(null);
      this.remainingLine = new g.maps.Polyline({
        path: [current, destination],
        geodesic: true,
        strokeColor: '#292928',
        strokeOpacity: 1,
        strokeWeight: 3,
        map,
      });

      if (!this.originMarker) {
        this.originMarker = new g.maps.Marker({
          map,
          position: origin,
          title: origin.label ?? 'Origin',
        });
      } else {
        this.originMarker.setMap(map);
        this.originMarker.setPosition(origin);
        this.originMarker.setTitle(origin.label ?? 'Origin');
      }

      if (!this.destMarker) {
        this.destMarker = new g.maps.Marker({
          map,
          position: destination,
          title: destination.label ?? 'Destination',
        });
      } else {
        this.destMarker.setMap(map);
        this.destMarker.setPosition(destination);
        this.destMarker.setTitle(destination.label ?? 'Destination');
      }

      if (!this.currentMarker) {
        this.currentMarker = new g.maps.Marker({
          map,
          position: current,
          title: 'Current location',
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#292928',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
      } else {
        this.currentMarker.setMap(map);
        this.currentMarker.setPosition(current);
      }

      map.fitBounds(bounds, 48);
    } catch {
      this.loadError.set('Could not draw the route on the map.');
      this.disposeMap();
    }
  }

  private disposeMap(): void {
    this.routeReady = false;
    this.travelledLine?.setMap(null);
    this.remainingLine?.setMap(null);
    this.originMarker?.setMap(null);
    this.destMarker?.setMap(null);
    this.currentMarker?.setMap(null);
    this.travelledLine = null;
    this.remainingLine = null;
    this.originMarker = null;
    this.destMarker = null;
    this.currentMarker = null;
    if (this.mapInstance && this.mapsApi) {
      this.mapsApi.maps.event.clearInstanceListeners(this.mapInstance);
    }
    this.mapInstance = null;
    this.mapsApi = null;
  }
}
