import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { OpsAuthService } from '../services/ops-auth.service';
import { OpsSessionService } from '../services/ops-session.service';
import { PRODUCT_NAME } from '../brand';
import { environment } from '../../environments/environment';

declare const google: {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        auto_select?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, string | number | boolean>,
      ) => void;
    };
  };
};

@Component({
  selector: 'ops-connect',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-page">
      <div class="auth-watermark" aria-hidden="true">
        <img src="felidaen-watermark.png" alt="" decoding="async" />
      </div>

      <header class="auth-header">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">W</span>
          <span class="brand-name">{{ productName }}</span>
          <span class="ops-badge">OPS</span>
        </div>
      </header>

      <main class="auth-main">
        <aside class="auth-aside">
          <div class="aside-illus" aria-hidden="true">
            <svg viewBox="0 0 320 200" class="warehouse-svg">
              <rect x="40" y="70" width="200" height="90" rx="4" fill="#e9e0f5" stroke="#845EC2" stroke-width="2"/>
              <path d="M40 70 L140 30 L240 70" fill="#f3eefb" stroke="#845EC2" stroke-width="2" stroke-linejoin="round"/>
              <rect x="70" y="100" width="40" height="35" rx="2" fill="#845EC2" opacity="0.35"/>
              <rect x="130" y="100" width="40" height="35" rx="2" fill="#845EC2" opacity="0.35"/>
              <rect x="190" y="100" width="30" height="50" rx="2" fill="#845EC2" opacity="0.2"/>
              <rect x="210" y="130" width="55" height="30" rx="3" fill="#cbd5e1"/>
              <rect x="218" y="118" width="18" height="14" fill="#94a3b8"/>
              <circle cx="235" cy="162" r="8" fill="#64748b"/>
              <circle cx="252" cy="162" r="8" fill="#64748b"/>
              <rect x="95" y="145" width="28" height="15" rx="2" fill="#c4b5fd"/>
              <rect x="155" y="150" width="22" height="10" rx="2" fill="#c4b5fd"/>
            </svg>
          </div>
          <h1 class="aside-title">{{ productName }} Ops</h1>
          <p class="aside-lead">Tools and data for warehouse teams to keep operations moving.</p>
          <ul class="feature-list">
            <li>
              <span class="feat-icon material-icons-outlined" aria-hidden="true">verified_user</span>
              <div>
                <strong>Invitation only</strong>
                <span>Access is restricted to authorized warehouse staff.</span>
              </div>
            </li>
            <li>
              <span class="feat-icon material-icons-outlined" aria-hidden="true">lock</span>
              <div>
                <strong>Work account required</strong>
                <span>Sign in with your work Google account.</span>
              </div>
            </li>
            <li>
              <span class="feat-icon material-icons-outlined" aria-hidden="true">security</span>
              <div>
                <strong>Secure by design</strong>
                <span>Your data and operations are protected.</span>
              </div>
            </li>
          </ul>
        </aside>

        <section class="auth-card ops-card">
          <div class="card-icon-wrap" aria-hidden="true">
            <span class="material-icons-outlined">warehouse</span>
          </div>
          <h2 class="card-title">Warehouse access</h2>

          @if (invitePreview(); as inv) {
            @if (inv.isValid) {
              <p class="card-lead invite-hint">
                You are invited as <strong>{{ inv.role }}</strong> for
                <strong>{{ inv.email }}</strong>. Sign in with that Google account.
              </p>
            } @else {
              <p class="err">This invitation is no longer valid. Ask a lead for a new invite.</p>
            }
          } @else {
            <p class="card-lead">
              Sign in with your work Google account. Access is by invitation only — if you need
              access, contact your warehouse lead.
            </p>
          }

          @if (error()) {
            <p class="err" role="alert">{{ error() }}</p>
          }
          @if (busy()) {
            <p class="status-hint">Signing in…</p>
          }

          <div #googleButton class="google-btn-host"></div>

          <div class="divider" aria-hidden="true"><span>or</span></div>

          <a class="help-link" href="mailto:ops-support@weyell.com?subject=Warehouse%20access%20request">
            <span class="material-icons-outlined" aria-hidden="true">support_agent</span>
            Need access? Contact warehouse lead
            <span class="material-icons-outlined arrow" aria-hidden="true">arrow_forward</span>
          </a>
        </section>
      </main>

      <footer class="auth-footer">
        <p>
          <span class="material-icons-outlined" aria-hidden="true">lock</span>
          Secure warehouse operations access
        </p>
        <p class="copy">{{ productName }} Internal · All rights reserved</p>
      </footer>
    </div>
  `,
  styles: `
    .auth-page {
      position: relative;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: linear-gradient(160deg, #f8f9fc 0%, #eef1f8 45%, #f4f6fa 100%);
    }
    .auth-watermark {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6rem 1rem 4rem;
    }
    .auth-watermark img {
      width: min(72vw, 540px);
      max-height: 55vh;
      object-fit: contain;
      opacity: 0.1;
      filter: saturate(1.05);
      user-select: none;
    }
    .auth-header,
    .auth-main,
    .auth-footer {
      position: relative;
      z-index: 1;
    }
    .auth-header {
      background: var(--ops-navy);
      padding: 0.9rem 1.5rem;
      flex-shrink: 0;
    }
    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      max-width: 1100px;
      margin: 0 auto;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #9b7ad4, var(--ops-brand-purple));
      color: #fff;
      font-weight: 800;
      font-size: 1.1rem;
      display: grid;
      place-items: center;
    }
    .brand-name {
      font-size: 1.2rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .ops-badge {
      margin-left: 0.15rem;
      padding: 0.15rem 0.55rem;
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-radius: 999px;
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #fff;
    }
    .auth-main {
      flex: 1;
      display: grid;
      grid-template-columns: minmax(280px, 1fr) minmax(320px, 420px);
      gap: 2.5rem;
      align-items: center;
      max-width: 1100px;
      width: 100%;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 2rem;
    }
    @media (max-width: 900px) {
      .auth-main {
        grid-template-columns: 1fr;
        gap: 1.75rem;
        padding-top: 1.5rem;
      }
      .auth-aside { order: 2; }
    }
    .aside-illus {
      margin-bottom: 1.25rem;
      max-width: 320px;
    }
    .warehouse-svg { width: 100%; height: auto; display: block; }
    .aside-title {
      margin: 0 0 0.5rem;
      font-size: 1.65rem;
      font-weight: 700;
      color: var(--ops-text);
      letter-spacing: -0.02em;
    }
    .aside-lead {
      margin: 0 0 1.5rem;
      font-size: 0.95rem;
      color: var(--ops-muted);
      line-height: 1.5;
      max-width: 360px;
    }
    .feature-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 380px;
    }
    .feature-list li {
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
    }
    .feat-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--ops-primary-soft);
      color: var(--ops-primary);
      display: grid;
      place-items: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .feature-list strong {
      display: block;
      font-size: 0.88rem;
      margin-bottom: 0.15rem;
      color: var(--ops-text);
    }
    .feature-list span {
      font-size: 0.8rem;
      color: var(--ops-muted);
      line-height: 1.4;
    }
    .auth-card {
      padding: 2rem 2rem 1.75rem;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
      text-align: center;
    }
    .card-icon-wrap {
      width: 52px;
      height: 52px;
      margin: 0 auto 1rem;
      border-radius: 50%;
      background: var(--ops-primary-soft);
      color: var(--ops-primary);
      display: grid;
      place-items: center;
    }
    .card-icon-wrap .material-icons-outlined { font-size: 26px; }
    .card-title {
      margin: 0 0 0.65rem;
      font-size: 1.35rem;
      font-weight: 700;
    }
    .card-lead {
      margin: 0 0 1.25rem;
      font-size: 0.88rem;
      color: var(--ops-muted);
      line-height: 1.55;
    }
    .invite-hint strong { color: var(--ops-text); }
    .err {
      color: #b91c1c;
      font-size: 0.85rem;
      margin: 0 0 0.75rem;
      text-align: left;
    }
    .status-hint {
      font-size: 0.85rem;
      color: var(--ops-muted);
      margin: 0 0 0.5rem;
    }
    .google-btn-host {
      min-height: 44px;
      display: flex;
      justify-content: center;
      margin-bottom: 0.25rem;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.15rem 0;
      color: var(--ops-muted);
      font-size: 0.78rem;
    }
    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--ops-border);
    }
    .help-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ops-primary);
      text-decoration: none;
      padding: 0.35rem 0.5rem;
      border-radius: var(--ops-radius-sm);
    }
    .help-link:hover {
      background: var(--ops-primary-soft);
    }
    .help-link .arrow { font-size: 16px; }
    .auth-footer {
      text-align: center;
      padding: 1.25rem 1rem 1.5rem;
      color: var(--ops-muted);
      font-size: 0.78rem;
    }
    .auth-footer p {
      margin: 0.2rem 0;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      justify-content: center;
    }
    .auth-footer .material-icons-outlined { font-size: 14px; }
    .copy { opacity: 0.85; }
  `,
})
export class OpsConnectComponent implements AfterViewInit {
  private readonly session = inject(OpsSessionService);
  private readonly authApi = inject(OpsAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly googleHost = viewChild<ElementRef<HTMLElement>>('googleButton');

  readonly productName = PRODUCT_NAME;
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly invitePreview = signal<{
    email: string;
    role: string;
    isValid: boolean;
  } | null>(null);

  ngAfterViewInit(): void {
    const token = this.route.snapshot.queryParamMap.get('invite');
    if (token) {
      this.authApi.previewInvitation(token).subscribe({
        next: (p) => this.invitePreview.set(p),
        error: () => this.invitePreview.set(null),
      });
    }
    this.initGoogleButton();
  }

  private initGoogleButton(): void {
    const clientId = environment.googleClientId;
    if (!clientId) {
      this.error.set('Google sign-in is not configured for this environment.');
      return;
    }
    this.renderGoogleWhenReady(clientId, 0);
  }

  private renderGoogleWhenReady(clientId: string, attempt: number): void {
    const host = this.googleHost()?.nativeElement;
    if (typeof google === 'undefined' || !host) {
      if (attempt < 40) {
        setTimeout(() => this.renderGoogleWhenReady(clientId, attempt + 1), 100);
      } else {
        this.error.set('Google sign-in could not load. Check your connection and refresh.');
      }
      return;
    }

    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => this.onGoogleCredential(response.credential),
    });
    google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: Math.min(360, host.clientWidth || 360),
    });
  }

  private onGoogleCredential(credential: string): void {
    this.busy.set(true);
    this.error.set(null);
    this.session.signInWithGoogle(credential).subscribe({
      next: () => this.busy.set(false),
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatSignInError(err));
      },
    });
  }

  private formatSignInError(err: unknown): string {
    if (err && typeof err === 'object' && 'status' in err) {
      const httpErr = err as { status?: number; error?: { detail?: string; title?: string } | string };
      if (httpErr.status === 502 || httpErr.status === 503 || httpErr.status === 504) {
        return 'Could not reach the server. Wait a moment and try again.';
      }
      const body = httpErr.error;
      if (typeof body === 'string' && body.trim() && !body.startsWith('<')) return body.trim();
      if (body && typeof body === 'object') {
        if (body.detail) return body.detail;
        if (body.title && !body.title.includes('.')) return body.title;
      }
    }
    return 'Sign-in failed.';
  }
}
