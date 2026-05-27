import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import { ParcelsService } from '../../services/parcels.service';

@Component({
  selector: 'app-quote-checkout-complete',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      @if (busy()) {
        <div class="card">
          <span class="material-icons-outlined spin">sync</span>
          <h1>Confirming payment…</h1>
          <p>Please wait while we verify your Paystack payment and create your shipment.</p>
        </div>
      } @else if (error()) {
        <div class="card err">
          <span class="material-icons-outlined">error_outline</span>
          <h1>Payment could not be confirmed</h1>
          <p>{{ error() }}</p>
          @if (quoteId()) {
            <a [routerLink]="['/quotes', quoteId()]" class="bb-btn bb-btn-primary">Back to quote</a>
          } @else {
            <a routerLink="/quotes/list" class="bb-btn bb-btn-primary">Back to quotes</a>
          }
        </div>
      } @else {
        <div class="card ok">
          <span class="material-icons-outlined">check_circle</span>
          <h1>Payment confirmed</h1>
          <p>Your shipment has been created. We will process your parcels for courier.</p>
          @if (quoteId()) {
            <a [routerLink]="['/quotes', quoteId()]" class="bb-btn bb-btn-primary">View quote</a>
          }
          <a routerLink="/tracking-support" class="bb-btn bb-btn-outline">Get support</a>
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
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      align-items: center;
    }
    .card h1 { margin: 0; font-size: 1.25rem; }
    .card p { margin: 0; color: var(--bb-muted); font-size: 0.9rem; }
    .card .material-icons-outlined { font-size: 2.5rem; color: var(--bb-link); }
    .card.ok .material-icons-outlined { color: #15803d; }
    .card.err .material-icons-outlined { color: var(--bb-danger); }
    .spin { animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class QuoteCheckoutCompleteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly borderbox = inject(BorderboxApiService);
  private readonly parcelsApi = inject(ParcelsService);

  readonly busy = signal(true);
  readonly error = signal<string | null>(null);
  readonly quoteId = signal<string | null>(null);

  ngOnInit(): void {
    const reference =
      this.route.snapshot.queryParamMap.get('reference') ??
      this.route.snapshot.queryParamMap.get('trxref');
    const id = this.route.snapshot.paramMap.get('id');
    this.quoteId.set(id);

    if (!reference?.trim()) {
      this.busy.set(false);
      this.error.set('Missing payment reference from Paystack.');
      return;
    }

    this.borderbox.completeQuoteCheckout(reference.trim()).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.quoteId.set(result.id);
        this.parcelsApi.loadParcels().subscribe();
      },
      error: (err: { error?: { detail?: string; title?: string }; message?: string }) => {
        this.busy.set(false);
        this.error.set(
          err?.error?.detail ??
            err?.error?.title ??
            (typeof err?.message === 'string' ? err.message : 'Could not confirm payment.'),
        );
      },
    });
  }
}
