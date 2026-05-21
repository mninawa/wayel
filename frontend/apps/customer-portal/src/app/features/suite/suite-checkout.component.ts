import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MOCK_SUITE } from '../../data/borderbox-mock.data';
import { environment } from '../../../environments/environment';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';

@Component({
  selector: 'app-suite-checkout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-page-head">
      <h1><span class="material-icons-outlined">verified_user</span> Renew Suite Access</h1>
      <p>Choose a plan and payment method to unlock ship-out.</p>
    </div>

    <div class="info bb-card bb-card-pad">
      <span class="material-icons-outlined">info</span>
      Ship-out unlocks immediately after successful payment. Your suite address stays reserved.
    </div>

    <div class="checkout-grid">
      <div class="main-col">
        <section class="bb-card bb-card-pad">
          <h2 class="step">Step 1 — Choose a Plan</h2>
          <label class="plan-card" [class.selected]="plan() === 'quarterly'">
            <input type="radio" name="plan" value="quarterly" [checked]="plan() === 'quarterly'" (change)="plan.set('quarterly')" />
            <div>
              <span class="bb-badge bb-badge-success">Recommended</span>
              <strong>Quarterly</strong>
              <span>R200 / 3 months · Paid upfront</span>
            </div>
          </label>
          <label class="plan-card" [class.selected]="plan() === 'monthly'">
            <input type="radio" name="plan" value="monthly" [checked]="plan() === 'monthly'" (change)="plan.set('monthly')" />
            <div>
              <strong>Monthly</strong>
              <span>R100 / 1 month · Paid upfront</span>
            </div>
          </label>
        </section>

        <section class="bb-card bb-card-pad">
          <h2 class="step">Step 2 — Choose Payment Method</h2>
          <label class="pay-card selected">
            <input type="radio" name="pay" checked />
            <div>
              <strong>Card Payment</strong>
              <span>Visa · Mastercard · Apple Pay</span>
            </div>
          </label>
          <label class="pay-card">
            <input type="radio" name="pay" />
            <div>
              <strong>EFT / Bank Transfer</strong>
              <span>Manual verification required</span>
            </div>
          </label>
          <p class="trust">🔒 Secure &amp; Encrypted · PCI DSS · SSL Secure</p>
        </section>

        <button type="button" class="bb-btn bb-btn-primary pay-btn" (click)="pay()" [disabled]="busy()">
          <span class="material-icons-outlined">lock</span>
          Pay R{{ amount() }} Securely
        </button>
      </div>

      <aside class="bb-card bb-card-pad summary">
        <h2 class="bb-card-title">Order Summary</h2>
        <dl class="kv">
          <div><dt>Suite Number</dt><dd>{{ suite.number }}</dd></div>
          <div><dt>Plan</dt><dd>{{ planLabel() }}</dd></div>
          <div><dt>Billing Period</dt><dd>{{ plan() === 'quarterly' ? '3 Months' : '1 Month' }}</dd></div>
        </dl>
        <div class="due">
          <span>Amount Due</span>
          <strong>R{{ amount() }}.00</strong>
        </div>
        <dl class="kv dates">
          <div><dt>Start Date</dt><dd>20 May 2026</dd></div>
          <div><dt>Expiry Date</dt><dd>{{ expiry() }}</dd></div>
        </dl>
        <div class="note-box">Ship-out unlocks after payment is confirmed.</div>
        <div class="reserved">🛡️ Your Suite is Reserved</div>
        <p class="help">Need help? <a href="#" class="bb-link">Help Center</a> or Live Chat</p>
      </aside>
    </div>
  `,
  styles: `
    .bb-page-head h1 { display: flex; align-items: center; gap: 0.4rem; }
    .info {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      margin-bottom: 1.25rem;
      background: var(--bb-primary-soft);
      border-color: #bfdbfe;
      font-size: 0.85rem;
      color: var(--bb-primary);
    }
    .checkout-grid { display: grid; grid-template-columns: 1fr 320px; gap: 1.25rem; align-items: start; }
    @media (max-width: 900px) { .checkout-grid { grid-template-columns: 1fr; } }
    .step { margin: 0 0 1rem; font-size: 0.95rem; font-weight: 700; }
    .plan-card, .pay-card {
      display: flex;
      gap: 0.75rem;
      padding: 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      margin-bottom: 0.65rem;
      cursor: pointer;
    }
    .plan-card.selected, .pay-card.selected { border-color: var(--bb-primary); background: var(--bb-primary-soft); }
    .plan-card div, .pay-card div { flex: 1; }
    .plan-card strong, .pay-card strong { display: block; }
    .plan-card span, .pay-card span { font-size: 0.78rem; color: var(--bb-muted); }
    .trust { font-size: 0.75rem; color: var(--bb-muted); margin: 0.5rem 0 0; }
    .pay-btn { width: 100%; padding: 0.85rem; font-size: 1rem; margin-top: 0.5rem; }
    .summary { position: sticky; top: 1rem; }
    .kv > div { display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 0.85rem; }
    .kv dt { color: var(--bb-muted); margin: 0; }
    .kv dd { margin: 0; font-weight: 600; }
    .due {
      margin: 1rem 0;
      padding: 0.85rem 0;
      border-top: 1px solid var(--bb-border);
      border-bottom: 1px solid var(--bb-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .due strong { font-size: 1.35rem; color: var(--bb-primary); }
    .note-box {
      padding: 0.65rem;
      background: var(--bb-primary-soft);
      border-radius: var(--bb-radius-sm);
      font-size: 0.78rem;
      color: var(--bb-primary);
      margin-bottom: 0.65rem;
    }
    .reserved {
      padding: 0.65rem;
      background: var(--bb-success-soft);
      border: 1px solid #bbf7d0;
      border-radius: var(--bb-radius-sm);
      font-size: 0.82rem;
      font-weight: 600;
      color: #15803d;
      margin-bottom: 0.75rem;
    }
    .help { font-size: 0.78rem; color: var(--bb-muted); margin: 0; }
  `,
})
export class SuiteCheckoutComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly borderboxApi = inject(BorderboxApiService);
  readonly suite = MOCK_SUITE;
  readonly plan = signal<'quarterly' | 'monthly'>('quarterly');
  readonly resolvedPlanId = signal<string | null>(null);
  readonly busy = signal(false);

  amount = () => (this.plan() === 'quarterly' ? 200 : 100);
  planLabel = () => (this.plan() === 'quarterly' ? 'Quarterly' : 'Monthly');
  expiry = () => (this.plan() === 'quarterly' ? '20 Aug 2026' : '20 Jun 2026');

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('plan');
    if (q === 'monthly' || q === 'quarterly') {
      this.plan.set(q);
    }
    if (!this.accountApi.account()) {
      this.accountApi.loadAccount().subscribe();
    }
    this.resolvePlanId();
  }

  private resolvePlanId(): void {
    if (environment.useMock) {
      this.resolvedPlanId.set(this.plan() === 'quarterly' ? 'plan_quarterly' : 'plan_monthly');
      return;
    }
    this.borderboxApi.listSuitePlans().subscribe({
      next: (plans) => {
        const months = this.plan() === 'quarterly' ? 3 : 1;
        const match = plans.find((p) => p.durationMonths === months);
        this.resolvedPlanId.set(match?.id ?? null);
      },
    });
  }

  pay(): void {
    const planId =
      this.resolvedPlanId() ??
      (this.plan() === 'quarterly' ? 'plan_quarterly' : 'plan_monthly');
    if (!planId) return;
    this.busy.set(true);
    this.accountApi.activateFirstSuite(planId).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.busy.set(false);
      },
    });
  }
}
