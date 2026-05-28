import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BrandWatermarkBackdropComponent } from './brand-watermark-backdrop.component';

/**
 * Reason codes the SPA's auth interceptor (or the inactivity timer)
 * can attach to the `?reason=` query param. Each one maps to a slightly
 * different headline + body so the operator/parent gets context-
 * appropriate copy. Unknown values fall back to the generic "session
 * ended" treatment so a stale link or a future reason code never
 * blanks the page.
 */
export type SessionExpiredReason =
  | 'session-expired' // Generic: server returned 401 and we don't know why.
  | 'idle-timeout' //   Inactivity timer fired client-side.
  | 'signed-out' //     Explicit sign-out (rare here, mostly informative).
  | 'concurrent-session'; // Another tab / device signed in and bumped this one.

interface ReasonCopy {
  headline: string;
  body: string;
  /** Material Symbols glyph name. */
  icon: string;
}

const REASON_COPY: Record<SessionExpiredReason, ReasonCopy> = {
  'session-expired': {
    headline: 'Your session has ended',
    body: "For your security we ended this session. Sign in again and we'll take you right back to where you were.",
    icon: 'lock_clock',
  },
  'idle-timeout': {
    headline: 'Signed out for inactivity',
    body: "You've been inactive for a while, so we ended this session to keep your account safe. Sign in again to continue.",
    icon: 'hourglass_empty',
  },
  'signed-out': {
    headline: "You've been signed out",
    body: 'Sign in again whenever you’re ready — we’ll restore your last screen for you.',
    icon: 'logout',
  },
  'concurrent-session': {
    headline: 'Signed in elsewhere',
    body: 'This account just signed in from another window or device, so we ended this session. Sign in again here if you didn’t mean to.',
    icon: 'devices',
  },
};

/**
 * Shared "your session has expired" splash page.
 *
 * Both the REMOVED and customer-portal lazy-load this component on
 * `/session-expired`. The auth interceptor (and the inactivity timer
 * when wired) redirects here with `?reason=…&returnTo=…` instead of
 * pushing the user back to `/login` with an inline banner.
 *
 * Why a dedicated page instead of a banner:
 *
 *   1. **Single, calm focus.** The login form is a noisy surface
 *      (background carousel, multi-mode tabs, SSO buttons). Dropping a
 *      "session expired" banner on top of it forces the operator to
 *      parse two messages at once. The splash gives the timeout one
 *      job: explain what happened, then hand off cleanly.
 *   2. **Reusable across surfaces.** Mobile, public-facing, even
 *      anonymous flows (e.g. an expired magic link) all benefit from
 *      the same chrome. Consolidating here means one polish job, not
 *      two.
 *   3. **Deep-link preservation is explicit.** The "Continue to sign
 *      in" CTA forwards `returnTo` to the login page so the parent
 *      lands back on `/parent/subscribe` after re-auth. A banner-only
 *      flow makes that wiring implicit (and easier to break).
 *
 * The CTA route is configurable via `?continueTo=` (defaults to
 * `/login`) so platform / external surfaces with different login
 * paths can both render this page. The component validates that the
 * `continueTo` and `returnTo` paths are same-origin relative URLs to
 * defend against open-redirect abuse from a tampered link.
 */
