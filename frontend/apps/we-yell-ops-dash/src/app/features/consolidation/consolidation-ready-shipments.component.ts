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
  ConsolidationApiService,
  type ConsolidationShipmentStage,
  type OpsConsolidationReadyShipmentDto,
} from '../../services/consolidation-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import { consolidationRoutes } from '../../types/consolidation.types';

@Component({
  selector: 'ops-consolidation-ready-shipments',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe, DecimalPipe, OpsPillComponent, OpsPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Shipment ready queue</h1>
          <p>
            Paid consolidations awaiting pick/pack, then staging for courier dispatch.
            Use warehouse inventory to locate parcels before packing.
          </p>
        </div>
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      @if (success()) { <p class="ok-banner">{{ success() }}</p> }

      <div class="tabs">
        <button type="button" class="tab" [class.active]="stage() === 'awaiting_pack'" (click)="setStage('awaiting_pack')">
          Awaiting pack
        </button>
        <button type="button" class="tab" [class.active]="stage() === 'ready'" (click)="setStage('ready')">
          Ready for dispatch
        </button>
      </div>

      @if (stage() === 'ready' && canPack()) {
        <section class="ops-card batch-bar">
          <label>
            <span>Courier reference (optional)</span>
            <input type="text" [(ngModel)]="courierRef" placeholder="Batch / manifest ref" />
          </label>
          <button
            type="button"
            class="btn-primary"
            [disabled]="selected().size === 0 || busy()"
            (click)="dispatchSelected()"
          >
            Dispatch selected ({{ selected().size }})
          </button>
        </section>
      }

      <section class="ops-card">
        <div class="table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                @if (stage() === 'ready' && canPack()) { <th class="chk"></th> }
                <th>Customer</th>
                <th>Suite</th>
                <th>Parcels</th>
                <th>Weight</th>
                <th>Delivery</th>
                <th>Paid</th>
                <th>Pick list</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.shipmentId) {
                <tr>
                  @if (stage() === 'ready' && canPack()) {
                    <td class="chk">
                      <input
                        type="checkbox"
                        [checked]="selected().has(row.shipmentId)"
                        (change)="toggleSelect(row.shipmentId)"
                      />
                    </td>
                  }
                  <td>{{ row.customerDisplayName }}</td>
                  <td>{{ row.suiteNumber }}</td>
                  <td>{{ row.parcelCount }}</td>
                  <td>{{ row.totalWeightKg | number:'1.1-1' }} kg</td>
                  <td>{{ row.deliveryMethod }}</td>
                  <td>{{ row.paidAtUtc ? (row.paidAtUtc | date:'mediumDate') : '—' }}</td>
                  <td class="pick-list">
                    <ul>
                      @for (p of row.parcels; track p.parcelId) {
                        <li>
                          <strong>{{ p.displayId }}</strong>
                          {{ p.itemName }}
                          @if (p.warehouseLocation) {
                            <ops-pill [label]="p.warehouseLocation" tone="gray" />
                          } @else {
                            <span class="warn">No location</span>
                          }
                        </li>
                      }
                    </ul>
                  </td>
                  <td class="actions">
                    @if (stage() === 'awaiting_pack' && canPack()) {
                      <button type="button" class="btn-pack" [disabled]="busy()" (click)="markPacked(row)">
                        Mark packed
                      </button>
                    } @else if (row.readyForDispatch) {
                      <ops-pill label="Ready" tone="green" />
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="stage() === 'ready' && canPack() ? 9 : 8" class="empty">
                    No shipments in this queue.
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
          ariaLabel="Shipment queue pages"
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
    .tabs { display: flex; gap: 0.35rem; margin-bottom: 0.85rem; }
    .tab {
      border: 1px solid var(--ops-border);
      background: #fff;
      border-radius: var(--ops-radius-sm);
      padding: 0.45rem 0.85rem;
      font-size: 0.82rem;
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
      min-width: 14rem;
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
    }
    .btn-primary, .btn-pack {
      border: none;
      border-radius: var(--ops-radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.45rem 0.75rem;
      cursor: pointer;
    }
    .btn-primary { background: var(--ops-brand-green); color: #fff; }
    .btn-pack { background: var(--ops-primary); color: #fff; white-space: nowrap; }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; vertical-align: top; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .chk { width: 2rem; }
    .pick-list ul { margin: 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 0.35rem; min-width: 14rem; }
    .pick-list li { list-style: disc; font-size: 0.78rem; }
    .pick-list .warn { color: #b45309; font-size: 0.72rem; margin-left: 0.25rem; }
    .actions { white-space: nowrap; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #166534; background: #dcfce7; padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class ConsolidationReadyShipmentsComponent implements OnInit {
  private readonly api = inject(ConsolidationApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = consolidationRoutes;
  readonly items = signal<OpsConsolidationReadyShipmentDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly stage = signal<ConsolidationShipmentStage>('awaiting_pack');
  readonly selected = signal(new Set<string>());
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly busy = signal(false);
  courierRef = '';

  ngOnInit(): void {
    this.refresh();
  }

  canPack(): boolean {
    return this.session.can(OPS_CAP.inspect);
  }

  setStage(stage: ConsolidationShipmentStage): void {
    this.stage.set(stage);
    this.page.set(1);
    this.selected.set(new Set());
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.error.set(null);
    this.api.listReadyShipments(key, this.page(), this.pageSize(), this.stage()).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.totalCount.set(result.totalCount);
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  markPacked(row: OpsConsolidationReadyShipmentDto): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.success.set(null);
    this.api.markPacked(row.shipmentId, null, key).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.success.set(result.message);
        this.refresh();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  toggleSelect(shipmentId: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  }

  dispatchSelected(): void {
    const key = this.session.opsKey();
    if (!key) return;
    const ids = [...this.selected()];
    if (ids.length === 0) return;
    this.busy.set(true);
    this.success.set(null);
    this.api.dispatchBatch(ids, this.courierRef.trim() || null, key).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.success.set(result.message);
        this.selected.set(new Set());
        this.courierRef = '';
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
