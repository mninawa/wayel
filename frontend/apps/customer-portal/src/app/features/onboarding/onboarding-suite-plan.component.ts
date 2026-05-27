import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  BorderboxApiService,
  type InitiateSuiteCheckoutDto,
  type SuitePlanDto,
} from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { PaystackCheckoutService } from '../../services/paystack-checkout.service';
import { WelcomeIntentService } from '../../services/welcome-intent.service';

type PlanChoice = 'monthly' | 'quarterly';

@Component({
  selector: 'app-onboarding-suite-plan',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="onboard">
      <aside class="sidebar">
        <a routerLink="/" class="brand">
          <span class="logo-icon">📦</span>
          <strong>WeYell</strong>
          <small>Shop in South Africa. Deliver to Eswatini.</small>
        </a>
        <nav>
          <span class="nav-item dim">Dashboard</span>
          <span class="nav-item dim">My Address</span>
        </nav>
        <div class="promo">🌍 More destinations coming soon!</div>
      </aside>

      <div class="main">
        <header class="top">
          <span></span>
          <div class="top-actions">
            <span class="bell">🔔 <sup>3</sup></span>
            <span>🇸🇿 Eswatini</span>
          </div>
        </header>

        <div class="content">
          <h1>Choose your suite plan</h1>
          <p class="sub">Your profile is complete — activate suite access to receive your SA address.</p>

          <div class="stepper">
            @for (s of steps; track s.n) {
              <div class="step" [class.done]="s.done" [class.active]="s.active">
                <span class="num">{{ s.done ? '✓' : s.n }}</span>
                <span>{{ s.label }}</span>
              </div>
            }
          </div>

          <div class="body-grid">
            <div class="form-area">
              <h2>Choose your suite subscription plan</h2>
              <p class="hint">All plans are paid upfront before activation.</p>

              <label class="plan" [class.selected]="plan() === 'monthly'">
                <input type="radio" name="plan" (change)="selectPlan('monthly')" [checked]="plan() === 'monthly'" />
                <span class="material-icons-outlined">calendar_month</span>
                <div>
                  <strong>R{{ planPriceLabel('monthly') }}</strong>
                  <span>1 month · Paid upfront</span>
                  <small>Perfect if you shop occasionally</small>
                </div>
              </label>

              <label class="plan" [class.selected]="plan() === 'quarterly'">
                <input type="radio" name="plan" (change)="selectPlan('quarterly')" [checked]="plan() === 'quarterly'" />
                <span class="bb-badge bb-badge-success">Best value</span>
                <span class="material-icons-outlined">calendar_month</span>
                <div>
                  <strong class="green">R{{ planPriceLabel('quarterly') }}</strong>
                  <span>3 months · Paid upfront</span>
                  <small>More savings for frequent shoppers</small>
                </div>
              </label>

              <div class="info-banner">
                <span class="material-icons-outlined">info</span>
                If your plan lapses, your suite stays reserved but ship-out is paused until renewal.
              </div>

              <p class="lock-note">🔒 All plans are paid upfront and non-refundable.</p>

              @if (error()) {
                <div class="err-banner" role="alert">{{ error() }}</div>
              }

              <div class="actions">
                <button
                  type="button"
                  class="bb-btn bb-btn-ghost pay-later"
                  (click)="payLater()"
                  [disabled]="busy()"
                  title="Take the tour first and pay when you're ready"
                >
                  Pay later — explore first
                </button>
                <button
                  type="button"
                  class="bb-btn bb-btn-primary"
                  (click)="continue()"
                  [disabled]="busy() || !selectedPlanDto()"
                >
                  @if (busy()) {
                    <span class="material-icons-outlined spin">sync</span>
                    Starting checkout…
                  } @else {
                    Continue to Payment →
                  }
                </button>
              </div>
              <p class="secure">🔒 Payments processed by Paystack</p>
            </div>

            <aside class="side-info">
              <h3>Why a WeYell suite address?</h3>
              <ul>
                <li>🛍️ Shop at any SA store with a real address</li>
                <li>📦 We receive and inspect your parcels</li>
                <li>🚚 Deliver securely to Eswatini</li>
              </ul>
              <h3>Plan rules</h3>
              <ul>
                <li>✓ Paid upfront for activation</li>
                <li>✓ Suite stays reserved if lapsed</li>
                <li>✓ No couriering while lapsed</li>
              </ul>
              <p>Have questions? <a routerLink="/sign-in" class="bb-link">Help Center</a></p>
              <a routerLink="/sign-in" class="bb-btn bb-btn-outline">Visit Help Center →</a>
            </aside>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .onboard { display: flex; min-height: 100vh; }
    .sidebar {
      width: var(--bb-sidebar-w);
      background: var(--bb-navy);
      color: #fff;
      padding: 1.25rem 0.85rem;
      display: flex;
      flex-direction: column;
    }
    .brand { color: #fff; text-decoration: none; display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 1.5rem; }
    .brand small { opacity: 0.65; font-size: 0.65rem; font-weight: 400; }
    .nav-item { display: block; padding: 0.5rem 0.75rem; font-size: 0.85rem; opacity: 0.5; }
    .promo { margin-top: auto; font-size: 0.75rem; opacity: 0.7; padding: 1rem; background: rgba(255,255,255,0.08); border-radius: 8px; }
    .main { flex: 1; background: var(--bb-bg); display: flex; flex-direction: column; }
    .top {
      height: 56px;
      background: #fff;
      border-bottom: 1px solid var(--bb-border);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 1.5rem;
      gap: 1rem;
      font-size: 0.85rem;
    }
    .content { padding: 2rem 2.5rem; max-width: 1100px; }
    .content h1 { margin: 0; font-size: 1.5rem; font-weight: 700; }
    .sub { color: var(--bb-muted); margin: 0.35rem 0 1.5rem; }
    .stepper { display: flex; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .step { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--bb-muted); }
    .step .num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid var(--bb-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.75rem;
    }
    .step.done .num { background: var(--bb-primary); border-color: var(--bb-primary); color: #fff; }
    .step.active .num { border-color: var(--bb-primary); color: var(--bb-primary); }
    .step.active { color: var(--bb-text); font-weight: 600; }
    .body-grid { display: grid; grid-template-columns: 1fr 280px; gap: 2rem; }
    @media (max-width: 900px) {
      .onboard { flex-direction: column; }
      .sidebar { display: none; }
      .content { padding: 1.25rem 1rem 2rem; }
      .body-grid { grid-template-columns: 1fr; }
      .actions { flex-direction: column; }
      .actions .bb-btn { width: 100%; }
    }
    @media (max-width: 640px) {
      .stepper { gap: 0.35rem; }
      .step span:not(.num) { display: none; }
      .step.active span:not(.num),
      .step.done span:not(.num) { display: inline; }
      .plan { flex-wrap: wrap; padding: 1rem; }
      .plan strong { font-size: 1.25rem; }
      .top { padding: 0 1rem; }
    }
    .plan {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      padding: 1.25rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      margin-bottom: 0.75rem;
      cursor: pointer;
      background: #fff;
      position: relative;
    }
    .plan.selected { border-color: var(--bb-primary); box-shadow: 0 0 0 1px var(--bb-primary); }
    .plan .bb-badge { position: absolute; top: 1rem; right: 1rem; }
    .plan strong { display: block; font-size: 1.5rem; }
    .plan .green { color: #15803d; }
    .plan span, .plan small { display: block; font-size: 0.82rem; color: var(--bb-muted); }
    .info-banner {
      display: flex;
      gap: 0.5rem;
      padding: 0.85rem;
      background: var(--bb-primary-soft);
      border-radius: var(--bb-radius-sm);
      font-size: 0.85rem;
      color: var(--bb-primary);
      margin: 1rem 0;
    }
    .err-banner {
      margin: 0.85rem 0 0;
      padding: 0.75rem 0.85rem;
      border-radius: var(--bb-radius-sm);
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      font-size: 0.85rem;
    }
    .lock-note { font-size: 0.78rem; color: var(--bb-muted); }
    .actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1.5rem;
      flex-wrap: wrap;
    }
    .actions .bb-btn[disabled] { opacity: 0.65; cursor: not-allowed; }
    .bb-btn-ghost.pay-later {
      background: transparent;
      border: 1px solid var(--bb-border);
      color: var(--bb-muted);
      font-weight: 600;
    }
    .bb-btn-ghost.pay-later:hover:not([disabled]) {
      border-color: var(--bb-primary);
      color: var(--bb-primary);
    }
    .actions .bb-btn .spin { animation: spin 1s linear infinite; display: inline-block; margin-right: 0.25rem; font-size: 1rem !important; vertical-align: -0.18em; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .secure { text-align: right; font-size: 0.75rem; color: var(--bb-muted); margin: 0.35rem 0 0; }
    .side-info {
      background: #fff;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      padding: 1.25rem;
      font-size: 0.85rem;
    }
    .side-info h3 { margin: 1rem 0 0.5rem; font-size: 0.9rem; }
    .side-info h3:first-child { margin-top: 0; }
    .side-info ul { margin: 0; padding-left: 0; list-style: none; }
    .side-info li { padding: 0.35rem 0; color: var(--bb-muted); }
  `,
})
export class OnboardingSuitePlanComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly borderboxApi = inject(BorderboxApiService);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly paystack = inject(PaystackCheckoutService);
  private readonly welcomeIntent = inject(WelcomeIntentService);

  readonly plan = signal<PlanChoice>('quarterly');
  readonly plans = signal<readonly SuitePlanDto[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly steps = [
    { n: 1, label: 'Sign in with Google', done: true, active: false },
    { n: 2, label: 'Complete profile', done: true, active: false },
    { n: 3, label: 'Choose suite plan', done: false, active: true },
    { n: 4, label: 'Payment', done: false, active: false },
  ];

  /**
   * The chosen DTO from the live plan catalogue. Resolves once
   * <code>listSuitePlans()</code> returns; until then we render the static
   * R100 / R200 fallback labels so the page isn't blank for the eye blink
   * before the API responds.
   */
  readonly selectedPlanDto = computed<SuitePlanDto | null>(() => {
    const list = this.plans();
    if (list.length === 0) return null;
    const months = this.plan() === 'monthly' ? 1 : 3;
    return list.find((p) => p.durationMonths === months) ?? list[0] ?? null;
  });

  ngOnInit(): void {
    // Make sure we have the customer's profile (used for default payer phone)
    // and the active plan catalogue before the user reaches the pay button.
    this.accountApi.ensureAccountLoaded().subscribe();
    this.borderboxApi.listSuitePlans().subscribe({
      next: (list) => this.plans.set(list),
      error: () => {
        // Don't block the form — the user can still pick a plan; we'll surface
        // a useful error only at the moment they try to pay.
      },
    });
  }

  selectPlan(choice: PlanChoice): void {
    this.plan.set(choice);
    this.error.set(null);
  }

  /**
   * Defer activation: record the intent on the backend (so future sign-ins
   * land on <code>/welcome</code> instead of bouncing back here) and route
   * the customer to the product-explainer page where they can pick the plan
   * and pay when they're ready. Optimistic: we navigate immediately and
   * surface the error inline if the round-trip fails.
   */
  payLater(): void {
    this.busy.set(true);
    this.error.set(null);
    const plan = this.selectedPlanDto();
    this.welcomeIntent.markPayLater(plan?.id ?? null).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigateByUrl('/welcome');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(this.humanizeError(err));
      },
    });
  }

  /** Cosmetic price label for the static cards before the catalogue lands. */
  planPriceLabel(choice: PlanChoice): string {
    const list = this.plans();
    if (list.length > 0) {
      const months = choice === 'monthly' ? 1 : 3;
      const found = list.find((p) => p.durationMonths === months);
      if (found) return String(Math.round(found.priceZar));
    }
    return choice === 'monthly' ? '100' : '200';
  }

  continue(): void {
    const plan = this.selectedPlanDto();
    if (!plan) {
      this.error.set('Suite plans are still loading — please wait a moment and try again.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    const callbackUrl = `${window.location.origin}/suite-access/checkout/complete`;
    const phone = this.accountApi.account()?.profile?.phone?.trim() ?? undefined;

    // Default to Paystack for the onboarding handoff. Renewal customers can
    // still pick MoMo from the rich /suite-access/checkout dashboard, but a
    // brand-new customer just wants to swipe a card and get into the app.
    this.borderboxApi
      .initiateSuiteCheckout(plan.id, callbackUrl, {
        provider: 'paystack',
        payerMsisdn: phone,
      })
      .subscribe({
        next: (res) => this.handlePaystackInit(res),
        error: (err: Error) => {
          this.busy.set(false);
          this.error.set(this.humanizeError(err));
        },
      });
  }

  private handlePaystackInit(res: InitiateSuiteCheckoutDto): void {
    // Try the inline popup first — gives the best UX. If the SDK fails to
    // load (ad-blockers, offline, etc) the service falls back to a full-page
    // redirect; in that case the promise never resolves because the browser
    // navigates away.
    this.paystack
      .start(res)
      .then((outcome) => {
        if (outcome.status === 'success') {
          this.busy.set(false);
          void this.router.navigateByUrl(
            `/suite-access/checkout/complete?reference=${encodeURIComponent(outcome.reference)}`,
          );
          return;
        }
        if (outcome.status === 'error') {
          this.busy.set(false);
          this.error.set(outcome.message);
          return;
        }
        // 'cancelled' → user closed the popup, keep them on this page so they
        // can retry without re-picking the plan.
        this.busy.set(false);
      })
      .catch(() => {
        // Last-resort redirect to the hosted Paystack page so the user is
        // never stuck on a half-loaded popup.
        window.location.href = res.authorizationUrl;
      });
  }

  private humanizeError(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      const msg = (err as { message: string }).message;
      if (msg && msg.length > 0) return msg;
    }
    return 'Could not start checkout. Please try again.';
  }
}
