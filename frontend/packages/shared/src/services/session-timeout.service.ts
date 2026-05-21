import { Injectable, signal } from '@angular/core';

/**
 * Lifecycle states the inactivity timer drives the SPA through.
 *
 *   `idle`     — service started but not yet armed (or stopped).
 *   `active`   — armed and watching for activity. Countdown not running.
 *   `warning`  — user has been inactive long enough that the dialog
 *                should ask "are you still there?". A short countdown
 *                is now ticking; any genuine activity is intentionally
 *                ignored — we want a deliberate "Stay signed in" click
 *                so an absent user doesn't get bumped back to active by
 *                an accidental mouse jiggle from a screensaver.
 *   `expired`  — countdown elapsed (or `expireNow()` was called). The
 *                onExpired hook has run; the consumer is responsible
 *                for clearing the local session and routing the user
 *                to the session-expired splash.
 */
export type SessionTimeoutState = 'idle' | 'active' | 'warning' | 'expired';

export interface SessionTimeoutOptions {
  /**
   * Total inactivity window in milliseconds before the session
   * is considered expired. The warning dialog appears earlier;
   * see {@link warningMs}.
   */
  idleMs: number;

  /**
   * How many milliseconds *before* {@link idleMs} elapses we should
   * surface the warning state. A value of 60_000 with `idleMs`
   * 25 minutes means the dialog appears at 24 minutes of inactivity
   * and counts down for the final minute.
   */
  warningMs: number;

  /**
   * Invoked exactly once when the state transitions to `expired`.
   * Typical implementation: clear the in-memory token, hit the BFF
   * sign-out endpoint, then `router.navigate(['/session-expired'])`.
   * The service intentionally does NOT navigate on its own so each
   * app can compose its own teardown sequence (toasts, BFF calls,
   * analytics) before the redirect.
   */
  onExpired: () => void;
}

const DEFAULTS: SessionTimeoutOptions = {
  idleMs: 25 * 60 * 1000,
  warningMs: 60 * 1000,
  onExpired: () => {
    /* must be overridden by the consumer */
  },
};

const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
];

/**
 * Inactivity-based session timeout tracker.
 *
 * Wired in once at the authenticated shell level — not at the app
 * level — so anonymous surfaces (login, accept-invitation, public
 * tenant pages) don't pay for the listeners or accidentally redirect
 * a brand-new visitor mid sign-in.
 *
 * Activity is detected via a small set of passive `window` listeners
 * (movement, keys, touch, scroll, wheel). During the `warning` window
 * those listeners are intentionally muted so the operator must
 * deliberately click "Stay signed in" — the goal is to defend against
 * an unattended workstation, and a stray mouse hover from a
 * screensaver shouldn't qualify.
 *
 * The service never imports the dialog, the router, or any session
 * service directly: callers compose those pieces in `onExpired`. That
 * keeps it portable across the REMOVED (BFF sign-out) and
 * customer-portal (account-session clear) without conditional logic.
 */
@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly stateSig = signal<SessionTimeoutState>('idle');
  private readonly remainingMsSig = signal<number>(0);

  /** Read-only reactive view of the current state. */
  readonly state = this.stateSig.asReadonly();

  /** Read-only reactive view of milliseconds left in the warning countdown. */
  readonly remainingMs = this.remainingMsSig.asReadonly();

  private opts: SessionTimeoutOptions = DEFAULTS;
  private armed = false;
  private listenersAttached = false;

  /** Timer that fires when the warning window should open. */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Interval that updates the visible countdown during `warning`. */
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  private readonly activityHandler = (): void => this.onActivity();
  private readonly visibilityHandler = (): void => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') this.onActivity();
  };

  /**
   * Begin tracking inactivity. Idempotent — call this from each
   * authenticated shell's `ngOnInit`. Calling on an already-armed
   * service updates the options (idleMs / warningMs / onExpired)
   * without re-attaching listeners.
   */
  start(opts: Partial<SessionTimeoutOptions> & { onExpired: () => void }): void {
    this.opts = { ...DEFAULTS, ...opts };
    if (!this.listenersAttached) {
      this.attachListeners();
      this.listenersAttached = true;
    }
    this.armed = true;
    this.stateSig.set('active');
    this.scheduleIdleTimer();
  }

  /**
   * Stop tracking — called from `ngOnDestroy` on the authenticated
   * shell, or after an explicit sign-out so the timer doesn't keep
   * running across the public chrome.
   */
  stop(): void {
    this.armed = false;
    this.stateSig.set('idle');
    this.clearIdleTimer();
    this.clearCountdownTimer();
    if (this.listenersAttached) {
      this.detachListeners();
      this.listenersAttached = false;
    }
  }

  /**
   * "I'm still here." Resets the timer back to the full idle window.
   * Called from the warning dialog's primary CTA. Safe to call from
   * any state — a no-op when the service is `idle` or `expired`.
   */
  extend(): void {
    if (!this.armed) return;
    if (this.stateSig() === 'expired') return;
    this.stateSig.set('active');
    this.clearCountdownTimer();
    this.scheduleIdleTimer();
  }

  /**
   * Force the timer into the `expired` state immediately. Used by the
   * warning dialog's "Sign out now" CTA so an operator who knows
   * they're done doesn't have to wait for the countdown.
   */
  expireNow(): void {
    if (!this.armed) return;
    if (this.stateSig() === 'expired') return;
    this.stateSig.set('expired');
    this.clearIdleTimer();
    this.clearCountdownTimer();
    try {
      this.opts.onExpired();
    } catch (err) {
      console.error('[SessionTimeoutService] onExpired threw', err);
    }
  }

  // ── internals ────────────────────────────────────────────────────

  private attachListeners(): void {
    if (typeof window === 'undefined') return;
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, this.activityHandler, { passive: true });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private detachListeners(): void {
    if (typeof window === 'undefined') return;
    for (const ev of ACTIVITY_EVENTS) {
      window.removeEventListener(ev, this.activityHandler);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private onActivity(): void {
    if (!this.armed) return;
    // Activity during the warning window is intentionally ignored —
    // see class doc for rationale.
    if (this.stateSig() !== 'active') return;
    this.scheduleIdleTimer();
  }

  private scheduleIdleTimer(): void {
    this.clearIdleTimer();
    const totalMs = Math.max(0, this.opts.idleMs - this.opts.warningMs);
    this.idleTimer = setTimeout(() => this.openWarning(), totalMs);
  }

  private openWarning(): void {
    if (!this.armed) return;
    this.stateSig.set('warning');
    const warningMs = this.opts.warningMs;
    this.remainingMsSig.set(warningMs);
    const start = Date.now();
    this.clearCountdownTimer();
    this.countdownTimer = setInterval(() => {
      if (this.stateSig() !== 'warning') {
        this.clearCountdownTimer();
        return;
      }
      const remaining = Math.max(0, warningMs - (Date.now() - start));
      this.remainingMsSig.set(remaining);
      if (remaining <= 0) {
        this.expireNow();
      }
    }, 250);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer != null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer != null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
