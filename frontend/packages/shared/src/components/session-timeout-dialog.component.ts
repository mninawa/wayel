import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { SessionTimeoutService } from '../services/session-timeout.service';

/**
 * Modal dialog rendered when {@link SessionTimeoutService} transitions
 * into the `warning` state. Shows a live countdown plus two CTAs:
 *
 *   - **Stay signed in** → `extend()` (returns to the active state and
 *     resets the timer).
 *   - **Sign out now**   → `expireNow()` (skips the rest of the
 *     countdown and triggers the consumer's `onExpired` hook, which
 *     typically clears the session and navigates to the splash).
 *
 * The dialog is intentionally self-contained: it injects the service,
 * subscribes via signals, and renders nothing when state is not
 * `warning`. Drop `<app-session-timeout-dialog />` once at the
 * authenticated shell level and the rest of the app gets covered.
 *
 * Accessibility:
 *
 *   - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`,
 *     `aria-describedby`.
 *   - Auto-focus the primary CTA so keyboard users can extend with
 *     a single Enter press.
 *   - `aria-live="polite"` on the countdown so screen readers
 *     announce the rolling seconds without spamming every tick.
 *   - Backdrop click does NOT dismiss — the operator must make a
 *     deliberate choice. Esc explicitly extends (treated as
 *     "I'm here") since dismissing into oblivion would defeat the
 *     warning's purpose.
 */
