import {
  Inject,
  Injectable,
  InjectionToken,
  Optional,
  computed,
  signal,
} from '@angular/core';
import {
  PlatformSessionService,
  type PlatformSessionRole,
} from './platform-session.service';

/**
 * Shape returned by `GET /bff/auth/me` (see `BffAuthEndpoints.BffMeResponse`
 * in Wayel.Bff.Shared). Kept loose on purpose so the SPA never throws on
 * an unknown role string from a future provider — we just fall back to
 * 'institution_user' in the mapper.
 */
export interface BffMeResponse {
  userId: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: string;
  accessTokenExpiresOnUtc: string;
  /**
   * Branding + identity slice of the signed-in user's home tenant.
   * Mirrors `BffAuthEndpoints.BffTenantSummary` on the server.
   * `null` for SuperAdmin platform users (no home tenant) and as a
   * graceful fallback when the BFF couldn't enrich from the API.
   * Optional in the type so older test fixtures (and any rolled-back
   * BFF that doesn't yet emit the field) deserialise cleanly.
   */
  tenant?: BffTenantSummary | null;
}

/**
 * Tenant summary returned alongside the identity bits of `/bff/auth/me`.
 * Carries enough of the tenant aggregate for a SPA shell to paint its
 * chrome (display name, colours, logo, favicon, theme, support
 * contacts) without a second round-trip.
 */
export interface BffTenantSummary {
  tenantId: string;
  name: string;
  slug: string;
  /** PascalCase enum: `'Active' | 'Suspended' | 'Archived'`. */
  status: string;
  displayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  surfaceColor: string | null;
  textColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  customDomain: string | null;
  /** PascalCase enum: `'System' | 'Light' | 'Dark'`. */
  theme: string;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
}

/**
 * Strategy for projecting a successful `/bff/auth/me` response into the
 * host SPA's session model. Each portal provides its own implementation:
 *
 * - REMOVED + client-portal write to `PlatformSessionService`
 *   (the default, see `DefaultBffSessionSink` below).
 * - customer-portal also mirrors the identity into `AccountSessionService`
 *   so its existing `AuthenticatedShellComponent` keeps working without
 *   needing to know whether it was lit up by mock email/password or by
 *   BFF cookie.
 *
 * The sink is also responsible for clearing local session state on signout —
 * both `BffAuthService.signOut()` and the bootstrap "no session" path will
 * call `clear()`.
 */
export interface BffSessionSink {
  apply(me: BffMeResponse): void;
  clear(): void;
}

export const BFF_SESSION_SINK = new InjectionToken<BffSessionSink>('BFF_SESSION_SINK');

const ME_PATH = '/bff/auth/me';
const LOGIN_PATH = '/bff/auth/login';
const LOGOUT_PATH = '/bff/auth/logout';
const BRANDING_BY_DOMAIN_PATH = '/bff/branding/by-domain';

/**
 * Talks to the per-SPA Backend-for-Frontend (`REMOVED`,
 * `Wayel.Bff.Customer`, `REMOVED`).
 *
 * Why `fetch` and not `HttpClient`? Three reasons:
 *
 *  1. The SPA's `httpErrorInterceptor` redirects on every 401. `/bff/auth/me`
 *     returns 401 as a *normal* signal that "you're not signed in" — we don't
 *     want that to bounce the browser to /login during initial bootstrap.
 *  2. `fetch` is browser-native and doesn't need the Angular HTTP testing
 *     module to unit test (vi.spyOn on `globalThis.fetch`).
 *  3. The BFF cookie is HttpOnly + same-origin, so `credentials: 'include'`
 *     in `fetch` Just Works without any interceptor plumbing.
 *
 * The service is intentionally thin: it owns the BFF round-trip and the
 * mapping into PlatformSessionService, and nothing else. App-level concerns
 * (toasts, redirects, return URLs) live in the components / app initializer
 * that call it.
 */
