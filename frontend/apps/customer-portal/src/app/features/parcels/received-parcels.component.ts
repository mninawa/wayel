import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MOCK_PARCELS, MOCK_SUITE, parcelSummaryFromMock } from '../../data/borderbox-mock.data';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-received-parcels',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head-row">
      <div class="bb-page-head">
        <h1>Received Parcels</h1>
        <p>Parcels received at your WeYell suite in South Africa.</p>
      </div>
      <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew Suite Access</a>
    </div>

    <app-suite-expired-banner />

    <div class="filters bb-card bb-card-pad">
      <select><option>All statuses</option></select>
      <select><option>All retailers</option></select>
      <select><option>Last 30 days</option></select>
      <input type="search" placeholder="Search by tracking, retailer, or item…" />
      <button type="button" class="bb-btn bb-btn-ghost"><span class="material-icons-outlined">tune</span> Filters</button>
    </div>

    <div class="layout">
      <section class="bb-card table-card">
        <table class="bb-table">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="Select all" /></th>
              <th>Tracking</th>
              <th>Retailer</th>
              <th>Item</th>
              <th>Received</th>
              <th>Weight</th>
              <th>Status</th>
              <th>Invoice</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of parcels; track p.id) {
              <tr>
                <td><input type="checkbox" /></td>
                <td><a [routerLink]="['/parcels', p.id]" class="track-link">{{ p.tracking }}</a></td>
                <td><span class="retailer">{{ p.retailer }}</span></td>
                <td>
                  <strong>{{ p.item }}</strong>
                  <span class="cat">{{ p.category }}</span>
                </td>
                <td>{{ p.receivedOn }}</td>
                <td>{{ p.weight }}</td>
                <td><span class="bb-pill" [class]="statusClass(p.status)">{{ p.status }}</span></td>
                <td>
                  @if (p.invoice === 'uploaded') {
                    <span class="material-icons-outlined ok">check_circle</span>
                  } @else {
                    <span class="material-icons-outlined pending">radio_button_unchecked</span>
                  }
                </td>
                <td><button type="button" class="more" aria-label="Actions">⋮</button></td>
              </tr>
            }
          </tbody>
        </table>
        <p class="table-foot">Receiving is active. Ship-outs are paused until suite renewal.</p>
      </section>

      <aside class="side">
        <section class="bb-card bb-card-pad">
          <h2 class="bb-card-title">Parcel Summary</h2>
          <ul class="summary">
            <li><span>Total Received</span><strong>{{ summary.total }}</strong></li>
            <li><span>Invoices Uploaded</span><strong>{{ summary.uploaded }}</strong></li>
            <li><span>Invoices Pending</span><strong>{{ summary.pending }}</strong></li>
            <li><span>Ready to Ship</span><strong>{{ summary.ready }}</strong></li>
            <li><span>In Transit</span><strong>{{ summary.inTransit }}</strong></li>
            <li><span>Delivered</span><strong>{{ summary.delivered }}</strong></li>
          </ul>
        </section>
        <section class="bb-card bb-card-pad warn-card">
          <span class="bb-badge bb-badge-danger">Expired</span>
          <p>Ship-out locked until renewal.</p>
          <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew Suite Access</a>
        </section>
        <section class="bb-card bb-card-pad help-card">
          <h2 class="bb-card-title">Need Help?</h2>
          <p>We're here every step of the way.</p>
          <a routerLink="/tracking-support" class="bb-link">Live Chat</a>
          <a routerLink="/tracking-support" class="bb-link">WhatsApp</a>
          <a routerLink="/tracking-support" class="bb-link">Visit Help Center →</a>
        </section>
      </aside>
    </div>

    <div class="quick-row">
      <article class="bb-card bb-card-pad">
        <span class="material-icons-outlined">cloud_upload</span>
        <h3>Upload Invoice</h3>
        <p>Upload invoices for received parcels.</p>
        <button type="button" class="bb-btn bb-btn-outline">Upload Invoice →</button>
      </article>
      <article class="bb-card bb-card-pad locked">
        <span class="material-icons-outlined">lock</span>
        <h3>Create Shipment Request</h3>
        <p>Locked until suite access is renewed.</p>
        <button type="button" class="bb-btn bb-btn-ghost" disabled>Locked — Renew to Continue</button>
      </article>
      <article class="bb-card bb-card-pad">
        <span class="material-icons-outlined">pin_drop</span>
        <h3>View My Address</h3>
        <p>Use your suite address when shopping.</p>
        <a routerLink="/my-address" class="bb-btn bb-btn-outline">View Address →</a>
      </article>
    </div>
  `,
  styles: `
    .head-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; gap: 1rem; flex-wrap: wrap; }
    .filters { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-bottom: 1.15rem; align-items: center; }
    .filters select, .filters input {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      font-size: 0.82rem;
    }
    .filters input { flex: 1; min-width: 200px; }
    .layout { display: grid; grid-template-columns: 1fr 280px; gap: 1.15rem; margin-bottom: 1.15rem; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
    .table-card { overflow: hidden; }
    .track-link { color: var(--bb-primary); font-weight: 600; text-decoration: none; font-family: ui-monospace, monospace; font-size: 0.8rem; }
    .retailer { font-weight: 600; }
    .cat { display: block; font-size: 0.72rem; color: var(--bb-muted); }
    .ok { color: var(--bb-success); font-size: 18px !important; }
    .pending { color: #cbd5e1; font-size: 18px !important; }
    .more { border: none; background: none; font-size: 1.1rem; color: var(--bb-muted); }
    .table-foot {
      margin: 0;
      padding: 0.75rem 1rem;
      background: var(--bb-primary-soft);
      font-size: 0.78rem;
      color: var(--bb-primary);
    }
    .summary { list-style: none; margin: 0; padding: 0; }
    .summary li { display: flex; justify-content: space-between; padding: 0.45rem 0; font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; }
    .warn-card { border-color: var(--bb-danger-border); background: var(--bb-danger-soft); }
    .warn-card p { font-size: 0.82rem; color: #991b1b; margin: 0.5rem 0 0.75rem; }
    .help-card .bb-link { display: block; margin-top: 0.35rem; }
    .quick-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    @media (max-width: 900px) { .quick-row { grid-template-columns: 1fr; } }
    .quick-row article { text-align: center; }
    .quick-row .material-icons-outlined { font-size: 32px !important; color: var(--bb-primary); margin-bottom: 0.5rem; }
    .quick-row h3 { margin: 0 0 0.35rem; font-size: 0.95rem; }
    .quick-row p { margin: 0 0 1rem; font-size: 0.8rem; color: var(--bb-muted); }
    .quick-row article.locked .material-icons-outlined { color: var(--bb-muted); }
    .bb-pill-ready { background: var(--bb-warning-soft); color: #b45309; }
    .bb-pill-received { background: var(--bb-success-soft); color: #15803d; }
  `,
})
export class ReceivedParcelsComponent {
  readonly parcels = MOCK_PARCELS;
  readonly suite = MOCK_SUITE;
  readonly summary = parcelSummaryFromMock();

  statusClass(s: string): string {
    return s.includes('Ready') ? 'bb-pill bb-pill-ready' : 'bb-pill bb-pill-received';
  }
}
