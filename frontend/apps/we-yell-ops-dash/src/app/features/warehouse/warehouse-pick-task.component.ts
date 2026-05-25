import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import {
  WarehouseApiService,
  type OpsPickTaskDto,
} from '../../services/warehouse-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import { warehouseRoutes } from '../../types/warehouse.types';

@Component({
  selector: 'ops-warehouse-pick-task',
  standalone: true,
  imports: [RouterLink, OpsPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <a [routerLink]="routes.picking" class="back">← Picking queue</a>
          <h1>Pick task {{ task()?.displayId ?? '' }}</h1>
          @if (task(); as t) {
            <p>{{ t.customerDisplayName }} · Suite {{ t.suiteNumber }}</p>
          }
        </div>
        @if (task(); as t) {
          <ops-pill [label]="t.status" tone="blue" />
        }
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      @if (success()) { <p class="ok-banner">{{ success() }}</p> }

      @if (task(); as t) {
        <section class="ops-card">
          <div class="table-wrap">
            <table class="ops-table">
              <thead>
                <tr>
                  <th>Parcel</th>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (line of t.parcels; track line.parcelId) {
                  <tr>
                    <td><strong>{{ line.displayId }}</strong></td>
                    <td>{{ line.itemName }}</td>
                    <td>
                      @if (line.locationId) {
                        <ops-pill [label]="line.locationId" tone="gray" />
                      } @else {
                        <span class="warn">No location</span>
                      }
                    </td>
                    <td><ops-pill [label]="line.pickStatus" [tone]="line.pickStatus === 'PICKED' ? 'green' : 'orange'" /></td>
                    <td>
                      @if (canPick() && line.pickStatus !== 'PICKED') {
                        <button
                          type="button"
                          class="btn-primary"
                          [disabled]="busyParcelId() === line.parcelId"
                          (click)="markPicked(line.parcelId)"
                        >
                          Mark picked
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="empty">No parcels on this pick list.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .page { max-width: 960px; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
    .page-head h1 { margin: 0.35rem 0; font-size: 1.35rem; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.88rem; }
    .back { display: inline-block; margin-bottom: 0.35rem; color: var(--ops-primary); font-size: 0.82rem; font-weight: 600; text-decoration: none; }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; vertical-align: middle; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .warn { color: #b45309; font-size: 0.78rem; }
    .btn-primary {
      border: none;
      border-radius: var(--ops-radius-sm);
      background: var(--ops-primary);
      color: #fff;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.4rem 0.7rem;
      cursor: pointer;
    }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #166534; background: #dcfce7; padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class WarehousePickTaskComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);
  private readonly route = inject(ActivatedRoute);

  readonly routes = warehouseRoutes;
  readonly task = signal<OpsPickTaskDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly busyParcelId = signal<string | null>(null);

  ngOnInit(): void {
    this.route.paramMap.subscribe(() => this.refresh());
  }

  canPick(): boolean {
    return this.session.can(OPS_CAP.pickingWrite);
  }

  refresh(): void {
    const key = this.session.opsKey();
    const taskId = this.route.snapshot.paramMap.get('taskId');
    if (!key || !taskId) return;
    this.api.getPickingTask(taskId, key).subscribe({
      next: (t) => this.task.set(t),
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  markPicked(parcelId: string): void {
    const key = this.session.opsKey();
    const taskId = this.route.snapshot.paramMap.get('taskId');
    if (!key || !taskId || !this.canPick()) return;
    this.busyParcelId.set(parcelId);
    this.success.set(null);
    this.api.markParcelPicked(taskId, { parcelId }, key).subscribe({
      next: (t) => {
        this.busyParcelId.set(null);
        this.task.set(t);
        this.success.set('Parcel marked as picked.');
      },
      error: (err) => {
        this.busyParcelId.set(null);
        this.error.set(this.formatError(err));
      },
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? 'Pick update failed.';
    }
    return 'Pick update failed.';
  }
}
