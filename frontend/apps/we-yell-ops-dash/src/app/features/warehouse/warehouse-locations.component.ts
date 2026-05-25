import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpsPaginationComponent } from '../../shared/ops-pagination.component';
import { OpsPillComponent, type OpsPillTone } from '../../shared/ops-pill.component';
import {
  WarehouseApiService,
  type OpsWarehouseLocationDto,
} from '../../services/warehouse-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';

@Component({
  selector: 'ops-warehouse-locations',
  standalone: true,
  imports: [FormsModule, DatePipe, OpsPillComponent, OpsPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Warehouse locations</h1>
          <p>Zones, aisles, shelves, and bins. Monitor occupancy before assigning storage.</p>
        </div>
        @if (canWrite()) {
          <button type="button" class="btn-primary" (click)="showCreate.set(!showCreate())">
            {{ showCreate() ? 'Cancel' : 'New location' }}
          </button>
        }
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      @if (success()) { <p class="ok-banner">{{ success() }}</p> }

      @if (showCreate() && canWrite()) {
        <section class="ops-card ops-card-pad create-form">
          <h2 class="ops-card-title">Create location</h2>
          <div class="form-grid">
            <label><span>Zone</span><input [(ngModel)]="create.zone" name="zone" /></label>
            <label><span>Aisle</span><input [(ngModel)]="create.aisle" name="aisle" /></label>
            <label><span>Shelf</span><input [(ngModel)]="create.shelf" name="shelf" /></label>
            <label><span>Bin</span><input [(ngModel)]="create.bin" name="bin" /></label>
            <label><span>Capacity</span><input type="number" [(ngModel)]="create.capacity" name="cap" min="1" /></label>
            <label><span>Storage type</span><input [(ngModel)]="create.storageType" name="stype" /></label>
            <label><span>Status</span><input [(ngModel)]="create.status" name="status" placeholder="ACTIVE" /></label>
          </div>
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="submitCreate()">Save location</button>
        </section>
      }

      <section class="ops-card filters">
        <label>
          <span>Zone</span>
          <input [(ngModel)]="zoneFilter" name="zf" placeholder="e.g. A" (keyup.enter)="applyFilters()" />
        </label>
        <label>
          <span>Status</span>
          <input [(ngModel)]="statusFilter" name="sf" placeholder="ACTIVE" (keyup.enter)="applyFilters()" />
        </label>
        <label>
          <span>Search</span>
          <input [(ngModel)]="searchFilter" name="search" placeholder="Location id" (keyup.enter)="applyFilters()" />
        </label>
        <button type="button" class="btn-primary" (click)="applyFilters()">Apply</button>
        <button type="button" class="btn-ghost" (click)="clearFilters()">Clear</button>
      </section>

      <section class="ops-card">
        <div class="table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Zone</th>
                <th>Aisle / Shelf / Bin</th>
                <th>Type</th>
                <th>Occupancy</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.locationId) {
                <tr>
                  <td><strong>{{ row.locationId }}</strong></td>
                  <td>{{ row.zone }}</td>
                  <td>{{ row.aisle }} / {{ row.shelf }} / {{ row.bin }}</td>
                  <td>{{ row.storageType }}</td>
                  <td>{{ row.occupancy }} / {{ row.capacity }}</td>
                  <td><ops-pill [label]="row.status" [tone]="statusTone(row.status)" /></td>
                  <td>{{ row.updatedAtUtc | date:'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">No locations found.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <ops-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [totalCount]="totalCount()"
          itemLabel="locations"
          ariaLabel="Location pages"
          (prev)="prevPage()"
          (next)="nextPage()"
          (pageSizeChange)="setPageSize($event)"
        />
      </section>
    </div>
  `,
  styles: `
    .page { max-width: 1280px; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .page-head h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.88rem; max-width: 44rem; }
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: flex-end; margin-bottom: 0.85rem; padding: 0.85rem 1rem; }
    .filters label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--ops-muted); }
    .filters input { min-width: 9rem; padding: 0.45rem 0.6rem; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); font-size: 0.84rem; }
    .create-form { margin-bottom: 0.85rem; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.75rem; margin-bottom: 0.85rem; }
    .form-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--ops-muted); }
    .form-grid input { padding: 0.45rem 0.6rem; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); }
    .btn-primary, .btn-ghost { border-radius: var(--ops-radius-sm); font-size: 0.78rem; font-weight: 600; padding: 0.45rem 0.75rem; cursor: pointer; border: none; }
    .btn-primary { background: var(--ops-primary); color: #fff; }
    .btn-ghost { background: transparent; border: 1px solid var(--ops-border); color: var(--ops-muted); }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #166534; background: #dcfce7; padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class WarehouseLocationsComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);

  readonly items = signal<OpsWarehouseLocationDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly busy = signal(false);
  readonly showCreate = signal(false);

  zoneFilter = '';
  statusFilter = '';
  searchFilter = '';
  create = {
    zone: '',
    aisle: '',
    shelf: '',
    bin: '',
    capacity: 1,
    storageType: 'Standard',
    status: 'ACTIVE',
  };

  ngOnInit(): void {
    this.refresh();
  }

  canWrite(): boolean {
    return this.session.can(OPS_CAP.warehouseWrite);
  }

  statusTone(status: string): OpsPillTone {
    const s = status.toUpperCase();
    if (s === 'ACTIVE') return 'green';
    if (s === 'FULL') return 'orange';
    if (s === 'DISABLED') return 'red';
    return 'gray';
  }

  applyFilters(): void {
    this.page.set(1);
    this.refresh();
  }

  clearFilters(): void {
    this.zoneFilter = '';
    this.statusFilter = '';
    this.searchFilter = '';
    this.page.set(1);
    this.refresh();
  }

  submitCreate(): void {
    const key = this.session.opsKey();
    if (!key || !this.canWrite()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createLocation(
        {
          zone: this.create.zone.trim(),
          aisle: this.create.aisle.trim(),
          shelf: this.create.shelf.trim(),
          bin: this.create.bin.trim(),
          capacity: this.create.capacity,
          storageType: this.create.storageType.trim() || 'Standard',
          status: this.create.status.trim() || 'ACTIVE',
        },
        key,
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.success.set('Location created.');
          this.showCreate.set(false);
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(this.formatError(err));
        },
      });
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.error.set(null);
    this.api
      .listLocations(key, this.page(), this.pageSize(), this.zoneFilter, this.statusFilter, this.searchFilter)
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
      if (err.status === 401) {
        return 'Your warehouse session expired. Sign in again to continue.';
      }
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? err.message;
    }
    return 'Something went wrong.';
  }
}
