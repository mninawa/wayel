import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MOCK_SUITE, getParcelById } from '../../data/borderbox-mock.data';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-parcel-details',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (parcel(); as p) {
      <a routerLink="/received-parcels" class="back">← Back to Parcels</a>
      <div class="head-row">
        <div>
          <h1>Parcel Details <span class="bb-badge bb-badge-warning">{{ p.status }}</span></h1>
          <p class="id">Parcel ID: {{ p.id }} <button type="button" class="copy" aria-label="Copy">📋</button></p>
        </div>
        <button type="button" class="bb-btn bb-btn-ghost">More Actions ▾</button>
      </div>

      <app-suite-expired-banner />

      <div class="grid">
        <section class="bb-card bb-card-pad span2">
          <h2 class="bb-card-title">Parcel Information</h2>
          <dl class="kv">
            <div><dt>Status</dt><dd><span class="bb-badge bb-badge-warning">{{ p.status }}</span></dd></div>
            <div><dt>Weight</dt><dd>{{ p.weight }}</dd></div>
            <div><dt>Dimensions</dt><dd>{{ p.dimensions }}</dd></div>
            <div><dt>Declared Value</dt><dd>R{{ p.declaredValue | number }}</dd></div>
            <div><dt>Received On</dt><dd>{{ p.receivedOn }}</dd></div>
            <div><dt>Stored At</dt><dd>Suite {{ suite.number }}</dd></div>
            <div><dt>Days in Warehouse</dt><dd>{{ p.daysInWarehouse }} days</dd></div>
            <div><dt>Tracking</dt><dd class="mono">{{ p.tracking }}</dd></div>
          </dl>
          <a routerLink="/received-parcels" class="bb-link">View full parcel activity →</a>
        </section>

        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Uploaded Invoice</h2>
          <div class="invoice">
            <span class="material-icons-outlined">picture_as_pdf</span>
            <div>
              <strong>{{ p.retailer }} Invoice</strong>
              <span>Uploaded {{ p.receivedOn }}</span>
            </div>
          </div>
          <a href="#" class="bb-link">View / Download →</a>
        </section>

        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Parcel Photos &amp; Contents</h2>
          <div class="photos">
            <div class="ph">📦</div><div class="ph">👟</div><div class="ph">📷</div>
          </div>
          <p><strong>1 × {{ p.item }}</strong></p>
          <p class="muted">{{ p.category }}</p>
        </section>

        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Quick Summary</h2>
          <dl class="kv sm">
            <div><dt>Shipping</dt><dd>Courier Door-to-Door</dd></div>
            <div><dt>Destination</dt><dd>Eswatini</dd></div>
            <div><dt>Ship-Out</dt><dd class="danger">N/A (expired)</dd></div>
          </dl>
          <p class="ok-note">✓ Parcel is ready — renew suite to ship.</p>
        </section>

        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Customs Checklist</h2>
          <ul class="check">
            <li class="done">Invoice uploaded</li>
            <li class="done">Proof of payment</li>
            <li class="done">ID on file</li>
            <li>Customs declaration — Not required</li>
          </ul>
        </section>

        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Parcel Timeline</h2>
          <ul class="timeline">
            <li class="done">Parcel Received</li>
            <li class="done">Quality Check Completed</li>
            <li class="done">Photos Taken</li>
            <li class="done">Ready to Ship</li>
            <li class="pending">Ship-Out — Pending (suite expired)</li>
          </ul>
        </section>

        <section class="bb-card bb-card-pad highlight">
          <h2 class="bb-card-title">Important</h2>
          <p>Ship-out disabled while suite access is expired.</p>
          <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew Suite Access →</a>
        </section>
      </div>

      <footer class="action-bar bb-card bb-card-pad">
        <span>Need Help? <a routerLink="/tracking-support" class="bb-link">Contact Support</a></span>
        <div class="actions">
          <button type="button" class="bb-btn bb-btn-ghost" disabled>🔒 Request Ship Out</button>
          <button type="button" class="bb-btn bb-btn-ghost" disabled>🔒 Add to Consolidation</button>
          <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew Suite Access</a>
        </div>
      </footer>
    }
  `,
  styles: `
    .back { display: inline-block; margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--bb-primary); text-decoration: none; font-weight: 600; }
    .head-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
    .head-row h1 { margin: 0; font-size: 1.35rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .id { margin: 0.35rem 0 0; font-size: 0.85rem; color: var(--bb-muted); }
    .copy { border: none; background: none; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
    .span2 { grid-column: span 2; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: span 1; } }
    .kv > div { display: grid; grid-template-columns: 140px 1fr; padding: 0.4rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; }
    .kv dt { color: var(--bb-muted); margin: 0; }
    .kv dd { margin: 0; font-weight: 600; }
    .kv .danger { color: var(--bb-danger); }
    .kv .mono { font-family: ui-monospace, monospace; font-size: 0.82rem; }
    .invoice { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; }
    .invoice span { display: block; font-size: 0.78rem; color: var(--bb-muted); }
    .photos { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
    .ph { width: 64px; height: 64px; background: #f1f5f9; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
    .muted { color: var(--bb-muted); font-size: 0.82rem; }
    .ok-note { margin: 0.75rem 0 0; font-size: 0.82rem; color: var(--bb-success); font-weight: 600; }
    .check { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
    .check li { padding: 0.35rem 0; }
    .check .done { color: var(--bb-success); }
    .timeline { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
    .timeline li { padding: 0.4rem 0; padding-left: 1rem; border-left: 2px solid #e2e8f0; }
    .timeline .done { border-color: var(--bb-success); color: var(--bb-success); }
    .timeline .pending { color: var(--bb-danger); }
    .highlight { background: var(--bb-primary-soft); border-color: #bfdbfe; }
    .action-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  `,
})
export class ParcelDetailsComponent {
  private readonly route = inject(ActivatedRoute);
  readonly suite = MOCK_SUITE;

  parcel = () => getParcelById(this.route.snapshot.paramMap.get('id') ?? '');
}
