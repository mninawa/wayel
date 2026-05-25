import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PaystackCheckoutService } from '../../services/paystack-checkout.service';

@Component({
  selector: 'app-simulated-paystack-sheet',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (checkout.simulated(); as init) {
      <div class="backdrop" role="presentation" (click)="checkout.cancelSimulated()"></div>
      <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sim-paystack-title">
        <header class="sheet-head">
          <span class="paystack-mark">paystack</span>
          <button type="button" class="close" aria-label="Close" (click)="checkout.cancelSimulated()">
            <span class="material-icons-outlined">close</span>
          </button>
        </header>
        <div class="sheet-body">
          <p class="dev-tag">Local dev — Paystack not configured</p>
          <h2 id="sim-paystack-title">Complete payment</h2>
          <p class="amount">R{{ init.amountZar | number:'1.2-2' }}</p>
          <p class="hint">
            Add <code>PAYSTACK_SECRET_KEY</code> and <code>PAYSTACK_PUBLIC_KEY</code> to your
            <code>.env</code>, set <code>PAYSTACK_ALLOW_SIMULATED=false</code>, and restart the API
            to use real Paystack checkout.
          </p>
          <p class="ref">Reference: {{ init.reference }}</p>
        </div>
        <footer class="sheet-foot">
          <button type="button" class="bb-btn bb-btn-ghost" (click)="checkout.cancelSimulated()">
            Cancel
          </button>
          <button type="button" class="bb-btn bb-btn-primary pay-btn" (click)="checkout.confirmSimulated()">
            Pay R{{ init.amountZar | number:'1.2-2' }} (simulate)
          </button>
        </footer>
      </aside>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      z-index: 300;
    }
    .sheet {
      position: fixed;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      z-index: 310;
      width: min(420px, 100vw);
      background: #fff;
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -8px 40px rgba(15, 23, 42, 0.18);
      display: flex;
      flex-direction: column;
    }
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--bb-border);
    }
    .paystack-mark {
      font-weight: 800;
      font-size: 1.1rem;
      letter-spacing: -0.02em;
      color: #011b33;
      text-transform: lowercase;
    }
    .close {
      border: none;
      background: transparent;
      color: var(--bb-muted);
      cursor: pointer;
      padding: 0.25rem;
      line-height: 0;
    }
    .sheet-body {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .dev-tag {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #b45309;
    }
    .sheet-body h2 {
      margin: 0;
      font-size: 1.05rem;
    }
    .amount {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
      color: var(--bb-text);
    }
    .hint {
      margin: 0;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .hint code {
      font-size: 0.78rem;
      background: #f1f5f9;
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
    }
    .ref {
      margin: 0;
      font-size: 0.75rem;
      color: var(--bb-muted);
      font-family: ui-monospace, monospace;
    }
    .sheet-foot {
      display: flex;
      gap: 0.65rem;
      justify-content: flex-end;
      padding: 1rem 1.25rem 1.25rem;
      border-top: 1px solid var(--bb-border);
    }
    .pay-btn { flex: 1; justify-content: center; }
  `,
})
export class SimulatedPaystackSheetComponent {
  readonly checkout = inject(PaystackCheckoutService);
}
