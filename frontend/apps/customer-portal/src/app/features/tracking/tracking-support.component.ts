import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  ShipmentTrackingDto,
  TrackingSupportOverviewDto,
} from '../../services/borderbox-api.service';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-tracking-support',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe, SuiteExpiredBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-page-head">
      <h1>Tracking &amp; Support</h1>
      <p>Follow your shipment to Eswatini and reach our team when you need help.</p>
    </div>

    <app-suite-expired-banner />

    @if (loading()) {
      <p class="loading" aria-live="polite">Loading tracking &amp; support…</p>
    } @else if (loadError()) {
      <div class="bb-card bb-card-pad err-card">
        <p class="err">{{ loadError() }}</p>
        <button type="button" class="bb-btn bb-btn-outline" (click)="reload()">Try again</button>
      </div>
    } @else if (overview()) {
      @let o = overview()!;
      <div class="layout">
        <div class="main">
          @if (o.activeShipment; as ship) {
            <section class="bb-card bb-card-pad journey-card">
              <div class="card-head">
                <h2 class="bb-card-title">Shipment journey</h2>
                <span class="bb-badge" [class]="statusBadgeClass(ship)">{{ ship.statusLabel }}</span>
              </div>
              <div class="journey">
                <div class="loc">
                  <span class="flag" aria-hidden="true">🇿🇦</span>
                  <div>
                    <strong>{{ ship.from }}</strong>
                    <small>South Africa</small>
                  </div>
                </div>
                <span class="material-icons-outlined plane" aria-hidden="true">flight</span>
                <div class="loc">
                  <span class="flag" aria-hidden="true">🇸🇿</span>
                  <div>
                    <strong>{{ ship.to }}</strong>
                    <small>Eswatini</small>
                  </div>
                </div>
              </div>
              <dl class="meta-row">
                <div>
                  <dt>Tracking</dt>
                  <dd class="mono">{{ ship.primaryTrackingNumber ?? '—' }}</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd class="mono">{{ ship.reference }}</dd>
                </div>
                @if (ship.estimatedDelivery) {
                  <div>
                    <dt>Estimated pickup</dt>
                    <dd>{{ ship.estimatedDelivery }}</dd>
                  </div>
                }
              </dl>
              <a
                [routerLink]="['/shipments', ship.shipmentId, 'track']"
                class="bb-btn bb-btn-primary track-dashboard-link"
              >
                Open shipment tracking
              </a>
            </section>

            <section class="bb-card bb-card-pad">
              <h2 class="bb-card-title">Tracking timeline</h2>
              <ul class="timeline">
                @for (step of ship.timeline; track step.label) {
                  <li [class.done]="step.done" [class.current]="step.current">
                    <span class="dot" aria-hidden="true"></span>
                    <div>
                      <strong>{{ step.label }}</strong>
                      @if (step.occurredAtUtc) {
                        <time>{{ step.occurredAtUtc | date:'d MMM y · HH:mm' }}</time>
                      }
                    </div>
                  </li>
                }
              </ul>
            </section>

            <section class="bb-card bb-card-pad">
              <h2 class="bb-card-title">Shipment details</h2>
              <dl class="kv">
                <div><dt>Service</dt><dd>{{ ship.service }}</dd></div>
                <div><dt>Weight</dt><dd>{{ ship.weightLabel }}</dd></div>
                <div><dt>Pieces</dt><dd>{{ ship.pieceCount }}</dd></div>
                <div><dt>From</dt><dd>{{ ship.from }}</dd></div>
                <div><dt>To</dt><dd>{{ ship.to }}</dd></div>
              </dl>
            </section>
          } @else {
            <section class="bb-card bb-card-pad empty-ship">
              <span class="material-icons-outlined empty-icon">local_shipping</span>
              <h2 class="bb-card-title">No active shipment</h2>
              <p>
                When you pay for a quote, your shipment appears here with live tracking steps to
                Eswatini.
              </p>
              <div class="empty-actions">
                <a routerLink="/quotes/request" class="bb-btn bb-btn-primary">Request a quote</a>
                <a routerLink="/quotes/list" class="bb-btn bb-btn-outline">View quotes</a>
              </div>
            </section>
          }

          <section class="bb-card bb-card-pad ticket-card">
            <h2 class="bb-card-title">Open a support ticket</h2>
            <p class="card-lead">Describe your issue and we will follow up by email and WhatsApp when enabled.</p>
            <label class="field-label" for="ticket-subject">Subject</label>
            <input
              id="ticket-subject"
              class="field"
              placeholder="e.g. Delivery delay inquiry"
              [ngModel]="ticketSubject()"
              (ngModelChange)="ticketSubject.set($event)"
            />
            <label class="field-label" for="ticket-body">Message</label>
            <textarea
              id="ticket-body"
              class="field"
              rows="4"
              placeholder="How can we help?"
              [ngModel]="ticketBody()"
              (ngModelChange)="ticketBody.set($event)"
            ></textarea>
            @if (ticketError()) {
              <p class="err sm" role="alert">{{ ticketError() }}</p>
            }
            <button
              type="button"
              class="bb-btn bb-btn-primary"
              [disabled]="ticketSubmitting()"
              (click)="submitTicket()"
            >
              @if (ticketSubmitting()) {
                Submitting…
              } @else {
                Submit ticket
              }
            </button>
            @if (ticketSuccess()) {
              <p class="success" role="status">{{ ticketSuccess() }}</p>
            }
          </section>
        </div>

        <aside class="side">
          <section class="bb-card bb-card-pad">
            <h2 class="bb-card-title">Notifications</h2>
            <p class="card-lead">Choose how we update you on parcels and shipments.</p>
            <label class="toggle">
              <input
                type="checkbox"
                [checked]="o.notifications.email"
                (change)="saveNotify('email', $event)"
              />
              <span>Email updates</span>
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                [checked]="o.notifications.sms"
                (change)="saveNotify('sms', $event)"
              />
              <span>SMS updates</span>
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                [checked]="o.notifications.whatsApp"
                (change)="saveNotify('whatsApp', $event)"
              />
              <span>WhatsApp updates</span>
            </label>
            @if (notifyError()) {
              <p class="err sm" role="alert">{{ notifyError() }}</p>
            }
          </section>

          @if (o.recentTicket; as ticket) {
            <section class="bb-card bb-card-pad ticket-summary">
              <h2 class="bb-card-title">Latest ticket</h2>
              <span class="bb-badge bb-badge-danger">{{ formatTicketStatus(ticket.status) }}</span>
              <p class="ticket-id">#{{ ticket.displayId }} · {{ ticket.createdAtUtc | date:'d MMM y' }}</p>
              <p class="ticket-subject">{{ ticket.subject }}</p>
              <p class="snippet">{{ ticket.snippet }}</p>
            </section>
          }

          <section class="bb-card bb-card-pad help-card">
            <h2 class="bb-card-title">Quick links</h2>
            <nav class="quick-links">
              <a routerLink="/received-parcels" class="quick-link">
                <span class="material-icons-outlined">inventory_2</span>
                Received parcels
              </a>
              <a routerLink="/quotes/list" class="quick-link">
                <span class="material-icons-outlined">request_quote</span>
                My quotes
              </a>
              <a routerLink="/my-address" class="quick-link">
                <span class="material-icons-outlined">place</span>
                Delivery address
              </a>
            </nav>
          </section>
        </aside>
      </div>
    }
  `,
  styles: `
    .loading { color: var(--bb-muted); font-size: 0.9rem; padding: 1rem 0; }
    .err-card { max-width: 28rem; }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 1.15rem;
      align-items: start;
    }
    @media (max-width: 1000px) {
      .layout { grid-template-columns: 1fr; }
    }
    .main { display: flex; flex-direction: column; gap: 1.15rem; }
    .side { display: flex; flex-direction: column; gap: 1.15rem; }
    .track-dashboard-link {
      margin-top: 1rem;
      width: 100%;
      justify-content: center;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .card-lead {
      margin: 0 0 0.85rem;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .journey {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      margin: 0.5rem 0 1rem;
      flex-wrap: wrap;
    }
    .loc { display: flex; gap: 0.55rem; align-items: center; font-size: 0.88rem; }
    .flag { font-size: 1.45rem; line-height: 1; }
    .loc small { display: block; color: var(--bb-muted); font-size: 0.72rem; }
    .plane { color: var(--bb-primary); font-size: 1.75rem !important; }
    .meta-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem 1.25rem;
      margin: 0;
      padding-top: 0.75rem;
      border-top: 1px solid var(--bb-border);
    }
    .meta-row > div { min-width: 0; }
    .meta-row dt { margin: 0; font-size: 0.72rem; color: var(--bb-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .meta-row dd { margin: 0.2rem 0 0; font-weight: 600; font-size: 0.88rem; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; }
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline li {
      display: flex;
      gap: 0.75rem;
      padding: 0.7rem 0 0.7rem 1rem;
      border-left: 2px solid #e2e8f0;
      margin-left: 5px;
    }
    .timeline li.done { border-color: var(--bb-success); }
    .timeline li.current { border-color: var(--bb-primary); }
    .timeline .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #cbd5e1;
      margin-left: -1.3rem;
      margin-top: 0.35rem;
      flex-shrink: 0;
    }
    .timeline li.done .dot { background: var(--bb-success); }
    .timeline li.current .dot { background: var(--bb-primary); box-shadow: 0 0 0 3px var(--bb-primary-soft); }
    .timeline time { display: block; font-size: 0.72rem; color: var(--bb-muted); font-weight: 400; margin-top: 0.15rem; }
    .kv > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.4rem 0;
      font-size: 0.82rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .kv dt { color: var(--bb-muted); margin: 0; flex-shrink: 0; }
    .kv dd { margin: 0; font-weight: 600; text-align: right; }
    .empty-ship { text-align: center; padding: 2rem 1.5rem; }
    .empty-icon { font-size: 2.5rem !important; color: var(--bb-primary); opacity: 0.85; }
    .empty-ship p { color: var(--bb-muted); font-size: 0.88rem; max-width: 26rem; margin: 0 auto 1.25rem; line-height: 1.5; }
    .empty-actions { display: flex; gap: 0.65rem; justify-content: center; flex-wrap: wrap; }
    .field-label { display: block; font-size: 0.78rem; font-weight: 600; color: var(--bb-muted); margin-bottom: 0.25rem; }
    .field {
      width: 100%;
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      margin-bottom: 0.75rem;
      font-size: 0.85rem;
      font-family: inherit;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0.45rem 0;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .ticket-id { font-size: 0.78rem; color: var(--bb-muted); margin: 0.35rem 0; }
    .ticket-subject { font-weight: 600; font-size: 0.9rem; margin: 0 0 0.35rem; }
    .snippet { font-size: 0.82rem; color: var(--bb-muted); margin: 0; line-height: 1.45; }
    .quick-links { display: flex; flex-direction: column; gap: 0.35rem; }
    .quick-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--bb-primary);
      text-decoration: none;
    }
    .quick-link:hover { text-decoration: underline; }
    .quick-link .material-icons-outlined { font-size: 1.15rem; }
    .bb-badge-in-transit { background: var(--bb-primary-soft); color: var(--bb-primary-deep); }
    .bb-badge-delivered { background: var(--bb-success-soft); color: #15803d; }
    .bb-badge-pending { background: var(--bb-warning-soft); color: #b45309; }
    .err { color: var(--bb-danger); font-size: 0.85rem; }
    .err.sm { font-size: 0.78rem; margin-top: 0.35rem; }
    .success { margin-top: 0.65rem; font-size: 0.85rem; color: #15803d; }
  `,
})
export class TrackingSupportComponent implements OnInit {
  private readonly api = inject(BorderboxApiService);
  private readonly accountApi = inject(CustomerAccountService);

  readonly overview = signal<TrackingSupportOverviewDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly notifyError = signal<string | null>(null);
  readonly ticketSubject = signal('');
  readonly ticketBody = signal('');
  readonly ticketSubmitting = signal(false);
  readonly ticketError = signal<string | null>(null);
  readonly ticketSuccess = signal<string | null>(null);

  ngOnInit(): void {
    this.accountApi.ensureAccountLoaded().subscribe({ error: () => {} });
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.getTrackingSupport().subscribe({
      next: (o) => {
        this.overview.set(o);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load tracking & support. Check your connection and try again.');
      },
    });
  }

  statusBadgeClass(ship: ShipmentTrackingDto): string {
    if (ship.status === 'InTransit') return 'bb-badge bb-badge-in-transit';
    if (ship.status === 'Delivered') return 'bb-badge bb-badge-delivered';
    return 'bb-badge bb-badge-pending';
  }

  formatTicketStatus(status: string): string {
    return status.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  saveNotify(key: 'email' | 'sms' | 'whatsApp', event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    const o = this.overview();
    const acc = this.accountApi.account();
    if (!o || !acc) {
      this.notifyError.set('Account not loaded yet. Refresh the page.');
      return;
    }

    const prefs = {
      ...acc.notifications,
      [key]: on,
      marketing: acc.notifications.marketing,
    };

    this.notifyError.set(null);
    this.accountApi.saveNotifications(prefs).subscribe({
      next: () => {
        this.overview.set({
          ...o,
          notifications: {
            email: prefs.email,
            sms: prefs.sms,
            whatsApp: prefs.whatsApp,
          },
        });
      },
      error: () => this.notifyError.set('Could not save preferences.'),
    });
  }

  submitTicket(): void {
    const subject = this.ticketSubject().trim();
    const body = this.ticketBody().trim();
    if (!subject || !body) {
      this.ticketError.set('Subject and message are required.');
      return;
    }

    this.ticketSubmitting.set(true);
    this.ticketError.set(null);
    this.ticketSuccess.set(null);
    this.api.createSupportTicket(subject, body).subscribe({
      next: (ticket) => {
        const o = this.overview();
        if (o) {
          this.overview.set({ ...o, recentTicket: ticket });
        }
        this.ticketSubject.set('');
        this.ticketBody.set('');
        this.ticketSubmitting.set(false);
        this.ticketSuccess.set(
          'Ticket submitted. Our team has been notified on WhatsApp when configured.',
        );
      },
      error: () => {
        this.ticketSubmitting.set(false);
        this.ticketError.set('Could not submit ticket. Try again in a moment.');
      },
    });
  }
}
