import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OpsPaginationComponent } from '../../shared/ops-pagination.component';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import {
  WarehouseApiService,
  type OpsPickTaskDto,
} from '../../services/warehouse-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { warehouseRoutes } from '../../types/warehouse.types';

type PickTab = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'PICKED' | 'BLOCKED';

@Component({
  selector: 'ops-warehouse-picking-queue',
  standalone: true,
  imports: [DatePipe, RouterLink, OpsPillComponent, OpsPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Picking queue</h1>
          <p>Consolidation pick lists by shipment. Start picking to confirm parcel locations.</p>
        </div>
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }

      <div class="tabs">
        @for (tab of tabs; track tab) {
          <button type="button" class="tab" [class.active]="statusTab() === tab" (click)="setTab(tab)">
            {{ tabLabel(tab) }}
          </button>
        }
      </div>

      <section class="ops-card">
        <div class="table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Customer</th>
                <th>Suite</th>
                <th>Parcels</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.pickTaskId) {
                <tr>
                  <td><strong>{{ row.displayId }}</strong></td>
                  <td>{{ row.customerDisplayName }}</td>
                  <td>{{ row.suiteNumber }}</td>
                  <td>{{ row.parcels.length }}</td>
                  <td><ops-pill [label]="row.priority" [tone]="row.priority === 'High' ? 'red' : 'gray'" /></td>
                  <td><ops-pill [label]="row.status" tone="blue" /></td>
                  <td>{{ row.createdAtUtc | date:'mediumDate' }}</td>
                  <td>
                    <a [routerLink]="routes.pickingTask(row.pickTaskId)" class="btn-primary-sm">
                      {{ row.status === 'PICKED' ? 'View' : 'Start picking' }}
                    </a>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty">No pick tasks in this queue.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <ops-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [totalCount]="totalCount()"
          itemLabel="tasks"
          ariaLabel="Picking queue pages"
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
    .tabs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.85rem; }
    .tab {
      border: 1px solid var(--ops-border);
      background: #fff;
      border-radius: var(--ops-radius-sm);
      padding: 0.45rem 0.85rem;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      color: var(--ops-muted);
    }
    .tab.active { background: var(--ops-primary); color: #fff; border-color: var(--ops-primary); }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .btn-primary-sm {
      display: inline-flex;
      padding: 0.35rem 0.65rem;
      border-radius: var(--ops-radius-sm);
      background: var(--ops-primary);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 600;
      text-decoration: none;
    }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class WarehousePickingQueueComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = warehouseRoutes;
  readonly tabs: PickTab[] = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PICKED', 'BLOCKED'];
  readonly items = signal<OpsPickTaskDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly statusTab = signal<PickTab>('PENDING');
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  tabLabel(tab: PickTab): string {
    return tab.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  setTab(tab: PickTab): void {
    this.statusTab.set(tab);
    this.page.set(1);
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.api.listPickingTasks(key, this.page(), this.pageSize(), this.statusTab()).subscribe({
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
      return body?.detail ?? body?.message ?? 'Could not load picking queue.';
    }
    return 'Could not load picking queue.';
  }
}
