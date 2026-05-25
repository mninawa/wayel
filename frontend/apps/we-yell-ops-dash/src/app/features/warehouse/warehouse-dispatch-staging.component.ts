import { DatePipe, DecimalPipe } from '@angular/common';
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
  WarehouseApiService,
  type OpsDispatchStagingItemDto,
} from '../../services/warehouse-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import { warehouseRoutes } from '../../types/warehouse.types';

type StagingTab = 'READY_FOR_DISPATCH' | 'AWAITING_COURIER' | 'IN_MANIFEST' | 'DISPATCHED';

@Component({
  selector: 'ops-warehouse-dispatch-staging',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    RouterLink,
    OpsPillComponent,
    OpsPaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Dispatch staging</h1>
          <p>Packed shipments ready for courier handover. Batch dispatch or add to a manifest.</p>
        </div>
        <a [routerLink]="routes.manifests" class="btn-ghost">View manifests</a>
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      @if (success()) { <p class="ok-banner">{{ success() }}</p> }

      <div class="tabs">
        @for (tab of tabs; track tab) {
          <button type="button" class="tab" [class.active]="statusTab() === tab" (click)="setTab(tab)">
            {{ tabLabel(tab) }}
          </button>
        }
      </div>

      @if (canDispatch() && statusTab() === 'READY_FOR_DISPATCH') {
        <section class="ops-card batch-bar">
          <label>
            <span>Courier</span>
            <input type="text" [(ngModel)]="manifestCourier" name="courier" placeholder="PUDO" />
          </label>
          <label>
            <span>Dispatch date</span>
            <input type="date" [(ngModel)]="manifestDate" name="date" />
          </label>
          <label>
            <span>Pickup window</span>
            <input type="text" [(ngModel)]="manifestWindow" name="window" placeholder="14:00–16:00" />
          </label>
          <button
            type="button"
            class="btn-primary"
            [disabled]="selected().size === 0 || busy()"
            (click)="createManifest()"
          >
            Create manifest ({{ selected().size }})
          </button>
        </section>
      }

      <section class="ops-card">
        <div class="table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                @if (canDispatch() && statusTab() === 'READY_FOR_DISPATCH') {
                  <th class="chk"></th>
                }
                <th>Shipment</th>
                <th>Customer</th>
                <th>Suite</th>
                <th>Parcels</th>
                <th>Weight</th>
                <th>Delivery</th>
                <th>Status</th>
                <th>Ready</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.shipmentId) {
                <tr>
                  @if (canDispatch() && statusTab() === 'READY_FOR_DISPATCH') {
                    <td class="chk">
                      <input
                        type="checkbox"
                        [checked]="selected().has(row.shipmentId)"
                        (change)="toggleSelect(row.shipmentId)"
                      />
                    </td>
                  }
                  <td><strong>{{ row.shipmentDisplayId }}</strong></td>
                  <td>{{ row.customerDisplayName }}</td>
                  <td>{{ row.suiteNumber }}</td>
                  <td>{{ row.parcelCount }}</td>
                  <td>{{ row.totalWeightKg | number:'1.1-1' }} kg</td>
                  <td>{{ row.deliveryMethod }}</td>
                  <td><ops-pill [label]="row.dispatchStagingStatus" tone="green" /></td>
                  <td>{{ row.readyAtUtc ? (row.readyAtUtc | date:'mediumDate') : '—' }}</td>
                  <td class="actions">
                    @if (canDispatch() && row.dispatchStagingStatus === 'READY_FOR_DISPATCH') {
                      <button
                        type="button"
                        class="btn-pack"
                        [disabled]="busy()"
                        (click)="dispatchOne(row)"
                      >
                        Dispatch
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="canDispatch() && statusTab() === 'READY_FOR_DISPATCH' ? 10 : 9" class="empty">
                    No shipments in this staging queue.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ops-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [totalCount]="totalCount()"
          itemLabel="shipments"
          ariaLabel="Dispatch staging pages"
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
    .batch-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      align-items: flex-end;
      margin-bottom: 0.85rem;
      padding: 0.85rem 1rem;
    }
    .batch-bar label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--ops-muted); }
    .batch-bar input {
      min-width: 10rem;
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
    }
    .btn-primary, .btn-pack, .btn-ghost {
      border-radius: var(--ops-radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.45rem 0.75rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    .btn-primary { background: var(--ops-primary); color: #fff; border: none; }
    .btn-pack { background: var(--ops-primary); color: #fff; border: none; white-space: nowrap; }
    .btn-ghost { background: #fff; border: 1px solid var(--ops-border); color: var(--ops-muted); }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; vertical-align: top; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .chk { width: 2rem; }
    .actions { white-space: nowrap; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #166534; background: #dcfce7; padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class WarehouseDispatchStagingComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = warehouseRoutes;
  readonly tabs: StagingTab[] = [
    'READY_FOR_DISPATCH',
    'AWAITING_COURIER',
    'IN_MANIFEST',
    'DISPATCHED',
  ];
  readonly items = signal<OpsDispatchStagingItemDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly statusTab = signal<StagingTab>('READY_FOR_DISPATCH');
  readonly selected = signal(new Set<string>());
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly busy = signal(false);

  manifestCourier = 'PUDO';
  manifestDate = new Date().toISOString().slice(0, 10);
  manifestWindow = '';

  ngOnInit(): void {
    this.refresh();
  }

  canDispatch(): boolean {
    return this.session.can(OPS_CAP.dispatchWrite);
  }

  tabLabel(tab: StagingTab): string {
    return tab.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  setTab(tab: StagingTab): void {
    this.statusTab.set(tab);
    this.page.set(1);
    this.selected.set(new Set());
    this.refresh();
  }

  toggleSelect(shipmentId: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.error.set(null);
    this.api.listDispatchStaging(key, this.page(), this.pageSize(), this.statusTab()).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.totalCount.set(r.totalCount);
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  createManifest(): void {
    const key = this.session.opsKey();
    const ids = [...this.selected()];
    if (!key || ids.length === 0 || !this.canDispatch()) return;
    this.busy.set(true);
    this.success.set(null);
    this.api
      .createManifest(
        {
          courier: this.manifestCourier.trim() || 'PUDO',
          dispatchDate: this.manifestDate,
          pickupWindow: this.manifestWindow.trim() || null,
          shipmentIds: ids,
        },
        key,
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.success.set('Manifest created.');
          this.selected.set(new Set());
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(this.formatError(err));
        },
      });
  }

  dispatchOne(row: OpsDispatchStagingItemDto): void {
    const key = this.session.opsKey();
    if (!key || !this.canDispatch()) return;
    this.busy.set(true);
    this.success.set(null);
    this.api.dispatchShipment(row.shipmentId, key).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.success.set(r.message);
        this.refresh();
      },
      error: (err) => {
        this.busy.set(false);
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
      return body?.detail ?? body?.message ?? 'Dispatch action failed.';
    }
    return 'Dispatch action failed.';
  }
}