@Component({
  selector: 'app-session-timeout-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="backdrop" role="presentation" aria-hidden="true"></div>
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stx-title"
        aria-describedby="stx-body"
        tabindex="-1"
        (keydown.escape)="extend()"
      >
        <div class="emblem" aria-hidden="true">
          <span class="material-icons-outlined">hourglass_top</span>
        </div>
        <h2 id="stx-title" class="title">Are you still there?</h2>
        <p id="stx-body" class="body">
          For your security we’ll sign you out shortly because of inactivity.
        </p>

        <div class="countdown" role="timer" aria-live="polite">
          <span class="countdown-num">{{ countdownLabel() }}</span>
          <span class="countdown-unit">left</span>
          <div
            class="countdown-bar"
            aria-hidden="true"
            [style.--progress]="progress()"
          ></div>
        </div>

        <div class="actions">
          <button
            #stayBtn
            type="button"
            class="btn-primary"
            (click)="extend()"
          >
            Stay signed in
          </button>
          <button
            type="button"
            class="btn-ghost"
            (click)="expireNow()"
          >
            Sign out now
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host { display: contents; }
      .backdrop {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(2px);
        z-index: 9998;
        animation: fade-in 0.18s ease-out;
      }
      .dialog {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: min(92vw, 420px);
        background: #fff;
        border-radius: 16px;
        padding: 1.85rem 1.5rem 1.4rem;
        box-shadow:
          0 1px 1px rgba(15, 23, 42, 0.04),
          0 18px 48px -18px rgba(15, 23, 42, 0.35);
        z-index: 9999;
        text-align: center;
        animation: dialog-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        outline: none;
      }
      @keyframes fade-in {
        from { opacity: 0; } to { opacity: 1; }
      }
      @keyframes dialog-in {
        from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
        to   { opacity: 1; transform: translate(-50%, -50%); }
      }
      .emblem {
        width: 56px; height: 56px; border-radius: 50%;
        margin: 0 auto 0.85rem;
        display: grid; place-items: center;
        background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
        color: #fff;
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
      }
      .emblem .material-icons-outlined { font-size: 28px; }
      .title {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 700;
        color: #0f172a;
      }
      .body {
        margin: 0.4rem 0 0;
        color: #475569;
        font-size: 0.92rem;
        line-height: 1.45;
      }
      .countdown {
        margin: 1.1rem auto 1.2rem;
        display: inline-flex; flex-direction: column; align-items: center;
        gap: 0.25rem;
        padding: 0.6rem 1rem;
        border-radius: 12px;
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        min-width: 8.5rem;
        position: relative;
      }
      .countdown-num {
        font-size: 1.8rem; font-weight: 700;
        color: #b45309;
        letter-spacing: 0.02em;
        font-variant-numeric: tabular-nums;
      }
      .countdown-unit {
        font-size: 0.72rem;
        text-transform: uppercase; letter-spacing: 0.08em;
        color: #92400e;
      }
      .countdown-bar {
        margin-top: 0.35rem;
        height: 4px; width: 100%;
        background: rgba(245, 158, 11, 0.18);
        border-radius: 999px;
        overflow: hidden;
        position: relative;
      }
      .countdown-bar::after {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: calc(var(--progress, 100) * 1%);
        background: linear-gradient(90deg, #f59e0b, #f97316);
        border-radius: 999px;
        transition: width 0.25s linear;
      }
      .actions {
        display: flex; flex-direction: column; gap: 0.5rem;
      }
      .btn-primary, .btn-ghost {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 0.7rem 1.1rem;
        border-radius: 10px;
        font: inherit; font-weight: 600; font-size: 0.95rem;
        cursor: pointer;
        transition: transform 0.08s, box-shadow 0.08s;
      }
      .btn-primary {
        border: none;
        color: #fff;
        background: linear-gradient(135deg, #5ba8e0 0%, #4f7cf3 100%);
        box-shadow: 0 6px 14px -6px rgba(79, 124, 243, 0.55);
      }
      .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 18px -8px rgba(79, 124, 243, 0.6); }
      .btn-primary:focus-visible { outline: 3px solid rgba(79, 124, 243, 0.45); outline-offset: 2px; }
      .btn-ghost {
        background: transparent;
        color: #475569;
        border: 1px solid rgba(15, 23, 42, 0.12);
      }
      .btn-ghost:hover { background: rgba(15, 23, 42, 0.04); }
      .btn-ghost:focus-visible { outline: 3px solid rgba(79, 124, 243, 0.35); outline-offset: 2px; }
      @media (max-width: 380px) {
        .dialog { padding: 1.4rem 1.15rem 1.1rem; border-radius: 12px; }
        .title { font-size: 1.08rem; }
        .countdown-num { font-size: 1.5rem; }
      }
    `,
  ],
})
export class SessionTimeoutDialogComponent {
  private readonly service = inject(SessionTimeoutService);
  private readonly stayBtn =
    viewChild<ElementRef<HTMLButtonElement>>('stayBtn');

  protected readonly visible = computed(() => this.service.state() === 'warning');

  /** Seconds remaining as an integer for display. */
  protected readonly countdownLabel = computed(() => {
    const ms = this.service.remainingMs();
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    if (seconds < 60) return `0:${String(seconds).padStart(2, '0')}`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  /** 0–100 progress used to drive the bar's width. */
  protected readonly progress = computed(() => {
    // Cheapest reasonable derivation: remaining / starting warning.
    // The service holds `warningMs` privately; we approximate via
    // the max observed remainingMs since the dialog opened. That
    // way the bar always animates from 100 → 0 even if the
    // consumer changed the warning window between mounts.
    const remaining = this.service.remainingMs();
    const peak = this.peakRemaining;
    if (remaining <= 0) return 0;
    if (remaining > peak) {
      this.peakRemaining = remaining;
      return 100;
    }
    return Math.max(0, Math.min(100, (remaining / peak) * 100));
  });

  /**
   * Tracks the largest `remainingMs` we've observed in the current
   * warning cycle; reset whenever the dialog hides so the next
   * warning cycle starts fresh.
   */
  private peakRemaining = 0;

  constructor() {
    // Reset the progress baseline + auto-focus the primary CTA every
    // time the dialog flips visible. Effect runs in the component's
    // injection context so it cleans up automatically on destroy.
    effect(() => {
      if (!this.visible()) {
        this.peakRemaining = 0;
        return;
      }
      this.peakRemaining = this.service.remainingMs();
      // Defer focus to the next animation frame so the element is
      // mounted in the DOM before we try to focus it.
      requestAnimationFrame(() => this.stayBtn()?.nativeElement.focus());
    });
  }

  protected extend(): void {
    this.service.extend();
  }

  protected expireNow(): void {
    this.service.expireNow();
  }
}
