import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BffAuthService } from '../services/bff-auth.service';
import {
  WayelAcceptInvitationService,
  consumePendingInvitationToken,
  rememberPendingInvitationToken,
  type WayelAcceptInvitationError,
  type WayelInvitationPreview,
} from '../services/wayel-accept-invitation.service';

/**
 * Visible phases in the accept flow. The first three are common to
 * both Google and password paths; `submitting` covers the actual
 * accept call (either flavour); `success` / `error` are terminal.
 *
 *   resolving   — pulling token off URL + previewing
 *   choosing    — chooser UI ("Continue with Google" vs "Set a password")
 *   redirecting — bouncing through OIDC for the Google path
 *   submitting  — POSTing /accept (Google) or /accept-password
 *   success     — short confirmation before navigating away
 *   error       — surfaced inline with retry where appropriate
 */
type Phase =
  | 'resolving'
  | 'choosing'
  | 'redirecting'
  | 'submitting'
  | 'success'
  | 'error';

/**
 * Audience-agnostic invitation acceptance screen.
 *
 *   /invitations/accept?token=<opaque>
 *
 * Two parallel acceptance paths are offered:
 *
 *   A. **Continue with Google** — the existing SSO flow. We bounce the
 *      browser through the BFF's OIDC handshake; the token survives
 *      the redirect via sessionStorage. After the user signs in we
 *      POST /staff-invitations/accept and the API binds the existing
 *      Google-backed user to the invitation's tenant + role.
 *
 *   B. **Set a password** — for recipients without a Gmail / Workspace
 *      address. We POST `{ token, password, displayName? }` straight
 *      to /staff-invitations/accept-password (anonymous, rate-limited).
 *      The API mints a brand-new password-credentialed user, accepts
 *      the invitation, and returns a fresh AuthSession. We then route
 *      to the audience-specific landing page.
 *
 * If the user is *already* signed in when they land here we skip the
 * chooser and just submit the SSO accept. The chooser is only shown
 * for fresh sessions.
 */
