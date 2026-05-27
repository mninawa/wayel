import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  BorderboxApiService,
  type MomoMsisdnValidationDto,
  type PaymentProviderOptionDto,
} from '../../services/borderbox-api.service';

/**
 * Emitted whenever the picker has a valid selection. Consumers use the values
 * verbatim when calling the initiate-checkout endpoints.
 */
export interface PaymentMethodChoice {
  provider: 'paystack' | 'momo';
  /** Only populated when {@link provider} is "momo"; MTN-normalised, digits only. */
  payerMsisdn?: string;
}

/**
 * Reusable payment-method picker shared by suite checkout and quote checkout.
 *
 * <ul>
 *   <li>Loads `/borderbox/payments/providers` on init.</li>
 *   <li>Shows a radio between MoMo and Paystack when both are configured.</li>
 *   <li>When MoMo is picked, requires a phone number that is validated against
 *       MTN's <c>accountholder/MSISDN/{msisdn}/active</c> probe before any
 *       <em>initiate-checkout</em> call is allowed.</li>
 * </ul>
 *
 * Parent components bind <c>(choiceChange)</c> to receive the latest valid
 * choice, and call <c>validate()</c> on submit to force-revalidate MoMo
 * numbers that haven't been checked yet.
 */
@Component({
  selector: 'app-payment-method-picker',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="pmp-skeleton" aria-busy="true" aria-live="polite">
        Loading payment options…
      </div>
    } @else if (providers().length === 0) {
      <p class="pmp-empty">
        No payment providers are configured. Please contact support.
      </p>
    } @else {
      <fieldset class="pmp">
        <legend class="pmp-legend">Pay with</legend>
        <div class="pmp-options">
          @for (opt of providers(); track opt.provider) {
            <label
              class="pmp-opt"
              [class.is-selected]="selectedProvider() === opt.provider"
              [class.is-disabled]="!opt.isConfigured"
            >
              <input
                type="radio"
                name="payment-provider"
                [value]="opt.provider"
                [checked]="selectedProvider() === opt.provider"
                [disabled]="!opt.isConfigured"
                (change)="onProviderChange(opt.provider)"
              />
              <span class="pmp-opt-body">
                <span class="pmp-opt-title">
                  {{ opt.displayName }}
                  @if (opt.isRecommended) {
                    <span class="pmp-pill">Recommended</span>
                  }
                  @if (!opt.isConfigured) {
                    <span class="pmp-pill pmp-pill--muted">Coming soon</span>
                  }
                </span>
                <span class="pmp-opt-sub">
                  @if (opt.provider === 'momo') {
                    @if (opt.isConfigured) {
                      Approve on your MTN MoMo phone — works across Eswatini,
                      South Africa, and other MTN markets.
                    } @else {
                      MTN MoMo isn't connected yet. Please pick another method.
                    }
                  } @else if (opt.provider === 'paystack') {
                    @if (opt.isConfigured) {
                      Card or instant EFT via Paystack.
                    } @else {
                      Card / EFT will be available once Paystack onboarding
                      is finalised.
                    }
                  } @else {
                    {{ opt.displayName }}
                  }
                </span>
              </span>
            </label>
          }
        </div>

        @if (selectedProvider() === 'momo') {
          <div class="pmp-momo">
            <label class="pmp-field">
              <span class="pmp-field-label">MTN MoMo phone number</span>
              <input
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                placeholder="+27 82 123 4567"
                [ngModel]="momoMsisdn()"
                (ngModelChange)="onMsisdnChange($event)"
                (blur)="onMsisdnBlur()"
                name="momoMsisdn"
                [attr.aria-invalid]="momoError() ? 'true' : null"
                [disabled]="validating()"
              />
            </label>
            <p class="pmp-field-hint">
              Include the country code (for example <code>+27</code> for South
              Africa or <code>+268</code> for Eswatini). We'll send the payment
              prompt straight to this number's MoMo wallet.
            </p>
            @if (validating()) {
              <p class="pmp-field-status pmp-field-status--checking">
                Checking with MTN…
              </p>
            } @else if (momoValidated()) {
              <p class="pmp-field-status pmp-field-status--ok">
                MTN MoMo wallet confirmed.
              </p>
            } @else if (momoError()) {
              <p class="pmp-field-status pmp-field-status--err">
                {{ momoError() }}
              </p>
            }
          </div>
        }
      </fieldset>
    }
  `,
  styles: `
    .pmp-skeleton {
      padding: 0.75rem 0;
      color: var(--bb-muted);
      font-size: 0.85rem;
    }
    .pmp-empty {
      padding: 0.5rem 0;
      color: var(--bb-danger);
      font-size: 0.85rem;
      margin: 0;
    }
    .pmp {
      border: 0;
      margin: 0;
      padding: 0;
    }
    .pmp-legend {
      padding: 0;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--bb-text);
      margin-bottom: 0.6rem;
    }
    .pmp-options {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
    .pmp-opt {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.65rem 0.8rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease;
    }
    .pmp-opt:hover { border-color: var(--bb-primary-soft, #c4b5fd); }
    .pmp-opt.is-selected {
      border-color: var(--bb-link);
      background: rgba(124, 58, 237, 0.05);
    }
    .pmp-opt.is-disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: #f9fafb;
    }
    .pmp-opt.is-disabled:hover { border-color: var(--bb-border); }
    .pmp-opt input { margin-top: 0.2rem; flex-shrink: 0; }
    .pmp-opt input:disabled { cursor: not-allowed; }
    .pmp-opt-body {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
    }
    .pmp-opt-title {
      font-weight: 600;
      font-size: 0.92rem;
      color: var(--bb-text);
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .pmp-opt-sub {
      font-size: 0.78rem;
      color: var(--bb-muted);
      line-height: 1.35;
    }
    .pmp-pill {
      font-size: 0.65rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 999px;
      background: #ecfdf5;
      color: #047857;
    }
    .pmp-pill--muted {
      background: #f1f5f9;
      color: #475569;
    }
    .pmp-momo {
      margin-top: 0.75rem;
      padding: 0.75rem;
      border-radius: var(--bb-radius-sm);
      background: #f9fafb;
      border: 1px dashed var(--bb-border);
    }
    .pmp-field { display: flex; flex-direction: column; gap: 0.3rem; }
    .pmp-field-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--bb-text);
    }
    .pmp-field input[type='tel'] {
      width: 100%;
      padding: 0.5rem 0.7rem;
      font-size: 0.95rem;
      border-radius: var(--bb-radius-sm);
      border: 1px solid var(--bb-border);
      font-family: inherit;
    }
    .pmp-field input[type='tel']:focus {
      outline: none;
      border-color: var(--bb-link);
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
    }
    .pmp-field input[type='tel'][aria-invalid='true'] {
      border-color: var(--bb-danger);
    }
    .pmp-field-hint {
      margin: 0.35rem 0 0;
      font-size: 0.74rem;
      color: var(--bb-muted);
      line-height: 1.4;
    }
    .pmp-field-hint code {
      background: rgba(0, 0, 0, 0.05);
      padding: 0.05rem 0.3rem;
      border-radius: 3px;
      font-size: 0.72rem;
    }
    .pmp-field-status {
      margin: 0.4rem 0 0;
      font-size: 0.78rem;
    }
    .pmp-field-status--checking { color: var(--bb-muted); }
    .pmp-field-status--ok { color: #047857; }
    .pmp-field-status--err { color: var(--bb-danger); }
  `,
})
export class PaymentMethodPickerComponent implements OnInit {
  private readonly api = inject(BorderboxApiService);

  /**
   * Pre-fills the MoMo phone number input. Typically the customer's default
   * delivery address phone (which is set via the /my-address page) — but
   * accepts any number. Tracked reactively so parents that load the account
   * lazily still propagate the phone to the field.
   */
  readonly defaultMsisdn = input<string | null>(null);

  /** Emits a fully valid choice (or null if the choice is incomplete). */
  @Output() readonly choiceChange = new EventEmitter<PaymentMethodChoice | null>();

  /** Tracks whether the user has typed in the MoMo field — once true, we stop
   * overwriting from {@link defaultMsisdn}. */
  private userTouchedMsisdn = false;

  constructor() {
    effect(() => {
      const incoming = this.defaultMsisdn();
      if (!incoming) return;
      if (this.userTouchedMsisdn) return;
      if (this.momoMsisdn() === incoming) return;
      this.momoMsisdn.set(incoming);
    });
  }

  readonly loading = signal(true);
  readonly providers = signal<PaymentProviderOptionDto[]>([]);
  readonly selectedProvider = signal<'paystack' | 'momo' | null>(null);
  readonly momoMsisdn = signal<string>('');
  readonly validating = signal(false);
  readonly momoValidated = signal(false);
  readonly momoError = signal<string | null>(null);
  /** Last value we successfully validated — guards us from re-firing on focus. */
  private lastValidatedRaw = '';

  /** True when a parent can safely submit the current selection. */
  readonly isReady = computed(() => {
    const p = this.selectedProvider();
    if (p === 'paystack') return true;
    if (p === 'momo') return this.momoValidated() && this.momoMsisdn().trim().length > 0;
    return false;
  });

  ngOnInit(): void {
    this.api.listPaymentProviders().subscribe({
      next: (list) => {
        // Backend returns providers in stable display order (Paystack first,
        // MoMo next). Keep that order as-is so users always see the same row
        // for the same provider regardless of which one is "recommended".
        this.providers.set([...list]);
        const initial = this.pickInitialProvider(list);
        this.selectedProvider.set(initial);
        this.loading.set(false);
        this.emit();
      },
      error: () => {
        this.providers.set([]);
        this.loading.set(false);
      },
    });
  }

  private pickInitialProvider(list: PaymentProviderOptionDto[]): 'paystack' | 'momo' | null {
    const configured = list.filter((p) => p.isConfigured);
    const recommended = configured.find((p) => p.isRecommended);
    const pick = (recommended ?? configured[0])?.provider;
    return pick === 'paystack' || pick === 'momo' ? pick : null;
  }

  onProviderChange(provider: string): void {
    if (provider !== 'paystack' && provider !== 'momo') return;
    const opt = this.providers().find((p) => p.provider === provider);
    if (!opt || !opt.isConfigured) return;
    this.selectedProvider.set(provider);
    this.momoError.set(null);
    if (provider === 'paystack') {
      this.momoValidated.set(false);
    }
    this.emit();
  }

  onMsisdnChange(value: string): void {
    this.userTouchedMsisdn = true;
    this.momoMsisdn.set(value ?? '');
    this.momoValidated.set(false);
    this.momoError.set(null);
    this.emit();
  }

  onMsisdnBlur(): void {
    const raw = this.momoMsisdn().trim();
    if (!raw || raw === this.lastValidatedRaw) return;
    this.runValidation(raw);
  }

  /**
   * Force-revalidates the currently-typed MoMo number. Resolves true when the
   * choice is valid and ready to submit, false otherwise. Paystack always
   * resolves true.
   */
  async validate(): Promise<boolean> {
    if (this.selectedProvider() === 'paystack') return true;
    if (this.selectedProvider() !== 'momo') return false;
    const raw = this.momoMsisdn().trim();
    if (!raw) {
      this.momoError.set('Enter the phone number linked to your MTN MoMo wallet.');
      return false;
    }
    if (this.momoValidated() && raw === this.lastValidatedRaw) return true;
    return this.runValidation(raw);
  }

  private async runValidation(raw: string): Promise<boolean> {
    this.validating.set(true);
    this.momoError.set(null);
    this.momoValidated.set(false);
    try {
      const result = await firstValueFrom(this.api.validateMomoMsisdn(raw));
      if (result.isValid) {
        this.momoMsisdn.set(result.msisdn);
        this.lastValidatedRaw = result.msisdn;
        this.momoValidated.set(true);
        this.emit();
        return true;
      }
      this.lastValidatedRaw = raw;
      this.momoError.set(result.reason ?? 'This number is not registered with MTN MoMo.');
      this.emit();
      return false;
    } catch {
      this.momoError.set('We could not reach MTN MoMo right now. Please try again.');
      this.emit();
      return false;
    } finally {
      this.validating.set(false);
    }
  }

  private emit(): void {
    const p = this.selectedProvider();
    if (p === 'paystack') {
      this.choiceChange.emit({ provider: 'paystack' });
      return;
    }
    if (p === 'momo' && this.momoValidated()) {
      this.choiceChange.emit({ provider: 'momo', payerMsisdn: this.momoMsisdn() });
      return;
    }
    this.choiceChange.emit(null);
  }
}
