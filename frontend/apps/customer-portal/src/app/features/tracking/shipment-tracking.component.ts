import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ShipmentTrackingDetailDto } from '../../services/borderbox-api.service';
import { BorderboxApiService } from '../../services/borderbox-api.service';

@Component({
  selector: 'app-shipment-tracking',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track-page">
      <a routerLink="/received-parcels" class="back-link">
        <span class="material-icons-outlined">arrow_back</span>
        Back to packages
      </a>

      @if (loading()) {
        <p class="loading" aria-live="polite">Loading shipment tracking…</p>
      } @else if (loadError()) {
        <div class="bb-card bb-card-pad err-card">
          <p class="err">{{ loadError() }}</p>
          <button type="button" class="bb-btn bb-btn-outline" (click)="reload()">Try again</button>
        </div>
      } @else if (detail()) {
        @let d = detail()!;

        <header class="track-header bb-card bb-card-pad">
          <div class="track-header-main">
            <p class="track-label">Tracking number</p>
            <div class="track-number-row">
              <h1 class="track-number">{{ d.trackingNumber }}</h1>
              <button
                type="button"
                class="icon-btn"
                (click)="copyTracking(d.trackingNumber)"
                [attr.aria-label]="copied() ? 'Copied' : 'Copy tracking number'"
              >
                <span class="material-icons-outlined">{{ copied() ? 'done' : 'content_copy' }}</span>
              </button>
            </div>
          </div>
          <div class="track-header-meta">
            <span class="status-pill">{{ d.statusLabel }}</span>
            <div class="meta-item">
              <span class="material-icons-outlined meta-icon">inventory_2</span>
              <span>{{ d.deliveryMethod }}</span>
            </div>
            <div class="meta-item">
              <span class="material-icons-outlined meta-icon">schedule</span>
              <span><strong>Estimated pickup:</strong> {{ d.estimatedDelivery }}</span>
            </div>
          </div>
        </header>

        <div class="track-grid">
          <section class="journey-col">
            <div class="bb-card bb-card-pad route-card">
              <div class="route-visual">
                <div class="route-end">
                  <span class="route-dot origin" aria-hidden="true"></span>
                  <div>
                    <strong>{{ d.originLabel }}</strong>
                    <small>Origin</small>
                  </div>
                </div>
                <div class="route-path" aria-hidden="true">
                  <span class="route-line"></span>
                  <span class="material-icons-outlined route-truck">local_shipping</span>
                </div>
                <div class="route-end">
                  <span class="route-dot dest" aria-hidden="true"></span>
                  <div>
                    <strong>{{ d.destinationLabel }}</strong>
                    <small>Destination</small>
                  </div>
                </div>
              </div>
            </div>

            <div class="bb-card bb-card-pad timeline-card">
              <h2 class="section-title">Tracking journey</h2>
              <ol class="milestones">
                @for (m of d.milestones; track m.label) {
                  <li
                    class="milestone"
                    [class.done]="m.done"
                    [class.current]="m.current"
                    [class.upcoming]="!m.done && !m.current"
                  >
                    <span class="milestone-icon" [class.active]="m.current" [class.done]="m.done && !m.current">
                      <span class="material-icons-outlined">{{ milestoneIcon(m) }}</span>
                    </span>
                    <div class="milestone-body">
                      <strong>{{ m.label }}</strong>
                      @if (m.occurredAtUtc && (m.done || m.current)) {
                        <time>{{ m.occurredAtUtc | date:'d MMM y, HH:mm' }}</time>
                      } @else if (m.occurredAtUtc) {
                        <time class="muted-schedule">{{ m.occurredAtUtc | date:'d MMM y, HH:mm' }}</time>
                      }
                    </div>
                  </li>
                }
              </ol>
              <p class="tz-note">{{ d.timezoneNote }}</p>
            </div>
          </section>

          <section class="detail-col">
            <div class="bb-card bb-card-pad summary-card">
              <h2 class="section-title">Shipment summary</h2>
              <div class="summary-tiles">
                <div class="tile">
                  <span class="tile-label">Parcels in shipment</span>
                  <span class="tile-val">{{ d.parcelCount }} {{ d.parcelCount === 1 ? 'parcel' : 'parcels' }}</span>
                </div>
                <div class="tile">
                  <span class="tile-label">Total weight</span>
                  <span class="tile-val">{{ d.totalWeightLabel }}</span>
                </div>
                <div class="tile">
                  <span class="tile-label">Declared value</span>
                  <span class="tile-val">{{ d.declaredValueLabel }}</span>
                </div>
              </div>
            </div>

            <div class="bb-card bb-card-pad table-card">
              <div class="table-head">
                <h2 class="section-title">Parcels in this shipment</h2>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tracking #</th>
                      <th>Item</th>
                      <th>Weight</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of d.parcels; track row.trackingNumber) {
                      <tr>
                        <td class="mono">{{ row.trackingNumber }}</td>
                        <td>{{ row.itemName }}</td>
                        <td>
                          @if (row.weightKg != null) {
                            {{ row.weightKg | number:'1.2-2' }} kg
                          } @else {
                            —
                          }
                        </td>
                        <td><span class="row-status">{{ row.statusLabel }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="info-row">
              <div class="bb-card bb-card-pad info-card">
                <h2 class="section-title">Courier information</h2>
                <div class="courier-brand">{{ d.courier.name }}</div>
                <dl class="info-kv">
                  <div><dt>Website</dt><dd><a [href]="courierUrl(d.courier.website)" target="_blank" rel="noopener">{{ d.courier.website }}</a></dd></div>
                  <div><dt>Contact</dt><dd>{{ d.courier.phone }}</dd></div>
                </dl>
              </div>
              <div class="bb-card bb-card-pad info-card">
                <h2 class="section-title">Recipient information</h2>
                <dl class="info-kv">
                  <div><dt>Name</dt><dd>{{ d.recipient.name }}</dd></div>
                  <div><dt>Phone</dt><dd>{{ d.recipient.phone }}</dd></div>
                  <div><dt>Address</dt><dd>{{ d.recipient.address }}</dd></div>
                </dl>
              </div>
            </div>

            <div class="bb-card bb-card-pad table-card">
              <div class="table-head">
                <h2 class="section-title">Shipment history</h2>
              </div>
              <div class="table-wrap">
                <table class="history-table">
                  <thead>
                    <tr>
                      <th>Date &amp; time</th>
                      <th>Event</th>
                      <th>Location</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (ev of d.history; track ev.occurredAtUtc + ev.eventLabel) {
                      <tr>
                        <td>{{ ev.occurredAtUtc | date:'d MMM y, HH:mm' }}</td>
                        <td>
                          <span class="event-cell">
                            <span class="event-dot" [attr.data-tone]="ev.eventTone"></span>
                            {{ ev.eventLabel }}
                          </span>
                        </td>
                        <td>{{ ev.location }}</td>
                        <td>{{ ev.details }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <p class="support-hint">
              Need help?
              <a routerLink="/tracking-support">Contact support</a>
            </p>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .track-page { max-width: 1280px; }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--bb-primary);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .back-link:hover { text-decoration: underline; }
    .loading { color: var(--bb-muted); padding: 2rem 0; }
    .err-card .err { color: var(--bb-danger); margin: 0 0 1rem; }

    .track-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 1.25rem 2rem;
      margin-bottom: 1.25rem;
      border: 1px solid var(--bb-border);
    }
    .track-label {
      margin: 0 0 0.25rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--bb-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .track-number-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .track-number {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--bb-primary);
      letter-spacing: -0.02em;
    }
    .icon-btn {
      border: 1px solid var(--bb-border);
      background: #fff;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--bb-muted);
    }
    .icon-btn:hover { border-color: var(--bb-primary); color: var(--bb-primary); }
    .track-header-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem 1.5rem;
    }
    .status-pill {
      background: var(--bb-success-soft);
      color: #15803d;
      font-weight: 700;
      font-size: 0.8rem;
      padding: 0.35rem 0.85rem;
      border-radius: 999px;
      border: 1px solid #bbf7d0;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.9rem;
      color: var(--bb-text);
    }
    .meta-icon { font-size: 1.1rem; color: var(--bb-muted); }

    .track-grid {
      display: grid;
      grid-template-columns: minmax(280px, 38%) 1fr;
      gap: 1.25rem;
      align-items: start;
    }
    @media (max-width: 960px) {
      .track-grid { grid-template-columns: 1fr; }
    }

    .section-title {
      margin: 0 0 1rem;
      font-size: 1rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .route-card { margin-bottom: 1rem; }
    .route-visual {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 0.75rem;
      align-items: center;
    }
    .route-end strong { display: block; font-size: 0.9rem; }
    .route-end small { color: var(--bb-muted); font-size: 0.75rem; }
    .route-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      margin-bottom: 0.35rem;
    }
    .route-dot.origin { background: var(--bb-primary); }
    .route-dot.dest { background: var(--bb-success); }
    .route-path {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      min-width: 80px;
    }
    .route-line {
      width: 100%;
      border-top: 2px dashed #cbd5e1;
    }
    .route-truck {
      color: var(--bb-primary);
      font-size: 1.5rem;
      background: #fff;
    }

    .milestones {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .milestone {
      display: grid;
      grid-template-columns: 40px 1fr;
      gap: 0.75rem;
      padding-bottom: 1.25rem;
      position: relative;
    }
    .milestone:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 19px;
      top: 36px;
      bottom: 0;
      width: 2px;
      background: #e2e8f0;
    }
    .milestone.done:not(:last-child)::before { background: #86efac; }
    .milestone.current:not(:last-child)::before {
      background: linear-gradient(#3b82f6 0%, #e2e8f0 100%);
    }
    .milestone-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      color: #94a3b8;
      z-index: 1;
    }
    .milestone-icon.done {
      background: var(--bb-success-soft);
      color: #16a34a;
    }
    .milestone-icon.active {
      background: var(--bb-primary-soft);
      color: var(--bb-primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .milestone.upcoming .milestone-body strong,
    .milestone.upcoming .milestone-body time { color: #94a3b8; }
    .milestone-body strong { display: block; font-size: 0.92rem; }
    .milestone-body time {
      font-size: 0.8rem;
      color: var(--bb-muted);
    }
    .muted-schedule { opacity: 0.7; }
    .tz-note {
      margin: 0.5rem 0 0;
      font-size: 0.75rem;
      color: var(--bb-muted);
    }

    .summary-tiles {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }
    @media (max-width: 700px) {
      .summary-tiles { grid-template-columns: 1fr; }
    }
    .tile {
      background: #f8fafc;
      border: 1px solid var(--bb-border);
      border-radius: 10px;
      padding: 0.85rem 1rem;
    }
    .tile-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--bb-muted);
      margin-bottom: 0.35rem;
    }
    .tile-val { font-size: 1rem; font-weight: 700; color: var(--bb-text); }

    .table-card { margin-bottom: 1rem; }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    th {
      text-align: left;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--bb-muted);
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--bb-border);
      font-weight: 700;
    }
    td {
      padding: 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }
    .mono { font-family: ui-monospace, monospace; font-size: 0.82rem; }
    .row-status {
      display: inline-block;
      background: var(--bb-success-soft);
      color: #15803d;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
    }
    .info-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    @media (max-width: 800px) {
      .info-row { grid-template-columns: 1fr; }
    }
    .courier-brand {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--bb-primary);
      margin-bottom: 0.75rem;
      letter-spacing: 0.02em;
    }
    .info-kv {
      margin: 0;
      display: grid;
      gap: 0.65rem;
    }
    .info-kv dt {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--bb-muted);
      margin: 0;
    }
    .info-kv dd { margin: 0.15rem 0 0; font-size: 0.9rem; }
    .info-kv a { color: var(--bb-primary); }

    .event-cell {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 600;
    }
    .event-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #94a3b8;
    }
    .event-dot[data-tone='success'] { background: var(--bb-success); }
    .event-dot[data-tone='info'] { background: var(--bb-primary); }

    .support-hint {
      font-size: 0.875rem;
      color: var(--bb-muted);
      margin: 0;
    }
    .support-hint a { color: var(--bb-primary); font-weight: 600; }
  `,
})
export class ShipmentTrackingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(BorderboxApiService);

  readonly detail = signal<ShipmentTrackingDetailDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly copied = signal(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const shipmentId = params.get('shipmentId');
      const parcelId = params.get('parcelId');
      if (shipmentId) {
        this.loadByShipment(shipmentId);
        return;
      }
      if (parcelId) {
        this.loadByParcel(parcelId);
        return;
      }
      this.loadError.set('Shipment not found.');
      this.loading.set(false);
    });
  }

  reload(): void {
    const shipmentId = this.route.snapshot.paramMap.get('shipmentId');
    const parcelId = this.route.snapshot.paramMap.get('parcelId');
    if (shipmentId) this.loadByShipment(shipmentId);
    else if (parcelId) this.loadByParcel(parcelId);
  }

  milestoneIcon(m: { icon: string; done: boolean; current: boolean }): string {
    if (m.current) return m.icon;
    if (m.done) return 'check_circle';
    return m.icon;
  }

  courierUrl(site: string): string {
    return site.startsWith('http') ? site : `https://${site}`;
  }

  copyTracking(value: string): void {
    navigator.clipboard?.writeText(value).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      },
      () => undefined,
    );
  }

  private loadByShipment(shipmentId: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.detail.set(null);
    if (shipmentId === 'active') {
      this.api.getTrackingSupport().subscribe({
        next: (o) => {
          const id = o.activeShipmentId;
          if (!id) {
            this.loadError.set('No active shipment to track right now.');
            this.loading.set(false);
            return;
          }
          this.fetchByShipment(id);
        },
        error: () => this.failLoad(),
      });
      return;
    }
    this.fetchByShipment(shipmentId);
  }

  private loadByParcel(parcelId: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.detail.set(null);
    this.api.getParcelShipmentTracking(parcelId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
      },
      error: (err: unknown) => this.failLoad(this.formatError(err)),
    });
  }

  private fetchByShipment(shipmentId: string): void {
    this.api.getShipmentTracking(shipmentId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
      },
      error: (err: unknown) => this.failLoad(this.formatError(err)),
    });
  }

  private formatError(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const body = (err as { error?: { detail?: string; title?: string } }).error;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
    }
    return 'Could not load shipment tracking. Try again.';
  }

  private failLoad(message?: string): void {
    this.loadError.set(message ?? 'Could not load shipment tracking. Try again.');
    this.loading.set(false);
  }
}
