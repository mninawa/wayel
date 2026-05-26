import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BrandWatermarkBackdropComponent } from '@wayel/shared/components/brand-watermark-backdrop.component';
import { resetHttpErrorUnauthorizedLatch } from '@wayel/shared/interceptors/http-error.interceptor';
import { AccountsBridgeService } from '@wayel/shared/services/accounts-bridge.service';
import { BffAuthService } from '@wayel/shared/services/bff-auth.service';
import { ConnectivityService } from '@wayel/shared/services/connectivity.service';
import { environment } from '../../../environments/environment';
import { CustomerAccountService } from '../../services/customer-account.service';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [BrandWatermarkBackdropComponent, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nk-brand-watermark-backdrop />
    <div class="auth">
      <aside class="brand-panel">
        <a routerLink="/" class="logo">
          <span class="logo-icon" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40">
              <rect width="40" height="40" rx="10" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)"/>
              <path d="M10 20h20M10 14h12M10 26h16" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </span>
          <strong>WeYell</strong>
        </a>
        <p class="tagline">Shop in South Africa. Deliver to Eswatini.</p>
        <span class="phase-badge">🇸🇿 Eswatini Phase 1</span>

        <div class="hero">
          <h1>Your South Africa shopping, <em>simplified.</em></h1>
          <p>Sign up with Google, complete your profile, then activate your personal suite in South Africa.</p>
          <ol class="journey-steps">
            <li><span>1</span> Sign in with Google</li>
            <li><span>2</span> Complete your profile</li>
            <li><span>3</span> Choose suite plan &amp; pay</li>
            <li><span>4</span> Start shopping with your SA address</li>
          </ol>
        </div>
      </aside>

      <main class="form-panel">
        <section class="form-card">
          <h2>Get started</h2>
          <p class="sub">Sign up or sign in with your Google account</p>

          @if (sessionExpired()) {
            <div class="session-note" role="status">Your session expired. Please sign in again.</div>
          }

          <button
            type="button"
            class="google primary-google"
            (click)="signInWithGoogle()"
            [disabled]="busy() || connectivity.isDisconnected()"
            [title]="connectivity.isDisconnected() ? connectivity.message() : null"
          >
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.7-11.3 7.7-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 5.5 29.3 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 5.5 29.3 3.5 24 3.5 16.3 3.5 9.7 8 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44.5c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.3 35.5 26.8 36.5 24 36.5c-5.4 0-9.7-3.2-11.3-7.7l-6.5 5C9.5 40.3 16.2 44.5 24 44.5z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.2 5.2c-.4.4 6.7-4.9 6.7-14.8 0-1.2-.1-2.4-.3-3.5z"/>
            </svg>
            {{ busy() ? 'Connecting…' : 'Continue with Google' }}
          </button>

          <p class="google-note">We use Google to create your WeYell account securely. No password needed.</p>

          @if (showPassword()) {
            <div class="or"><span>or use email (dev)</span></div>
            <form (ngSubmit)="onSubmit()" novalidate>
              <label class="field">
                <span>Email</span>
                <input type="email" [ngModel]="email()" (ngModelChange)="email.set($event)" name="email" />
              </label>
              <label class="field">
                <span>Password</span>
                <input [type]="showPwd() ? 'text' : 'password'" [ngModel]="password()" (ngModelChange)="password.set($event)" name="password" />
              </label>
              @if (serverError(); as err) {
                <p class="err" role="alert">{{ err }}</p>
              }
              <button type="submit" class="submit secondary" [disabled]="busy()">Sign in with email</button>
            </form>
          }

          @if (serverError(); as err) {
            <p class="err" role="alert">{{ err }}</p>
          }
        </section>
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-height: 100vh;
    }
    .auth {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-height: 100vh;
    }
    @media (max-width: 960px) { .auth { grid-template-columns: 1fr; } .brand-panel { display: none; } }
    .brand-panel {
      background: var(--bb-navy);
      color: #fff;
      padding: 2rem 2.5rem;
      display: flex;
      flex-direction: column;
    }
    .logo { display: flex; align-items: center; gap: 0.65rem; color: #fff; text-decoration: none; font-size: 1.1rem; }
    .tagline { margin: 0.35rem 0 0.75rem; font-size: 0.82rem; opacity: 0.75; }
    .phase-badge {
      display: inline-block;
      width: fit-content;
      padding: 0.3rem 0.65rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.1);
      font-size: 0.72rem;
      font-weight: 600;
      margin-bottom: 2rem;
    }
    .hero h1 { font-size: 2rem; font-weight: 700; line-height: 1.15; margin: 0 0 1rem; }
    .hero h1 em { color: #6eb5ff; font-style: normal; }
    .hero p { opacity: 0.85; line-height: 1.55; max-width: 400px; }
    .journey-steps {
      list-style: none;
      margin: 1.5rem 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .journey-steps li {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.88rem;
      font-weight: 500;
    }
    .journey-steps span {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(255,255,255,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 700;
    }
    .form-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background: transparent;
    }
    .form-card {
      width: 100%;
      max-width: 420px;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(15, 23, 42, 0.1);
      border-radius: 4px;
      box-shadow:
        0 1px 0 rgba(15, 23, 42, 0.06),
        0 24px 48px -20px rgba(15, 23, 42, 0.22);
      padding: 2rem;
    }
    .form-card h2 { margin: 0; font-size: 1.45rem; font-weight: 700; }
    .sub { margin: 0.35rem 0 1.5rem; color: var(--bb-muted); font-size: 0.88rem; }
    .session-note {
      padding: 0.65rem;
      margin-bottom: 1rem;
      background: var(--bb-warning-soft);
      border-radius: var(--bb-radius-sm);
      font-size: 0.82rem;
      color: #92400e;
    }
    .google.primary-google {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fff;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--bb-text);
    }
    .google.primary-google:hover { background: #f8fafc; box-shadow: var(--bb-shadow); }
    .google-note {
      margin: 0.85rem 0 0;
      text-align: center;
      font-size: 0.78rem;
      color: var(--bb-muted);
    }
    .dev-block {
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px dashed var(--bb-border);
    }
    .dev-label { margin: 0 0 0.65rem; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bb-muted); }
    .dev-btn {
      width: 100%;
      margin-bottom: 0.5rem;
      padding: 0.65rem;
      border: 1px solid var(--bb-primary);
      border-radius: var(--bb-radius-sm);
      background: var(--bb-primary-soft);
      color: var(--bb-primary-deep);
      font-weight: 600;
      font-size: 0.85rem;
    }
    .dev-btn.secondary { background: #fff; border-color: var(--bb-border); color: var(--bb-muted); }
    .or { display: flex; align-items: center; gap: 0.75rem; margin: 1.25rem 0; color: var(--bb-muted); font-size: 0.78rem; }
    .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--bb-border); }
    .field { display: block; margin-bottom: 0.75rem; }
    .field span { display: block; font-size: 0.78rem; font-weight: 600; color: var(--bb-muted); margin-bottom: 0.3rem; }
    .field input {
      width: 100%;
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
    }
    .submit.secondary {
      width: 100%;
      padding: 0.65rem;
      border: none;
      border-radius: var(--bb-radius-sm);
      background: var(--bb-muted);
      color: #fff;
      font-weight: 600;
    }
    .err { color: #b91c1c; font-size: 0.85rem; margin-top: 0.75rem; }
  `,
})
export class SignInComponent implements OnInit {
  private readonly accounts = inject(AccountsBridgeService);
  private readonly journey = inject(CustomerAccountService);
  private readonly bffAuth = inject(BffAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly connectivity = inject(ConnectivityService);

  email = signal('');
  password = signal('');
  busy = signal(false);
  showPwd = signal(false);
  serverError = signal<string | null>(null);
  sessionExpired = signal(false);
  showPassword = () => environment.passwordSignInEnabled;

  ngOnInit(): void {
    this.sessionExpired.set(
      this.route.snapshot.queryParamMap.get('reason') === 'session-expired',
    );
    const ssoError = this.route.snapshot.queryParamMap.get('sso_error');
    if (ssoError) {
      const lower = ssoError.toLowerCase();
      this.serverError.set(
        lower.includes('invalid_client')
          ? 'Google sign-in failed: invalid OAuth client secret. Set GOOGLEOIDC__CLIENTSECRET in your root .env (from Google Cloud Console), then restart bff-customer.'
          : lower.includes('idx10500') || lower.includes('signature validation')
          ? 'Google sign-in could not be verified (missing signing keys). Restart the BFF after deploy, then try again — or use email and password below.'
          : lower.includes('name or service not known') || lower.includes('idx208')
            ? 'Google sign-in could not reach accounts.google.com from the server (Docker DNS/network). Sign in with email and password below, or restart Docker and try Google again.'
            : 'Google sign-in did not complete. Try again or use email and password below.',
      );
    }
  }

  signInWithGoogle(): void {
    this.serverError.set(null);
    if (this.connectivity.isDisconnected()) {
      this.serverError.set(this.connectivity.message());
      return;
    }
    if (environment.useBffAuth) {
      const returnUrl =
        this.route.snapshot.queryParamMap.get('next') ?? '/dashboard';
      this.bffAuth.signInWithGoogle(returnUrl);
      return;
    }
    this.serverError.set(
      'Google SSO requires BFF mode. Run npm run dev:portal:bff to enable it.',
    );
  }

  onSubmit(): void {
    if (this.busy() || !this.email().trim() || !this.password()) return;
    this.busy.set(true);
    this.serverError.set(null);
    this.accounts.login({ email: this.email().trim(), password: this.password() }).subscribe({
      next: () => {
        this.journey.loadAccount().subscribe({
          next: (acc) => {
            resetHttpErrorUnauthorizedLatch();
            this.busy.set(false);
            void this.router.navigateByUrl(this.journey.getPostAuthRoute({
              profileComplete: acc.profileComplete,
              suiteEligible: acc.suiteEligible,
              hasSuite: acc.hasSuite,
              hasPayLaterIntent: acc.onboardingIntent?.kind === 'pay_later',
            }));
          },
        });
      },
      error: (err: Error) => {
        this.busy.set(false);
        this.serverError.set(err?.message || 'Could not sign in.');
      },
    });
  }
}
