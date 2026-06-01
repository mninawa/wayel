import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { InitiateQuoteCheckoutDto, QuoteDetailDto } from '../../services/borderbox-api.service';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import { PaystackCheckoutService } from '../../services/paystack-checkout.service';
import { MomoPendingComponent } from '../payments/momo-pending.component';
import {
  PaymentMethodPickerComponent,
  type PaymentMethodChoice,
} from '../payments/payment-method-picker.component';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-shipping-quote',
  standalone: true,
  imports: [
    RouterLink,
    SuiteExpiredBannerComponent,
    DecimalPipe,
    DatePipe,
    MomoPendingComponent,
    PaymentMethodPickerComponent,
    ConfirmDialogComponent,
    PulseLoaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (quote(); as q) {
      <nav class="crumb"><a routerLink="/quotes/list">Quotes</a> › {{ q.displayNumber }}</nav>
      <div class="head-row">
        <h1>Shipping Quote <span class="material-icons-outlined">description</span></h1>
        <div class="head-actions">
          @if (q.canCancel) {
            <button
              type="button"
              class="bb-btn bb-btn-outline"
              [disabled]="cancelling()"
              (click)="cancel()"
            >
              Cancel quote
            </button>
          }
          @if (q.hasPaymentInvoice) {
            <a
              [href]="paymentInvoiceUrl(q.id)"
              target="_blank"
              rel="noopener"
              class="bb-btn bb-btn-outline"
            >View invoice</a>
          } @else {
            <button type="button" class="bb-btn bb-btn-outline" disabled title="Available after Paystack payment">
              View invoice
            </button>
          }
        </div>
      </div>

      <app-suite-expired-banner />

      <div class="grid">
        <div class="col-left">
          <section class="bb-card bb-card-pad">
            <h2 class="bb-card-title">Quote Summary</h2>
            <dl class="kv">
              <div><dt>Quote Number</dt><dd>{{ q.displayNumber }}</dd></div>
              <div><dt>Created</dt><dd>{{ q.createdAtUtc | date:'d MMM y' }}</dd></div>
              <div><dt>Status</dt><dd>{{ q.statusLabel }}</dd></div>
              <div><dt>Valid Until</dt><dd class="green">{{ q.validUntil | date:'d MMM y, HH:mm' }}</dd></div>
              <div><dt>Ship To</dt><dd>{{ q.shipTo }}</dd></div>
              <div><dt>Est. Delivery</dt><dd>{{ q.deliveryEstimate }}</dd></div>
            </dl>
            @if (q.declaredGoodsValueZar > 0) {
              <div class="declared-note">
                <span>Goods value (paid to Takealot / retailer)</span>
                <strong>R{{ q.declaredGoodsValueZar | number:'1.2-2' }}</strong>
              </div>
            }
            <div class="total-box">
              <span>Total to pay</span>
              <strong>R{{ q.totalLandedCost | number:'1.2-2' }}</strong>
              <small>WeYell fees &amp; customs — not retailer price</small>
            </div>
          </section>
        </div>

        <section class="bb-card bb-card-pad col-mid">
          <div class="card-head">
            <h2 class="bb-card-title">What you pay</h2>
          </div>
          <ul class="breakdown">
            @for (line of q.breakdown; track line.label) {
              <li [class.breakdown-line--info]="line.includedInTotal === false">
                <span>
                  {{ line.label }}
                  @if (line.includedInTotal === false) {
                    <span class="breakdown-tag">not in total</span>
                  }
                </span>
                <span>R{{ line.amount | number:'1.2-2' }}</span>
              </li>
            }
          </ul>
          <div class="total-line">
            <span>Total to pay</span>
            <strong class="green">R{{ q.totalLandedCost | number:'1.2-2' }}</strong>
          </div>
          <p class="info-box">
            @if (q.dutyCharged) {
              Import duty is remitted to Eswatini (applies to items declared above R{{ q.dutyGoodsValueThresholdZar | number:'1.0-0' }} each).
            } @else {
              No Eswatini import duty on this quote — no item is declared above R{{ q.dutyGoodsValueThresholdZar | number:'1.0-0' }}.
            }
            @if (q.vatCharged) {
              WeYell standard take is 25% of declared goods value: 15% VAT (SARS) plus 10% for handling and freight fee.
            } @else {
              Service fees (10% of goods value) apply; VAT is paused on this quote.
            }
            Amounts use your declared goods value — you are not charged the Takealot/retailer price again.
          </p>
        </section>

        <section class="bb-card bb-card-pad col-right">
          <h2 class="bb-card-title">Shipment Breakdown</h2>
          <dl class="kv sm">
            <div><dt>Parcels</dt><dd>{{ q.parcelCount }}</dd></div>
            <div><dt>Total Weight</dt><dd>{{ q.totalWeightKg | number:'1.1-1' }} kg</dd></div>
            <div><dt>Method</dt><dd>{{ q.deliveryMethod }}</dd></div>
            <div><dt>Consolidation</dt><dd>{{ q.consolidation }}</dd></div>
            <div><dt>Warehouse</dt><dd>{{ q.warehouse }}</dd></div>
            <div>
              <dt>Ship-Out</dt>
              <dd [class.danger]="q.shipOutLocked">
                {{ q.shipOutLocked ? '🔒 Locked (Suite Expired)' : '✓ Available' }}
              </dd>
            </div>
          </dl>
          @if (q.linkedParcels.length > 0) {
            <h3 class="sub-title">Linked parcels</h3>
            <ul class="linked">
              @for (p of q.linkedParcels; track p.parcelId) {
                <li>
                  <a [routerLink]="['/parcels', p.parcelId]">{{ p.reference }}</a>
                  <span>{{ p.itemName }}</span>
                  <span class="muted">R{{ p.declaredValueZar | number:'1.2-2' }}</span>
                </li>
              }
            </ul>
          }
        </section>
      </div>

      @if (q.status === 'ConvertedToShipment' || q.status === 'Paid') {
        <footer class="sticky-bar bb-card bb-card-pad approved">
          <span class="material-icons-outlined">check_circle</span>
          <span>Payment received — your shipment is being prepared.</span>
          <a
            [routerLink]="q.shipmentId ? ['/shipments', q.shipmentId, 'track'] : ['/shipments', 'active', 'track']"
            class="bb-btn bb-btn-primary"
          >Track shipment</a>
        </footer>
      } @else if (q.shipOutLocked || q.status === 'BlockedSuiteExpired') {
        <footer class="sticky-bar bb-card bb-card-pad">
          <span class="material-icons-outlined">lock</span>
          <span>Renew your suite access to approve and pay for this quote.</span>
          <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew suite</a>
        </footer>
      } @else if (q.canApprove) {
        <footer class="sticky-bar bb-card bb-card-pad">
          <span>Review the breakdown, then approve to unlock payment.</span>
          <button
            type="button"
            class="bb-btn bb-btn-primary"
            [disabled]="approving()"
            (click)="approve()"
          >
            Approve quote
          </button>
        </footer>
      } @else if (q.canPay) {
        @if (momoPending(); as momo) {
          <app-momo-pending
            [reference]="momo.reference"
            [payerMsisdn]="momo.payerMsisdn"
            [amountLabel]="momo.amountLabel"
            (succeeded)="onMomoSucceeded($event)"
            (failed)="onMomoFailed($event)"
            (cancelled)="onMomoCancelled()"
          />
        } @else {
          <section
            #payPanel
            class="pay-panel bb-card bb-card-pad"
            tabindex="-1"
            id="choose-payment-method"
          >
            <h2 class="pay-panel-title">Choose payment method</h2>
            <app-payment-method-picker
              [defaultMsisdn]="defaultPayerMsisdn()"
              (choiceChange)="paymentChoice.set($event)"
            />
          </section>
          <footer class="sticky-bar bb-card bb-card-pad">
            <span>Pay the landed cost to create your shipment (parcels move to ship-out after payment).</span>
            <button
              type="button"
              class="bb-btn bb-btn-primary"
              [disabled]="paying() || !paymentChoice()"
              (click)="pay()"
            >
              Pay R{{ q.totalLandedCost | number:'1.2-2' }}
            </button>
          </footer>
        }
      } @else if (q.status === 'Cancelled') {
        <footer class="sticky-bar bb-card bb-card-pad">
          <span>This quote was cancelled.</span>
          <a routerLink="/quotes/request" class="bb-btn bb-btn-primary">Request new quote</a>
        </footer>
      } @else if (q.status === 'Expired') {
        <footer class="sticky-bar bb-card bb-card-pad">
          <span>This quote has expired. Request a new quote from your parcels.</span>
          <a routerLink="/quotes/request" class="bb-btn bb-btn-primary">Request new quote</a>
        </footer>
      }
    } @else if (loadError()) {
      <p class="err">{{ loadError() }}</p>
    } @else {
      <nk-pulse-loader label="Loading quote…" />
    }

    @if (actionError()) {
      <p class="err pad">{{ actionError() }}</p>
    }

    <app-confirm-dialog
      [open]="showCancelDialog()"
      title="Cancel this quote?"
      message="Linked parcels will return to your inbox and can be quoted again. This cannot be undone."
      confirmLabel="Cancel quote"
      cancelLabel="Keep quote"
      tone="danger"
      [busy]="cancelling()"
      (confirmed)="confirmCancel()"
      (cancelled)="dismissCancelDialog()"
    />
  `,
  styles: `
    .crumb { font-size: 0.82rem; margin-bottom: 0.75rem; }
    .crumb a { color: var(--bb-link); text-decoration: none; font-weight: 600; }
    .head-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
    .head-row h1 { margin: 0; font-size: 1.35rem; display: flex; align-items: center; gap: 0.35rem; }
    .head-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .grid { display: grid; grid-template-columns: 1fr 1.1fr 0.9fr; gap: 1rem; margin-bottom: 5rem; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .kv > div { display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; }
    .kv dt { color: var(--bb-muted); margin: 0; }
    .kv dd { margin: 0; font-weight: 600; }
    .kv .green { color: var(--bb-success); }
    .kv .danger { color: var(--bb-danger); }
    .total-box {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--bb-success-soft);
      border-radius: var(--bb-radius-sm);
      text-align: center;
    }
    .total-box strong { display: block; font-size: 1.75rem; color: #15803d; }
    .total-box small { font-size: 0.78rem; color: var(--bb-success); }
    .declared-note {
      margin-top: 0.75rem;
      padding: 0.5rem 0.65rem;
      background: #f8fafc;
      border-radius: var(--bb-radius-sm);
      font-size: 0.78rem;
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .declared-note span { color: var(--bb-muted); }
    .declared-note strong { color: var(--bb-text); font-weight: 600; }
    .breakdown { list-style: none; margin: 0; padding: 0; }
    .breakdown li { display: flex; justify-content: space-between; padding: 0.45rem 0; font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; }
    .breakdown-line--info { background: #f8fafc; color: var(--bb-muted); font-style: italic; }
    .breakdown-tag {
      display: inline-block;
      margin-left: 0.35rem;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--bb-muted);
      font-style: normal;
    }
    .total-line { display: flex; justify-content: space-between; padding: 0.75rem 0; font-weight: 700; }
    .green { color: #15803d; }
    .info-box { font-size: 0.85rem; padding: 0.7rem 0.85rem; background: var(--bb-info-bg); border: 1px solid var(--bb-info-border); border-radius: var(--bb-radius-sm); color: var(--bb-info-text); margin: 0; line-height: 1.45; }
    .sticky-bar {
      position: fixed;
      bottom: 0;
      left: var(--portal-sidebar-offset, var(--bb-sidebar-w));
      right: 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding-inline: var(--bb-content-pad-x);
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
      z-index: 10;
    }
    .sticky-bar span:nth-child(1):not(.material-icons-outlined) { flex: 1; font-size: 0.85rem; color: var(--bb-muted); }
    .sticky-bar.approved { background: var(--bb-success-soft); }
    .pay-panel {
      margin-top: 1rem;
      margin-bottom: 6rem;
      scroll-margin-top: 1rem;
      outline: none;
      transition: box-shadow 240ms ease;
    }
    .pay-panel:focus,
    .pay-panel:focus-visible {
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.18);
    }
    .pay-panel-title {
      margin: 0 0 0.6rem;
      font-size: 1rem;
      font-weight: 600;
    }
    .err { color: var(--bb-danger); font-size: 0.85rem; }
    .pad { padding: 1rem; }
    .muted { color: var(--bb-muted); }
    .sub-title { font-size: 0.85rem; margin: 1rem 0 0.5rem; }
    .linked { list-style: none; margin: 0; padding: 0; font-size: 0.82rem; }
    .linked li { display: flex; flex-wrap: wrap; gap: 0.35rem 0.75rem; padding: 0.35rem 0; border-bottom: 1px solid #f1f5f9; }
    .linked a { color: var(--bb-link); font-weight: 600; text-decoration: none; }
    @media (max-width: 1023px) {
      .sticky-bar {
        left: 0;
      }
    }
  `,
})
export class ShippingQuoteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(BorderboxApiService);
  private readonly parcelsSvc = inject(ParcelsService);
  private readonly paystack = inject(PaystackCheckoutService);
  private readonly accountApi = inject(CustomerAccountService);

  readonly paymentChoice = signal<PaymentMethodChoice | null>(null);
  readonly picker = viewChild(PaymentMethodPickerComponent);
  readonly payPanelRef = viewChild<ElementRef<HTMLElement>>('payPanel');
  /** Guards us from re-scrolling every time the user clicks around. */
  private hasFocusedPayPanel = false;

  constructor() {
    // The moment the quote becomes payable and the pay panel is mounted,
    // smooth-scroll it into view and move keyboard focus to it so the user
    // arriving from the wizard immediately lands on "Choose payment method"
    // instead of having to scroll past the quote summary.
    effect(() => {
      const q = this.quote();
      const el = this.payPanelRef()?.nativeElement;
      const pending = this.momoPending();
      if (!q?.canPay || pending || !el || this.hasFocusedPayPanel) return;
      this.hasFocusedPayPanel = true;
      // Wait one frame so layout has settled before scrolling.
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        try {
          el.focus({ preventScroll: true });
        } catch {
          /* older browsers — silently fall back to scrollIntoView alone */
        }
      });
    });
  }
  /**
   * Picks the phone we should pre-fill on the MoMo picker, in priority order:
   *   1. The customer's default delivery address phone (most likely to be the
   *      number they actually use on their phone, since the SPA forces them
   *      to enter it on /my-address).
   *   2. Any delivery address phone they have on file.
   *   3. The legacy `profile.phone` field.
   * All three may be saved via the /my-address page.
   */
  readonly defaultPayerMsisdn = computed((): string | null => {
    const acc = this.accountApi.account();
    if (!acc) return null;
    const defaultAddr = acc.deliveryAddresses.find((a) => a.isDefault && a.phone?.trim());
    if (defaultAddr?.phone) return defaultAddr.phone;
    const anyAddr = acc.deliveryAddresses.find((a) => a.phone?.trim());
    if (anyAddr?.phone) return anyAddr.phone;
    return acc.profile.phone?.trim() || null;
  });

  readonly momoPending = signal<{
    reference: string;
    payerMsisdn: string;
    amountLabel: string;
  } | null>(null);

  paymentInvoiceUrl(quoteId: string): string {
    return this.api.quotePaymentInvoiceDownloadUrl(quoteId);
  }

  readonly quote = signal<QuoteDetailDto | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly approving = signal(false);
  readonly paying = signal(false);
  readonly cancelling = signal(false);
  readonly showCancelDialog = signal(false);

  ngOnInit(): void {
    this.parcelsSvc.loadDashboard().subscribe();
    this.reload();
  }

  private reload(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.getQuote(id).subscribe({
      next: (q) => this.quote.set(q),
      error: () => this.loadError.set('Quote not found.'),
    });
  }

  approve(): void {
    const q = this.quote();
    if (!q || !q.canApprove) return;
    this.approving.set(true);
    this.actionError.set(null);
    this.api.approveQuote(q.id).subscribe({
      next: () => {
        this.approving.set(false);
        this.reload();
      },
      error: (err: { error?: { detail?: string }; message?: string }) => {
        this.approving.set(false);
        this.actionError.set(
          err?.error?.detail ?? err?.message ?? 'Could not approve quote.',
        );
      },
    });
  }

  async pay(): Promise<void> {
    const q = this.quote();
    if (!q || !q.canPay) return;

    const picker = this.picker();
    const ready = picker ? await picker.validate() : false;
    if (!ready) return;
    const choice = this.paymentChoice();
    if (!choice) return;

    this.paying.set(true);
    this.actionError.set(null);
    this.momoPending.set(null);
    const callbackUrl = `${window.location.origin}/quotes/${q.id}/checkout/complete`;
    const msisdn = choice.payerMsisdn ?? this.defaultPayerMsisdn() ?? undefined;
    this.api
      .initiateQuoteCheckout(q.id, callbackUrl, {
        provider: choice.provider,
        payerMsisdn: msisdn,
      })
      .subscribe({
        next: (res) => {
          this.paying.set(false);
          if (res.provider === 'momo') {
            this.momoPending.set({
              reference: res.reference,
              payerMsisdn: msisdn ?? 'your phone',
              amountLabel: `R ${res.amountZar.toFixed(2)}`,
            });
            return;
          }
          this.onPaystackInitiated(res);
        },
        error: (err: { error?: { detail?: string }; message?: string }) => {
          this.paying.set(false);
          this.actionError.set(
            err?.error?.detail ?? err?.message ?? 'Could not start checkout.',
          );
        },
      });
  }

  onMomoSucceeded(reference: string): void {
    this.momoPending.set(null);
    const q = this.quote();
    if (!q) return;
    this.api.completeQuoteCheckout(reference).subscribe({
      next: () => this.router.navigateByUrl(`/quotes/${q.id}/checkout/complete?provider=momo`),
      error: (err: { error?: { detail?: string }; message?: string }) =>
        this.actionError.set(
          err?.error?.detail ?? err?.message ?? 'Could not finalise MoMo payment.',
        ),
    });
  }

  onMomoFailed(message: string): void {
    this.momoPending.set(null);
    this.actionError.set(message);
  }

  onMomoCancelled(): void {
    this.momoPending.set(null);
  }

  private onPaystackInitiated(res: InitiateQuoteCheckoutDto): void {
    const q = this.quote();
    if (!q) return;
    this.paystack
      .start(res)
      .then((outcome) => {
        if (outcome.status === 'success') {
          // The inline popup finished successfully — hand off to the
          // existing /checkout/complete page so we verify with Paystack
          // server-side and then create the shipment.
          this.router.navigateByUrl(
            `/quotes/${q.id}/checkout/complete?reference=${encodeURIComponent(outcome.reference)}`,
          );
          return;
        }
        if (outcome.status === 'error') {
          this.actionError.set(outcome.message);
        }
        // status === 'cancelled' → user closed the popup, nothing to do
        // beyond letting them retry from the same page.
      })
      .catch(() => {
        window.location.href = res.authorizationUrl;
      });
  }

  cancel(): void {
    const q = this.quote();
    if (!q || !q.canCancel) return;
    // Open the in-app confirm modal instead of using the native browser
    // dialog — keeps the experience on-brand and accessible.
    this.showCancelDialog.set(true);
  }

  dismissCancelDialog(): void {
    if (this.cancelling()) return;
    this.showCancelDialog.set(false);
  }

  confirmCancel(): void {
    const q = this.quote();
    if (!q || !q.canCancel) {
      this.showCancelDialog.set(false);
      return;
    }
    this.cancelling.set(true);
    this.actionError.set(null);
    this.api.cancelQuote(q.id).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.showCancelDialog.set(false);
        this.reload();
      },
      error: (err: { error?: { detail?: string }; message?: string }) => {
        this.cancelling.set(false);
        this.showCancelDialog.set(false);
        this.actionError.set(
          err?.error?.detail ?? err?.message ?? 'Could not cancel quote.',
        );
      },
    });
  }
}
