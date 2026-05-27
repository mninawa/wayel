import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import { WelcomeIntentService } from '../../services/welcome-intent.service';

@Component({
  selector: 'app-suite-checkout-complete',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      @if (busy()) {
        <div class="card">
          <span class="material-icons-outlined spin">sync</span>
          <h1>Confirming payment…</h1>
          <p>Please wait while we verify your Paystack payment and renew suite access.</p>
        </div>
      } @else if (error()) {
        <div class="card err">
          <span class="material-icons-outlined">error_outline</span>
          <h1>Payment could not be confirmed</h1>
          <p>{{ error() }}</p>
          <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Back to checkout</a>
        </div>
      } @else {
        <div class="card ok">
          <span class="material-icons-outlined">check_circle</span>
          <h1>Suite access activated</h1>
          <p>Your Paystack payment was confirmed and suite access is now active.</p>
          <a routerLink="/dashboard" class="bb-btn bb-btn-primary">Go to dashboard</a>
        </div>
      }
    </div>
  `,
  styles: `
    .wrap {
      min-height: 60vh;
      display: grid;
      place-items: center;
      padding: 2rem 1rem;
    }
    .card {
      max-width: 420px;
      text-align: center;
      padding: 2rem 1.5rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      background: var(--bb-surface);
      box-shadow: var(--bb-shadow-md);
    }
    .card h1 { margin: 0.75rem 0 0.5rem; font-size: 1.25rem; }
    .card p { margin: 0 0 1.25rem; color: var(--bb-muted); font-size: 0.9rem; }
    .card .material-icons-outlined { font-size: 2.5rem; color: var(--bb-link); }
    .card.ok .material-icons-outlined { color: #15803d; }
    .card.err .material-icons-outlined { color: var(--bb-danger); }
    .spin { animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class SuiteCheckoutCompleteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly borderbox = inject(BorderboxApiService);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly parcelsApi = inject(ParcelsService);
  private readonly welcomeIntent = inject(WelcomeIntentService);

  readonly busy = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const reference =
      this.route.snapshot.queryParamMap.get('reference') ??
      this.route.snapshot.queryParamMap.get('trxref');
    if (!reference?.trim()) {
      this.busy.set(false);
      this.error.set('Missing payment reference from Paystack.');
      return;
    }

    this.borderbox.completeSuiteCheckout(reference.trim()).subscribe({
      next: () => {
        // Payment confirmed → the customer is no longer "paying later".
        // Clear the flag so a future expired-suite cycle starts clean
        // (and so they don't bounce to /welcome instead of their dashboard
        // on subsequent sign-ins).
        this.welcomeIntent.clear();
        this.accountApi.loadAccount().subscribe({
          next: () => {
            this.parcelsApi.loadDashboard().subscribe({
              next: () => {
                this.busy.set(false);
                void this.router.navigate(['/dashboard']);
              },
              error: () => {
                this.busy.set(false);
                void this.router.navigate(['/dashboard']);
              },
            });
          },
          error: () => {
            this.busy.set(false);
          },
        });
      },
      error: (err: Error) => {
        this.busy.set(false);
        this.error.set(err?.message ?? 'Could not confirm payment.');
      },
    });
  }
}
