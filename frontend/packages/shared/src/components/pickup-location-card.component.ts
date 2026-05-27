import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PickupLocationConfig } from '../pickup/pickup-location.types';
import {
  formatPickupAddress,
  formatPickupPhoneDisplay,
  googleMapsDirectionsUrl,
  googleMapsSearchUrl,
} from '../pickup/pickup-location.utils';
import { PickupLocationMapComponent } from './pickup-location-map.component';

/**
 * Displays a pickup location with Google Maps, formatted address, and contact actions.
 * Region-agnostic — pass any {@link PickupLocationConfig}.
 */
@Component({
  selector: 'nk-pickup-location-card',
  standalone: true,
  imports: [PickupLocationMapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="pickup-card" [class.compact]="compact()" [class.selected]="selected()">
      @if (showMap()) {
        <div class="map-wrap">
          <nk-pickup-location-map
            [location]="location()"
            [apiKey]="apiKey()"
            [height]="mapHeight()"
            [interactive]="interactiveMap()"
          />
        </div>
      }

      <div class="body">
        <header class="head">
          <div>
            @if (regionLabel()) {
              <span class="region">{{ regionLabel() }}</span>
            }
            <h3 class="name">{{ location().name }}</h3>
          </div>
          @if (selectable()) {
            <button
              type="button"
              class="select-btn"
              [class.active]="selected()"
              (click)="selectedChange.emit(location().id)"
            >
              {{ selected() ? 'Selected' : 'Select' }}
            </button>
          }
        </header>

        <address class="addr">
          <p>{{ location().line1 }}</p>
          @if (location().line2) {
            <p>{{ location().line2 }}</p>
          }
          <p>{{ location().city }}, {{ location().region }}@if (location().postalCode) { {{ ' ' + location().postalCode }}}</p>
          @if (location().poBox) {
            <p>{{ location().poBox }}</p>
          }
          <p>{{ location().country }}</p>
        </address>

        @if (phoneDisplay()) {
          <p class="phone">
            <span class="material-icons-outlined">call</span>
            <a [href]="phoneHref()">{{ phoneDisplay() }}</a>
          </p>
        }

        @if (location().description && !compact()) {
          <p class="desc">{{ location().description }}</p>
        }

        <div class="actions">
          <a
            [href]="directionsUrl()"
            target="_blank"
            rel="noopener noreferrer"
            class="action primary"
          >
            <span class="material-icons-outlined">directions</span>
            Directions
          </a>
          <a
            [href]="searchUrl()"
            target="_blank"
            rel="noopener noreferrer"
            class="action"
          >
            <span class="material-icons-outlined">map</span>
            Google Maps
          </a>
        </div>
      </div>
    </article>
  `,
  styles: `
    .pickup-card {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--nk-border, #e8eaed);
      border-radius: var(--nk-pickup-radius, 16px);
      background: var(--nk-surface, #fff);
      overflow: hidden;
      box-shadow: var(--nk-pickup-shadow, 0 2px 8px rgba(41, 41, 40, 0.04));
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .pickup-card.selected {
      border-color: var(--nk-sky, #c3f832);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--nk-sky, #c3f832) 35%, transparent);
    }
    .map-wrap {
      border-radius: var(--nk-pickup-radius, 16px) var(--nk-pickup-radius, 16px) 0 0;
      overflow: hidden;
    }
    .body {
      padding: 1rem 1.1rem 1.1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .compact .body { padding: 0.85rem; gap: 0.5rem; }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .region {
      display: block;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--nk-muted, #6b7280);
      margin-bottom: 0.15rem;
    }
    .name {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: var(--nk-text, #292928);
      letter-spacing: -0.02em;
    }
    .select-btn {
      flex-shrink: 0;
      padding: 0.4rem 0.75rem;
      border-radius: 999px;
      border: 1px solid var(--nk-border, #e8eaed);
      background: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--nk-text, #292928);
      cursor: pointer;
    }
    .select-btn.active {
      background: var(--nk-sky, #c3f832);
      border-color: var(--nk-sky, #c3f832);
      color: var(--nk-text, #292928);
    }
    .addr {
      font-style: normal;
      font-size: 0.82rem;
      line-height: 1.45;
      color: var(--nk-muted, #6b7280);
    }
    .addr p { margin: 0 0 0.15rem; }
    .phone {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      font-size: 0.82rem;
      font-weight: 600;
    }
    .phone a {
      color: var(--nk-text, #292928);
      text-decoration: none;
    }
    .phone a:hover { text-decoration: underline; }
    .phone .material-icons-outlined { font-size: 16px !important; color: var(--nk-muted, #6b7280); }
    .desc {
      margin: 0;
      font-size: 0.78rem;
      color: var(--nk-muted, #6b7280);
      line-height: 1.45;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.15rem;
    }
    .action {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      border: 1px solid var(--nk-border, #e8eaed);
      background: #fff;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--nk-text, #292928);
      text-decoration: none;
    }
    .action.primary {
      background: var(--nk-sky, #c3f832);
      border-color: var(--nk-sky, #c3f832);
    }
    .action .material-icons-outlined { font-size: 16px !important; }
  `,
})
export class PickupLocationCardComponent {
  readonly location = input.required<PickupLocationConfig>();
  readonly apiKey = input<string | null | undefined>(null);
  readonly regionLabel = input<string | null>(null);
  readonly compact = input(false);
  readonly showMap = input(true);
  readonly mapHeight = input(200);
  readonly interactiveMap = input(false);
  readonly selectable = input(false);
  readonly selected = input(false);

  readonly selectedChange = output<string>();

  readonly phoneDisplay = computed(() =>
    formatPickupPhoneDisplay(this.location().phone, this.location().phoneAlt),
  );

  readonly phoneHref = computed(() => {
    const phone = this.location().phone?.replace(/\s+/g, '') ?? '';
    return phone ? `tel:${phone}` : '#';
  });

  readonly searchUrl = computed(() => googleMapsSearchUrl(this.location()));
  readonly directionsUrl = computed(() => googleMapsDirectionsUrl(this.location()));
  readonly formattedAddress = computed(() => formatPickupAddress(this.location()));
}
