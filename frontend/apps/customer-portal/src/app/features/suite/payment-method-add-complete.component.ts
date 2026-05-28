import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BorderboxApiService } from '../../services/borderbox-api.service';

@Component({
  selector: 'app-payment-method-add-complete',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      @if (busy()) {
        <div class="card">
          <span class="material-icons-outlined spin">sync</span>
          <h1>Saving your card…</h1>
          <p>We are verifying your card with Paystack. A small verification charge may appear and is refunded automatically.</p>
        </div>
      } @else if (error()) {
        <div class="card err">
          <span class="material-icons-outlined">error_outline</span>
          <h1>Could not save card</h1>
          <p>{{ error() }}</p>
          <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Back to payments</a>
        </div>
      } @else {
        <div class="card ok">
          <span class="material-icons-outlined">check_circle</span>
          <h1>Card saved</h1>
          <p>
            @if (savedName()) {
              <strong>{{ savedName() }}</strong> is ready to use for renewals and checkout.
            } @else {
              Your card is ready to use for renewals and checkout.
            }
          </p>
          <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Back to payments</a>
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
      max-width: 440px;
      text-align: center;
      padding: 2rem 1.5rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      background: var(--bb-surface);
      box-shadow: var(--bb-shadow-md);
    }
    .card h1 { margin: 0.75rem 0 0.5rem; font-size: 1.25rem; }
    .card p { margin: 0 0 1.25rem; color: var(--bb-muted); font-size: 0.9rem; line-height: 1.45; }
    .card .material-icons-outlined { font-size: 2.5rem; color: var(--bb-link); }
    .card.ok .material-icons-outlined { color: #15803d; }
    .card.err .material-icons-outlined { color: var(--bb-danger); }
    .spin { animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class PaymentMethodAddCompleteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly borderbox = inject(BorderboxApiService);

  readonly busy = signal(true);
  readonly error = signal<string | null>(null);
  readonly savedName = signal<string | null>(null);

  ngOnInit(): void {
    const reference =
      this.route.snapshot.queryParamMap.get('reference') ??
      this.route.snapshot.queryParamMap.get('trxref');
    if (!reference?.trim()) {
      this.busy.set(false);
      this.error.set('Missing payment reference from Paystack.');
      return;
    }

    const label = sessionStorage.getItem('weyell_pending_card_label');
    sessionStorage.removeItem('weyell_pending_card_label');

    this.borderbox.completeAddPaymentMethod(reference.trim(), label).subscribe({
      next: (card) => {
        this.savedName.set(card.displayName);
        this.busy.set(false);
      },
      error: (err: Error) => {
        this.busy.set(false);
        this.error.set(err?.message ?? 'Card verification failed.');
      },
    });
  }
}