@Component({
  selector: 'nk-wayel-accept-invitation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="accept-shell">
      <div class="accept-card">
        <h1 class="accept-title">Accept your invitation</h1>

        @if (preview(); as p) {
          <p class="accept-sub">
            You're joining
            <strong>{{ p.tenantName }}</strong>
            as <strong>{{ formatRole(p.role) }}</strong>.
            <br />
            <span class="muted">Invitation sent to {{ p.email }}.</span>
          </p>
        }

        @switch (phase()) {
          @case ('resolving') {
            <div class="state">
              <div class="spinner" aria-hidden="true"></div>
              <p>Checking your link…</p>
            </div>
          }
          @case ('choosing') {
            <div class="chooser">
              <p class="chooser-intro">
                Pick how you want to sign in. You can always link the other
                method to your account later.
              </p>

              <button
                type="button"
                class="btn google"
                (click)="onChooseGoogle()"
              >
                <svg class="g-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.6 12.227c0-.665-.06-1.305-.171-1.92H12v3.633h5.39a4.61 4.61 0 0 1-2 3.027v2.51h3.234c1.892-1.744 2.985-4.31 2.985-7.25z"/>
                  <path fill="#34A853" d="M12 22c2.7 0 4.965-.895 6.62-2.422l-3.234-2.51c-.897.602-2.045.96-3.386.96-2.604 0-4.81-1.76-5.598-4.123H3.07v2.59A9.997 9.997 0 0 0 12 22z"/>
                  <path fill="#FBBC04" d="M6.402 13.905a5.99 5.99 0 0 1 0-3.81V7.504H3.07a9.997 9.997 0 0 0 0 8.992l3.332-2.59z"/>
                  <path fill="#EA4335" d="M12 5.967c1.467 0 2.785.504 3.823 1.495l2.866-2.866C16.96 2.917 14.696 2 12 2A9.997 9.997 0 0 0 3.07 7.504l3.332 2.59C7.19 7.728 9.396 5.967 12 5.967z"/>
                </svg>
                Continue with Google
              </button>

              <div class="divider"><span>or</span></div>

              <button
                type="button"
                class="btn primary"
                (click)="onChoosePassword()"
              >
                <svg class="key-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor"/>
                </svg>
                Set a password instead
              </button>

              <p class="chooser-note">
                Use a password if your invitation was sent to a non-Gmail
                address (such as your work email or Outlook), or if you
                prefer not to use Google.
              </p>
            </div>
          }
          @case ('redirecting') {
            <div class="state">
              <div class="spinner" aria-hidden="true"></div>
              <p>Redirecting you to Google to sign in…</p>
              <p class="muted">
                You'll come back here automatically once you've signed in
                with the email this invitation was sent to.
              </p>
            </div>
          }
          @case ('submitting') {
            <div class="state">
              <div class="spinner" aria-hidden="true"></div>
              <p>{{ submittingLabel() }}</p>
            </div>
          }
          @case ('success') {
            <div class="state success">
              <div class="check" aria-hidden="true">&#10004;</div>
              <p class="big">You're in!</p>
              <p>Welcome to {{ audienceLabel() ?? 'Wayel' }}. Redirecting…</p>
            </div>
          }
          @case ('error') {
            <div class="state error">
              <div class="cross" aria-hidden="true">!</div>
              <p class="big">{{ errorTitle() }}</p>
              <p>{{ errorDetail() }}</p>
              @if (canRetry()) {
                <button type="button" class="btn primary" (click)="retry()">
                  Try again
                </button>
              }
              @if (canChooseAgain()) {
                <button type="button" class="btn ghost" (click)="resetToChooser()">
                  Pick a different sign-in method
                </button>
              }
            </div>
          }
        }

        @if (showPasswordForm()) {
          <form
            class="password-form"
            (submit)="$event.preventDefault(); submitPassword()"
            novalidate
          >
            <div class="pw-head">
              <button
                type="button"
                class="pw-back"
                (click)="cancelPassword()"
                aria-label="Back to choices"
              >
                ← Back
              </button>
              <h2 class="pw-title">Set a password</h2>
            </div>

            @if (preview(); as p) {
              <p class="pw-email">
                Account: <strong>{{ p.email }}</strong>
              </p>
            }

            <label class="pw-field">
              <span class="pw-label">Your name</span>
              <input
                type="text"
                name="display_name"
                autocomplete="name"
                placeholder="Coach Casey"
                maxlength="120"
                [(ngModel)]="displayName"
              />
              <span class="pw-help">
                What should we show next to your account in the app?
              </span>
            </label>

            <label class="pw-field">
              <span class="pw-label">Password</span>
              <input
                type="password"
                name="new_password"
                autocomplete="new-password"
                minlength="8"
                required
                placeholder="At least 8 characters"
                [(ngModel)]="password"
              />
            </label>

            <label class="pw-field">
              <span class="pw-label">Confirm password</span>
              <input
                type="password"
                name="confirm_password"
                autocomplete="new-password"
                minlength="8"
                required
                placeholder="Re-enter the same password"
                [(ngModel)]="confirmPassword"
              />
            </label>

            @if (passwordError(); as msg) {
              <p class="pw-error">{{ msg }}</p>
            }

            <button
              type="submit"
              class="btn primary block"
              [disabled]="submittingPassword()"
            >
              {{ submittingPassword() ? 'Creating your account…' : 'Create account & accept' }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .accept-shell {
      min-height: 100vh;
      display: grid; place-items: center;
      padding: 2rem 1rem;
      background: linear-gradient(135deg, #f8fafc, #eef2ff);
    }
    .accept-card {
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
      padding: 2rem 2.4rem;
      max-width: 460px; width: 100%;
      text-align: center;
    }
    .accept-title {
      margin: 0 0 0.5rem;
      font-size: 1.4rem; font-weight: 700;
      color: #111827;
    }
    .accept-sub {
      margin: 0 0 1.4rem;
      font-size: 0.95rem;
      color: #374151;
      line-height: 1.45;
    }
    .state {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.8rem;
      color: #374151;
      padding: 1rem 0;
    }
    .state.success { color: #047857; }
    .state.error { color: #b91c1c; }
    .big { font-size: 1.05rem; font-weight: 600; margin: 0.3rem 0; }
    .muted { color: #6b7280; font-size: 0.9rem; }
    .spinner {
      width: 38px; height: 38px;
      border: 3px solid #e5e7eb;
      border-top-color: #4338ca;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    .check, .cross {
      width: 56px; height: 56px;
      border-radius: 50%;
      display: grid; place-items: center;
      font-size: 28px; font-weight: 700;
      color: #fff;
    }
    .check { background: #10b981; }
    .cross { background: #ef4444; }

    /* ── Chooser ── */
    .chooser { display: flex; flex-direction: column; gap: 0.9rem; }
    .chooser-intro {
      margin: 0;
      color: #4b5563;
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .chooser-note {
      margin: 0.4rem 0 0;
      font-size: 0.8rem;
      color: #6b7280;
      line-height: 1.45;
    }
    .divider {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      color: #9ca3af;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0.2rem 0;
    }
    .divider::before, .divider::after {
      content: ''; height: 1px; background: #e5e7eb;
    }

    /* ── Buttons ── */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      padding: 0.65rem 1rem;
      border: 1px solid transparent;
      border-radius: 10px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
    }
    .btn.primary {
      background: #4338ca; color: #fff;
    }
    .btn.primary:hover:not(:disabled) { background: #3730a3; }
    .btn.primary:disabled {
      background: #c7d2fe;
      cursor: not-allowed;
    }
    .btn.google {
      background: #fff;
      color: #1f2937;
      border-color: #d1d5db;
    }
    .btn.google:hover { background: #f9fafb; }
    .btn.ghost {
      margin-top: 0.4rem;
      background: transparent;
      color: #4338ca;
      border: 0;
      font-weight: 500;
      text-decoration: underline;
    }
    .btn.block { width: 100%; }
    .g-icon { width: 18px; height: 18px; }
    .key-icon { width: 18px; height: 18px; }

    /* ── Password form ── */
    .password-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
      text-align: left;
    }
    .pw-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .pw-back {
      background: transparent;
      border: 0;
      color: #4338ca;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
    }
    .pw-back:hover { text-decoration: underline; }
    .pw-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: #111827;
    }
    .pw-email {
      margin: 0;
      font-size: 0.9rem;
      color: #4b5563;
    }
    .pw-field { display: flex; flex-direction: column; gap: 0.35rem; }
    .pw-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #4b5563;
    }
    .pw-field input {
      padding: 0.55rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font: inherit;
      font-size: 0.95rem;
    }
    .pw-field input:focus {
      outline: none;
      border-color: #4338ca;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }
    .pw-help { font-size: 0.78rem; color: #6b7280; }
    .pw-error {
      margin: 0;
      padding: 0.55rem 0.75rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      font-size: 0.85rem;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class WayelAcceptInvitationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(BffAuthService);
  private readonly api = inject(WayelAcceptInvitationService);

  /**
   * Where to send the user after a successful acceptance. Each portal
   * passes its own landing route via the route data hash:
   *
   *   { data: { successRedirectPath: '/staff/dashboard' } }
   *
   * Defaults to "/" so callers that forget to set it still navigate
   * somewhere sane.
   */
  readonly successRedirectPath = signal<string>('/');

  /** Audience-friendly noun ("staff console", "parent area") for confirmation. */
  readonly audienceLabel = signal<string | null>(null);

  readonly phase = signal<Phase>('resolving');
  readonly errorTitle = signal<string>('Something went wrong');
  readonly errorDetail = signal<string>('Please try the link again.');
  readonly canRetry = computed(() =>
    this.phase() === 'error' && this.errorIsRetryable());
  readonly canChooseAgain = computed(() =>
    this.phase() === 'error' && this.errorAllowsChooserReset());
  private readonly errorIsRetryable = signal<boolean>(false);
  private readonly errorAllowsChooserReset = signal<boolean>(false);

  /** Anonymous preview pulled before the chooser is rendered. */
  readonly preview = signal<WayelInvitationPreview | null>(null);

  /** True while the password form is open underneath the chooser. */
  readonly showPasswordForm = signal(false);
  protected password = '';
  protected confirmPassword = '';
  protected displayName = '';
  protected readonly passwordError = signal<string | null>(null);
  protected readonly submittingPassword = signal(false);

  /** Submitting label varies by path so the user knows what's happening. */
  protected readonly submittingLabel = signal('Activating your access…');

  /** The token currently being processed. Held in a signal so `retry()` works. */
  private readonly currentToken = signal<string | null>(null);

  ngOnInit(): void {
    const data = this.route.snapshot.data ?? {};
    if (typeof data['successRedirectPath'] === 'string') {
      this.successRedirectPath.set(data['successRedirectPath']);
    }
    if (typeof data['audienceLabel'] === 'string') {
      this.audienceLabel.set(data['audienceLabel']);
    }

    const queryToken = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
    const token = queryToken || consumePendingInvitationToken() || '';

    if (!token) {
      this.fail(
        'Missing invitation link',
        'This page needs the invitation link from your email. Please open the link in the message we sent you.',
        false,
      );
      return;
    }

    this.currentToken.set(token);
    void this.bootstrap(token);
  }

  /**
   * Initial token-driven page setup: resolve preview, decide whether
   * to auto-submit (already signed-in) or render the chooser.
   */
  private async bootstrap(token: string): Promise<void> {
    // Preview is best-effort: the API gates the actual accept call,
    // so a failed preview just falls through to the chooser without
    // the friendly "joining X as Staff" copy.
    try {
      const preview = await this.api.preview(token);
      this.preview.set(preview);

      // Trust the preview status as a fast pre-flight: skip the
      // submit roundtrip if we already know the link is dead.
      if (preview && preview.status !== 'Pending') {
        this.surfaceTerminalPreview(preview.status);
        return;
      }
    } catch {
      // Network-only failure — no preview, but the user can still try.
      this.preview.set(null);
    }

    // Already signed in? Skip the chooser, run the SSO accept.
    const me = await this.auth.me();
    if (me) {
      this.submittingLabel.set('Activating your access…');
      this.phase.set('submitting');
      void this.runSso(token);
      return;
    }

    // Anonymous and the link is still pending → chooser.
    this.phase.set('choosing');
  }

  /** Fired when the user clicks "Continue with Google" on the chooser. */
  onChooseGoogle(): void {
    const token = this.currentToken();
    if (!token) return;
    rememberPendingInvitationToken(token);
    this.phase.set('redirecting');
    this.auth.signInWithGoogle('/invitations/accept');
  }

  /** Fired when the user clicks "Set a password instead". */
  onChoosePassword(): void {
    this.passwordError.set(null);
    this.password = '';
    this.confirmPassword = '';
    // Pre-seed the display name from the invitation email's local part
    // so the user can just hit Enter on the form for a sensible default.
    const p = this.preview();
    if (p && !this.displayName) {
      const local = p.email.split('@')[0] ?? '';
      this.displayName = local
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    this.showPasswordForm.set(true);
  }

  cancelPassword(): void {
    this.showPasswordForm.set(false);
    this.passwordError.set(null);
  }

  /** Reset terminal-error state and let the user pick the other path. */
  resetToChooser(): void {
    this.errorAllowsChooserReset.set(false);
    this.errorIsRetryable.set(false);
    this.showPasswordForm.set(false);
    this.phase.set('choosing');
  }

  async submitPassword(): Promise<void> {
    if (this.submittingPassword()) return;

    const token = this.currentToken();
    if (!token) return;

    if (!this.password || this.password.length < 8) {
      this.passwordError.set('Choose a password of at least 8 characters.');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.passwordError.set('Passwords do not match.');
      return;
    }

    this.submittingPassword.set(true);
    this.passwordError.set(null);
    this.submittingLabel.set('Creating your account…');

    try {
      await this.api.acceptWithPassword(
        token,
        this.password,
        this.displayName?.trim() || null,
      );
      this.phase.set('success');
      // Brief moment so the user sees the success state. The BFF
      // wrapper has set the session cookie on this same response, so
      // a *hard* navigation re-bootstraps the SPA against the cookie
      // — that triggers the regular /bff/auth/me hydration the rest
      // of the app already relies on (auth guards, session signals,
      // tenant branding, etc.). A soft `Router.navigateByUrl` would
      // bypass that bootstrap and the user would land on the
      // dashboard logged-in-by-cookie but logged-out-by-signal.
      window.setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = this.successRedirectPath();
        } else {
          void this.router.navigateByUrl(this.successRedirectPath());
        }
      }, 900);
    } catch (e) {
      this.submittingPassword.set(false);
      this.handlePasswordError(e as WayelAcceptInvitationError);
    }
  }

  /** Manual retry — only enabled for transient (5xx / network) failures. */
  retry(): void {
    const token = this.currentToken();
    if (!token) return;
    this.errorIsRetryable.set(false);
    this.errorAllowsChooserReset.set(false);
    void this.bootstrap(token);
  }

  /**
   * Run the SSO accept call. The user is already authenticated when
   * we get here — bootstrap() guarantees it (or kicks the OIDC flow
   * itself).
   */
  private async runSso(token: string): Promise<void> {
    try {
      await this.api.accept(token);
      this.phase.set('success');
      window.setTimeout(() => {
        void this.router.navigateByUrl(this.successRedirectPath());
      }, 900);
    } catch (e) {
      this.handleSsoError(e as WayelAcceptInvitationError);
    }
  }

  private handleSsoError(err: WayelAcceptInvitationError): void {
    const code = err.code ?? '';
    if (code === 'invitation.email_mismatch') {
      this.fail(
        'Wrong account',
        `This invitation is for a different email address. Sign out and sign back in with the email that received the invitation, or use "Set a password" instead.`,
        false,
        true,
      );
      return;
    }
    if (code === 'invitation.expired') {
      this.fail(
        'Invitation expired',
        'This invitation has expired. Please ask the person who invited you to send a new link.',
        false,
      );
      return;
    }
    if (code === 'invitation.revoked') {
      this.fail(
        'Invitation revoked',
        'This invitation has been revoked. Please reach out to the institution if you believe this was a mistake.',
        false,
      );
      return;
    }
    if (code === 'invitation.already_accepted') {
      this.fail(
        'Already accepted',
        'This invitation has already been redeemed. You should already have access — try signing in directly.',
        false,
      );
      return;
    }
    if (code === 'invitation.not_found' || code === 'invitation.token_invalid') {
      this.fail(
        'Invalid link',
        'We could not find that invitation. Please double-check the link from your email.',
        false,
      );
      return;
    }
    if (code === 'invitation.authentication_required') {
      // Cookie expired between bootstrap and the POST. Bounce back into
      // the OIDC flow with the token preserved.
      const token = this.currentToken();
      if (token) rememberPendingInvitationToken(token);
      this.phase.set('redirecting');
      this.auth.signInWithGoogle('/invitations/accept');
      return;
    }
    // Unknown / 5xx — let the user retry.
    this.fail("We couldn't finish accepting", err.message ?? 'Please try again.', err.status >= 500);
  }

  private handlePasswordError(err: WayelAcceptInvitationError): void {
    const code = err.code ?? '';
    if (code === 'invitation.email_already_registered') {
      this.passwordError.set(
        'An account already exists for this email. Use "Continue with Google" or sign in first, then re-open the link.',
      );
      this.errorAllowsChooserReset.set(true);
      return;
    }
    if (code === 'invitation.expired') {
      this.passwordError.set(
        'This invitation has expired. Please ask the person who invited you to send a new link.',
      );
      return;
    }
    if (code === 'invitation.revoked' || code === 'invitation.already_revoked') {
      this.passwordError.set(
        'This invitation has been revoked. Please reach out to the institution if you believe this was a mistake.',
      );
      return;
    }
    if (code === 'invitation.already_accepted') {
      this.passwordError.set(
        'This invitation has already been redeemed. Try signing in directly.',
      );
      return;
    }
    if (code === 'invitation.token_invalid' || code === 'invitation.not_found') {
      this.passwordError.set(
        'We could not find that invitation. Please double-check the link from your email.',
      );
      return;
    }
    if (code === 'invitation.password_too_weak') {
      this.passwordError.set('Choose a password of at least 8 characters.');
      return;
    }
    this.passwordError.set(err.message ?? 'Could not create your account. Please try again.');
  }

  private surfaceTerminalPreview(status: WayelInvitationPreview['status']): void {
    if (status === 'Expired') {
      this.fail(
        'Invitation expired',
        'This invitation has expired. Please ask the person who invited you to send a new link.',
        false,
      );
      return;
    }
    if (status === 'Revoked') {
      this.fail(
        'Invitation revoked',
        'This invitation has been revoked. Please reach out to the institution if you believe this was a mistake.',
        false,
      );
      return;
    }
    if (status === 'Accepted') {
      this.fail(
        'Already accepted',
        'This invitation has already been redeemed. You should already have access — try signing in directly.',
        false,
      );
      return;
    }
    // Defensive: anything else falls back to the chooser.
    this.phase.set('choosing');
  }

  private fail(
    title: string,
    detail: string,
    retryable: boolean,
    allowChooserReset: boolean = false,
  ): void {
    this.errorTitle.set(title);
    this.errorDetail.set(detail);
    this.errorIsRetryable.set(retryable);
    this.errorAllowsChooserReset.set(allowChooserReset);
    this.phase.set('error');
  }

  protected formatRole(role: string): string {
    if (!role) return 'Staff';
    // Friendly casing — "Staff" / "Tenant Admin".
    return role.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
}
