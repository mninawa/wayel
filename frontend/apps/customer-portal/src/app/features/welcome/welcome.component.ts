import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BffAuthService } from '@wayel/shared/services/bff-auth.service';
import {
  BorderboxApiService,
  type InitiateSuiteCheckoutDto,
  type SuitePlanDto,
} from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { PaystackCheckoutService } from '../../services/paystack-checkout.service';

type PlanChoice = 'monthly' | 'quarterly';

/**
 * Product-explainer landing page shown to customers who picked "Pay later"
 * on the suite-plan onboarding step. Two roles:
 *
 *   1. Educate — three-step "how WeYell works" rundown plus value props.
 *      We deliberately repeat key bits from the public landing page rather
 *      than redirect there: at this point the customer is signed in and
 *      bouncing them to a marketing tree is jarring.
 *
 *   2. Activate — a sticky-feeling "Activate now" card with the plan picker
 *      and a single Pay Now button that fires the same Paystack flow used by
 *      the onboarding step. The card is the primary CTA; everything else on
 *      the page is supporting context.
 *
 * If the customer has already activated their suite (e.g. they revisited the
 * URL after paying through a different surface), the activation card is
 * hidden and they see a single "Continue to dashboard" CTA. This makes
 * <code>/welcome</code> safe to land on regardless of state.
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">
        <span class="brand-icon">📦</span>
        <strong>WeYell</strong>
      </a>
      <div class="topbar-right">
        <span class="flag">🇸🇿 Eswatini</span>
        <button type="button" class="ghost-btn" (click)="signOut()">Sign out</button>
      </div>
    </header>

    <main class="wrap">
      <section class="hero">
        <span class="hero-eyebrow">Welcome to WeYell</span>
        <h1>Your gateway to South African shops, delivered to Eswatini.</h1>
        <p class="hero-sub">
          Get a real South African address, receive parcels from any SA retailer, and
          courier them to your door in Eswatini — all from one dashboard.
        </p>
        @if (alreadyActive()) {
          <a routerLink="/dashboard" class="hero-cta primary">
            <span class="material-icons-outlined">arrow_forward</span>
            Continue to dashboard
          </a>
        } @else {
          <a href="#activate" class="hero-cta primary">
            <span class="material-icons-outlined">bolt</span>
            Activate my suite
          </a>
        }
      </section>

      <section class="steps">
        <h2>How WeYell works</h2>
        <ol>
          <li>
            <span class="step-num">1</span>
            <div>
              <h3>Shop anywhere in South Africa</h3>
              <p>
                Use your private WeYell suite address as the delivery address on any
                SA online store — Takealot, Bash, Superbalist, Mr Price, you name it.
              </p>
            </div>
          </li>
          <li>
            <span class="step-num">2</span>
            <div>
              <h3>We receive and inspect</h3>
              <p>
                Your parcels arrive at our SA warehouse where we verify contents,
                weigh them, and photograph the package — so you always know what's
                waiting for you.
              </p>
            </div>
          </li>
          <li>
            <span class="step-num">3</span>
            <div>
              <h3>Ship to Eswatini when you're ready</h3>
              <p>
                Consolidate multiple parcels into one shipment to save on courier
                costs, then track every step from receive to delivery in real time.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section class="benefits">
        <h2>Why activate your suite</h2>
        <ul>
          <li>
            <span class="material-icons-outlined benefit-icon">verified</span>
            A real South African address that any retailer accepts at checkout.
          </li>
          <li>
            <span class="material-icons-outlined benefit-icon">all_inbox</span>
            Unlimited parcel receiving while your plan is active — no per-parcel fees.
          </li>
          <li>
            <span class="material-icons-outlined benefit-icon">group_work</span>
            Consolidate parcels into one shipment to slash courier costs.
          </li>
          <li>
            <span class="material-icons-outlined benefit-icon">photo_camera</span>
            Photo proof and a digital trail for every parcel from receive to delivery.
          </li>
          <li>
            <span class="material-icons-outlined benefit-icon">payments</span>
            Pay only for shipping when you actually ship — receive is included.
          </li>
        </ul>
      </section>

      @if (!alreadyActive()) {
        <section class="activate-card" id="activate">
          <header class="activate-head">
          @if (trialEligible()) {
            <span class="activate-eyebrow early-adopter-eyebrow">Early adopter offer</span>
          } @else {
            <span class="activate-eyebrow">Step 4 · Activate</span>
          }
            <h2>@if (trialEligible()) { Your first {{ trialDurationDays() }} days are free } @else { Activate your suite address }</h2>
            <p class="activate-sub">
              @if (trialEligible()) {
                As an early adopter, your first {{ trialDurationDays() }} days are free — full suite access with no payment today.
                Prefer to pay upfront? Choose a plan below instead.
              } @else {
                Pick a plan and pay securely with Paystack. Your suite address is
                ready to receive parcels the moment we confirm the payment.
              }
            </p>
          </header>

          <div class="plan-grid">
            <label class="plan" [class.selected]="plan() === 'monthly'">
              <input
                type="radio"
                name="plan"
                (change)="selectPlan('monthly')"
                [checked]="plan() === 'monthly'"
              />
              <div class="plan-body">
                <div class="plan-name">Monthly</div>
                <div class="plan-price">
                  R{{ planPriceLabel('monthly') }}
                  <span class="plan-period">/ month</span>
                </div>
                <p class="plan-paid">Paid upfront · 1 month</p>
                <p class="plan-hint">Perfect if you shop occasionally.</p>
              </div>
            </label>

            <label class="plan" [class.selected]="plan() === 'quarterly'">
              <input
                type="radio"
                name="plan"
                (change)="selectPlan('quarterly')"
                [checked]="plan() === 'quarterly'"
              />
              <span class="best-tag">Best value</span>
              <div class="plan-body">
                <div class="plan-name">Quarterly</div>
                <div class="plan-price ok">
                  R{{ planPriceLabel('quarterly') }}
                  <span class="plan-period">/ 3 months</span>
                </div>
                <p class="plan-paid">Paid upfront · 3 months</p>
                <p class="plan-hint">More savings for frequent shoppers.</p>
              </div>
            </label>
          </div>

          @if (error()) {
            <div class="err-banner" role="alert">{{ error() }}</div>
          }

          @if (trialEligible()) {
            <button
              type="button"
              class="pay-cta trial-cta"
              (click)="startTrial()"
              [disabled]="busy()"
            >
              @if (busy()) {
                <span class="material-icons-outlined spin">sync</span>
                Starting…
              } @else {
                <span class="material-icons-outlined">volunteer_activism</span>
                Claim your free {{ trialDurationDays() }} days
              }
            </button>
          }

          <button
            type="button"
            class="pay-cta"
            [class.pay-cta-secondary]="trialEligible()"
            (click)="payNow()"
            [disabled]="busy() || !selectedPlanDto()"
          >
            @if (busy()) {
              <span class="material-icons-outlined spin">sync</span>
              Starting checkout…
            } @else {
              <span class="material-icons-outlined">lock</span>
              Pay R{{ payAmount() | number:'1.0-0' }} Securely with Paystack
            }
          </button>

          <p class="extra">
            Prefer MTN MoMo or want to see your payment history?
            <a routerLink="/suite-access/checkout">Open the full payment dashboard</a>.
          </p>

          <p class="legal">
            <span class="material-icons-outlined">shield</span>
            All payments processed by Paystack — your card details never touch our servers.
          </p>
        </section>
      }

      <footer class="footer">
        <p>
          Questions? <a class="link" routerLink="/tracking-support">Visit our help center</a>
          or sign out and come back later.
        </p>
      </footer>
    </main>
  `,
  styles: `
    :host { display: block; background: var(--bb-bg, #f8fafc); min-height: 100vh; }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #fff;
      border-bottom: 1px solid var(--bb-border, #e2e8f0);
      padding: 0.75rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--bb-text, #0f172a); text-decoration: none; font-size: 1rem; }
    .brand strong { font-weight: 700; font-size: 1.05rem; }
    .brand-icon { font-size: 1.2rem; }
    .topbar-right { display: inline-flex; align-items: center; gap: 1rem; font-size: 0.85rem; }
    .flag { color: var(--bb-muted, #64748b); }
    .ghost-btn {
      border: 1px solid var(--bb-border, #e2e8f0);
      background: transparent;
      padding: 0.4rem 0.85rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.82rem;
      color: var(--bb-muted, #475569);
      cursor: pointer;
    }
    .ghost-btn:hover { border-color: var(--bb-primary, #0052cc); color: var(--bb-primary, #0052cc); }

    .wrap {
      max-width: 920px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 4rem;
      display: grid;
      gap: 2.25rem;
    }

    .hero {
      text-align: center;
      padding: 1.5rem 0.5rem 0;
    }
    .hero-eyebrow {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: var(--bb-primary-soft, #eff6ff);
      color: var(--bb-primary, #0052cc);
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .hero h1 {
      margin: 0.85rem 0 0.85rem;
      font-size: clamp(1.6rem, 4vw, 2.4rem);
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--bb-text, #0f172a);
      line-height: 1.15;
    }
    .hero-sub {
      max-width: 640px;
      margin: 0 auto 1.5rem;
      color: var(--bb-muted, #475569);
      font-size: 1rem;
      line-height: 1.55;
    }
    .hero-cta {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.85rem 1.5rem;
      border-radius: 999px;
      font-size: 0.95rem;
      font-weight: 700;
      text-decoration: none;
      transition: transform 0.15s;
    }
    .hero-cta.primary {
      background: var(--bb-primary, #0052cc);
      color: #fff;
      box-shadow: 0 6px 18px rgba(0, 82, 204, 0.25);
    }
    .hero-cta:hover { transform: translateY(-1px); }

    section h2 {
      margin: 0 0 1rem;
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--bb-text, #0f172a);
    }

    .steps ol {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.85rem;
    }
    .steps li {
      display: grid;
      grid-template-columns: 2.25rem 1fr;
      gap: 1rem;
      align-items: flex-start;
      padding: 1.1rem 1.25rem;
      background: #fff;
      border: 1px solid var(--bb-border, #e2e8f0);
      border-radius: 14px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .step-num {
      width: 2.25rem;
      height: 2.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bb-primary, #0052cc);
      color: #fff;
      border-radius: 50%;
      font-weight: 800;
    }
    .steps h3 { margin: 0 0 0.25rem; font-size: 1rem; font-weight: 700; color: var(--bb-text, #0f172a); }
    .steps p { margin: 0; color: var(--bb-muted, #475569); font-size: 0.92rem; line-height: 1.5; }

    .benefits ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 0.6rem 1rem;
    }
    .benefits li {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.85rem 1rem;
      background: #fff;
      border: 1px solid var(--bb-border, #e2e8f0);
      border-radius: 12px;
      font-size: 0.92rem;
      color: var(--bb-text, #0f172a);
      line-height: 1.45;
    }
    .benefit-icon {
      color: var(--bb-primary, #0052cc);
      font-size: 1.25rem !important;
      flex: 0 0 auto;
    }

    .activate-card {
      background: #fff;
      border: 1px solid var(--bb-border, #e2e8f0);
      border-radius: 18px;
      padding: 1.75rem 1.5rem;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
      scroll-margin-top: 5rem;
    }
    .activate-head { text-align: center; margin-bottom: 1.5rem; }
    .activate-eyebrow {
      display: inline-block;
      padding: 0.25rem 0.7rem;
      background: #ecfdf5;
      color: #15803d;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .activate-head h2 { margin: 0.6rem 0 0.4rem; font-size: 1.5rem; font-weight: 800; }
    .activate-sub { margin: 0; color: var(--bb-muted, #475569); font-size: 0.95rem; }

    .plan-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
      margin-bottom: 1.1rem;
    }
    @media (max-width: 640px) { .plan-grid { grid-template-columns: 1fr; } }

    .plan {
      position: relative;
      display: block;
      padding: 1.1rem 1.1rem 1rem 2.4rem;
      border: 2px solid var(--bb-border, #e2e8f0);
      border-radius: 14px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .plan input[type="radio"] {
      position: absolute;
      left: 1rem;
      top: 1.15rem;
      accent-color: var(--bb-primary, #0052cc);
      width: 1.05rem;
      height: 1.05rem;
    }
    .plan.selected {
      border-color: var(--bb-primary, #0052cc);
      box-shadow: 0 0 0 1px var(--bb-primary, #0052cc), 0 6px 14px rgba(0, 82, 204, 0.08);
    }
    .plan-name { font-weight: 700; color: var(--bb-text, #0f172a); }
    .plan-price {
      margin-top: 0.25rem;
      font-size: 1.45rem;
      font-weight: 800;
      color: var(--bb-text, #0f172a);
      line-height: 1.1;
    }
    .plan-price.ok { color: #15803d; }
    .plan-period { font-size: 0.9rem; font-weight: 600; color: var(--bb-muted, #64748b); }
    .plan-paid {
      margin: 0.35rem 0 0.15rem;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--bb-muted, #64748b);
    }
    .plan-hint { margin: 0; font-size: 0.82rem; color: var(--bb-muted, #475569); }
    .best-tag {
      position: absolute;
      top: 0.85rem;
      right: 0.85rem;
      padding: 0.15rem 0.5rem;
      background: #dcfce7;
      color: #15803d;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 999px;
    }

    .err-banner {
      margin-bottom: 0.85rem;
      padding: 0.75rem 0.85rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      border-radius: 10px;
      font-size: 0.88rem;
    }

    .pay-cta {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      padding: 0.95rem 1.25rem;
      border: none;
      border-radius: 14px;
      background: var(--bb-primary, #0052cc);
      color: #fff;
      font-size: 1.02rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(0, 82, 204, 0.3);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .pay-cta:hover:not(:disabled) { transform: translateY(-1px); }
    .pay-cta:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
    .pay-cta .spin { animation: spin 1s linear infinite; font-size: 1.2rem !important; }
    .pay-cta-secondary {
      margin-top: 0.75rem;
      background: #fff;
      color: var(--bb-text, #0f172a);
      border: 1px solid var(--bb-border, #e2e8f0);
      box-shadow: none;
    }
    .trial-cta { margin-bottom: 0.25rem; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .extra { margin: 0.75rem 0 0; text-align: center; font-size: 0.85rem; color: var(--bb-muted, #475569); }
    .extra a { color: var(--bb-primary, #0052cc); font-weight: 600; text-decoration: none; }
    .extra a:hover { text-decoration: underline; }
    .legal {
      margin: 0.85rem 0 0;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.78rem;
      color: var(--bb-muted, #64748b);
    }
    .legal .material-icons-outlined { font-size: 1rem !important; }

    .footer {
      text-align: center;
      color: var(--bb-muted, #64748b);
      font-size: 0.85rem;
    }
    .link { color: var(--bb-primary, #0052cc); font-weight: 600; text-decoration: none; }
    .link:hover { text-decoration: underline; }
  `,
})
export class WelcomeComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly borderboxApi = inject(BorderboxApiService);
  private readonly paystack = inject(PaystackCheckoutService);
  private readonly bffAuth = inject(BffAuthService);

  readonly plan = signal<PlanChoice>('quarterly');
  readonly plans = signal<readonly SuitePlanDto[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Hide the activation card once the customer has a live suite, so the page
   * is safe to navigate to from anywhere (sidebar link, bookmarks etc.)
   * without showing a redundant "Pay now" button.
   */
  readonly alreadyActive = computed(() => {
    const account = this.accountApi.account();
    return account?.hasSuite === true;
  });

  /** Live plan DTO based on the radio choice, once /suite-plans returns. */
  readonly selectedPlanDto = computed<SuitePlanDto | null>(() => {
    const list = this.plans();
    if (list.length === 0) return null;
    const months = this.plan() === 'monthly' ? 1 : 3;
    return list.find((p) => p.durationMonths === months) ?? list[0] ?? null;
  });

  readonly payAmount = computed<number>(() => this.selectedPlanDto()?.priceZar ?? 0);

  readonly trialEligible = computed(
    () => this.accountApi.account()?.suiteTrial?.eligible === true,
  );

  readonly trialDurationDays = computed(
    () => this.accountApi.account()?.suiteTrial?.durationDays ?? 30,
  );

  ngOnInit(): void {
    this.accountApi.ensureAccountLoaded().subscribe();
    this.borderboxApi.listSuitePlans().subscribe({
      next: (list) => this.plans.set(list),
      // Quiet failure — the static R100/R200 fallback labels still render
      // so the customer can still pick a plan; we'll surface a useful error
      // only at the moment they actually try to pay.
      error: () => {
        /* no-op */
      },
    });
  }

  selectPlan(choice: PlanChoice): void {
    this.plan.set(choice);
    this.error.set(null);
  }

  /**
   * Cosmetic price label shown before <code>listSuitePlans()</code> returns —
   * falls back to the published catalogue prices so the cards aren't blank.
   */
  planPriceLabel(choice: PlanChoice): string {
    const list = this.plans();
    if (list.length > 0) {
      const months = choice === 'monthly' ? 1 : 3;
      const found = list.find((p) => p.durationMonths === months);
      if (found) return String(Math.round(found.priceZar));
    }
    return choice === 'monthly' ? '100' : '200';
  }

  payNow(): void {
    const plan = this.selectedPlanDto();
    if (!plan) {
      this.error.set('Suite plans are still loading — please wait a moment and try again.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    const callbackUrl = `${window.location.origin}/suite-access/checkout/complete`;
    const phone = this.accountApi.account()?.profile?.phone?.trim() ?? undefined;

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

  startTrial(): void {
    this.busy.set(true);
    this.error.set(null);
    this.accountApi.startSuiteTrial().subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigateByUrl('/dashboard');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(this.humanizeError(err));
      },
    });
  }

  signOut(): void {
    void this.bffAuth.signOut().finally(() => {
      void this.router.navigateByUrl('/sign-in');
    });
  }

  private handlePaystackInit(res: InitiateSuiteCheckoutDto): void {
    this.paystack
      .start(res)
      .then((outcome) => {
        if (outcome.status === 'success') {
          // The checkout-complete page will clear the pay-later flag once
          // it confirms the payment server-side.
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
        // 'cancelled' — keep them on this page so they can retry without
        // re-picking the plan.
        this.busy.set(false);
      })
      .catch(() => {
        // Inline SDK couldn't load — fall through to the hosted page.
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
