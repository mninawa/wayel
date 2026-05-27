import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import {
  WarehouseApiService,
  type OpsParcelStorageDto,
} from '../../services/warehouse-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import { suiteLocationId } from './warehouse-location.utils';
import { warehouseRoutes } from '../../types/warehouse.types';

@Component({
  selector: 'ops-warehouse-storage-assignment',
  standalone: true,
  imports: [FormsModule, RouterLink, OpsPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Assign storage</h1>
          <p>Place a received parcel into an available bin or shelf location.</p>
        </div>
        <a [routerLink]="routes.locations" class="btn-ghost">All locations</a>
      </header>

      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      @if (success()) { <p class="ok-banner">{{ success() }}</p> }

      @if (storage(); as s) {
        <section class="ops-card ops-card-pad summary">
          <div class="summary-grid">
            <div><span class="lbl">Parcel</span><strong>{{ s.displayId }}</strong></div>
            <div><span class="lbl">Customer</span><strong>{{ s.customerDisplayName }}</strong></div>
            <div><span class="lbl">Suite</span><strong>{{ s.suiteNumber }}</strong></div>
            <div><span class="lbl">Item</span><strong>{{ s.itemName }}</strong></div>
            <div><span class="lbl">Status</span><ops-pill [label]="s.status" tone="gray" /></div>
            <div><span class="lbl">Days stored</span><strong>{{ s.daysInWarehouse }}d</strong></div>
            <div>
              <span class="lbl">Current location</span>
              <strong>{{ s.currentLocationLabel ?? s.currentLocationId ?? 'Unassigned' }}</strong>
            </div>
          </div>
          <a [routerLink]="routes.parcel(s.parcelId)" class="view-link">View parcel</a>
        </section>

        @if (canAssign()) {
          <section class="ops-card ops-card-pad">
            <h2 class="ops-card-title">Select location</h2>
            <label class="field">
              <span>Location</span>
              <select [(ngModel)]="selectedLocationId" name="loc">
                <option value="">Choose a location…</option>
                @for (loc of s.eligibleLocations; track loc.locationId) {
                  <option [value]="loc.locationId">
                    {{ loc.locationId }} — {{ loc.zone }} ({{ loc.occupancy }}/{{ loc.capacity }})
                  </option>
                }
              </select>
            </label>
            <label class="field">
              <span>Notes (optional)</span>
              <textarea [(ngModel)]="notes" name="notes" rows="2"></textarea>
            </label>
            <button type="button" class="btn-primary" [disabled]="busy() || !selectedLocationId" (click)="assign()">
              Assign location
            </button>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: 720px; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .page-head h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.88rem; }
    .summary { margin-bottom: 0.85rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem 1rem; margin-bottom: 0.75rem; }
    .lbl { display: block; font-size: 0.72rem; color: var(--ops-muted); font-weight: 600; margin-bottom: 0.15rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.85rem; font-size: 0.75rem; font-weight: 600; color: var(--ops-muted); }
    .field select, .field textarea {
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      font-size: 0.84rem;
      font-weight: 400;
      color: var(--ops-text);
    }
    .btn-primary, .btn-ghost {
      border-radius: var(--ops-radius-sm);
      font-size: 0.82rem;
      font-weight: 600;
      padding: 0.5rem 0.9rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    .btn-primary { background: var(--ops-lime); color: var(--ops-ink); border: none; }
    .btn-ghost { background: #fff; border: 1px solid var(--ops-border); color: var(--ops-muted); }
    .view-link { color: var(--ops-link); font-weight: 600; text-decoration: none; font-size: 0.82rem; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #166534; background: #dcfce7; padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class WarehouseStorageAssignmentComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);
  private readonly route = inject(ActivatedRoute);

  readonly routes = warehouseRoutes;
  readonly storage = signal<OpsParcelStorageDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly busy = signal(false);

  selectedLocationId = '';
  notes = '';

  ngOnInit(): void {
    this.route.paramMap.subscribe(() => this.refresh());
  }

  canAssign(): boolean {
    return this.session.can(OPS_CAP.warehouseWrite);
  }

  refresh(): void {
    const key = this.session.opsKey();
    const parcelId = this.route.snapshot.paramMap.get('parcelId');
    if (!key || !parcelId) return;
    this.api.getParcelStorage(parcelId, key).subscribe({
      next: (s) => {
        this.storage.set(s);
        this.selectedLocationId = s.currentLocationId ?? s.suggestedLocationId ?? suiteLocationId(s.suiteNumber) ?? '';
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  assign(): void {
    const key = this.session.opsKey();
    const parcelId = this.route.snapshot.paramMap.get('parcelId');
    if (!key || !parcelId || !this.selectedLocationId) return;
    this.busy.set(true);
    this.success.set(null);
    this.api
      .assignParcelStorage(
        parcelId,
        { locationId: this.selectedLocationId, notes: this.notes.trim() || null },
        key,
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.success.set('Storage location assigned.');
          this.refresh();
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
      return body?.detail ?? body?.message ?? 'Could not update storage.';
    }
    return 'Could not update storage.';
  }
}
