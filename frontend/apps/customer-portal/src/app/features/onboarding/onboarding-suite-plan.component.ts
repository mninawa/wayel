import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CustomerAccountService } from '../../services/customer-account.service';

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
                <input type="radio" name="plan" (change)="plan.set('monthly')" [checked]="plan() === 'monthly'" />
                <span class="material-icons-outlined">calendar_month</span>
                <div>
                  <strong>R100</strong>
                  <span>1 month · Paid upfront</span>
                  <small>Perfect if you shop occasionally</small>
                </div>
              </label>

              <label class="plan" [class.selected]="plan() === 'quarterly'">
                <input type="radio" name="plan" (change)="plan.set('quarterly')" [checked]="plan() === 'quarterly'" />
                <span class="bb-badge bb-badge-success">Best value</span>
                <span class="material-icons-outlined">calendar_month</span>
                <div>
                  <strong class="green">R200</strong>
                  <span>3 months · Paid upfront</span>
                  <small>More savings for frequent shoppers</small>
                </div>
              </label>

              <div class="info-banner">
                <span class="material-icons-outlined">info</span>
                If your plan lapses, your suite stays reserved but ship-out is paused until renewal.
              </div>

              <p class="lock-note">🔒 All plans are paid upfront and non-refundable.</p>

              <div class="actions">
                <button type="button" class="bb-btn bb-btn-outline">← Back</button>
                <button type="button" class="bb-btn bb-btn-primary" (click)="continue()">
                  Continue to Payment →
                </button>
              </div>
              <p class="secure">🔒 Secure payment</p>
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
    @media (max-width: 900px) { .body-grid { grid-template-columns: 1fr; } }
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
    .lock-note { font-size: 0.78rem; color: var(--bb-muted); }
    .actions { display: flex; justify-content: space-between; margin-top: 1.5rem; }
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
export class OnboardingSuitePlanComponent {
  private readonly router = inject(Router);
  readonly plan = signal<'monthly' | 'quarterly'>('quarterly');

  readonly steps = [
    { n: 1, label: 'Sign in with Google', done: true, active: false },
    { n: 2, label: 'Complete profile', done: true, active: false },
    { n: 3, label: 'Choose suite plan', done: false, active: true },
    { n: 4, label: 'Payment', done: false, active: false },
  ];

  continue(): void {
    void this.router.navigate(['/suite-access/checkout'], {
      queryParams: { plan: this.plan() },
    });
  }
}
