import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MOCK_QUOTE, MOCK_SUITE } from '../../data/borderbox-mock.data';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-shipping-quote',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="crumb"><a routerLink="/dashboard">Quotes</a> › {{ quote.id }}</nav>
    <div class="head-row">
      <h1>Shipping Quote <span class="material-icons-outlined">description</span></h1>
      <div class="head-actions">
        <button type="button" class="bb-btn bb-btn-outline">Download PDF</button>
        <button type="button" class="bb-btn bb-btn-outline">Share Quote</button>
        <button type="button" class="bb-btn bb-btn-ghost">⋯ More</button>
      </div>
    </div>

    <app-suite-expired-banner />

    <div class="grid">
      <div class="col-left">
        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Quote Summary</h2>
          <dl class="kv">
            <div><dt>Quote Number</dt><dd>{{ quote.id }}</dd></div>
            <div><dt>Created</dt><dd>{{ quote.created }}</dd></div>
            <div><dt>Valid Until</dt><dd class="green">{{ quote.validUntil }}</dd></div>
            <div><dt>Ship To</dt><dd>{{ quote.shipTo }}</dd></div>
            <div><dt>Est. Delivery</dt><dd>{{ quote.deliveryEstimate }}</dd></div>
          </dl>
          <div class="total-box">
            <span>Total Landed Cost</span>
            <strong>R{{ quote.total | number:'1.2-2' }}</strong>
            <small>✓ All duties &amp; taxes included</small>
          </div>
        </section>

        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Optional Protection</h2>
          <label><input type="radio" name="prot" checked /> No Protection</label>
          <label><input type="radio" name="prot" /> Add Protection — 2% of declared value</label>
          <p class="muted">Declared Value: R4,140.00 <a href="#" class="bb-link">Edit</a></p>
        </section>
      </div>

      <section class="bb-card bb-card-pad col-mid">
        <div class="card-head">
          <h2 class="bb-card-title">Landed Cost Breakdown</h2>
          <select><option>ZAR</option></select>
        </div>
        <ul class="breakdown">
          @for (line of quote.breakdown; track line.label) {
            <li>
              <span>{{ line.label }}</span>
              <span>R{{ line.amount | number }}</span>
            </li>
          }
        </ul>
        <div class="total-line">
          <span>Total Landed Cost</span>
          <strong class="green">R{{ quote.total | number:'1.2-2' }}</strong>
        </div>
        <p class="info-box">Costs are estimates; final customs amounts may vary slightly.</p>
      </section>

      <section class="bb-card bb-card-pad col-right">
        <h2 class="bb-card-title">Shipment Breakdown</h2>
        <dl class="kv sm">
          <div><dt>Parcels</dt><dd>{{ quote.parcels }}</dd></div>
          <div><dt>Total Weight</dt><dd>{{ quote.weightKg }} kg</dd></div>
          <div><dt>Method</dt><dd>{{ quote.method }}</dd></div>
          <div><dt>Consolidation</dt><dd>{{ quote.consolidation }}</dd></div>
          <div><dt>Warehouse</dt><dd>{{ quote.warehouse }}</dd></div>
          <div><dt>Ship-Out</dt><dd class="danger">🔒 Locked (Suite Expired)</dd></div>
        </dl>
        <h3 class="sub">Tracking Timeline</h3>
        <ul class="timeline">
          <li class="done">Received in South Africa</li>
          <li class="current">In Transit to Eswatini</li>
          <li>Arrived in Eswatini</li>
          <li>Out for Delivery</li>
        </ul>
      </section>
    </div>

    <footer class="sticky-bar bb-card bb-card-pad">
      <span class="material-icons-outlined">lock</span>
      <span>Renew your suite access to approve this quote and proceed with ship-out.</span>
      <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew Suite to Approve</a>
    </footer>
  `,
  styles: `
    .crumb { font-size: 0.82rem; margin-bottom: 0.75rem; }
    .crumb a { color: var(--bb-primary); text-decoration: none; font-weight: 600; }
    .head-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
    .head-row h1 { margin: 0; font-size: 1.35rem; display: flex; align-items: center; gap: 0.35rem; }
    .head-actions { display: flex; gap: 0.5rem; }
    .grid { display: grid; grid-template-columns: 1fr 1.1fr 0.9fr; gap: 1rem; margin-bottom: 5rem; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .kv > div { display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; }
    .kv dt { color: var(--bb-muted); margin: 0; }
    .kv dd { margin: 0; font-weight: 600; }
    .kv .green { color: var(--bb-success); }
    .kv .danger { color: var(--bb-danger); }
    .total-box {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--bb-success-soft);
      border-radius: var(--bb-radius-sm);
      text-align: center;
    }
    .total-box strong { display: block; font-size: 1.75rem; color: #15803d; }
    .total-box small { font-size: 0.78rem; color: var(--bb-success); }
    .breakdown { list-style: none; margin: 0; padding: 0; }
    .breakdown li { display: flex; justify-content: space-between; padding: 0.45rem 0; font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; }
    .total-line { display: flex; justify-content: space-between; padding: 0.75rem 0; font-weight: 700; }
    .green { color: #15803d; }
    .info-box { font-size: 0.78rem; padding: 0.65rem; background: var(--bb-primary-soft); border-radius: var(--bb-radius-sm); color: var(--bb-primary); margin: 0; }
    .card-head { display: flex; justify-content: space-between; align-items: center; }
    .sub { font-size: 0.82rem; font-weight: 700; margin: 1rem 0 0.5rem; color: var(--bb-muted); }
    .timeline { list-style: none; margin: 0; padding: 0; font-size: 0.82rem; }
    .timeline li { padding: 0.35rem 0 0.35rem 1rem; border-left: 2px solid #e2e8f0; }
    .timeline .done { border-color: var(--bb-success); color: var(--bb-success); }
    .timeline .current { border-color: var(--bb-primary); color: var(--bb-primary); font-weight: 600; }
    .muted { font-size: 0.82rem; color: var(--bb-muted); }
    label { display: block; margin: 0.35rem 0; font-size: 0.85rem; }
    .sticky-bar {
      position: fixed;
      bottom: 0;
      left: var(--bb-sidebar-w);
      right: 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.06);
      z-index: 10;
    }
    .sticky-bar span:nth-child(2) { flex: 1; font-size: 0.85rem; color: var(--bb-muted); }
    @media (max-width: 760px) { .sticky-bar { left: 0; } }
  `,
})
export class ShippingQuoteComponent {
  private readonly route = inject(ActivatedRoute);
  readonly quote = MOCK_QUOTE;
  readonly suite = MOCK_SUITE;
}
