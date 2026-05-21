import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MOCK_PARCELS, MOCK_SUITE } from '../../data/borderbox-mock.data';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-create-shipment',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head-row">
      <div class="bb-page-head">
        <h1>Create Shipment / Consolidation Request</h1>
        <p>Combine your parcels and ship to Eswatini.</p>
      </div>
      <span class="bb-badge bb-badge-danger">Suite Access Expired</span>
    </div>

    <app-suite-expired-banner />

    <div class="steps">
      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Step 1 — Select Parcels</h2>
        <p class="meta">6 parcels selected · Est. weight <strong>12.4 kg</strong></p>
        <ul class="parcel-picks">
          @for (p of parcels; track p.id) {
            <li>
              <input type="checkbox" checked />
              <span class="mono">{{ p.tracking }}</span>
              <span>{{ p.item }}</span>
            </li>
          }
        </ul>
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Step 2 — Delivery Method</h2>
        <label class="radio-card selected">
          <input type="radio" name="method" checked />
          <div>
            <strong>Door-to-Door (Recommended)</strong>
            <span>R240.00</span>
          </div>
        </label>
        <label class="radio-card">
          <input type="radio" name="method" />
          <div>
            <strong>PUDO (Pick Up / Drop Off)</strong>
            <span>R180.00</span>
          </div>
        </label>
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">Step 3 — Delivery Address</h2>
        <select><option>Use saved address — Manzini, Eswatini</option></select>
        <div class="fields">
          <input placeholder="Full Name" value="Sabelo Dlamini" />
          <input placeholder="Phone" value="+268 76 123 4567" />
          <input placeholder="City / Town" value="Manzini" />
        </div>
      </section>

      <section class="bb-card bb-card-pad summary">
        <h2 class="bb-card-title">Step 4 — Shipment Summary</h2>
        <dl class="kv">
          <div><dt>Parcels</dt><dd>6</dd></div>
          <div><dt>Total weight</dt><dd>12.4 kg</dd></div>
          <div><dt>Delivery</dt><dd>Door-to-Door</dd></div>
          <div><dt>Est. delivery</dt><dd>4–6 working days</dd></div>
        </dl>
        <p class="total">R240.00</p>
        <button type="button" class="bb-btn bb-btn-primary" disabled>
          <span class="material-icons-outlined">lock</span> Continue to Payment
        </button>
        <p class="lock-note">Ship-out is locked. Renew your suite access to continue.</p>
      </section>
    </div>

    @if (showModal()) {
      <div class="modal-backdrop" (click)="showModal.set(false)">
        <div class="modal bb-card" (click)="$event.stopPropagation()">
          <span class="material-icons-outlined lock-icon">lock</span>
          <h2>Ship-out locked</h2>
          <p>Renew your suite access to continue.</p>
          <div class="modal-alert">
            Your suite {{ suite.number }} is reserved, but parcels cannot be couriered until paid.
          </div>
          <div class="plan-picks">
            <a routerLink="/suite-access/checkout" class="plan" (click)="showModal.set(false)">
              <strong>R100 / 1 Month</strong>
              <span>Best for short-term needs</span>
            </a>
            <a routerLink="/suite-access/checkout" class="plan popular" (click)="showModal.set(false)">
              <span class="badge">Most popular</span>
              <strong>R200 / 3 Months</strong>
              <span>Best value &amp; savings</span>
            </a>
          </div>
          <button type="button" class="bb-btn bb-btn-ghost" (click)="showModal.set(false)">Close</button>
        </div>
      </div>
    }

    <button type="button" class="open-modal bb-btn bb-btn-outline" (click)="showModal.set(true)">
      Preview renewal modal
    </button>
  `,
  styles: `
    .head-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
    .steps { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 900px) { .steps { grid-template-columns: 1fr; } }
    .summary { grid-column: 1 / -1; max-width: 400px; justify-self: end; }
    .meta { font-size: 0.85rem; color: var(--bb-muted); margin: 0 0 0.75rem; }
    .parcel-picks { list-style: none; margin: 0; padding: 0; max-height: 200px; overflow-y: auto; }
    .parcel-picks li { display: flex; gap: 0.65rem; align-items: center; padding: 0.4rem 0; font-size: 0.82rem; border-bottom: 1px solid #f1f5f9; }
    .mono { font-family: ui-monospace, monospace; color: var(--bb-primary); font-size: 0.78rem; }
    .radio-card {
      display: flex;
      gap: 0.65rem;
      padding: 0.85rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      margin-bottom: 0.5rem;
      cursor: pointer;
    }
    .radio-card.selected { border-color: var(--bb-primary); background: var(--bb-primary-soft); }
    .radio-card div { flex: 1; display: flex; justify-content: space-between; }
    select, .fields input {
      width: 100%;
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      margin-bottom: 0.5rem;
      font-size: 0.85rem;
    }
    .kv > div { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.85rem; }
    .total { font-size: 1.75rem; font-weight: 700; margin: 0.75rem 0; color: var(--bb-text); }
    .lock-note { font-size: 0.78rem; color: var(--bb-danger); margin: 0.5rem 0 0; }
    .open-modal { margin-top: 1rem; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }
    .modal {
      max-width: 480px;
      width: 100%;
      padding: 2rem;
      text-align: center;
    }
    .lock-icon { font-size: 48px !important; color: var(--bb-danger); }
    .modal h2 { margin: 0.5rem 0; }
    .modal-alert {
      background: var(--bb-danger-soft);
      padding: 0.75rem;
      border-radius: var(--bb-radius-sm);
      font-size: 0.85rem;
      color: #991b1b;
      margin: 1rem 0;
      text-align: left;
    }
    .plan-picks { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; text-align: left; }
    .plan {
      display: block;
      padding: 0.85rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      text-decoration: none;
      color: inherit;
      position: relative;
    }
    .plan.popular { border-color: var(--bb-primary); }
    .plan .badge {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      font-size: 0.65rem;
      background: var(--bb-primary);
      color: #fff;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-weight: 700;
    }
    .plan span { display: block; font-size: 0.78rem; color: var(--bb-muted); }
  `,
})
export class CreateShipmentComponent {
  readonly parcels = MOCK_PARCELS;
  readonly suite = MOCK_SUITE;
  readonly showModal = signal(false);
}
