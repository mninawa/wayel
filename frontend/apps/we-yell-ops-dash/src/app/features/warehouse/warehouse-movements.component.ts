import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OpsPaginationComponent } from '../../shared/ops-pagination.component';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import {
  WarehouseApiService,
  type OpsWarehouseMovementDto,
} from '../../services/warehouse-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { warehouseRoutes } from '../../types/warehouse.types';

@Component({
  selector: 'ops-warehouse-movements',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, OpsPillComponent, OpsPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Movement log</h1>
          <p>Parcel relocations across zones, picking, packing, and dispatch staging.</p>
        </div>
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }

      <section class="ops-card filters">
        <label>
          <span>Parcel ID</span>
          <input [(ngModel)]="parcelFilter" name="parcel" (keyup.enter)="applyFilters()" />
        </label>
        <label>
          <span>Movement type</span>
          <input [(ngModel)]="typeFilter" name="type" placeholder="Relocate" (keyup.enter)="applyFilters()" />
        </label>
        <label>
          <span>From (UTC)</span>
          <input type="datetime-local" [(ngModel)]="fromFilter" name="from" />
        </label>
        <label>
          <span>To (UTC)</span>
          <input type="datetime-local" [(ngModel)]="toFilter" name="to" />
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
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>By</th>
                <th>When</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.movementId) {
                <tr>
                  <td>
                    <a [routerLink]="routes.parcel(row.parcelId)" class="view-link">
                      {{ row.parcelDisplayId ?? row.parcelId }}
                    </a>
                  </td>
                  <td><ops-pill [label]="row.movementType" tone="blue" /></td>
                  <td>{{ row.fromLocationId ?? '—' }}</td>
                  <td>{{ row.toLocationId }}</td>
                  <td>{{ row.movedBy ?? '—' }}</td>
                  <td>{{ row.movedAtUtc | date:'MMM d, y, h:mm a' }}</td>
                  <td class="notes">{{ row.notes ?? '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">No movements recorded.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <ops-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [totalCount]="totalCount()"
          itemLabel="movements"
          ariaLabel="Movement log pages"
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
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: flex-end; margin-bottom: 0.85rem; padding: 0.85rem 1rem; }
    .filters label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--ops-muted); }
    .filters input { min-width: 10rem; padding: 0.45rem 0.6rem; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); font-size: 0.84rem; }
    .btn-primary, .btn-ghost { border-radius: var(--ops-radius-sm); font-size: 0.78rem; font-weight: 600; padding: 0.45rem 0.75rem; cursor: pointer; border: none; }
    .btn-primary { background: var(--ops-primary); color: #fff; }
    .btn-ghost { background: transparent; border: 1px solid var(--ops-border); color: var(--ops-muted); }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; vertical-align: top; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .notes { max-width: 12rem; font-size: 0.78rem; color: var(--ops-muted); }
    .view-link { color: var(--ops-primary); font-weight: 600; text-decoration: none; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class WarehouseMovementsComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = warehouseRoutes;
  readonly items = signal<OpsWarehouseMovementDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly error = signal<string | null>(null);

  parcelFilter = '';
  typeFilter = '';
  fromFilter = '';
  toFilter = '';

  ngOnInit(): void {
    this.refresh();
  }

  applyFilters(): void {
    this.page.set(1);
    this.refresh();
  }

  clearFilters(): void {
    this.parcelFilter = '';
    this.typeFilter = '';
    this.fromFilter = '';
    this.toFilter = '';
    this.page.set(1);
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.api
      .listMovements(
        key,
        this.page(),
        this.pageSize(),
        this.parcelFilter,
        this.typeFilter,
        this.fromFilter ? new Date(this.fromFilter).toISOString() : undefined,
        this.toFilter ? new Date(this.toFilter).toISOString() : undefined,
      )
      .subscribe({
        next: (r) => {
          this.items.set(r.items);
          this.totalCount.set(r.totalCount);
        },
        error: (err) => this.error.set(this.formatError(err)),
      });
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.refresh();
  }

  nextPage(): void {
    const max = Math.max(1, Math.ceil(this.totalCount() / this.pageSize()));
    if (this.page() >= max) return;
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
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? 'Could not load movements.';
    }
    return 'Could not load movements.';
  }
}
