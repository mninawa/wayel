import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReceivingApiService, type OpsParcelDetailDto } from '../../services/receiving-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import {
  WarehouseApiService,
  type OpsParcelStorageDto,
  type OpsWarehouseBoardCardDto,
} from '../../services/warehouse-api.service';
import { warehouseRoutes } from '../../types/warehouse.types';
import {
  isSuiteLocationId,
  locationOptionLabel,
  suiteLocationId,
} from './warehouse-location.utils';

export interface WarehouseBoardStoreConfirm {
  locationId: string;
  notes: string | null;
}

@Component({
  selector: 'ops-warehouse-board-store-modal',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="cancelled.emit()" aria-hidden="true"></div>
    <div class="modal ops-card" role="dialog" aria-modal="true" aria-labelledby="store-modal-title">
      <header class="modal-head">
        <div>
          <h2 id="store-modal-title">Store parcel</h2>
          <p>
            @if (storage()?.suggestedLocationLabel; as label) {
              Default location is the customer's <strong>{{ label }}</strong>. Confirm or choose another bin.
            } @else {
              Choose where to store this parcel before moving it to <strong>Stored</strong>.
            }
          </p>
        </div>
        <button type="button" class="icon-btn" (click)="cancelled.emit()" aria-label="Close">
          <span class="material-icons-outlined">close</span>
        </button>
      </header>

      @if (error()) {
        <p class="err-banner">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="muted pad">Loading parcel details…</p>
      } @else {
        @if (storage()?.suggestedLocationId; as suiteLocId) {
          <button type="button" class="suite-quick ops-btn ops-btn-primary" (click)="storeInSuitePostbox(suiteLocId)">
            <span class="material-icons-outlined">inbox</span>
            Store in {{ storage()?.suggestedLocationLabel ?? 'suite' }}
          </button>
        }

        <section class="summary">
          <div class="summary-row">
            <span class="lbl">Parcel</span>
            <strong>{{ card().displayId }}</strong>
          </div>
          <div class="summary-row">
            <span class="lbl">Item</span>
            <strong>{{ storage()?.itemName ?? card().title }}</strong>
          </div>
          @if (storage()?.suiteNumber ?? card().suiteNumber; as suite) {
            <div class="summary-row">
              <span class="lbl">Suite</span>
              <strong>{{ suite }}</strong>
            </div>
          }
          @if (storage()?.customerDisplayName ?? card().customerDisplayName; as customer) {
            <div class="summary-row">
              <span class="lbl">Customer</span>
              <strong>{{ customer }}</strong>
            </div>
          }
          @if (parcel(); as p) {
            <div class="checks">
              <div class="check" [class.missing]="p.weightKg == null">
                <span class="material-icons-outlined">{{ p.weightKg != null ? 'check_circle' : 'error_outline' }}</span>
                <span>Weight {{ p.weightKg != null ? (p.weightKg | number:'1.0-1') + ' kg' : 'not recorded' }}</span>
              </div>
              <div class="check" [class.missing]="!p.dimensionsLabel">
                <span class="material-icons-outlined">{{ p.dimensionsLabel ? 'check_circle' : 'error_outline' }}</span>
                <span>Dimensions {{ p.dimensionsLabel ?? 'not recorded' }}</span>
              </div>
              <div class="check" [class.missing]="p.inspection?.conditionStatus === 'NOT_INSPECTED'">
                <span class="material-icons-outlined">
                  {{ p.inspection?.conditionStatus !== 'NOT_INSPECTED' ? 'check_circle' : 'error_outline' }}
                </span>
                <span>Inspection {{ p.inspection?.conditionStatus === 'NOT_INSPECTED' ? 'pending' : 'done' }}</span>
              </div>
            </div>
            @if (p.readinessBlockers.length) {
              <div class="blockers">
                <span class="lbl">Quote readiness notes</span>
                <ul>
                  @for (b of p.readinessBlockers; track b) {
                    <li>{{ b }}</li>
                  }
                </ul>
              </div>
            }
            @if (p.weightKg == null || !p.dimensionsLabel) {
              <p class="hint">
                Weight and dimensions are not required to store, but should be captured before quoting.
                @if (card().parcelId) {
                  <a [routerLink]="routes.parcel(card().parcelId!)" class="link">Open parcel</a>
                }
              </p>
            }
          }
        </section>

        @if (storage(); as s) {
          <details class="alt-locations" [open]="!s.suggestedLocationId">
            <summary>Or choose another storage slot</summary>
            <label class="field">
              <span>Storage slot</span>
              <select [(ngModel)]="selectedLocationId" name="location">
                <option value="">Choose a location…</option>
                @if (suiteLocations().length) {
                  <optgroup label="Suites">
                    @for (loc of suiteLocations(); track loc.locationId) {
                      <option [value]="loc.locationId">
                        {{ locationLabel(loc) }}
                      </option>
                    }
                  </optgroup>
                }
                @if (otherLocations().length) {
                  <optgroup label="Shelf / bin locations">
                    @for (loc of otherLocations(); track loc.locationId) {
                      <option [value]="loc.locationId">
                        {{ locationLabel(loc) }}
                      </option>
                    }
                  </optgroup>
                }
              </select>
            </label>
            <label class="field">
              <span>Notes (optional)</span>
              <textarea [(ngModel)]="notes" name="notes" rows="2" placeholder="e.g. Fragile — top shelf only"></textarea>
            </label>
          </details>
          @if (!s.eligibleLocations.length) {
            <p class="warn">No active locations available.</p>
          }
        }

        <footer class="modal-actions">
          <button type="button" class="ops-btn ops-btn-ghost" (click)="cancelled.emit()">Cancel</button>
          <button
            type="button"
            class="ops-btn ops-btn-primary"
            [disabled]="!selectedLocationId"
            (click)="submit()"
          >
            Store in selected slot
          </button>
        </footer>
      }
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }
    .modal {
      position: relative;
      width: min(480px, 100%);
      max-height: min(90vh, 720px);
      overflow: auto;
      padding: 1rem 1.1rem 1.1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .modal-head {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: flex-start;
    }
    .modal-head h2 { margin: 0 0 0.25rem; font-size: 1.05rem; }
    .modal-head p { margin: 0; color: var(--ops-muted); font-size: 0.84rem; line-height: 1.4; }
    .suite-quick {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      padding: 0.65rem 1rem;
    }
    .icon-btn {
      border: none;
      background: transparent;
      color: var(--ops-muted);
      padding: 0.25rem;
      border-radius: 6px;
      flex-shrink: 0;
    }
    .summary {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: var(--ops-radius-sm);
      border: 1px solid var(--ops-border);
    }
    .summary-row { display: flex; justify-content: space-between; gap: 0.75rem; font-size: 0.84rem; }
    .lbl { color: var(--ops-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .checks { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.35rem; }
    .check {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      color: #166534;
    }
    .check .material-icons-outlined { font-size: 1rem; }
    .check.missing { color: var(--ops-muted); }
    .blockers ul { margin: 0.25rem 0 0; padding-left: 1.1rem; font-size: 0.78rem; color: var(--ops-muted); }
    .alt-locations summary {
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ops-primary);
      margin-bottom: 0.5rem;
    }
    .field { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.82rem; margin-top: 0.5rem; }
    .field select,
    .field textarea {
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      padding: 0.55rem 0.65rem;
      font-size: 0.84rem;
      font-family: inherit;
    }
    .warn { color: var(--ops-danger); font-size: 0.82rem; margin: 0; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.65rem 0.75rem; border-radius: var(--ops-radius-sm); margin: 0; font-size: 0.82rem; }
    .muted.pad { padding: 0.5rem 0; margin: 0; color: var(--ops-muted); }
  `,
})
export class WarehouseBoardStoreModalComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly receivingApi = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);

  readonly card = input.required<OpsWarehouseBoardCardDto>();
  readonly confirmed = output<WarehouseBoardStoreConfirm>();
  readonly cancelled = output<void>();

  readonly routes = warehouseRoutes;
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly storage = signal<OpsParcelStorageDto | null>(null);
  readonly parcel = signal<OpsParcelDetailDto | null>(null);

  readonly suiteLocations = computed(() =>
    (this.storage()?.eligibleLocations ?? []).filter((l) => isSuiteLocationId(l.locationId)),
  );
  readonly otherLocations = computed(() =>
    (this.storage()?.eligibleLocations ?? []).filter((l) => !isSuiteLocationId(l.locationId)),
  );

  selectedLocationId = '';
  notes = '';

  ngOnInit(): void {
    const key = this.session.opsKey();
    const parcelId = this.card().parcelId;
    if (!key || !parcelId) {
      this.loading.set(false);
      this.error.set('Parcel details unavailable.');
      return;
    }

    this.api.getParcelStorage(parcelId, key).subscribe({
      next: (s) => {
        this.storage.set(s);
        this.selectedLocationId =
          s.currentLocationId ?? s.suggestedLocationId ?? suiteLocationId(s.suiteNumber) ?? '';
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.formatError(err));
      },
    });

    this.receivingApi.getParcel(parcelId, key).subscribe({
      next: (p) => this.parcel.set(p),
      error: () => {},
    });
  }

  locationLabel(loc: { locationId: string; zone: string; occupancy: number; capacity: number }): string {
    const suite = this.storage()?.suiteNumber ?? this.card().suiteNumber;
    return locationOptionLabel(loc.locationId, loc.zone, loc.occupancy, loc.capacity, suite);
  }

  storeInSuitePostbox(locationId: string): void {
    this.confirmed.emit({ locationId, notes: null });
  }

  submit(): void {
    if (!this.selectedLocationId.trim()) return;
    this.confirmed.emit({
      locationId: this.selectedLocationId.trim(),
      notes: this.notes.trim() || null,
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? 'Could not load storage options.';
    }
    return 'Could not load storage options.';
  }
}
