import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OpsKpiCardComponent } from '../../shared/ops-kpi-card.component';
import {
  OpsPillComponent,
  pillToneForInvoice,
  pillToneForMatch,
  pillToneForParcelStatus,
} from '../../shared/ops-pill.component';
import {
  ReceivingApiService,
  type OpsParcelQueueItemDto,
  type OpsReceivingStatsDto,
} from '../../services/receiving-api.service';
import { OpsReceivingContextService } from '../../services/ops-receiving-context.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { receivingRoutes } from '../../types/receiving.types';

@Component({
  selector: 'ops-receiving-dashboard',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, OpsKpiCardComponent, OpsPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Parcel Receiving Dashboard</h1>
          <p>Monitor intake, matching, and quote readiness across the warehouse.</p>
        </div>
        <div class="head-actions">
          <a [routerLink]="routes.newParcel" class="ops-btn ops-btn-primary">
            <span class="material-icons-outlined">add</span>
            Receive New Parcel
          </a>
        </div>
      </header>

      @if (error()) {
        <p class="err-banner" role="alert">{{ error() }}</p>
      }

      @if (stats(); as s) {
        <div class="kpi-row">
          <button type="button" class="kpi-btn" (click)="filterByReceivedToday()">
            <ops-kpi-card label="Received Today" [value]="s.receivedToday" icon="inventory" tone="teal" />
          </button>
          <button type="button" class="kpi-btn" (click)="filterByUnmatched()">
            <ops-kpi-card label="Unmatched Parcels" [value]="s.unmatchedParcels" icon="link_off" tone="orange" />
          </button>
          <button type="button" class="kpi-btn" (click)="filterByAwaitingInvoice()">
            <ops-kpi-card label="Awaiting Invoice" [value]="s.awaitingInvoice" icon="receipt_long" tone="amber" />
          </button>
          <button type="button" class="kpi-btn" (click)="filterByReadyForQuote()">
            <ops-kpi-card label="Ready for Quote" [value]="s.readyForQuote" icon="request_quote" tone="blue" />
          </button>
          <a [routerLink]="routes.exceptions" class="kpi-btn kpi-link">
            <ops-kpi-card label="Exceptions" [value]="s.exceptions" icon="warning_amber" tone="red" />
          </a>
        </div>
      }

      <section class="ops-card queue-card">
        <header class="queue-head">
          <div>
            <h2>Receiving Queue</h2>
            <span class="muted">
              @if (hasActiveFilters()) {
                {{ filteredQueue().length }} of {{ queue().length }} items
              } @else {
                {{ queue().length }} items
              }
            </span>
          </div>
          <button type="button" class="ops-btn ops-btn-ghost" (click)="refresh()" [disabled]="busy()">
            <span class="material-icons-outlined">refresh</span>
            Refresh
          </button>
        </header>

        <div class="filters">
          <label class="search-field">
            <span class="material-icons-outlined">search</span>
            <input
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              name="search"
              placeholder="Search tracking, retailer, customer, suite…"
            />
          </label>
          <select
            [ngModel]="suiteMatchFilter()"
            (ngModelChange)="suiteMatchFilter.set($event)"
            name="suiteMatch"
          >
            <option value="">All suite matches</option>
            @for (option of suiteMatchOptions; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
          <select
            [ngModel]="invoiceFilter()"
            (ngModelChange)="invoiceFilter.set($event)"
            name="invoice"
          >
            <option value="">All invoice statuses</option>
            <option value="__awaiting__">Awaiting invoice (any)</option>
            @for (option of invoiceOptions; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event)"
            name="status"
          >
            <option value="">All statuses</option>
            @for (option of statusOptions; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
          @if (hasActiveFilters()) {
            <button type="button" class="ops-btn ops-btn-ghost clear-btn" (click)="clearFilters()">
              Clear filters
            </button>
          }
        </div>

        @if (busy() && queue().length === 0) {
          <p class="muted pad">Loading queue…</p>
        } @else if (queue().length === 0) {
          <p class="muted pad">No parcels in the receiving queue yet.</p>
        } @else if (filteredQueue().length === 0) {
          <p class="muted pad">No parcels match the current filters.</p>
        } @else {
          <div class="table-wrap">
            <table class="ops-table">
              <thead>
                <tr>
                  <th>Parcel ID</th>
                  <th>Tracking Number</th>
                  <th>Retailer</th>
                  <th>Customer</th>
                  <th>Received Time</th>
                  <th>Suite Match</th>
                  <th>Invoice Status</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (row of filteredQueue(); track row.parcelId) {
                  <tr>
                    <td><strong>{{ row.displayId }}</strong></td>
                    <td class="mono">{{ row.trackingNumber || '—' }}</td>
                    <td>{{ row.retailer }}</td>
                    <td>
                      <span class="customer-name">{{ row.customerDisplayName }}</span>
                      @if (row.suiteNumber) {
                        <span class="suite-tag">Suite {{ row.suiteNumber }}</span>
                      }
                    </td>
                    <td>{{ row.receivedAtUtc | date:'MMM d, y, h:mm a' }}</td>
                    <td><ops-pill [label]="row.suiteMatchStatus" [tone]="matchTone(row.suiteMatchStatus)" /></td>
                    <td><ops-pill [label]="row.invoiceStatus" [tone]="invoiceTone(row.invoiceStatus)" /></td>
                    <td><ops-pill [label]="row.conditionStatus" tone="green" /></td>
                    <td><ops-pill [label]="row.statusLabel" [tone]="statusTone(row.status)" /></td>
                    <td>
                      <a [routerLink]="routes.parcel(row.parcelId)" class="view-link">View</a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    .page { max-width: 1280px; }
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .page-head h1 { margin: 0 0 0.35rem; font-size: 1.45rem; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.88rem; }
    .head-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.85rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .kpi-row { grid-template-columns: 1fr; } }
    .kpi-btn {
      display: block;
      width: 100%;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      text-align: left;
      border-radius: var(--ops-radius);
    }
    .kpi-btn:focus-visible {
      outline: 2px solid var(--ops-primary);
      outline-offset: 2px;
    }
    .kpi-link {
      text-decoration: none;
      color: inherit;
    }
    .queue-card { overflow: hidden; }
    .queue-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.15rem;
      border-bottom: 1px solid var(--ops-border);
    }
    .queue-head h2 { margin: 0; font-size: 1rem; }
    .muted { color: var(--ops-muted); font-size: 0.8rem; }
    .pad { padding: 1.25rem; }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--ops-border);
      align-items: center;
    }
    .search-field {
      flex: 1 1 200px;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid var(--ops-border);
      border-radius: 10px;
      padding: 0 0.65rem;
      background: #f8fafc;
    }
    .search-field .material-icons-outlined {
      font-size: 1rem;
      color: var(--ops-muted);
    }
    .search-field input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 0.55rem 0;
      font-size: 0.82rem;
      outline: none;
    }
    .filters select {
      border: 1px solid var(--ops-border);
      border-radius: 10px;
      padding: 0.55rem 0.65rem;
      font-size: 0.78rem;
      background: #f8fafc;
      color: var(--ops-text);
    }
    .clear-btn { font-size: 0.78rem; }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th {
      text-align: left;
      padding: 0.65rem 1rem;
      background: #f8fafc;
      color: var(--ops-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--ops-border);
      white-space: nowrap;
    }
    .ops-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--ops-border);
      vertical-align: middle;
    }
    .ops-table tbody tr:hover { background: #fafbfc; }
    .customer-name { display: block; font-weight: 600; }
    .suite-tag { display: block; font-size: 0.72rem; color: var(--ops-muted); margin-top: 0.15rem; }
    .mono { font-family: ui-monospace, monospace; font-size: 0.78rem; }
    .view-link {
      color: var(--ops-primary);
      font-weight: 600;
      text-decoration: none;
      font-size: 0.8rem;
    }
    .err-banner {
      color: var(--ops-danger);
      background: var(--ops-danger-soft);
      border: 1px solid var(--ops-danger-border);
      border-radius: var(--ops-radius-sm);
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      margin-bottom: 0.85rem;
    }
  `,
})
export class ReceivingDashboardComponent implements OnInit {
  private readonly api = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);
  private readonly receiving = inject(OpsReceivingContextService);

  readonly routes = receivingRoutes;

  readonly stats = signal<OpsReceivingStatsDto | null>(null);
  readonly queue = signal<OpsParcelQueueItemDto[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly searchQuery = signal('');
  readonly suiteMatchFilter = signal('');
  readonly invoiceFilter = signal('');
  readonly statusFilter = signal('');
  readonly receivedTodayOnly = signal(false);

  readonly suiteMatchOptions = ['Match', 'Partial Match', 'No Match'] as const;
  readonly invoiceOptions = ['Awaiting Invoice', 'Pending Review', 'Invoiced', 'Rejected'] as const;
  readonly statusOptions = [
    'Received',
    'Awaiting Invoice',
    'Ready for Quote',
    'In Shipment',
    'Delivered',
  ] as const;

  readonly matchTone = pillToneForMatch;
  readonly invoiceTone = pillToneForInvoice;
  readonly statusTone = pillToneForParcelStatus;

  readonly filteredQueue = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const suite = this.suiteMatchFilter();
    const invoice = this.invoiceFilter();
    const status = this.statusFilter();
    const todayOnly = this.receivedTodayOnly();

    return this.queue().filter((row) => {
      if (suite && row.suiteMatchStatus !== suite) return false;

      if (invoice === '__awaiting__') {
        if (row.invoiceStatus !== 'Awaiting Invoice' && row.invoiceStatus !== 'Pending Review') {
          return false;
        }
      } else if (invoice && row.invoiceStatus !== invoice) {
        return false;
      }

      if (status && row.statusLabel !== status) return false;

      if (todayOnly && !this.isReceivedToday(row.receivedAtUtc)) return false;

      if (!q) return true;

      const haystack = [
        row.displayId,
        row.trackingNumber,
        row.retailer,
        row.customerDisplayName,
        row.customerEmail,
        row.suiteNumber,
        row.itemName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  });

  readonly hasActiveFilters = computed(
    () =>
      !!this.searchQuery().trim() ||
      !!this.suiteMatchFilter() ||
      !!this.invoiceFilter() ||
      !!this.statusFilter() ||
      this.receivedTodayOnly(),
  );

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.getDashboard(key).subscribe({
      next: (data) => {
        this.stats.set(data.stats);
        this.queue.set(data.queue);
        this.receiving.applyStats(data.stats);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.suiteMatchFilter.set('');
    this.invoiceFilter.set('');
    this.statusFilter.set('');
    this.receivedTodayOnly.set(false);
  }

  filterByReceivedToday(): void {
    this.clearFilters();
    this.receivedTodayOnly.set(true);
  }

  filterByUnmatched(): void {
    this.clearFilters();
    this.suiteMatchFilter.set('No Match');
  }

  filterByAwaitingInvoice(): void {
    this.clearFilters();
    this.invoiceFilter.set('__awaiting__');
  }

  filterByReadyForQuote(): void {
    this.clearFilters();
    this.statusFilter.set('Ready for Quote');
  }

  private isReceivedToday(receivedAtUtc: string): boolean {
    const received = new Date(receivedAtUtc);
    const now = new Date();
    return (
      received.getFullYear() === now.getFullYear() &&
      received.getMonth() === now.getMonth() &&
      received.getDate() === now.getDate()
    );
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
    }
    return 'Could not load receiving dashboard.';
  }
}