@Injectable({ providedIn: 'root' })
export class BffAuthService {
  // Constructor injection (rather than `inject()`) keeps the service
  // trivially testable: `new BffAuthService(mockSession)` works without
  // standing up an Angular injection context. The optional sink lets a
  // host app override how a successful /me result projects into the
  // SPA's session model (see `BffSessionSink`).
  constructor(
    private readonly session: PlatformSessionService,
    @Optional() @Inject(BFF_SESSION_SINK) sink: BffSessionSink | null = null,
    /**
     * Optional painter override. Production code lets Angular DI
     * supply the singleton (`TenantBrandingPainter` is `providedIn:
     * 'root'`); unit tests can pass `new TenantBrandingPainter()`
     * directly so the service stays constructable outside an
     * injection context.
     */
    painter: TenantBrandingPainter | null = null,
  ) {
    // The painter is shared between the per-user paint (driven by the
    // session sink) and the pre-login `prepaintBrandingFromHost()` call
    // below, so the painter's "originals cache" composes correctly
    // across both surfaces. We hold it as a field too so the pre-paint
    // path doesn't need to dig through the sink to reach it.
    this.painter = painter ?? new TenantBrandingPainter();
    this.sink = sink ?? new DefaultBffSessionSink(session, this.painter);
  }

  private readonly painter: TenantBrandingPainter;
  private readonly sink: BffSessionSink;

  /** True once `bootstrap()` has resolved at least once. Used by app
   *  initializers / guards that want to wait for the first /me roundtrip
   *  before deciding whether to redirect. */
  private readonly _bootstrapped = signal(false);
  readonly bootstrapped = this._bootstrapped.asReadonly();

  /** True iff the BFF /me responded 200 on the most recent bootstrap. The
   *  full identity lives in `PlatformSessionService.currentUser()` — this
   *  flag is only useful for "did the cookie work?" checks. */
  private readonly _hasBffSession = signal(false);
  readonly hasBffSession = computed(() => this._hasBffSession());

  /**
   * Hits `/bff/auth/me` once and hydrates `PlatformSessionService` if the
   * cookie is good. Always resolves (never throws) so it's safe inside an
   * app initializer.
   */
  async bootstrap(): Promise<BffMeResponse | null> {
    try {
      const me = await this.me();
      if (me) {
        this.sink.apply(me);
        this._hasBffSession.set(true);
      } else {
        this._hasBffSession.set(false);
      }
      return me;
    } finally {
      this._bootstrapped.set(true);
    }
  }

  /**
   * Pure lookup against `/bff/branding/by-domain/<host>` — returns the
   * tenant summary if a tenant has claimed the host, `null` if not (204
   * or any non-2xx). Unlike `prepaintBrandingFromHost()` this does
   * **not** touch the document, so it's safe to call from admin
   * surfaces (e.g. a "Verify domain" button on the Branding form) that
   * mustn't repaint the chrome the SuperAdmin is currently wearing.
   */
  async lookupTenantByHost(host: string): Promise<BffTenantSummary | null> {
    const trimmed = (host ?? '').trim();
    if (!trimmed) return null;
    let response: Response;
    try {
      response = await fetch(`${BRANDING_BY_DOMAIN_PATH}/${encodeURIComponent(trimmed)}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      return null;
    }
    if (response.status === 204 || !response.ok) return null;
    return (await response.json()) as BffTenantSummary;
  }

  /**
   * Pre-paint the document chrome from the visitor's host header so an
   * unauthenticated SPA shell already wears the tenant's branding before
   * the user signs in. Safe to call before `bootstrap()`:
   *
   *  - Hits `/bff/branding/by-domain/<host>`.
   *  - 200 → paint via the shared `TenantBrandingPainter`.
   *  - 204 → no tenant has claimed this host (typical for the platform's
   *    own hostnames). The painter is left untouched so the platform
   *    default chrome stays put.
   *  - Network / 5xx → swallowed (logged via the global error handler).
   *
   * Always resolves; never throws. If the user later signs in,
   * `apply(me)` repaints with the home-tenant branding (which may
   * differ from the host tenant — that's the source of truth post-login).
   *
   * Dev-only host preview:
   * Visitors can pass <c>?previewHost=parents.sun-valley.example</c> in
   * the URL to pretend they came from a different host. This is the
   * companion to the BFF's <c>X-Wayel-Branding-Host</c> header bypass
   * and lets you preview a tenant's pre-login chrome from
   * <c>localhost:4200</c> without owning the DNS record. The override
   * is also persisted in <c>sessionStorage</c> so the next route
   * change keeps the same preview without needing the query string
   * tacked back on. The persistence is per-tab (sessionStorage), not
   * cross-tab, so a developer can have one tab on the Sun Valley
   * preview and another on the platform default at the same time.
   *
   * @param hostOverride Optional host string to use instead of
   *                     `window.location.host` / the preview override.
   *                     Tests pass a literal; production code calls
   *                     without it.
   */
  async prepaintBrandingFromHost(hostOverride?: string): Promise<BffTenantSummary | null> {
    const host = hostOverride ?? this.resolveHostForBranding();
    if (!host) return null;

    let response: Response;
    try {
      response = await fetch(`${BRANDING_BY_DOMAIN_PATH}/${encodeURIComponent(host)}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      // Offline / DNS hiccup — degrade silently to the platform default.
      return null;
    }

    if (response.status === 204 || !response.ok) {
      return null;
    }

    const summary = (await response.json()) as BffTenantSummary;
    this.painter.paint(summary);
    return summary;
  }

  /**
   * Resolve the host the SPA should ask the BFF about. Order of
   * precedence:
   *
   *   1. <c>?previewHost=...</c> on the current URL (also stashed
   *      in sessionStorage so it sticks across route changes).
   *   2. <c>sessionStorage['wayel.previewHost']</c> set by a
   *      previous query-string visit in this tab.
   *   3. The browser's actual <c>window.location.host</c>.
   *
   * Returns an empty string in non-browser contexts (SSR, tests
   * without a window) so the caller can short-circuit.
   *
   * Public-but-marked-internal so a portal can wire a "Clear
   * preview" UI control if it wants to (just call
   * <c>sessionStorage.removeItem('wayel.previewHost')</c> and
   * reload).
   */
  private resolveHostForBranding(): string {
    if (typeof window === 'undefined') return '';

    // 1. Query string wins and seeds the session-storage cache.
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('previewHost')?.trim();
      if (fromQuery) {
        try {
          window.sessionStorage.setItem('wayel.previewHost', fromQuery);
        } catch {
          // sessionStorage can throw under strict-cookie contexts;
          // we only persist as a convenience so a failure here
          // shouldn't block the actual paint.
        }
        return fromQuery;
      }
    } catch {
      // Malformed URL — fall through to the storage / location paths.
    }

    // 2. Sticky preview from earlier in this tab.
    try {
      const stored = window.sessionStorage.getItem('wayel.previewHost');
      if (stored && stored.trim().length > 0) return stored.trim();
    } catch {
      // Same caveat as the setItem above.
    }

    // 3. Real browser host.
    return window.location.host ?? '';
  }

