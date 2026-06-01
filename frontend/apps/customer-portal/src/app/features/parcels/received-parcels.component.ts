import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import {
  computeParcelPageMetrics,
  isReadyToQuoteParcel,
  parcelStatusLabel,
  parcelStatusPillClass,
  quoteStatusPillClass,
} from '../../models/parcel.models';
import { canTrackParcel, trackParcelRoute } from '../../utils/tracking-links';
import type { ParcelListItem } from '../../models/parcel.models';
import { ParcelsService } from '../../services/parcels.service';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { PendingInvoiceBannerComponent } from '../shared/pending-invoice-banner.component';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

@Component({
  selector: 'app-received-parcels',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent, PendingInvoiceBannerComponent, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-page-head">
      <div class="head-row">
        <div>
          <h1>Parcels</h1>
          <p>Parcels received at your WeYell suite in South Africa.</p>
        </div>
        <a routerLink="/received-parcels" class="bb-btn bb-btn-outline">Map view</a>
      </div>
    </div>

    <app-suite-expired-banner />

    <app-pending-invoice-banner />

    <section class="stats">
      @for (card of statCards(); track card.key) {
        <button type="button" class="stat bb-card" (click)="applyStatFilter(card.key)">
          <div class="stat-icon" [attr.data-color]="card.color">
            <span class="material-icons-outlined">{{ card.icon }}</span>
          </div>
          <div class="stat-body">
            <p class="stat-title">{{ card.title }}</p>
            <p class="stat-val">{{ card.value }}</p>
            <p class="stat-lbl">{{ card.hint }}</p>
          </div>
        </button>
      }
    </section>

    <div class="toolbar bb-card bb-card-pad">
      <select
        class="toolbar-select"
        [value]="statusFilter()"
        (change)="statusFilter.set($any($event.target).value)"
        aria-label="Parcel status"
      >
        <option value="all">All statuses</option>
        @for (s of statusOptions(); track s.value) {
          <option [value]="s.value">{{ s.label }}</option>
        }
      </select>
      <select
        class="toolbar-select"
        [value]="invoiceFilter()"
        (change)="invoiceFilter.set($any($event.target).value)"
        aria-label="Invoice status"
      >
        <option value="all">All invoice states</option>
        <option value="uploaded">Invoice uploaded</option>
        <option value="pending">Invoice pending</option>
      </select>
      <label class="search-wrap">
        <span class="material-icons-outlined search-icon">search</span>
        <input
          type="search"
          class="search-input"
          placeholder="Search by tracking, retailer, or item…"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
      </label>
      @if (hasActiveFilters()) {
        <button type="button" class="bb-btn bb-btn-ghost btn-clear" (click)="clearFilters()">
          <span class="material-icons-outlined">filter_alt_off</span>
          Clear filters
        </button>
      }
    </div>

    <section class="bb-card table-card">
      @if (parcelsApi.loading()) {
        <nk-pulse-loader label="Loading parcels…" />
      } @else {
        <div class="table-scroll">
          <table class="bb-table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Retailer</th>
                <th>Item</th>
                <th>Received</th>
                <th>Weight</th>
                <th>Parcel status</th>
                <th>Quote status</th>
                <th>Invoice</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (p of paginated(); track p.id) {
                <tr [class.row-needs-invoice]="p.invoiceStatus === 'Pending'">
                  <td>
                    <a [routerLink]="['/parcels', p.id]" class="track-link">{{ p.trackingNumber ?? '—' }}</a>
                  </td>
                  <td class="retailer-cell">
                    <span class="retailer" [title]="p.retailer">{{ p.retailer }}</span>
                  </td>
                  <td>
                    <strong>{{ p.itemName }}</strong>
                    <span class="cat">{{ p.category }}</span>
                  </td>
                  <td>{{ parcelsApi.displayDate(p.receivedAtUtc) }}</td>
                  <td>{{ parcelsApi.displayWeight(p.weightKg) }}</td>
                  <td>
                    <span class="bb-pill" [class]="parcelStatusPillClass(p.status)">
                      {{ parcelStatusLabel(p.status) }}
                    </span>
                  </td>
                  <td>
                    @if (p.quoteStateLabel) {
                      <span class="bb-pill" [class]="quoteStatusPillClass(p.quoteState, p.quoteStateLabel)">
                        {{ p.quoteStateLabel }}
                      </span>
                    } @else {
                      <span class="muted-sm">—</span>
                    }
                  </td>
                  <td>
                    @if (p.invoiceStatus === 'Uploaded') {
                      <span class="invoice-pill invoice-pill--done">
                        <span class="material-icons-outlined">check_circle</span>
                        Uploaded
                      </span>
                    } @else {
                      <a [routerLink]="['/parcels', p.id]" class="invoice-pill invoice-pill--action">
                        <span class="material-icons-outlined">warning</span>
                        Pending
                      </a>
                    }
                  </td>
                  <td class="actions-cell">
                    <a [routerLink]="actionLink(p)" class="action-link">{{ actionLabel(p) }}</a>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="empty">No parcels match your filters.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalFiltered() > 0) {
          <nav class="pagination" aria-label="Parcel list pages">
            <p class="pagination-meta">
              {{ rangeStart() }} to {{ rangeEnd() }} of {{ totalFiltered() }} parcels
              @if (totalFiltered() !== metrics().total) {
                <span class="pagination-filtered">(from {{ metrics().total }} total)</span>
              }
            </p>
            <div class="pagination-controls">
              <label class="page-size">
                Rows per page
                <select [value]="pageSize()" (change)="setPageSize($any($event.target).value)">
                  @for (n of pageSizeOptions; track n) {
                    <option [value]="n">{{ n }}</option>
                  }
                </select>
              </label>
              <div class="pagination-actions">
                <button
                  type="button"
                  class="bb-btn bb-btn-outline btn-sm"
                  [disabled]="!canGoPrev()"
                  (click)="prevPage()"
                  aria-label="Previous page"
                >
                  <span class="material-icons-outlined">chevron_left</span>
                </button>
                <span class="pagination-pages">{{ currentPage() }} / {{ totalPages() }}</span>
                <button
                  type="button"
                  class="bb-btn bb-btn-outline btn-sm"
                  [disabled]="!canGoNext()"
                  (click)="nextPage()"
                  aria-label="Next page"
                >
                  <span class="material-icons-outlined">chevron_right</span>
                </button>
              </div>
            </div>
          </nav>
        }
      }
    </section>
  `,
  styles: `
    .head-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }
    @media (max-width: 1100px) { .stats { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) {
      .stats { grid-template-columns: 1fr; }
      .toolbar { flex-direction: column; align-items: stretch; }
      .toolbar-select,
      .search-wrap { width: 100%; min-width: 0; }
      .pagination {
        flex-direction: column;
        align-items: stretch;
      }
      .pagination-controls {
        width: 100%;
        justify-content: space-between;
      }
    }
    .stat {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.65rem 0.85rem;
      padding: 1rem 1.1rem;
      text-align: left;
      cursor: pointer;
      border: 1px solid var(--bb-border);
      transition: border-color 0.15s, box-shadow 0.15s;
      width: 100%;
      font: inherit;
      color: inherit;
      background: #fff;
    }
    .stat:hover { border-color: var(--bb-link); box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08); }
    .stat-icon {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      grid-row: span 2;
    }
    .stat-icon[data-color='blue'] { background: var(--bb-primary-soft); color: var(--bb-ink); }
    .stat-icon[data-color='orange'] { background: var(--bb-warning-soft); color: #b45309; }
    .stat-icon[data-color='teal'] { background: #e0f2fe; color: #0284c7; }
    .stat-icon[data-color='amber'] { background: #fef3c7; color: #b45309; }
    .stat-body { min-width: 0; }
    .stat-title { margin: 0; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--bb-muted); }
    .stat-val { margin: 0.15rem 0 0; font-size: 1.45rem; font-weight: 700; line-height: 1.1; color: var(--bb-text); }
    .stat-lbl { margin: 0.2rem 0 0; font-size: 0.75rem; color: var(--bb-muted); }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
      margin-bottom: 1rem;
    }
    .toolbar-select {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      font-size: 0.82rem;
      background: #fff;
    }
    .search-wrap {
      flex: 1;
      min-width: 200px;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0 0.65rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fff;
    }
    .search-icon { color: var(--bb-muted); font-size: 20px !important; }
    .search-input {
      flex: 1;
      border: none;
      outline: none;
      padding: 0.5rem 0;
      font-size: 0.82rem;
      background: transparent;
    }
    .btn-clear { display: inline-flex; align-items: center; gap: 0.25rem; }

    .table-card { width: 100%; }
    .table-scroll { overflow-x: auto; }
    .track-link {
      color: var(--bb-link);
      font-weight: 600;
      text-decoration: none;
      font-family: ui-monospace, monospace;
      font-size: 0.78rem;
    }
    .track-link:hover { text-decoration: underline; }
    .retailer-cell { min-width: 8rem; max-width: 12rem; }
    .retailer {
      font-weight: 600;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cat { display: block; font-size: 0.72rem; color: var(--bb-muted); margin-top: 0.1rem; }
    .invoice-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.28rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-decoration: none;
      white-space: nowrap;
    }
    .invoice-pill .material-icons-outlined { font-size: 16px !important; }
    .invoice-pill--done { background: var(--bb-success-soft); color: #15803d; }
    .invoice-pill--action { background: var(--bb-warning-soft); color: #b45309; border: 1px solid #fcd34d; }
    tr.row-needs-invoice { background: #fffbeb; }
    .pill-quote-muted { background: #f1f5f9; color: #64748b; }
    .pill-quote-active { background: var(--bb-primary-soft); color: var(--bb-ink); }
    .pill-quote-transit { background: #dcfce7; color: #15803d; }
    .pill-quote-expired { background: #fee2e2; color: #b91c1c; }
    .muted-sm { font-size: 0.78rem; color: var(--bb-muted); }
    .actions-cell { white-space: nowrap; }
    .action-link { font-size: 0.8rem; font-weight: 600; color: var(--bb-link); text-decoration: none; }
    .action-link:hover { text-decoration: underline; }
    .empty { text-align: center; color: var(--bb-muted); padding: 2rem !important; }

    .pagination {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--bb-border);
      background: #fafafa;
    }
    .pagination-meta { margin: 0; font-size: 0.8rem; color: var(--bb-muted); }
    .pagination-filtered { color: var(--bb-muted); }
    .pagination-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
    .page-size {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.78rem;
      color: var(--bb-muted);
    }
    .page-size select {
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      font-size: 0.78rem;
    }
    .pagination-actions { display: flex; align-items: center; gap: 0.35rem; }
    .pagination-pages { font-size: 0.8rem; font-weight: 600; min-width: 4rem; text-align: center; }
    .btn-sm { padding: 0.35rem 0.5rem; min-width: 2rem; }
    .btn-sm .material-icons-outlined { font-size: 20px !important; }

    .bb-pill-ready { background: var(--bb-warning-soft); color: #b45309; }
    .bb-pill-received { background: var(--bb-success-soft); color: #15803d; }
    .bb-pill-transit { background: var(--bb-primary-soft); color: var(--bb-ink); }
    .bb-pill-awaiting { background: var(--bb-warning-soft); color: #b45309; }
    .bb-pill-delivered { background: #e0e7ff; color: #3730a3; }
  `,
})
export class ReceivedParcelsComponent implements OnInit {
  readonly parcelsApi = inject(ParcelsService);
  private readonly route = inject(ActivatedRoute);
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  readonly search = signal('');
  readonly statusFilter = signal('all');
  readonly invoiceFilter = signal('all');
  readonly quoteFilter = signal<'all' | 'ready'>('all');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);

  readonly parcelStatusLabel = parcelStatusLabel;
  readonly parcelStatusPillClass = parcelStatusPillClass;
  readonly quoteStatusPillClass = quoteStatusPillClass;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.parcelsApi.parcels().filter((p) => {
      if (this.statusFilter() !== 'all' && p.status !== this.statusFilter()) return false;
      if (this.invoiceFilter() === 'uploaded' && p.invoiceStatus !== 'Uploaded') return false;
      if (this.invoiceFilter() === 'pending' && p.invoiceStatus !== 'Pending') return false;
      if (this.quoteFilter() === 'ready' && !isReadyToQuoteParcel(p)) return false;
      if (!q) return true;
      return (
        p.retailer.toLowerCase().includes(q) ||
        p.itemName.toLowerCase().includes(q) ||
        (p.trackingNumber?.toLowerCase().includes(q) ?? false)
      );
    });
  });

  readonly metrics = computed(() => computeParcelPageMetrics(this.parcelsApi.parcels()));

  readonly statCards = computed(() => {
    const m = this.metrics();
    return [
      { key: 'all' as const, title: 'Total parcels', value: m.total, hint: 'All time', icon: 'inventory_2', color: 'blue' },
      { key: 'ready' as const, title: 'Ready to quote', value: m.readyToQuote, hint: 'Awaiting your quote', icon: 'request_quote', color: 'orange' },
      { key: 'shipment' as const, title: 'In shipment', value: m.inShipment, hint: 'On the way', icon: 'local_shipping', color: 'teal' },
      { key: 'invoice' as const, title: 'Invoices pending', value: m.invoicesPending, hint: 'Not yet invoiced', icon: 'upload_file', color: 'amber' },
    ];
  });

  readonly totalFiltered = computed(() => this.filtered().length);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalFiltered() / this.pageSize())),
  );

  readonly safePageIndex = computed(() =>
    Math.min(this.pageIndex(), Math.max(0, this.totalPages() - 1)),
  );

  readonly paginated = computed(() => {
    const start = this.safePageIndex() * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  readonly currentPage = computed(() => this.safePageIndex() + 1);

  readonly rangeStart = computed(() =>
    this.totalFiltered() === 0 ? 0 : this.safePageIndex() * this.pageSize() + 1,
  );

  readonly rangeEnd = computed(() =>
    Math.min(this.totalFiltered(), (this.safePageIndex() + 1) * this.pageSize()),
  );

  readonly canGoPrev = computed(() => this.safePageIndex() > 0);
  readonly canGoNext = computed(() => this.safePageIndex() < this.totalPages() - 1);

  readonly statusOptions = computed(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const p of this.parcelsApi.parcels()) {
      if (seen.has(p.status)) continue;
      seen.add(p.status);
      options.push({ value: p.status, label: parcelStatusLabel(p.status) });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly hasActiveFilters = computed(
    () =>
      this.statusFilter() !== 'all'
      || this.invoiceFilter() !== 'all'
      || this.quoteFilter() !== 'all'
      || this.search().trim().length > 0,
  );

  constructor() {
    effect(() => {
      this.search();
      this.statusFilter();
      this.invoiceFilter();
      this.quoteFilter();
      this.pageSize();
      this.pageIndex.set(0);
    });

    effect(() => {
      const maxIndex = Math.max(0, this.totalPages() - 1);
      if (this.pageIndex() > maxIndex) {
        this.pageIndex.set(maxIndex);
      }
    });
  }

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('invoice') === 'pending') {
      this.filterInvoicesPending();
    }
    const initialQuery = this.route.snapshot.queryParamMap.get('q');
    if (initialQuery) {
      this.search.set(initialQuery);
    }
    this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q') ?? '';
      if (q !== this.search()) {
        this.search.set(q);
      }
    });
    this.refresh();
  }

  refresh(): void {
    this.parcelsApi.refreshParcelsPage().subscribe();
  }

  setPageSize(raw: string): void {
    const n = Number(raw);
    if (PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number])) {
      this.pageSize.set(n);
    }
  }

  applyStatFilter(key: 'all' | 'ready' | 'shipment' | 'invoice'): void {
    this.search.set('');
    this.quoteFilter.set('all');
    switch (key) {
      case 'all':
        this.statusFilter.set('all');
        this.invoiceFilter.set('all');
        break;
      case 'ready':
        this.statusFilter.set('all');
        this.invoiceFilter.set('all');
        this.quoteFilter.set('ready');
        break;
      case 'shipment':
        this.statusFilter.set('InShipment');
        this.invoiceFilter.set('all');
        break;
      case 'invoice':
        this.statusFilter.set('all');
        this.invoiceFilter.set('pending');
        break;
    }
  }

  filterInvoicesPending(): void {
    this.applyStatFilter('invoice');
  }

  clearFilters(): void {
    this.applyStatFilter('all');
  }

  prevPage(): void {
    if (this.canGoPrev()) this.pageIndex.update((i) => i - 1);
  }

  nextPage(): void {
    if (this.canGoNext()) this.pageIndex.update((i) => i + 1);
  }

  actionLabel(p: ParcelListItem): string {
    if (p.invoiceStatus === 'Pending') return 'Upload invoice';
    if (isReadyToQuoteParcel(p)) return 'Request quote';
    if (canTrackParcel(p)) return 'Track shipment';
    return 'View details';
  }

  actionLink(p: ParcelListItem): string | string[] {
    if (p.invoiceStatus === 'Pending') return ['/parcels', p.id];
    if (isReadyToQuoteParcel(p)) return '/quotes/request';
    const track = trackParcelRoute(p);
    if (track) return track;
    return ['/parcels', p.id];
  }
}
