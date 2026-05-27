import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { resetHttpErrorUnauthorizedLatch } from '@wayel/shared/interceptors/http-error.interceptor';
import { AccountsBridgeService } from '@wayel/shared/services/accounts-bridge.service';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { BffAuthService } from '@wayel/shared/services/bff-auth.service';
import { environment } from '../../../environments/environment';
import { PRODUCT_NAME } from '../../brand';

interface FormState {
  email: string;
  password: string;
}

const EMPTY: FormState = { email: '', password: '' };

/**
 * /login — production-grade split-screen sign-in for parents & staff.
 *
 * Left panel: rotating kids-themed photography behind a brand gradient
 * with hero copy + value props.
 *
 * Right panel: email + password form with SSO buttons, password
 * visibility toggle, "remember me", a live recognition hint, and a
 * collapsible Demo accounts picker so the demo reel still works.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login-shell">
      <!-- ── Brand panel ──────────────────────────────────────────── -->
      <aside class="brand-panel" aria-hidden="true">
        <div class="brand-bg">
          <div class="brand-bg-fallback"></div>
          @for (img of backgroundImages; track img.url; let i = $index) {
            @if (!imageFailed()[i]) {
              <img
                class="brand-bg-img"
                [class.active]="currentImageIndex() === i"
                [src]="img.url"
                [alt]="img.alt"
                loading="eager"
                decoding="async"
                referrerpolicy="no-referrer"
                (error)="onImageError(i)"
              />
            }
          }
          <div class="brand-bg-tint"></div>
        </div>

        <div class="brand-top">
          <span class="brand-wordmark">{{ productName }}</span>
        </div>

        <div class="brand-hero">
          <h2 class="hero-title">Shop in South Africa. Deliver to Eswatini.</h2>
          <p class="hero-sub">
            Track parcels from US retailers, upload invoices, approve quotes,
            and follow your shipment home — all in one WeYell customer portal.
          </p>

          <ul class="hero-bullets" role="list">
            <li>
              <span class="material-icons-outlined" aria-hidden="true">inventory_2</span>
              See every parcel the moment it hits our warehouse
            </li>
            <li>
              <span class="material-icons-outlined" aria-hidden="true">request_quote</span>
              Review quotes and pay when you're ready to ship
            </li>
            <li>
              <span class="material-icons-outlined" aria-hidden="true">local_shipping</span>
              Live tracking from checkout to delivery in Eswatini
            </li>
          </ul>

          @let curImg = backgroundImages[currentImageIndex()];
          <p class="hero-caption">
            <span class="material-icons-outlined" aria-hidden="true">photo_camera</span>
            {{ curImg.caption }}
          </p>

          <div class="hero-dots" role="tablist" aria-label="Background photo">
            @for (img of backgroundImages; track img.url; let i = $index) {
              @if (!imageFailed()[i]) {
                <button
                  type="button"
                  role="tab"
                  class="hero-dot"
                  [class.active]="currentImageIndex() === i"
                  [attr.aria-selected]="currentImageIndex() === i"
                  [attr.aria-label]="'Show photo: ' + img.alt"
                  (click)="setImage(i)"
                ></button>
              }
            }
          </div>
        </div>

        <footer class="brand-foot">
          <span>© {{ year }} WeYell</span>
          <span class="brand-foot-links">
            <a routerLink="/" class="brand-foot-link">About</a>
          </span>
        </footer>
      </aside>

      <!-- ── Form panel ───────────────────────────────────────────── -->
      <main class="form-panel">
        <header class="form-head">
          <a routerLink="/" class="back-link">
            <span class="material-icons-outlined" aria-hidden="true">arrow_back</span>
            Back
          </a>
          <div class="brand-mobile">
            <span class="brand-wordmark">{{ productName }}</span>
          </div>
        </header>

        <section class="form-card">
          @if (sessionExpired()) {
            <div class="session-banner" role="status" aria-live="polite">
              <span class="session-banner-icon" aria-hidden="true">
                <span class="material-icons-outlined">lock_clock</span>
              </span>
              <span class="session-banner-text">
                <strong class="session-banner-title">Your session expired</strong>
                <span class="session-banner-body">
                  For your security, we signed you out after a period of
                  inactivity. Sign in again to pick up where you left off.
                </span>
              </span>
            </div>
            <h1 class="card-title">Sign back in</h1>
          } @else {
            <h1 class="card-title">Welcome back</h1>
            <p class="card-sub">
              Sign in to see today's reports, photos and schedule.
            </p>
          }

          <div class="sso-row">
            <button
              type="button"
              class="sso-btn"
              (click)="signInWithGoogle()"
            >
              <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.7-11.3 7.7-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 5.5 29.3 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 5.5 29.3 3.5 24 3.5 16.3 3.5 9.7 8 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44.5c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.3 35.5 26.8 36.5 24 36.5c-5.4 0-9.7-3.2-11.3-7.7l-6.5 5C9.5 40.3 16.2 44.5 24 44.5z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.2 5.2c-.4.4 6.7-4.9 6.7-14.8 0-1.2-.1-2.4-.3-3.5z"/>
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              class="sso-btn"
              (click)="ssoUnavailable('Apple')"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="#000">
                <path d="M16.365 1.43c0 1.14-.404 2.21-1.213 3.04-.97 1.01-2.13 1.6-3.27 1.5-.16-1.13.43-2.32 1.18-3.06.83-.84 2.27-1.49 3.3-1.48zm3.41 16.34c-.6 1.4-.9 2-1.66 3.23-.96 1.62-2.32 3.64-4 3.65-1.49.01-1.88-.97-3.92-.96-2.04.01-2.46 1-3.96.95-1.69-.05-2.97-1.86-3.93-3.48-2.69-4.55-2.97-9.88-1.32-12.74 1.18-2.04 3.05-3.23 4.81-3.23 1.79 0 2.92 1 4.4 1 1.43 0 2.31-1 4.39-1 1.59 0 3.27.86 4.46 2.36-3.92 2.16-3.28 7.79.74 10.22z"/>
              </svg>
              Continue with Apple
            </button>
          </div>

          @if (passwordSignInEnabled) {
          <div class="divider"><span>or sign in with email</span></div>

          <form (ngSubmit)="onSubmit()" novalidate autocomplete="on">
            <label class="field">
              <span class="lbl">Email</span>
              <input
                type="email"
                autocomplete="username"
                inputmode="email"
                required
                [ngModel]="form().email"
                (ngModelChange)="patch({ email: $event })"
                name="email"
                placeholder="you@email.com"
              />
            </label>

            <label class="field">
              <span class="lbl-row">
                <span class="lbl">Password</span>
                <a
                  href="#"
                  class="lbl-link"
                  (click)="$event.preventDefault(); forgot()"
                >Forgot?</a>
              </span>
              <span class="pwd-wrap">
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                  [ngModel]="form().password"
                  (ngModelChange)="patch({ password: $event })"
                  name="password"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  class="pwd-toggle"
                  (click)="showPassword.set(!showPassword())"
                  [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                >
                  <span class="material-icons-outlined" aria-hidden="true">
                    {{ showPassword() ? 'visibility_off' : 'visibility' }}
                  </span>
                </button>
              </span>
            </label>

            <label class="remember">
              <input
                type="checkbox"
                [checked]="remember()"
                (change)="remember.set(!!$any($event.target).checked)"
              />
              <span>Keep me signed in on this device</span>
            </label>

            @if (serverError(); as err) {
              <p class="err" role="alert">
                <span class="material-icons-outlined" aria-hidden="true">error</span>
                {{ err }}
              </p>
            }

            <button
              type="submit"
              class="btn-primary"
              [disabled]="busy() || !canSubmit()"
            >
              @if (busy()) {
                <span class="spinner" aria-hidden="true"></span>
                Signing in…
              } @else {
                Sign in
                <span class="material-icons-outlined" aria-hidden="true">arrow_forward</span>
              }
            </button>
          </form>

          <p class="card-foot">
            New here?
            <a routerLink="/register">Create an account</a>
          </p>
          } @else {
          <p class="sso-only-note" role="note">
            <span class="material-icons-outlined" aria-hidden="true">verified_user</span>
            WeYell uses single sign-on only. Continue with your
            Google or Apple account to sign in or create your family
            account.
          </p>
          }

        </section>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #f3f4f6;
      }
      .login-shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
      }

      /* ── Brand panel ─────────────────────────────────────────── */
      .brand-panel {
        position: relative;
        padding: 2.25rem 2.5rem;
        color: #fff;
        background:
          radial-gradient(900px 700px at 0% 0%, rgba(255,255,255,0.18), transparent 60%),
          linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
        isolation: isolate;
      }
      .brand-panel > * { position: relative; z-index: 2; }

      .brand-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        overflow: hidden;
      }
      .brand-bg-fallback {
        position: absolute;
        inset: 0;
        background-color: #ec4899;
        background-image:
          radial-gradient(circle at 22% 18%, #fbbf24 0 26px, transparent 28px),
          radial-gradient(circle at 78% 22%, #34d399 0 22px, transparent 24px),
          radial-gradient(circle at 18% 78%, #60a5fa 0 28px, transparent 30px),
          radial-gradient(circle at 82% 72%, #f472b6 0 24px, transparent 26px),
          radial-gradient(circle at 50% 45%, #a78bfa 0 18px, transparent 20px),
          radial-gradient(circle at 38% 60%, #22d3ee 0 16px, transparent 18px),
          radial-gradient(circle at 65% 35%, #fde047 0 14px, transparent 16px),
          linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%);
        background-size: 140% 140%, 130% 130%, 150% 150%, 120% 120%, 110% 110%, 130% 130%, 140% 140%, 100% 100%;
      }
      .brand-bg-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        opacity: 0;
        transform: scale(1.04);
        transition: opacity 1.4s ease-in-out, transform 8s ease-out;
        pointer-events: none;
      }
      .brand-bg-img.active {
        opacity: 1;
        transform: scale(1);
      }
      .brand-bg-tint {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(165deg,
            rgba(249, 115, 22, 0.55) 0%,
            rgba(236, 72, 153, 0.45) 45%,
            rgba(139, 92, 246, 0.55) 100%),
          linear-gradient(to bottom,
            rgba(0,0,0,0) 50%,
            rgba(0,0,0,0.35) 100%);
        pointer-events: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .brand-bg-img { transition: none; transform: none; }
      }

      .brand-top {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
      }
      .brand-wordmark {
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #fff;
      }

      .brand-hero { max-width: 460px; }
      .hero-title {
        margin: 0 0 0.85rem;
        font-size: 2rem;
        line-height: 1.15;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .hero-sub {
        margin: 0 0 1.5rem;
        font-size: 0.95rem;
        line-height: 1.55;
        color: rgba(255,255,255,0.86);
      }
      .hero-bullets {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .hero-bullets li {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 0.88rem;
        color: rgba(255,255,255,0.92);
      }
      .hero-bullets .material-icons-outlined {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: rgba(255,255,255,0.18);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      }
      .hero-caption {
        margin: 1.25rem 0 0.65rem;
        font-size: 0.78rem;
        color: rgba(255,255,255,0.78);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-style: italic;
      }
      .hero-caption .material-icons-outlined { font-size: 16px; opacity: 0.8; }
      .hero-dots {
        display: inline-flex;
        gap: 6px;
        margin-top: 4px;
      }
      .hero-dot {
        appearance: none;
        border: none;
        cursor: pointer;
        width: 22px;
        height: 4px;
        border-radius: 999px;
        background: rgba(255,255,255,0.32);
        padding: 0;
        transition: background 0.2s, width 0.25s;
      }
      .hero-dot:hover { background: rgba(255,255,255,0.55); }
      .hero-dot.active {
        background: #fff;
        width: 32px;
      }

      .brand-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.78rem;
        color: rgba(255,255,255,0.72);
      }
      .brand-foot-links { display: inline-flex; gap: 14px; }
      .brand-foot-links a {
        color: inherit;
        text-decoration: none;
      }
      .brand-foot-links a:hover { color: #fff; }

      /* ── Form panel ──────────────────────────────────────────── */
      .form-panel {
        padding: 1.5rem 2.25rem 2rem;
        display: flex;
        flex-direction: column;
        background: #f3f4f6;
        overflow-y: auto;
      }
      .form-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.25rem;
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85rem;
        color: #4b5563;
        text-decoration: none;
        font-weight: 500;
      }
      .back-link:hover { color: var(--sd-color-primary, #ec4899); }
      .back-link .material-icons-outlined { font-size: 18px; }
      .brand-mobile {
        display: none;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        color: #111827;
      }
      .brand-mobile .brand-wordmark {
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--bb-ink);
      }

      .form-card {
        width: 100%;
        max-width: 420px;
        margin: auto;
        padding: 2rem;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        box-shadow: 0 24px 48px -28px rgba(15, 23, 42, 0.18);
      }
      .card-title {
        margin: 0 0 0.4rem;
        font-size: 1.45rem;
        font-weight: 700;
        color: #111827;
      }
      .card-sub {
        margin: 0 0 1.25rem;
        font-size: 0.85rem;
        line-height: 1.5;
        color: #6b7280;
      }

      /*
        Session-expired banner — shown above the form when the auth
        interceptor redirects with ?reason=session-expired. Calm amber
        treatment, single visual, replaces the previous toast pile-up.
      */
      .session-banner {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin: 0 0 1.1rem;
        padding: 12px 14px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 12px;
        color: #78350f;
      }
      .session-banner-icon {
        flex: none;
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: #fef3c7;
        color: #b45309;
      }
      .session-banner-icon .material-icons-outlined {
        font-size: 20px;
      }
      .session-banner-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .session-banner-title {
        font-size: 0.92rem;
        font-weight: 700;
        color: #92400e;
      }
      .session-banner-body {
        font-size: 0.8rem;
        line-height: 1.45;
        color: #78350f;
      }

      .sso-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 1.1rem;
      }
      .sso-btn {
        appearance: none;
        border: 1px solid #e5e7eb;
        background: #fff;
        border-radius: 10px;
        padding: 0.6rem 0.5rem;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #374151;
        transition: border-color 0.15s, background 0.15s;
      }
      .sso-btn:hover {
        border-color: #ec4899;
        background: #fff7fb;
      }
      .divider {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.72rem;
        color: #9ca3af;
        margin: 0.85rem 0;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .divider::before,
      .divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #e5e7eb;
      }

      .sso-only-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0.9rem 0 0.4rem;
        padding: 10px 12px;
        border-radius: 10px;
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        color: #0c4a6e;
        font-size: 12px;
        line-height: 1.45;
      }
      .sso-only-note .material-icons-outlined {
        font-size: 18px;
        color: #0369a1;
        flex-shrink: 0;
      }

      form { display: flex; flex-direction: column; gap: 0.85rem; }
      .field { display: flex; flex-direction: column; gap: 6px; }
      .lbl-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .lbl {
        font-size: 0.78rem;
        font-weight: 600;
        color: #374151;
      }
      .lbl-link {
        font-size: 0.74rem;
        font-weight: 600;
        color: #ec4899;
        text-decoration: none;
      }
      .lbl-link:hover { text-decoration: underline; }
      .field input,
      .pwd-wrap input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.6rem 0.75rem;
        border-radius: 10px;
        border: 1px solid #e5e7eb;
        background: #fff;
        font: inherit;
        font-size: 0.9rem;
        color: #111827;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .field input:focus,
      .pwd-wrap input:focus {
        outline: none;
        border-color: #ec4899;
        box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.14);
      }

      .pwd-wrap { position: relative; display: block; }
      .pwd-wrap input { padding-right: 38px; }
      .pwd-toggle {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: none;
        background: transparent;
        cursor: pointer;
        color: #6b7280;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .pwd-toggle:hover { color: #ec4899; background: #f3f4f6; }
      .pwd-toggle .material-icons-outlined { font-size: 18px; }

      .remember {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.82rem;
        color: #4b5563;
        cursor: pointer;
        user-select: none;
      }
      .remember input {
        width: 16px;
        height: 16px;
        accent-color: #ec4899;
        cursor: pointer;
      }

      .err,
      .hint {
        margin: 0;
        padding: 0.55rem 0.7rem;
        border-radius: 10px;
        font-size: 0.82rem;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .err {
        background: #fef2f2;
        color: #991b1b;
        border: 1px solid #fecaca;
      }
      .err .material-icons-outlined { font-size: 18px; }
      .hint {
        background: #ecfeff;
        color: #155e75;
        border: 1px solid #a5f3fc;
      }
      .hint .material-icons-outlined { font-size: 18px; }

      .btn-primary {
        appearance: none;
        border: none;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        font-size: 0.92rem;
        padding: 0.7rem 1rem;
        border-radius: 10px;
        background: linear-gradient(135deg, #f97316, #ec4899);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: filter 0.15s, transform 0.05s;
        margin-top: 0.25rem;
      }
      .btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
      .btn-primary:active:not(:disabled) { transform: scale(0.99); }
      .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
      .btn-primary .material-icons-outlined { font-size: 18px; }

      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.4);
        border-top-color: #fff;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      .card-foot {
        margin: 1.25rem 0 0;
        text-align: center;
        font-size: 0.85rem;
        color: #6b7280;
      }
      .card-foot a {
        color: #ec4899;
        font-weight: 600;
        text-decoration: none;
      }
      .card-foot a:hover { text-decoration: underline; }

      /* Demo accounts */
      .advanced {
        margin-top: 1rem;
        border-top: 1px dashed #e5e7eb;
        padding-top: 0.85rem;
      }
      .advanced summary {
        cursor: pointer;
        font-size: 0.78rem;
        font-weight: 600;
        color: #6b7280;
        list-style: none;
      }
      .advanced summary::-webkit-details-marker { display: none; }
      .advanced summary::before {
        content: '+ ';
        font-weight: 700;
      }
      .advanced[open] summary::before { content: '− '; }
      .advanced-hint {
        margin: 0.5rem 0 0.75rem;
        font-size: 0.74rem;
        color: #6b7280;
      }
      .advanced-hint code {
        background: #f3f4f6;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 0.78rem;
      }
      .demo-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .demo-card {
        width: 100%;
        display: grid;
        grid-template-columns: 32px 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 0.5rem 0.65rem;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: #fff;
        font: inherit;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.15s, background 0.15s;
      }
      .demo-card:hover {
        border-color: #ec4899;
        background: #fff7fb;
      }
      .avatar {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        color: #fff;
        font-weight: 700;
        font-size: 0.72rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .demo-main {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .demo-name {
        font-weight: 600;
        font-size: 0.85rem;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .demo-email {
        font-size: 0.72rem;
        color: #6b7280;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .role-pill {
        font-size: 0.65rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }
      .role-pill[data-role='parent'] { background: #fce7f3; color: #be185d; }
      .role-pill[data-role='staff']  { background: #dbeafe; color: #1d4ed8; }

      /* Responsive
       *
       * 760px (not the usual 960) so the brand carousel stays on screen
       * for all normal laptop widths — 12" MacBooks, split-screen, and
       * landscape iPads all sit above this line. Phones and narrow
       * portrait tablets drop to the single-column form-only view.
       */
      @media (max-width: 760px) {
        .login-shell { grid-template-columns: 1fr; }
        .brand-panel { display: none; }
        .form-panel { padding: 1.25rem 1rem 2rem; }
        .brand-mobile { display: inline-flex; }
        .form-card { padding: 1.5rem; box-shadow: none; border-radius: 14px; }
      }
    `,
  ],
})
export class LoginComponent implements OnInit {
  readonly productName = PRODUCT_NAME;

  private readonly accounts = inject(AccountsBridgeService);
  private readonly session = inject(AccountSessionService);
  private readonly bffAuth = inject(BffAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = signal<FormState>({ ...EMPTY });
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly remember = signal(true);
  readonly year = new Date().getFullYear();
  /**
   * `true` when the auth interceptor redirected here with
   * `?reason=session-expired`. Drives the inline banner above the form
   * (replacing the previous toast pile-up). Cached at construction
   * time — the param doesn't change while the user is on this page,
   * and we don't want a navigation that drops the param to also drop
   * the banner mid-typing.
   */
  readonly sessionExpired = signal(false);

  /**
   * Build-time SSO-only switch — see `environment.passwordSignInEnabled`.
   * When `false` we hide the email/password form, the divider, and the
   * "Create an account" link so the user only sees the Google / Apple
   * SSO buttons. Matches the API which gates `/auth/login` and
   * `/auth/register` behind the same flag and returns 403
   * `auth.password_login_disabled` outside Development.
   */
  readonly passwordSignInEnabled = environment.passwordSignInEnabled;

  /** Background carousel — same source family as the admin login. */
  readonly backgroundImages: ReadonlyArray<{
    url: string;
    alt: string;
    caption: string;
  }> = [
    {
      url:
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=70',
      alt: 'Packages on a warehouse conveyor',
      caption: 'Your US purchases, received and ready to quote.',
    },
    {
      url:
        'https://images.unsplash.com/photo-1578575437136-9e86f6c5e3e2?auto=format&fit=crop&w=1600&q=70',
      alt: 'Shipping containers at a port',
      caption: 'Cross-border delivery built for Eswatini families.',
    },
    {
      url:
        'https://images.unsplash.com/photo-1494412646604-aaac575ede33?auto=format&fit=crop&w=1600&q=70',
      alt: 'Worker scanning parcels in a warehouse',
      caption: 'Every parcel scanned, matched, and tracked.',
    },
    {
      url:
        'https://images.unsplash.com/photo-1607083206869-4c7672fa65a1?auto=format&fit=crop&w=1600&q=70',
      alt: 'Brown cardboard delivery boxes',
      caption: 'From checkout to your door in Eswatini.',
    },
    {
      url:
        'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?auto=format&fit=crop&w=1600&q=70',
      alt: 'Children gathered around a teacher reading a story',
      caption: 'Story time still beats every screen.',
    },
  ];

  readonly currentImageIndex = signal(0);
  readonly imageFailed = signal<boolean[]>([]);
  private rotateHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.sessionExpired.set(
      this.route.snapshot.queryParamMap.get('reason') === 'session-expired',
    );

    this.imageFailed.set(this.backgroundImages.map(() => false));
    this.startBackgroundRotation();
    this.destroyRef.onDestroy(() => this.stopBackgroundRotation());
  }

  patch(p: Partial<FormState>): void {
    this.form.update((s) => ({ ...s, ...p }));
    if (this.serverError()) this.serverError.set(null);
  }

  canSubmit(): boolean {
    const f = this.form();
    return !!f.email.trim() && !!f.password;
  }

  onSubmit(): void {
    if (this.busy() || !this.canSubmit()) return;
    const f = this.form();
    this.busy.set(true);
    this.serverError.set(null);
    this.accounts
      .login({ email: f.email.trim(), password: f.password })
      .subscribe({
        next: () => {
          // Re-arm the once-per-session 401 latch so a *future* token
          // expiry in this same tab still triggers the redirect-to-login
          // flow. Without this the second expiry would silently swallow
          // the 401s and leave the SPA on a half-loaded page.
          resetHttpErrorUnauthorizedLatch();
          const next =
            this.route.snapshot.queryParamMap.get('returnTo') ||
            this.route.snapshot.queryParamMap.get('next') ||
            this.session.homeRouteForRole();
          this.busy.set(false);
          this.router.navigateByUrl(next);
        },
        error: (err: Error) => {
          this.busy.set(false);
          this.serverError.set(err?.message || 'Could not sign in.');
        },
      });
  }

  forgot(): void {
    this.serverError.set(
      'Password reset is handled by your institution admin in this build.',
    );
  }

  /**
   * Top-level redirect to `/bff/auth/login` so the OIDC dance runs against
   * `REMOVED` and the browser comes back with an HttpOnly cookie.
   * In mock mode (`useBffAuth: false`) we surface the same "not enabled"
   * affordance as the other providers — there's no BFF to talk to.
   */
  signInWithGoogle(): void {
    if (!environment.useBffAuth) {
      this.ssoUnavailable('Google');
      return;
    }
    this.serverError.set(null);
    const returnUrl =
      this.route.snapshot.queryParamMap.get('next') ??
      this.route.snapshot.queryParamMap.get('returnUrl') ??
      '/parent/children';
    this.bffAuth.signInWithGoogle(returnUrl);
  }

  ssoUnavailable(provider: string): void {
    this.serverError.set(
      `${provider} sign-in is not enabled in this environment yet.`,
    );
  }

  // ── Background carousel ──────────────────────────────────────────────

  setImage(i: number): void {
    if (i < 0 || i >= this.backgroundImages.length) return;
    if (this.imageFailed()[i]) return;
    this.currentImageIndex.set(i);
    this.startBackgroundRotation();
  }

  onImageError(i: number): void {
    this.imageFailed.update((flags) => {
      const next = [...flags];
      next[i] = true;
      return next;
    });
    if (this.currentImageIndex() === i) {
      this.advanceToNextWorkingImage();
    }
  }

  private startBackgroundRotation(): void {
    this.stopBackgroundRotation();
    if (typeof window === 'undefined') return;
    this.rotateHandle = setInterval(() => {
      this.advanceToNextWorkingImage();
    }, 6000);
  }

  private advanceToNextWorkingImage(): void {
    const flags = this.imageFailed();
    const total = this.backgroundImages.length;
    if (total === 0) return;
    let i = this.currentImageIndex();
    for (let step = 0; step < total; step++) {
      i = (i + 1) % total;
      if (!flags[i]) {
        this.currentImageIndex.set(i);
        return;
      }
    }
  }

  private stopBackgroundRotation(): void {
    if (this.rotateHandle !== null) {
      clearInterval(this.rotateHandle);
      this.rotateHandle = null;
    }
  }

}
