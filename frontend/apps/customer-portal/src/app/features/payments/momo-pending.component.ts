import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, interval, switchMap, takeWhile } from 'rxjs';
import { BorderboxApiService } from '../../services/borderbox-api.service';

/**
 * Inline pending UI for an MTN MoMo Collections push.
 * Polls /borderbox/payments/{reference}/status every 4 seconds until the
 * customer approves / declines the prompt on their handset, or the timeout
 * elapses. Mirrors the "approve on your phone" UX MTN ships in its first-party SDK.
 */
@Component({
  selector: 'app-momo-pending',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="momo-pending" role="status" aria-live="polite">
      <div class="momo-pending__logo" aria-hidden="true">
        <span class="material-icons-outlined">smartphone</span>
      </div>
      <h3 class="momo-pending__title">Check your phone</h3>
      <p class="momo-pending__sub">
        We sent an MTN MoMo approval prompt to
        <strong>{{ payerMsisdn }}</strong
        >. Open it and enter your wallet PIN to complete the payment of
        <strong>{{ amountLabel }}</strong
        >.
      </p>

      <div class="momo-pending__spinner" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>

      <p class="momo-pending__hint">
        Approval expires in {{ remainingSeconds() }}s. Keep this page open — it will
        finish automatically once you approve.
      </p>

      @if (error(); as msg) {
        <p class="momo-pending__error">{{ msg }}</p>
      }

      <button
        type="button"
        class="momo-pending__cancel"
        (click)="onCancel()"
        [disabled]="cancelling()"
      >
        Cancel
      </button>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .momo-pending {
        background: linear-gradient(155deg, #fff8e1 0%, #ffe082 100%);
        border-radius: 18px;
        padding: 28px;
        text-align: center;
        color: #3e2723;
        box-shadow: 0 12px 28px -18px rgba(0,0,0,0.25);
      }
      .momo-pending__logo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #ffffffcc;
        margin-bottom: 14px;
      }
      .momo-pending__logo .material-icons-outlined {
        font-size: 32px;
        color: #f9a825;
      }
      .momo-pending__title {
        margin: 0 0 8px;
        font-size: 1.25rem;
      }
      .momo-pending__sub {
        margin: 0 auto 18px;
        max-width: 380px;
        font-size: 0.95rem;
        line-height: 1.45;
      }
      .momo-pending__spinner {
        display: inline-flex;
        gap: 6px;
        margin: 8px 0 14px;
      }
      .momo-pending__spinner span {
        width: 9px; height: 9px; border-radius: 50%;
        background: #f57f17;
        animation: momo-bounce 1.2s infinite ease-in-out;
      }
      .momo-pending__spinner span:nth-child(2) { animation-delay: 0.15s; }
      .momo-pending__spinner span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes momo-bounce {
        0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
      .momo-pending__hint { margin: 0; font-size: 0.85rem; color: #5d4037; }
      .momo-pending__error {
        margin: 12px 0 0;
        padding: 8px 12px;
        background: #fff;
        border-radius: 10px;
        color: #b71c1c;
        font-size: 0.85rem;
      }
      .momo-pending__cancel {
        margin-top: 16px;
        padding: 8px 16px;
        border-radius: 10px;
        border: none;
        background: #6d4c41;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      .momo-pending__cancel:disabled { opacity: 0.5; cursor: not-allowed; }
    `,
  ],
})
export class MomoPendingComponent implements OnInit, OnDestroy {
  @Input({ required: true }) reference!: string;
  @Input({ required: true }) payerMsisdn!: string;
  @Input({ required: true }) amountLabel!: string;

  @Output() readonly succeeded = new EventEmitter<string>();
  @Output() readonly failed = new EventEmitter<string>();
  @Output() readonly cancelled = new EventEmitter<void>();

  private readonly api = inject(BorderboxApiService);
  private readonly destroyRef = inject(DestroyRef);
  private pollSub?: Subscription;

  /** MoMo sandbox approvals time out in ~3 minutes; mirror that on the client. */
  private readonly timeoutSeconds = 180;
  readonly remainingSeconds = signal(this.timeoutSeconds);
  readonly error = signal<string | null>(null);
  readonly cancelling = signal(false);

  ngOnInit(): void {
    this.pollSub = interval(4000)
      .pipe(
        switchMap(() => this.api.getPaymentStatus(this.reference)),
        takeUntilDestroyed(this.destroyRef),
        takeWhile((s) => s.status === 'pending', true),
      )
      .subscribe({
        next: (s) => {
          if (s.status === 'success') {
            this.succeeded.emit(this.reference);
          } else if (s.status === 'failed') {
            this.failed.emit('Payment was not approved. Try again or use another method.');
          }
        },
        error: (err: Error) => this.error.set(err?.message ?? 'Could not check payment status.'),
      });

    const tickSub = interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const next = this.remainingSeconds() - 1;
        if (next <= 0) {
          this.remainingSeconds.set(0);
          this.failed.emit('Payment prompt expired. Please try again.');
          tickSub.unsubscribe();
          this.pollSub?.unsubscribe();
        } else {
          this.remainingSeconds.set(next);
        }
      });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  onCancel(): void {
    this.cancelling.set(true);
    this.pollSub?.unsubscribe();
    this.cancelled.emit();
  }
}
