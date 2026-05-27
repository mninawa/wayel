import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
  private readonly destroyRef = inject(DestroyRef);

  readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');
  readonly apiKey = input<string | null | undefined>(null);
  readonly origin = input<MapLatLng>(WEYELL_SA_ORIGIN);
  readonly destination = input<MapLatLng>(WEYELL_SZ_DESTINATION);
  /** 0–1 progress along the corridor; drives current-position marker. */
  readonly progress = input(0.35);
  readonly ariaLabel = input('Shipment route map');

  readonly loadError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const host = this.mapHost()?.nativeElement;
      const key = this.apiKey();
      const origin = this.origin();
      const destination = this.destination();
      const progress = this.progress();
      if (!host || !key?.trim()) {
        this.loadError.set(key?.trim() ? null : 'Add a Google Maps API key to see the route map.');
        return;
      }

      this.loadError.set(null);

      let map: google.maps.Map | null = null;
      let travelledLine: google.maps.Polyline | null = null;
      let remainingLine: google.maps.Polyline | null = null;
      let originMarker: google.maps.Marker | null = null;
      let destMarker: google.maps.Marker | null = null;
      let currentMarker: google.maps.Marker | null = null;

      this.mapsLoader.load(key, ['maps']).then((g) => {
        const current = corridorPoint(origin, destination, progress);
        const bounds = new g.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(destination);
        bounds.extend(current);

        map = new g.maps.Map(host, {
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
        map.fitBounds(bounds, 48);

        const fullPath = [origin, destination];
        const travelledPath = [origin, current];

        travelledLine = new g.maps.Polyline({
          path: travelledPath,
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

        remainingLine = new g.maps.Polyline({
          path: [current, destination],
          geodesic: true,
          strokeColor: '#292928',
          strokeOpacity: 1,
          strokeWeight: 3,
          map,
        });

        originMarker = new g.maps.Marker({
          map,
          position: origin,
          title: origin.label ?? 'Origin',
        });
        destMarker = new g.maps.Marker({
          map,
          position: destination,
          title: destination.label ?? 'Destination',
        });
        currentMarker = new g.maps.Marker({
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

        void travelledLine;
      }).catch(() => {
        this.loadError.set('Could not load Google Maps.');
      });

      this.destroyRef.onDestroy(() => {
        travelledLine?.setMap(null);
        remainingLine?.setMap(null);
        originMarker?.setMap(null);
        destMarker?.setMap(null);
        currentMarker?.setMap(null);
        map = null;
      });
    });
  }
}