@Component({
  selector: 'app-session-expired',
  standalone: true,
  imports: [BrandWatermarkBackdropComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nk-brand-watermark-backdrop [prominent]="true" />
    <main class="page" role="main">
      <section class="card" aria-labelledby="se-title">
        <div class="emblem" aria-hidden="true">
          <span class="material-icons-outlined">{{ copy().icon }}</span>
        </div>

        <h1 id="se-title" class="title">{{ copy().headline }}</h1>
        <p class="body">{{ copy().body }}</p>

        <button
          type="button"
          class="btn-primary"
          (click)="continue()"
          [attr.aria-label]="continueLabel()"
        >
          <span>{{ continueLabel() }}</span>
          <span class="material-icons-outlined" aria-hidden="true">arrow_forward</span>
        </button>

        @if (returnPath()) {
          <p class="return-hint">
            <span class="material-icons-outlined" aria-hidden="true">link</span>
            We’ll take you back to
            <code class="return-path">{{ returnPath() }}</code>
            after sign-in.
          </p>
        }

        <footer class="meta">
          <span class="meta-row">
            <span class="material-icons-outlined" aria-hidden="true">verified_user</span>
            <span>Sessions end after a period of inactivity to protect your account.</span>
          </span>
          <p class="art-credit">Background artwork by Felidaen</p>
        </footer>
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        position: relative;
      }
      .page {
        position: relative;
        z-index: 1;
        min-height: 100vh;
        display: grid;
        place-items: center;
        align-content: center;
        padding: 1.5rem;
        padding-top: clamp(8rem, 18vh, 11rem);
      }
      .card {
        width: 100%;
        max-width: 480px;
        background: rgba(255, 255, 255, 0.82);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(15, 23, 42, 0.1);
        border-radius: 4px;
        padding: 2.4rem 2rem 2rem;
        box-shadow:
          0 1px 0 rgba(15, 23, 42, 0.06),
          0 24px 48px -20px rgba(15, 23, 42, 0.22);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.85rem;
        animation: card-rise 320ms ease-out both;
      }
      @keyframes card-rise {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .emblem {
        width: 64px;
        height: 64px;
        border-radius: 0;
        display: grid;
        place-items: center;
        background: #0f62fe;
        color: #fff;
        margin-bottom: 0.25rem;
      }
      .emblem .material-icons-outlined { font-size: 32px; }
      .title {
        margin: 0;
        font-size: 1.45rem;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.01em;
      }
      .body {
        margin: 0;
        color: #475569;
        font-size: 0.96rem;
        line-height: 1.5;
        max-width: 38ch;
      }
      .btn-primary {
        margin-top: 0.85rem;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.7rem 1.2rem;
        border-radius: 0;
        border: none;
        background: #0f62fe;
        color: #fff;
        font: inherit;
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .btn-primary:hover { background: #0353e9; }
      .btn-primary:active { background: #002d9c; }
      .btn-primary:focus-visible {
        outline: 2px solid #0f62fe;
        outline-offset: 2px;
      }
      .btn-primary .material-icons-outlined { font-size: 18px; }
      .return-hint {
        margin: 0.4rem 0 0;
        font-size: 0.78rem;
        color: #64748b;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        max-width: 100%;
        flex-wrap: wrap;
        justify-content: center;
      }
      .return-hint .material-icons-outlined { font-size: 14px; color: #94a3b8; }
      .return-path {
        background: rgba(15, 23, 42, 0.05);
        padding: 0.05rem 0.4rem;
        border-radius: 5px;
        font-size: 0.76rem;
        color: #1e293b;
        max-width: 28ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: bottom;
      }
      .meta {
        margin-top: 0.85rem;
        padding-top: 0.95rem;
        border-top: 1px dashed rgba(15, 23, 42, 0.1);
        width: 100%;
        color: #94a3b8;
      }
      .meta-row {
        display: inline-flex; align-items: center; gap: 0.4rem;
        font-size: 0.78rem;
      }
      .meta-row .material-icons-outlined { font-size: 14px; }
      .art-credit {
        margin: 0.65rem 0 0;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #64748b;
      }
      @media (max-width: 480px) {
        .page { padding-top: clamp(6rem, 14vh, 9rem); }
        .card { padding: 1.85rem 1.25rem 1.5rem; border-radius: 14px; }
        .title { font-size: 1.25rem; }
        .body { font-size: 0.92rem; }
      }
    `,
  ],
})
export class SessionExpiredComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * Where "Continue" sends the user. Configurable so the same
   * component can serve REMOVED (`/login`) and customer-portal
   * (`/login`) — and surfaces with future bespoke login paths can
   * pass their own. Resolved from the route's `data.continueTo`,
   * which is the most defensible source (unforgeable from a URL).
   */
  protected readonly continueTo = signal<string>(
    (this.route.snapshot.data?.['continueTo'] as string | undefined) ?? '/login',
  );

  protected readonly returnPath = signal<string | null>(
    sanitiseInternalPath(this.route.snapshot.queryParamMap.get('returnTo')),
  );

  protected readonly reason = signal<SessionExpiredReason>(
    coerceReason(this.route.snapshot.queryParamMap.get('reason')),
  );

  protected readonly copy = computed(() => REASON_COPY[this.reason()]);

  protected readonly continueLabel = computed(() =>
    this.returnPath() ? 'Continue to sign in' : 'Sign in again',
  );

  protected continue(): void {
    const dest = this.continueTo();
    const ret = this.returnPath();
    if (ret) {
      void this.router.navigate([dest], { queryParams: { returnTo: ret } });
    } else {
      void this.router.navigateByUrl(dest);
    }
  }
}

function coerceReason(raw: string | null): SessionExpiredReason {
  if (raw && raw in REASON_COPY) return raw as SessionExpiredReason;
  return 'session-expired';
}

/**
 * Refuse anything that isn't an explicit relative path. We never want
 * to forward the user to an absolute URL after sign-in (open-redirect
 * vector) and the logout flow already strips paths to `/`-anchored
 * forms before stamping `returnTo`.
 */
function sanitiseInternalPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null; // protocol-relative
  if (raw.startsWith('/login') || raw.startsWith('/session-expired')) return null;
  return raw;
}
