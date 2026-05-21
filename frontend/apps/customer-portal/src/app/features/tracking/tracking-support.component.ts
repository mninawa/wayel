import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  MOCK_SHIPMENT_TIMELINE,
  MOCK_SUITE,
  MOCK_TICKET,
  MOCK_TRACKING,
} from '../../data/borderbox-mock.data';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-tracking-support',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-page-head">
      <h1>Tracking &amp; Support</h1>
      <p>Track your shipments in real-time and get support when you need it.</p>
    </div>

    <app-suite-expired-banner />

    <div class="grid">
      <section class="bb-card bb-card-pad span2">
        <div class="card-head">
          <h2 class="bb-card-title">Shipment Journey</h2>
          <span class="bb-badge bb-badge-success">{{ tracking.status }}</span>
        </div>
        <div class="journey">
          <div class="loc"><span>🇿🇦</span><div><strong>Midrand, Gauteng</strong><small>South Africa</small></div></div>
          <span class="material-icons-outlined plane">flight</span>
          <div class="loc"><span>🇸🇿</span><div><strong>Manzini</strong><small>Eswatini</small></div></div>
        </div>
        <p><strong>Estimated Delivery:</strong> {{ tracking.estimatedDelivery }}</p>
        <p class="track-num">Tracking: <strong>{{ tracking.trackingNumber }}</strong> <button type="button" class="copy">📋</button></p>
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Notification Preferences</h2>
        <label class="toggle"><input type="checkbox" checked /> Email updates</label>
        <label class="toggle"><input type="checkbox" checked /> SMS updates</label>
        <label class="toggle"><input type="checkbox" /> WhatsApp updates</label>
        <button type="button" class="bb-btn bb-btn-outline">Manage Preferences</button>
      </section>

      <section class="bb-card bb-card-pad span2">
        <h2 class="bb-card-title">Tracking Timeline</h2>
        <ul class="timeline">
          @for (t of timeline; track t.label) {
            <li [class.done]="t.done" [class.current]="t.current">
              <span class="dot"></span>
              <div>
                <strong>{{ t.label }}</strong>
                <span>19 Aug 2026 · 14:30</span>
              </div>
            </li>
          }
        </ul>
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Shipment Details</h2>
        <dl class="kv">
          <div><dt>Tracking</dt><dd>{{ tracking.trackingNumber }}</dd></div>
          <div><dt>Reference</dt><dd>{{ tracking.reference }}</dd></div>
          <div><dt>Order</dt><dd>{{ tracking.orderNumber }}</dd></div>
          <div><dt>Service</dt><dd>{{ tracking.service }}</dd></div>
          <div><dt>Weight</dt><dd>{{ tracking.weight }}</dd></div>
          <div><dt>From</dt><dd>{{ tracking.from }}</dd></div>
          <div><dt>To</dt><dd>{{ tracking.to }}</dd></div>
        </dl>
        <a href="#" class="bb-link">View Full Shipment Details ↗</a>
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Recent Support Ticket</h2>
        <span class="bb-badge bb-badge-danger">{{ ticket.status }}</span>
        <p class="ticket-id">#{{ ticket.id }} · {{ ticket.date }}</p>
        <p><strong>{{ ticket.subject }}</strong></p>
        <p class="snippet">{{ ticket.snippet }}</p>
        <button type="button" class="bb-btn bb-btn-outline">View Ticket</button>
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Help &amp; Support</h2>
        <p>Our team is ready to assist you.</p>
        <div class="help-btns">
          <button type="button" class="bb-btn bb-btn-outline">Live Chat</button>
          <button type="button" class="bb-btn bb-btn-outline">WhatsApp</button>
        </div>
        <a routerLink="/tracking-support" class="bb-link">Visit Help Center →</a>
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Popular FAQs</h2>
        <ul class="faqs">
          <li>How long does delivery take to Eswatini? ›</li>
          <li>How do I upload an invoice? ›</li>
          <li>What happens when suite access expires? ›</li>
        </ul>
        <a href="#" class="bb-link">View all FAQs →</a>
      </section>

      <section class="bb-card bb-card-pad renew-card">
        <h2 class="bb-card-title">Keep your suite active</h2>
        <p>Renew for uninterrupted ship-out and member benefits.</p>
        <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">{{ suite.renewMonthly.label }}</a>
      </section>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.15rem; }
    .span2 { grid-column: span 2; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: span 1; } }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .journey { display: flex; align-items: center; gap: 1.5rem; margin: 1rem 0; }
    .loc { display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; }
    .loc span:first-child { font-size: 1.5rem; }
    .loc small { display: block; color: var(--bb-muted); font-size: 0.72rem; }
    .plane { color: var(--bb-primary); font-size: 28px !important; }
    .track-num { font-size: 0.88rem; color: var(--bb-muted); }
    .track-num strong { color: var(--bb-primary); font-family: ui-monospace, monospace; }
    .copy { border: none; background: none; }
    .toggle { display: block; margin: 0.5rem 0; font-size: 0.85rem; }
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline li { display: flex; gap: 0.75rem; padding: 0.65rem 0; border-left: 2px solid #e2e8f0; margin-left: 6px; padding-left: 1rem; }
    .timeline li.done { border-color: var(--bb-success); }
    .timeline li.current { border-color: var(--bb-primary); }
    .timeline .dot { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; margin-left: -1.35rem; flex-shrink: 0; }
    .timeline li.done .dot { background: var(--bb-success); }
    .timeline li.current .dot { background: var(--bb-primary); }
    .timeline span { display: block; font-size: 0.72rem; color: var(--bb-muted); font-weight: 400; }
    .kv > div { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.82rem; border-bottom: 1px solid #f1f5f9; }
    .kv dt { color: var(--bb-muted); margin: 0; }
    .kv dd { margin: 0; font-weight: 600; }
    .ticket-id { font-size: 0.78rem; color: var(--bb-muted); }
    .snippet { font-size: 0.82rem; color: var(--bb-muted); }
    .help-btns { display: flex; gap: 0.5rem; margin: 0.75rem 0; }
    .faqs { list-style: none; margin: 0 0 0.75rem; padding: 0; font-size: 0.85rem; }
    .faqs li { padding: 0.45rem 0; border-bottom: 1px solid #f1f5f9; color: var(--bb-text); }
    .renew-card { background: var(--bb-success-soft); border-color: #bbf7d0; }
  `,
})
export class TrackingSupportComponent {
  readonly tracking = MOCK_TRACKING;
  readonly timeline = MOCK_SHIPMENT_TIMELINE;
  readonly ticket = MOCK_TICKET;
  readonly suite = MOCK_SUITE;
}
