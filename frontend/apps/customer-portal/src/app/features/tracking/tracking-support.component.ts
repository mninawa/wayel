import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  SupportContactDto,
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
      <h1>Support</h1>
      <p>Chat with us on WhatsApp, email our team, or open a ticket — we'll respond as fast as we can.</p>
    </div>

    <app-suite-expired-banner />

    @if (loading()) {
      <p class="loading" aria-live="polite">Loading support…</p>
    } @else if (loadError()) {
      <div class="bb-card bb-card-pad err-card">
        <p class="err">{{ loadError() }}</p>
        <button type="button" class="bb-btn bb-btn-outline" (click)="reload()">Try again</button>
      </div>
    } @else if (overview()) {
      @let o = overview()!;
      <div class="layout">
        <div class="main">
          <section class="bb-card bb-card-pad channels-card">
            <h2 class="bb-card-title">Talk to us</h2>
            <p class="card-lead">
              Pick the channel that works best — we'll keep the conversation in one place.
            </p>
            <div class="channels">
              @if (whatsAppLink(); as link) {
                <a
                  [href]="link"
                  target="_blank"
                  rel="noopener"
                  class="channel channel-whatsapp"
                >
                  <span class="channel-icon" aria-hidden="true">
                    <span class="material-icons-outlined">chat</span>
                  </span>
                  <span class="channel-body">
                    <strong>WhatsApp</strong>
                    <small>{{ whatsAppDisplay() ?? 'Chat with our team' }}</small>
                  </span>
                  <span class="material-icons-outlined channel-go" aria-hidden="true">arrow_forward</span>
                </a>
              } @else {
                <div class="channel channel-disabled" aria-disabled="true">
                  <span class="channel-icon" aria-hidden="true">
                    <span class="material-icons-outlined">chat</span>
                  </span>
                  <span class="channel-body">
                    <strong>WhatsApp</strong>
                    <small>Not configured yet — please use email or open a ticket below.</small>
                  </span>
                </div>
              }

              @if (emailLink(); as mailto) {
                <a [href]="mailto" class="channel channel-email">
                  <span class="channel-icon" aria-hidden="true">
                    <span class="material-icons-outlined">mail</span>
                  </span>
                  <span class="channel-body">
                    <strong>Email</strong>
                    <small>{{ o.support.emailAddress }}</small>
                  </span>
                  <span class="material-icons-outlined channel-go" aria-hidden="true">arrow_forward</span>
                </a>
              }
            </div>
          </section>

          <section class="bb-card bb-card-pad ticket-card">
            <h2 class="bb-card-title">Open a support ticket</h2>
            <p class="card-lead">
              Prefer to keep a paper trail? Send us a ticket — we'll reply by email and (when enabled)
              ping you on WhatsApp.
            </p>
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
              rows="5"
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
            <p class="card-lead">Choose how we reach you about parcels and shipments.</p>
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

          @if (o.activeShipmentId; as shipId) {
            <section class="bb-card bb-card-pad active-shipment-link">
              <h2 class="bb-card-title">Tracking your shipment?</h2>
              <p class="card-lead">
                Step-by-step status, ETA and pickup details have moved to the shipment page.
              </p>
              <a
                [routerLink]="['/shipments', shipId, 'track']"
                class="bb-btn bb-btn-outline track-btn"
              >
                Open shipment tracking
              </a>
            </section>
          }
        </aside>
      </div>
    }
  `,
  styles: `
    .loading { color: var(--bb-muted); font-size: 0.9rem; padding: 1rem 0; }
    .err-card { max-width: 28rem; }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 1.15rem;
      align-items: start;
    }
    @media (max-width: 1000px) {
      .layout { grid-template-columns: 1fr; }
    }
    .main { display: flex; flex-direction: column; gap: 1.15rem; }
    .side { display: flex; flex-direction: column; gap: 1.15rem; }
    .card-lead {
      margin: 0 0 0.85rem;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .channels { display: flex; flex-direction: column; gap: 0.65rem; }
    .channel {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      background: #fff;
      text-decoration: none;
      color: inherit;
      transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
    }
    .channel:hover:not(.channel-disabled) {
      border-color: var(--bb-primary);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
      transform: translateY(-1px);
    }
    .channel-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .channel-whatsapp .channel-icon {
      background: rgba(37, 211, 102, 0.12);
      color: #128c7e;
    }
    .channel-email .channel-icon {
      background: var(--bb-primary-soft);
      color: var(--bb-primary-deep);
    }
    .channel-disabled .channel-icon {
      background: #f1f5f9;
      color: #94a3b8;
    }
    .channel-icon .material-icons-outlined { font-size: 1.4rem !important; }
    .channel-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .channel-body strong { font-size: 0.95rem; }
    .channel-body small { font-size: 0.78rem; color: var(--bb-muted); margin-top: 0.15rem; }
    .channel-go {
      color: var(--bb-muted);
      font-size: 1.1rem !important;
      flex-shrink: 0;
    }
    .channel-disabled {
      background: #f8fafc;
      cursor: default;
    }
    .channel-disabled .channel-body small { color: var(--bb-muted); }
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
    .track-btn { width: 100%; justify-content: center; }
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

  readonly whatsAppLink = computed(() => this.overview()?.support.whatsAppLink ?? null);
  readonly whatsAppDisplay = computed(() => this.overview()?.support.whatsAppDisplay ?? null);
  readonly emailLink = computed(() => {
    const email = this.overview()?.support.emailAddress;
    if (!email) return null;
    return `mailto:${email}?subject=${encodeURIComponent('WeYell support')}`;
  });

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
        this.loadError.set('Could not load support. Check your connection and try again.');
      },
    });
  }

  formatTicketStatus(status: string): string {
    return status.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  saveNotify(key: 'email' | 'whatsApp', event: Event): void {
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
          "Ticket submitted. We'll reply by email and (when enabled) ping you on WhatsApp.",
        );
      },
      error: () => {
        this.ticketSubmitting.set(false);
        this.ticketError.set('Could not submit ticket. Try again in a moment.');
      },
    });
  }
}
