import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipmentRouteMapComponent } from '@wayel/shared/components/shipment-route-map.component';
import { WEYELL_SA_ORIGIN, WEYELL_SZ_DESTINATION } from '@wayel/shared/pickup/shipment-route.constants';
import { environment } from '../../../environments/environment';
import {
  formatParcelReference,
  formatWeight,
  parcelStatusLabel,
  type ParcelListItem,
} from '../../models/parcel.models';
import { ParcelsService } from '../../services/parcels.service';
import { trackParcelRoute } from '../../utils/tracking-links';

type PackageTab = 'active' | 'delivered';

interface PackageCardModel {
  parcel: ParcelListItem;
  routeLabel: string;
  orderId: string;
  statusLabel: string;
  statusClass: string;
  progress: number;
  meta: string;
}

@Component({
  selector: 'app-packages-hub',
  standalone: true,
  imports: [RouterLink, ShipmentRouteMapComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hub">
      <nk-shipment-route-map
        class="hub-map"
        [apiKey]="mapsApiKey"
        [origin]="origin"
        [destination]="destination"
        [progress]="selectedProgress()"
        ariaLabel="Parcel corridor map"
      />

      <aside class="packages-panel" aria-label="Packages">
        <header class="panel-head">
          <h1>Packages</h1>
          <a routerLink="/quotes/request" class="panel-action" title="Request ship-out quote">
            <span class="material-icons-outlined">add</span>
          </a>
        </header>

        <nav class="bb-pill-tabs panel-tabs" aria-label="Package filter">
          <button type="button" [class.active]="tab() === 'active'" (click)="tab.set('active')">
            On the way
          </button>
          <button type="button" [class.active]="tab() === 'delivered'" (click)="tab.set('delivered')">
            Delivered
          </button>
        </nav>

        <div class="panel-list">
          @if (loading()) {
            <p class="panel-empty">Loading packages…</p>
          } @else if (visibleCards().length === 0) {
            <p class="panel-empty">
              @if (tab() === 'delivered') {
                No delivered packages yet.
              } @else {
                No active packages. Use your suite address when shopping in South Africa.
              }
            </p>
          } @else {
            @for (card of visibleCards(); track card.parcel.id) {
              <article
                class="package-card"
                [class.expanded]="selectedId() === card.parcel.id"
                (click)="select(card.parcel.id)"
                (keydown.enter)="select(card.parcel.id)"
                tabindex="0"
                role="button"
                [attr.aria-pressed]="selectedId() === card.parcel.id"
              >
                <div class="card-top">
                  <div>
                    <h2 class="card-route">{{ card.routeLabel }}</h2>
                    <p class="card-id">Order ID {{ card.orderId }}</p>
                  </div>
                  <span class="bb-badge" [class]="card.statusClass">{{ card.statusLabel }}</span>
                </div>

                @if (selectedId() === card.parcel.id) {
                  <div class="bb-progress bb-progress-light card-progress" aria-hidden="true">
                    <span [style.width.%]="card.progress"></span>
                  </div>
                  <dl class="card-meta">
                    <div><dt>Sender</dt><dd>{{ card.parcel.retailer || '—' }}</dd></div>
                    <div><dt>Received</dt><dd>{{ card.parcel.receivedAtUtc | date:'d MMM y, HH:mm' }}</dd></div>
                    <div><dt>Weight</dt><dd>{{ formatWeight(card.parcel.weightKg) }}</dd></div>
                    <div><dt>Item</dt><dd>{{ card.parcel.itemName }}</dd></div>
                  </dl>
                  <div class="card-actions">
                    <a [routerLink]="['/parcels', card.parcel.id]" class="card-link" (click)="$event.stopPropagation()">
                      Parcel details
                    </a>
                    @if (trackRoute(card.parcel); as route) {
                      <a [routerLink]="route" class="card-link primary" (click)="$event.stopPropagation()">
                        Full tracking
                      </a>
                    }
                  </div>
                }
              </article>
            }
          }
        </div>

        <a routerLink="/received-parcels/list" class="table-link">View parcel table →</a>
      </aside>

      @if (selectedCard(); as sel) {
        <footer class="bottom-bar">
          <div class="bar-main">
            <span class="bb-badge" [class]="sel.statusClass">{{ sel.statusLabel }}</span>
            <strong>{{ sel.orderId }}</strong>
            <span class="bar-route">{{ sel.routeLabel }}</span>
          </div>
          <div class="bar-grid">
            <div><span class="lbl">From</span><strong>{{ origin.label }}</strong></div>
            <div><span class="lbl">To</span><strong>{{ destination.label }}</strong></div>
            <div><span class="lbl">Status</span><strong>{{ sel.meta }}</strong></div>
            <div><span class="lbl">Weight</span><strong>{{ formatWeight(sel.parcel.weightKg) }}</strong></div>
          </div>
          @if (trackRoute(sel.parcel); as route) {
            <a [routerLink]="route" class="bb-btn bb-btn-primary bar-cta">Track shipment</a>
          } @else {
            <a [routerLink]="['/parcels', sel.parcel.id]" class="bb-btn bb-btn-outline bar-cta">View parcel</a>
          }
        </footer>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: calc(100vh - var(--bb-topbar-h));
      min-height: calc(100dvh - var(--bb-topbar-h));
    }

    .hub {
      position: relative;
      height: 100%;
      min-height: inherit;
      overflow: hidden;
    }

    .hub-map {
      z-index: 0;
    }

    .packages-panel {
      position: absolute;
      z-index: 2;
      top: 1rem;
      left: 1rem;
      bottom: 1rem;
      width: min(400px, calc(100% - 2rem));
      max-height: calc(100% - 2rem);
      display: flex;
      flex-direction: column;
      background: #fff;
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      overflow: hidden;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.1rem 1.15rem 0.65rem;
    }

    .panel-head h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .panel-action {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: var(--bb-muted);
      text-decoration: none;
    }
    .panel-action:hover { background: var(--bb-surface-muted); color: var(--bb-text); }

    .panel-tabs {
      margin: 0 1rem 0.75rem;
      width: auto;
    }

    .panel-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 0.85rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .panel-empty {
      margin: 1rem 0.5rem;
      font-size: 0.85rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }

    .package-card {
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      padding: 0.85rem 0.9rem;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
      background: #fff;
    }
    .package-card:hover { border-color: #cbd5e1; }
    .package-card.expanded {
      border-color: var(--bb-ink);
      box-shadow: var(--bb-shadow-card);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      gap: 0.65rem;
      align-items: flex-start;
    }

    .card-route {
      margin: 0 0 0.15rem;
      font-size: 0.92rem;
      font-weight: 700;
      line-height: 1.25;
    }

    .card-id {
      margin: 0;
      font-size: 0.72rem;
      color: var(--bb-muted);
    }

    .card-progress { margin: 0.75rem 0 0.65rem; height: 4px; }

    .card-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.45rem 0.75rem;
      margin: 0 0 0.75rem;
    }
    .card-meta dt {
      margin: 0;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--bb-muted);
    }
    .card-meta dd {
      margin: 0.1rem 0 0;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--bb-text);
    }

    .card-actions {
      display: flex;
      gap: 0.65rem;
      flex-wrap: wrap;
    }
    .card-link {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--bb-ink);
      text-decoration: underline;
      text-decoration-color: var(--bb-lime);
    }
    .card-link.primary { color: var(--bb-ink); }

    .table-link {
      display: block;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--bb-border);
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--bb-muted);
      text-decoration: none;
    }
    .table-link:hover { color: var(--bb-text); }

    .bottom-bar {
      position: absolute;
      z-index: 3;
      left: 50%;
      transform: translateX(-50%);
      bottom: 1rem;
      width: min(920px, calc(100% - 2rem));
      background: #fff;
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      padding: 0.85rem 1.15rem;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.75rem 1.25rem;
      align-items: center;
    }

    .bar-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
      min-width: 0;
    }
    .bar-main strong { font-size: 0.88rem; }
    .bar-route {
      font-size: 0.82rem;
      color: var(--bb-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bar-grid {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.65rem;
    }
    .bar-grid .lbl {
      display: block;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--bb-muted);
      margin-bottom: 0.15rem;
    }
    .bar-grid strong {
      font-size: 0.82rem;
      font-weight: 600;
      display: block;
    }

    .bar-cta {
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
      white-space: nowrap;
    }

    @media (max-width: 1023px) {
      .packages-panel {
        top: auto;
        bottom: 0;
        left: 0;
        right: 0;
        width: 100%;
        max-height: 52vh;
        border-radius: var(--bb-radius) var(--bb-radius) 0 0;
      }
      .bottom-bar {
        display: none;
      }
    }

    @media (max-width: 640px) {
      .bar-grid { grid-template-columns: repeat(2, 1fr); }
      .packages-panel { max-height: 58vh; }
    }
  `,
})
export class PackagesHubComponent implements OnInit {
  private readonly parcelsApi = inject(ParcelsService);

  readonly mapsApiKey = environment.googleMapsApiKey;
  readonly origin = WEYELL_SA_ORIGIN;
  readonly destination = WEYELL_SZ_DESTINATION;
  readonly formatWeight = formatWeight;

  readonly tab = signal<PackageTab>('active');
  readonly selectedId = signal<string | null>(null);
  readonly loading = signal(true);

  readonly allCards = computed((): PackageCardModel[] =>
    this.parcelsApi.parcels().map((p) => this.toCard(p)),
  );

  readonly visibleCards = computed(() => {
    const cards = this.allCards();
    return this.tab() === 'delivered'
      ? cards.filter((c) => this.isDelivered(c.parcel))
      : cards.filter((c) => !this.isDelivered(c.parcel));
  });

  readonly selectedCard = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.allCards().find((c) => c.parcel.id === id) ?? null;
  });

  readonly selectedProgress = computed(() => this.selectedCard()?.progress ?? 0.2);

  ngOnInit(): void {
    this.parcelsApi.loadParcels().subscribe({
      next: () => {
        this.loading.set(false);
        const first = this.visibleCards()[0];
        if (first) this.selectedId.set(first.parcel.id);
      },
      error: () => this.loading.set(false),
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  trackRoute(p: ParcelListItem): string[] | null {
    return trackParcelRoute(p);
  }

  private toCard(p: ParcelListItem): PackageCardModel {
    const status = parcelStatusLabel(p.status);
    const statusKey = p.status.toLowerCase().replace(/\s+/g, '');
    let statusLabel = 'PACKED';
    let statusClass = 'bb-badge-info';

    if (statusKey.includes('delivered')) {
      statusLabel = 'DELIVERED';
      statusClass = 'bb-badge bb-status-delivered';
    } else if (statusKey.includes('inshipment') || statusKey.includes('intransit')) {
      statusLabel = 'IN TRANSIT';
      statusClass = 'bb-badge bb-badge-success';
    } else if (statusKey.includes('ready')) {
      statusLabel = 'READY';
      statusClass = 'bb-badge bb-badge-info';
    } else {
      statusLabel = 'PACKED';
      statusClass = 'bb-badge bb-badge-info';
    }

    return {
      parcel: p,
      routeLabel: 'South Africa → Eswatini',
      orderId: p.trackingNumber ?? formatParcelReference(p.id),
      statusLabel,
      statusClass,
      progress: this.parcelProgress(p),
      meta: status,
    };
  }

  private parcelProgress(p: ParcelListItem): number {
    const s = p.status.toLowerCase().replace(/\s+/g, '');
    if (s.includes('delivered')) return 100;
    if (s.includes('inshipment') || s.includes('intransit')) return 72;
    if (s.includes('ready')) return 48;
    if (s.includes('received')) return 28;
    return 15;
  }

  private isDelivered(p: ParcelListItem): boolean {
    return p.status.toLowerCase().replace(/\s+/g, '').includes('delivered');
  }
}
