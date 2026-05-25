import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import {
  WarehouseApiService,
  type OpsPackingTaskDto,
} from '../../services/warehouse-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import { warehouseRoutes } from '../../types/warehouse.types';

@Component({
  selector: 'ops-warehouse-pack-shipment',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink, OpsPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <a [routerLink]="routes.packing" class="back">← Packing queue</a>
          <h1>Pack shipment {{ task()?.shipmentDisplayId ?? '' }}</h1>
          @if (task(); as t) {
            <p>{{ t.customerDisplayName }} · {{ t.deliveryMethod }} → {{ t.destination }}</p>
          }
        </div>
        @if (task(); as t) {
          <ops-pill [label]="t.status" tone="blue" />
        }
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      @if (success()) { <p class="ok-banner">{{ success() }}</p> }

      @if (task(); as t) {
        <section class="ops-card ops-card-pad meta">
          <div class="meta-grid">
            <div><span class="lbl">Quoted weight</span><strong>{{ t.quotedWeightKg ?? '—' | number:'1.1-1' }} kg</strong></div>
            <div><span class="lbl">Packages</span><strong>{{ t.packageCount }}</strong></div>
            <div><span class="lbl">Variance</span><ops-pill [label]="t.varianceStatus" tone="yellow" /></div>
          </div>
        </section>

        @if (canPack() && t.status !== 'PACKED') {
          <section class="ops-card ops-card-pad">
            <h2 class="ops-card-title">Complete packing</h2>
            <div class="form-grid">
              <label>
                <span>Final weight (kg)</span>
                <input type="number" step="0.1" [(ngModel)]="form.finalWeightKg" name="wt" />
              </label>
              <label>
                <span>Dimensions label</span>
                <input [(ngModel)]="form.finalDimensionsLabel" name="dim" placeholder="45x35x25 cm" />
              </label>
              <label>
                <span>Packaging type</span>
                <select [(ngModel)]="form.packagingType" name="pkg">
                  <option value="Box">Box</option>
                  <option value="Mailer">Mailer</option>
                  <option value="Crate">Crate</option>
                  <option value="Custom">Custom</option>
                </select>
              </label>
              <label>
                <span>Package count</span>
                <input type="number" min="1" [(ngModel)]="form.packageCount" name="pc" />
              </label>
            </div>
            <label class="field">
              <span>Notes (optional)</span>
              <textarea [(ngModel)]="form.notes" name="notes" rows="2"></textarea>
            </label>
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="complete()">
              Complete packing
            </button>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: 720px; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
    .page-head h1 { margin: 0.35rem 0; font-size: 1.35rem; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.88rem; }
    .back { display: inline-block; margin-bottom: 0.35rem; color: var(--ops-primary); font-size: 0.82rem; font-weight: 600; text-decoration: none; }
    .meta { margin-bottom: 0.85rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
    .lbl { display: block; font-size: 0.72rem; color: var(--ops-muted); font-weight: 600; margin-bottom: 0.15rem; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 0.85rem; }
    .form-grid label, .field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.75rem; font-weight: 600; color: var(--ops-muted); }
    .form-grid input, .form-grid select, .field textarea {
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      font-size: 0.84rem;
      font-weight: 400;
      color: var(--ops-text);
    }
    .btn-primary {
      border: none;
      border-radius: var(--ops-radius-sm);
      background: var(--ops-primary);
      color: #fff;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 0.5rem 0.9rem;
      cursor: pointer;
    }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #166534; background: #dcfce7; padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class WarehousePackShipmentComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);
  private readonly route = inject(ActivatedRoute);

  readonly routes = warehouseRoutes;
  readonly task = signal<OpsPackingTaskDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly busy = signal(false);

  form = {
    finalWeightKg: 0,
    finalDimensionsLabel: '',
    packagingType: 'Box',
    packageCount: 1,
    notes: '',
  };

  ngOnInit(): void {
    this.route.paramMap.subscribe(() => this.refresh());
  }

  canPack(): boolean {
    return this.session.can(OPS_CAP.packingWrite);
  }

  refresh(): void {
    const key = this.session.opsKey();
    const shipmentId = this.route.snapshot.paramMap.get('shipmentId');
    if (!key || !shipmentId) return;
    this.api.listPackingTasks(key, 1, 100).subscribe({
      next: (r) => {
        const match =
          r.items.find((x) => x.shipmentId === shipmentId) ??
          r.items.find((x) => x.packingTaskId === shipmentId);
        if (!match) {
          this.error.set('Packing task not found for this shipment.');
          return;
        }
        this.task.set(match);
        this.form.finalWeightKg = match.finalWeightKg ?? match.quotedWeightKg ?? 0;
        this.form.finalDimensionsLabel = match.finalDimensionsLabel ?? '';
        this.form.packagingType = match.packagingType ?? 'Box';
        this.form.packageCount = match.packageCount;
        this.form.notes = match.notes ?? '';
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  complete(): void {
    const key = this.session.opsKey();
    const t = this.task();
    if (!key || !t || !this.canPack()) return;
    this.busy.set(true);
    this.success.set(null);
    this.api
      .completePacking(
        t.packingTaskId,
        {
          finalWeightKg: this.form.finalWeightKg,
          finalDimensionsLabel: this.form.finalDimensionsLabel.trim(),
          packagingType: this.form.packagingType,
          packageCount: this.form.packageCount,
          notes: this.form.notes.trim() || null,
        },
        key,
      )
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.task.set(updated);
          this.success.set('Packing completed.');
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(this.formatError(err));
        },
      });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? 'Packing failed.';
    }
    return 'Packing failed.';
  }
}
