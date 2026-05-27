import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import type { PickupLocationConfig } from '../pickup/pickup-location.types';
import {
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
} from '../pickup/pickup-location.utils';
import { GoogleMapsLoaderService } from '../services/google-maps-loader.service';

/**
 * Google Maps surface for a pickup location.
 * Uses Embed API when an API key is available; falls back to a link card.
 * Optionally renders an interactive JS map when `interactive` is true.
 */
@Component({
  selector: 'nk-pickup-location-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-shell" [style.height.px]="height()">
      @if (embedUrl(); as url) {
        <iframe
          class="map-embed"
          [src]="url"
          title="Map — {{ location().name }}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allowfullscreen
        ></iframe>
      } @else if (interactive() && mapReady()) {
        <div #mapHost class="map-host" role="img" [attr.aria-label]="'Map showing ' + location().name"></div>
      } @else {
        <div class="map-fallback">
          <span class="material-icons-outlined map-pin">location_on</span>
          <p>{{ location().name }}</p>
          <a [href]="searchUrl()" target="_blank" rel="noopener noreferrer" class="map-link">
            Open in Google Maps
          </a>
        </div>
      }
    </div>
  `,
  styles: `
    .map-shell {
      position: relative;
      width: 100%;
      border-radius: inherit;
      overflow: hidden;
      background: var(--nk-pickup-map-bg, #eef0f2);
    }
    .map-embed,
    .map-host {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
    .map-fallback {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      padding: 1rem;
      text-align: center;
      color: var(--nk-muted, #6b7280);
    }
    .map-pin {
      font-size: 2rem !important;
      color: var(--nk-sky, #c3f832);
    }
    .map-fallback p {
      margin: 0;
      font-weight: 600;
      color: var(--nk-text, #292928);
    }
    .map-link {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--nk-text, #292928);
      text-decoration: underline;
      text-decoration-color: var(--nk-sky, #c3f832);
    }
  `,
})
export class PickupLocationMapComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly destroyRef = inject(DestroyRef);

  readonly location = input.required<PickupLocationConfig>();
  readonly apiKey = input<string | null | undefined>(null);
  readonly height = input(220);
  readonly interactive = input(false);

  readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');
  readonly mapReady = signal(false);

  readonly searchUrl = computed(() => googleMapsSearchUrl(this.location()));
  readonly directionsUrl = computed(() => googleMapsDirectionsUrl(this.location()));

  readonly embedUrl = computed((): SafeResourceUrl | null => {
    const key = this.apiKey();
    const url = key ? googleMapsEmbedUrl(this.location(), key) : null;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    effect(() => {
      const loc = this.location();
      const key = this.apiKey();
      const host = this.mapHost()?.nativeElement;
      if (!this.interactive() || this.embedUrl() || !host || !loc.geo || !key?.trim()) {
        this.mapReady.set(false);
        return;
      }

      let map: google.maps.Map | null = null;
      let marker: google.maps.marker.AdvancedMarkerElement | google.maps.Marker | null = null;

      this.mapsLoader
        .load(key, ['maps', 'marker'])
        .then((g) => {
          map = new g.maps.Map(host, {
            center: loc.geo!,
            zoom: 16,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });

          if (g.maps.marker?.AdvancedMarkerElement) {
            marker = new g.maps.marker.AdvancedMarkerElement({
              map,
              position: loc.geo!,
              title: loc.name,
            });
          } else {
            marker = new g.maps.Marker({
              map,
              position: loc.geo!,
              title: loc.name,
            });
          }

          this.mapReady.set(true);
        })
        .catch(() => {
          this.mapReady.set(false);
        });

      this.destroyRef.onDestroy(() => {
        if (marker && 'map' in marker) {
          marker.map = null;
        }
        map = null;
      });
    });
  }
}
