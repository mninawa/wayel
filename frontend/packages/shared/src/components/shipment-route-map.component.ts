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
    .map-error p { margin: 0; max-width: 240px; text-align: center; }
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

      if (!host.isConnected) {
        return;
      }

      this.loadError.set(null);

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
        this.disposeMap();
      });

      void this.mapsLoader
        .load(key, ['maps'])
        .then((g) => {
          if (cancelled || !host.isConnected || !(host instanceof HTMLElement)) {
            return;
          }

          this.mapsApi = g;
          const origin = this.origin();
          const destination = this.destination();
          const progress = this.progress();
          const current = corridorPoint(origin, destination, progress);
          const bounds = new g.maps.LatLngBounds();
          bounds.extend(origin);
          bounds.extend(destination);
          bounds.extend(current);

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
          this.mapInstance.fitBounds(bounds, 48);

          this.syncRoute(origin, destination, progress);
        })
        .catch(() => {
          if (!cancelled) {
            this.loadError.set('Could not load Google Maps.');
          }
        });
    });

    effect(() => {
      const origin = this.origin();
      const destination = this.destination();
      const progress = this.progress();
      if (!this.mapInstance || !this.mapsApi) {
        return;
      }

      this.syncRoute(origin, destination, progress);
    });
  }

  private syncRoute(origin: MapLatLng, destination: MapLatLng, progress: number): void {
    const g = this.mapsApi;
    const map = this.mapInstance;
    if (!g || !map) {
      return;
    }

    const current = corridorPoint(origin, destination, progress);
    const bounds = new g.maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    bounds.extend(current);

    if (!this.travelledLine) {
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
    } else {
      this.travelledLine.setPath([origin, current]);
    }

    if (!this.remainingLine) {
      this.remainingLine = new g.maps.Polyline({
        path: [current, destination],
        geodesic: true,
        strokeColor: '#292928',
        strokeOpacity: 1,
        strokeWeight: 3,
        map,
      });
    } else {
      this.remainingLine.setPath([current, destination]);
    }

    if (!this.originMarker) {
      this.originMarker = new g.maps.Marker({
        map,
        position: origin,
        title: origin.label ?? 'Origin',
      });
    } else {
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
      this.currentMarker.setPosition(current);
    }

    map.fitBounds(bounds, 48);
  }

  private disposeMap(): void {
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
    this.mapInstance = null;
    this.mapsApi = null;
  }
}
