import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  ShipmentOpsApiService,
  type OpsShipmentListItemDto,
} from '../../services/shipment-ops-api.service';
import { OpsSessionService } from '../../services/ops-session.service';

@Component({
  selector: 'ops-shipment-status',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <h1>Shipment status</h1>
        <p>Advance paid and in-transit shipments — updates appear on customer tracking.</p>
      </header>

      <div class="toolbar">
        <button type="button" class="ops-btn ops-btn-outline" (click)="refresh()" [disabled]="busy()">
          Refresh
        </button>
      </div>

      @if (success()) {
        <p class="ok-banner" role="status">{{ success() }}</p>
      }
      @if (error()) {
        <p class="err-banner" role="alert">{{ error() }}</p>
      }

      @if (shipments().length === 0 && !busy()) {
        <section class="ops-card ops-card-pad empty">
          <span class="material-icons-outlined">local_shipping</span>
          <p>No active shipments to update.</p>
        </section>
      } @else {
        <ul class="list">
          @for (s of shipments(); track s.shipmentId) {
            <li class="ops-card ops-card-pad row">
              <div class="row-main">
                <strong>{{ s.primaryTrackingNumber || s.shipmentId.slice(0, 8) }}</strong>
                <span class="muted">{{ s.customerDisplayName }} · {{ s.customerEmail }}</span>
                <span class="muted">{{ s.parcelCount }} parcel(s) · {{ s.deliveryMethod }}</span>
                @if (s.lastEventAtUtc) {
                  <span class="muted">Last event {{ s.lastEventAtUtc | date:'medium' }}</span>
                }
              </div>
              <div class="row-actions">
                <span class="status-pill">{{ s.statusLabel }}</span>
                @if (s.status === 'Paid') {
                  <button type="button" class="ops-btn ops-btn-primary" [disabled]="busy()" (click)="markInTransit(s)">
                    Mark in transit
                  </button>
                }
                @if (s.status === 'InTransit') {
                  <button type="button" class="ops-btn ops-btn-primary" [disabled]="busy()" (click)="markDelivered(s)">
                    Mark delivered
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .page { max-width: 900px; }
    .page-head h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    .page-head p { margin: 0 0 1rem; color: var(--ops-muted); font-size: 0.88rem; }
    .toolbar { margin-bottom: 1rem; }
    .ok-banner { background: var(--ops-success-soft); color: #15803d; border: 1px solid #86efac; border-radius: var(--ops-radius-sm); padding: 0.65rem 0.85rem; font-size: 0.85rem; margin-bottom: 0.75rem; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); border: 1px solid var(--ops-danger-border); border-radius: var(--ops-radius-sm); padding: 0.75rem 1rem; font-size: 0.85rem; margin-bottom: 0.75rem; }
    .empty { text-align: center; color: var(--ops-muted); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .row-main { display: flex; flex-direction: column; gap: 0.15rem; min-width: 200px; }
    .row-main strong { font-size: 1rem; }
    .muted { font-size: 0.8rem; color: var(--ops-muted); }
    .row-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; }
    .status-pill { background: var(--ops-primary-soft); color: var(--ops-primary); font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 999px; }
  `,
})
export class ShipmentStatusComponent implements OnInit {
  private readonly api = inject(ShipmentOpsApiService);
  private readonly session = inject(OpsSessionService);

  readonly shipments = signal<OpsShipmentListItemDto[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.listShipments(key).subscribe({
      next: (items) => {
        this.shipments.set(items);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  markInTransit(s: OpsShipmentListItemDto): void {
    this.updateStatus(s.shipmentId, 'InTransit');
  }

  markDelivered(s: OpsShipmentListItemDto): void {
    this.updateStatus(s.shipmentId, 'Delivered');
  }

  private updateStatus(shipmentId: string, status: string): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.updateStatus(shipmentId, { status }, key).subscribe({
      next: (r) => {
        this.success.set(`${r.eventLabel} — now ${r.statusLabel}`);
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
      const body = err.error as { detail?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
    }
    return 'Could not update shipment.';
  }
}