  /** Raw `/bff/auth/me` call. Returns `null` on 401, throws on network/5xx. */
  async me(): Promise<BffMeResponse | null> {
    const response = await fetch(ME_PATH, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 401) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `BFF /me failed with HTTP ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as BffMeResponse;
  }

  /**
   * Top-level navigation to `/bff/auth/login` — OIDC needs a full document
   * navigation so the browser follows redirects to Google and back. Do **not**
   * try to fetch this endpoint with XHR.
   *
   * @param returnUrl Path inside the SPA to land on after successful sign-in.
   *                  Must start with `/`. Defaults to the current location.
   */
  signInWithGoogle(returnUrl?: string): void {
    if (typeof window === 'undefined') return;
    const safe = this.sanitizeReturnUrl(
      returnUrl ?? window.location.pathname + window.location.search,
    );
    const target = `${LOGIN_PATH}?returnUrl=${encodeURIComponent(safe)}`;
    window.location.href = target;
  }

  /**
   * Calls `/bff/auth/logout` (best-effort — swallows network/401 errors so
   * a stale cookie doesn't block client-side cleanup) then clears the local
   * `PlatformSessionService` so the UI flips to signed-out immediately.
   *
   * Logout is a state-changing request, so the BFF's antiforgery middleware
   * requires an `X-XSRF-TOKEN` header that matches the value of the
   * `XSRF-TOKEN` cookie the BFF previously set on a safe-method response.
   */
  async signOut(): Promise<void> {
    try {
      await fetch(LOGOUT_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: bffStateChangingHeaders(),
      });
    } catch {
      // Best-effort. Even if the BFF is unreachable we still want to drop the
      // local session so the user doesn't get stuck on a "signed in" UI.
    } finally {
      this._hasBffSession.set(false);
      this.sink.clear();
    }
  }

  // ── internals ──────────────────────────────────────────────────────────

  private sanitizeReturnUrl(raw: string): string {
    if (!raw.startsWith('/')) return '/';
    if (raw.startsWith('//')) return '/'; // Protocol-relative — never trust
    if (raw.startsWith('/bff/')) return '/'; // Don't bounce back into the BFF
    if (raw.startsWith('/login')) return '/';
    return raw;
  }
}

/**
 * Reads the BFF-issued `XSRF-TOKEN` cookie (set as non-HttpOnly by
 * `BffAntiforgeryMiddleware`) and returns headers suitable for a
 * state-changing `fetch()` call into the BFF / API.
 *
 * Exported so app-level fetch wrappers (e.g. `WayelInvitationsService`)
 * can stay compatible with the BFF's antiforgery contract without each
 * one reimplementing the cookie read.
 */
export function bffStateChangingHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = readCookie('XSRF-TOKEN');
  const base: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    base['X-XSRF-TOKEN'] = token;
  }
  return { ...base, ...(extra as Record<string, string>) };
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  const parts = document.cookie ? document.cookie.split(';') : [];
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.substring(target.length));
    }
  }
  return null;
}

/**
 * Maps a Wayel.Api role string (the .NET `UserRole` enum, ToString()) into
 * the SPA's `PlatformSessionRole`. Unknown roles default to
 * `institution_user` so a brand new role on the backend never crashes the
 * SPA — the worst case is "user lands in their tenant workspace instead of
 * the platform dashboard", which is the safer default.
 */
export function mapRole(role: string): PlatformSessionRole {
  switch ((role ?? '').toLowerCase()) {
    case 'superadmin':
    case 'super_admin':
      return 'super_admin';
    case 'support':
      return 'support';
    case 'tenantadmin':
    case 'tenant_admin':
    case 'tenantmanager':
    case 'tenant_manager':
    case 'parent':
    default:
      return 'institution_user';
  }
}

/**
 * The default sink — projects `/bff/auth/me` into `PlatformSessionService`.
 *
 * Used by `BffAuthService` whenever the host app does not provide its own
 * `BFF_SESSION_SINK`. This preserves the original wiring for REMOVED
 * and client-portal, both of which read identity straight off
 * `PlatformSessionService`.
 *
 * `customer-portal` overrides this with an adapter that *also* mirrors
 * the identity into `AccountSessionService` so its `Phase0Account`-driven
 * shells light up too.
 */
export class DefaultBffSessionSink implements BffSessionSink {
  constructor(
    private readonly session: PlatformSessionService,
    private readonly painter: TenantBrandingPainter,
  ) {}

  apply(me: BffMeResponse): void {
    const role = mapRole(me.role);
    if (role === 'institution_user') {
      this.session.signInAsInstitutionUser({
        id: me.userId,
        email: me.email,
        displayName: me.displayName,
        homeTenantId: me.tenantId ?? '',
        // Prefer the branding display name (the public-facing brand)
        // over the operational name the SuperAdmin sees, falling back
        // to either if the other is missing. The shell renders this in
        // the topbar pill and the workspace title.
        homeTenantName: me.tenant?.displayName?.trim()
          || me.tenant?.name?.trim()
          || '',
      });
    } else {
      this.session.signInAsSuperUser({
        id: me.userId,
        email: me.email,
        displayName: me.displayName,
        role,
      });
    }
    // Branding paint runs for every signed-in user that has a tenant.
    // SuperAdmin users without a home tenant fall through to the
    // platform default palette — `paint(null)` is a no-op so the
    // platform brand stays untouched.
    this.painter.paint(me.tenant ?? null);
  }

  clear(): void {
    this.painter.reset();
    this.session.signOut();
  }
}

/**
 * Applies a tenant's branding blob to the document chrome:
 *
 *  - Sets a curated set of `--nk-*` / `--sd-color-*` CSS custom
 *    properties on `<html>` so the existing platform palette gets
 *    overridden tenant-side without each component opting in.
 *  - Swaps the document `<link rel="icon">` to the tenant favicon
 *    (when set), restoring the original on `reset()`.
 *  - Sets `data-theme` on `<html>` so theme-aware CSS can flip
 *    light/dark independently of the user's OS preference.
 *
 * State held: per-property *prior values* (not just names) so the
 * painter composes correctly with itself — repeatedly calling
 * `paint(...)` always returns the document to the state it had
 * before the very first paint when `reset()` is finally called.
 *
 * Provided in `'root'` so the BFF session sink and any component
 * that wants to drive a live preview (e.g. the Branding tab in the
 * admin portal) share a single instance and can't trample each
 * other's stored "originals".
 */
@Injectable({ providedIn: 'root' })
export class TenantBrandingPainter {
  /** href of `<link rel="icon">` before any `paint()` call.
   *  `null` once it's been restored, "" if there was no original. */
  private originalFaviconHref: string | null = null;
  /** `data-theme` attr before any `paint()` call, or `null` if it was unset. */
  private originalDataTheme: string | null = null;
  /** Keyed by CSS-variable name → its inline value before the first paint
   *  (empty string if the var wasn't set inline). Restored on `reset()`. */
  private originalProps: Record<string, string> = {};
  /** True between the first `paint()` and the matching `reset()`.
   *  Used so a second `paint()` doesn't blow away the *real* originals. */
  private dirty = false;

  /** Map of CSS-variable name → value. Empty/whitespace clears it. */
  private static colorMap(t: BffTenantSummary): Record<string, string | null> {
    return {
      '--nk-sky': t.primaryColor,
      '--nk-sky-deep': t.secondaryColor,
      '--nk-coral': t.accentColor,
      '--nk-bg': t.backgroundColor,
      '--nk-surface': t.surfaceColor,
      '--nk-text': t.textColor,
      // Legacy SecureDocs aliases — every existing component reads these
      // so we mirror the primary trio there too. Background/surface/text
      // already cascade through `--nk-*`, no need to alias them again.
      '--sd-color-primary': t.primaryColor,
      '--sd-color-secondary': t.secondaryColor,
      '--sd-color-accent': t.accentColor,
    };
  }

  paint(tenant: BffTenantSummary | null): void {
    if (typeof document === 'undefined') return;
    if (!tenant) {
      // `paint(null)` is documented as "use the platform default
      // palette" — equivalent to `reset()`. Earlier we ran `reset()`
      // unconditionally on every paint, but that defeats the
      // composition story above; we only want to reset when caller
      // explicitly asks for it.
      this.reset();
      return;
    }

    const root = document.documentElement;
    const colors = TenantBrandingPainter.colorMap(tenant);
    for (const [name, value] of Object.entries(colors)) {
      this.rememberOriginalProp(root, name);
      const trimmed = value?.trim() ?? '';
      if (trimmed.length > 0) {
        root.style.setProperty(name, trimmed);
      } else {
        root.style.removeProperty(name);
      }
    }

    // Theme: only set when explicitly Light or Dark — `System` means
    // "respect the OS preference", so we leave `data-theme` unset.
    const theme = tenant.theme?.toLowerCase();
    if (!this.dirty) {
      this.originalDataTheme = root.getAttribute('data-theme');
    }
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }

    if (tenant.faviconUrl && tenant.faviconUrl.trim().length > 0) {
      const link = ensureFaviconLink();
      if (link) {
        if (!this.dirty) {
          this.originalFaviconHref = link.getAttribute('href') ?? '';
        }
        link.setAttribute('href', tenant.faviconUrl.trim());
      }
    }

    this.dirty = true;
  }

  /** Restore the document to its pre-`paint()` state. Safe to call
   *  even when `paint()` was never invoked. */
  reset(): void {
    if (typeof document === 'undefined') return;
    if (!this.dirty) return;
    const root = document.documentElement;
    for (const [name, prior] of Object.entries(this.originalProps)) {
      if (prior === '') {
        root.style.removeProperty(name);
      } else {
        root.style.setProperty(name, prior);
      }
    }
    this.originalProps = {};
    if (this.originalDataTheme !== null) {
      root.setAttribute('data-theme', this.originalDataTheme);
    } else {
      root.removeAttribute('data-theme');
    }
    this.originalDataTheme = null;
    if (this.originalFaviconHref !== null) {
      const link = ensureFaviconLink();
      if (link) {
        if (this.originalFaviconHref === '') {
          link.removeAttribute('href');
        } else {
          link.setAttribute('href', this.originalFaviconHref);
        }
      }
      this.originalFaviconHref = null;
    }
    this.dirty = false;
  }

  private rememberOriginalProp(root: HTMLElement, name: string): void {
    // First paint of a property captures its current inline value
    // (empty string when not set inline) so subsequent paints in the
    // same dirty cycle keep stacking on the same baseline. Once
    // `reset()` runs, the cache clears and the next paint starts a
    // fresh capture cycle.
    if (this.originalProps[name] === undefined) {
      this.originalProps[name] = root.style.getPropertyValue(name);
    }
  }
}

function ensureFaviconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}
