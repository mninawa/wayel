import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OpsPaginationComponent } from '../../shared/ops-pagination.component';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import {
  ConsolidationApiService,
  type OpsConsolidationInventoryItemDto,
} from '../../services/consolidation-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import { consolidationRoutes } from '../../types/consolidation.types';
import {
  formatStorageLocationLabel,
  suiteLocationId,
} from '../warehouse/warehouse-location.utils';

@Component({
  selector: 'ops-consolidation-inventory',
  standalone: true,
  imports: [RouterLink, FormsModule, OpsPillComponent, OpsPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Warehouse inventory</h1>
          <p>
            Parcels currently in the warehouse. Assign shelf or bin locations and monitor
            storage duration before consolidation and dispatch.
          </p>
        </div>
      </header>

      @if (error()) {
        <p class="err-banner">{{ error() }}</p>
      }
      @if (success()) {
        <p class="ok-banner">{{ success() }}</p>
      }

      <section class="ops-card filters">
        <label>
          <span>Suite</span>
          <input
            type="search"
            [ngModel]="suiteFilter()"
            (ngModelChange)="suiteFilter.set($event)"
            placeholder="Filter by suite"
            (keyup.enter)="applyFilters()"
          />
        </label>
        <label>
          <span>Location</span>
          <input
            type="search"
            [ngModel]="locationFilter()"
            (ngModelChange)="locationFilter.set($event)"
            placeholder="Filter by bin / shelf"
            (keyup.enter)="applyFilters()"
          />
        </label>
        <button type="button" class="btn-primary" (click)="applyFilters()">Apply</button>
        <button type="button" class="btn-ghost" (click)="clearFilters()">Clear</button>
      </section>

      <section class="ops-card">
        <div class="table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Parcel</th>
                <th>Customer</th>
                <th>Suite</th>
                <th>Item</th>
                <th>Status</th>
                <th>Days stored</th>
                <th>Storage slot</th>
                <th>Readiness</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.parcelId) {
                <tr [class.stale]="row.daysInWarehouse >= 14">
                  <td>
                    <strong>{{ row.displayId }}</strong>
                    @if (row.trackingNumber) {
                      <span class="sub">{{ row.trackingNumber }}</span>
                    }
                  </td>
                  <td>{{ row.customerDisplayName }}</td>
                  <td>{{ row.suiteNumber }}</td>
                  <td>
                    <span class="item">{{ row.itemName }}</span>
                    <span class="sub">{{ row.retailer }}</span>
                  </td>
                  <td><ops-pill [label]="row.status" tone="gray" /></td>
                  <td>{{ row.daysInWarehouse }}d</td>
                  <td class="loc-cell">
                    @if (canAssign()) {
                      <input
                        type="text"
                        class="loc-input"
                        [ngModel]="locationDraft(row.parcelId)"
                        (ngModelChange)="setLocationDraft(row.parcelId, $event)"
                        [placeholder]="defaultLocationPlaceholder(row)"
                      />
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="savingId() === row.parcelId"
                        (click)="saveLocation(row)"
                      >
                        Save
                      </button>
                      @if (!row.warehouseLocation && row.suiteNumber) {
                        <button
                          type="button"
                          class="btn-suite"
                          [disabled]="savingId() === row.parcelId"
                          (click)="saveSuitePostbox(row)"
                        >
                          Use suite {{ row.suiteNumber }}
                        </button>
                      }
                    } @else {
                      {{ displayLocation(row) }}
                    }
                  </td>
                  <td><ops-pill [label]="row.quoteReadiness" tone="blue" /></td>
                  <td>
                    <a [routerLink]="routes.parcel(row.parcelId)" class="view-link">View</a>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="empty">No parcels in warehouse inventory.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ops-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [totalCount]="totalCount()"
          itemLabel="parcels"
          ariaLabel="Warehouse inventory pages"
          (prev)="prevPage()"
          (next)="nextPage()"
          (pageSizeChange)="setPageSize($event)"
        />
      </section>
    </div>
  `,
  styles: `
    .page { max-width: 1280px; }
    .page-head { margin-bottom: 1rem; }
    .page-head h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.88rem; max-width: 44rem; }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      align-items: flex-end;
      margin-bottom: 0.85rem;
      padding: 0.85rem 1rem;
    }
    .filters label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--ops-muted); }
    .filters input {
      min-width: 10rem;
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      font-size: 0.84rem;
    }
    .btn-primary, .btn-ghost, .btn-save {
      border-radius: var(--ops-radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.45rem 0.75rem;
      cursor: pointer;
    }
    .btn-primary { background: var(--ops-primary); color: #fff; border: none; }
    .btn-ghost { background: transparent; border: 1px solid var(--ops-border); color: var(--ops-muted); }
    .btn-save { background: var(--ops-brand-green); color: #fff; border: none; margin-top: 0.25rem; width: 100%; }
    .btn-suite {
      background: var(--ops-primary-soft);
      color: var(--ops-primary);
      border: none;
      margin-top: 0.25rem;
      width: 100%;
      border-radius: var(--ops-radius-sm);
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.35rem 0.5rem;
      cursor: pointer;
    }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; vertical-align: top; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .ops-table tr.stale td:nth-child(6) { color: #b45309; font-weight: 700; }
    .sub { display: block; font-size: 0.72rem; color: var(--ops-muted); margin-top: 0.15rem; }
    .item { display: block; font-weight: 600; }
    .loc-cell { min-width: 8.5rem; }
    .loc-input {
      width: 100%;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      font-size: 0.78rem;
    }
    .view-link { color: var(--ops-primary); font-weight: 600; text-decoration: none; white-space: nowrap; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #166534; background: #dcfce7; padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class ConsolidationInventoryComponent implements OnInit {
  private readonly api = inject(ConsolidationApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = consolidationRoutes;
  readonly items = signal<OpsConsolidationInventoryItemDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly suiteFilter = signal('');
  readonly locationFilter = signal('');
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly savingId = signal<string | null>(null);
  private readonly locationDrafts = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.refresh();
  }

  canAssign(): boolean {
    return this.session.can(OPS_CAP.inspect);
  }

  locationDraft(parcelId: string): string {
    const drafts = this.locationDrafts();
    if (parcelId in drafts) {
      return drafts[parcelId];
    }
    const row = this.items().find((x) => x.parcelId === parcelId);
    return row?.warehouseLocation ?? '';
  }

  defaultLocationPlaceholder(row: OpsConsolidationInventoryItemDto): string {
    const suiteLoc = suiteLocationId(row.suiteNumber);
    return suiteLoc ? `Suite ${row.suiteNumber.trim()}` : 'SUITE-… or shelf bin';
  }

  displayLocation(row: OpsConsolidationInventoryItemDto): string {
    return formatStorageLocationLabel(row.warehouseLocation, row.suiteNumber) ?? '—';
  }

  saveSuitePostbox(row: OpsConsolidationInventoryItemDto): void {
    const loc = suiteLocationId(row.suiteNumber);
    if (!loc) return;
    this.setLocationDraft(row.parcelId, loc);
    this.saveLocation({ ...row, warehouseLocation: loc });
  }

  setLocationDraft(parcelId: string, value: string): void {
    this.locationDrafts.update((d) => ({ ...d, [parcelId]: value }));
  }

  applyFilters(): void {
    this.page.set(1);
    this.refresh();
  }

  clearFilters(): void {
    this.suiteFilter.set('');
    this.locationFilter.set('');
    this.page.set(1);
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.error.set(null);
    this.api
      .listInventory(
        key,
        this.page(),
        this.pageSize(),
        this.suiteFilter(),
        this.locationFilter(),
      )
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.totalCount.set(result.totalCount);
          this.locationDrafts.set({});
        },
        error: (err) => this.error.set(this.formatError(err)),
      });
  }

  saveLocation(row: OpsConsolidationInventoryItemDto): void {
    const key = this.session.opsKey();
    if (!key) return;
    const draft = this.locationDraft(row.parcelId).trim();
    const next = draft.length ? draft : null;
    this.savingId.set(row.parcelId);
    this.success.set(null);
    this.api.updateStorageLocation(row.parcelId, next, key).subscribe({
      next: (result) => {
        this.savingId.set(null);
        this.success.set(result.message);
        this.refresh();
      },
      error: (err) => {
        this.savingId.set(null);
        this.error.set(this.formatError(err));
      },
    });
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.refresh();
  }

  nextPage(): void {
    const maxPage = Math.max(1, Math.ceil(this.totalCount() / this.pageSize()));
    if (this.page() >= maxPage) return;
    this.page.update((p) => p + 1);
    this.refresh();
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.refresh();
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string; title?: string } | null;
      return body?.message ?? body?.title ?? err.message;
    }
    return 'Something went wrong.';
  }
}
