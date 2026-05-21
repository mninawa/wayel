import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BffAuthService,
  TenantBrandingPainter,
  mapRole,
  type BffMeResponse,
  type BffTenantSummary,
} from './bff-auth.service';
import { PlatformSessionService } from './platform-session.service';

/**
 * Build a fresh service against a fresh `PlatformSessionService`. The
 * session service uses `sessionStorage` internally — `vitest`'s `node`
 * environment doesn't ship one, so we shim it. We rebuild it per test so
 * leakage between cases is impossible.
 */
function makeService(): {
  bff: BffAuthService;
  session: PlatformSessionService;
} {
  const session = new PlatformSessionService();
  const bff = new BffAuthService(session);
  return { bff, session };
}

beforeEach(() => {
  // jsdom-free shim: a Map-backed Storage is enough for the tiny surface
  // PlatformSessionService touches (getItem / setItem / removeItem).
  const store = new Map<string, string>();
  // @ts-expect-error – assigning to Node global is intentional for tests.
  globalThis.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error – clean up the global so other suites don't see it.
  delete globalThis.sessionStorage;
  // @ts-expect-error – fetch is replaced per-test; clear it for hygiene.
  delete globalThis.fetch;
});

function mockFetchOnce(
  init: { status: number; body?: unknown } | (() => Promise<Response>),
): ReturnType<typeof vi.fn> {
  const fn =
    typeof init === 'function'
      ? vi.fn(init)
      : vi.fn(async () =>
          new Response(init.body == null ? null : JSON.stringify(init.body), {
            status: init.status,
            headers: { 'content-type': 'application/json' },
          }),
        );
  // @ts-expect-error – overriding the global fetch is intentional.
  globalThis.fetch = fn;
  return fn;
}

const SUPER_ADMIN_ME: BffMeResponse = {
  userId: 'usr-1',
  tenantId: null,
  email: 'ada@wayel.example',
  displayName: 'Ada Lovelace',
  role: 'SuperAdmin',
  accessTokenExpiresOnUtc: new Date(Date.now() + 60_000).toISOString(),
};

const TENANT_USER_ME: BffMeResponse = {
  userId: 'usr-2',
  tenantId: 'tenant-1',
  email: 'manager@littlestars.example',
  displayName: 'Mary Manager',
  role: 'TenantManager',
  accessTokenExpiresOnUtc: new Date(Date.now() + 60_000).toISOString(),
};

describe('BffAuthService.bootstrap()', () => {
  it('hydrates the session as a super-user when /me returns a SuperAdmin', async () => {
    const fetchSpy = mockFetchOnce({ status: 200, body: SUPER_ADMIN_ME });
    const { bff, session } = makeService();

    const me = await bff.bootstrap();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/bff/auth/me',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(me).toEqual(SUPER_ADMIN_ME);
    expect(session.isSignedIn()).toBe(true);
    expect(session.isSuperUser()).toBe(true);
    expect(session.currentUser()?.email).toBe(SUPER_ADMIN_ME.email);
    expect(bff.bootstrapped()).toBe(true);
    expect(bff.hasBffSession()).toBe(true);
  });

  it('hydrates the session as an institution user when /me returns a TenantManager', async () => {
    mockFetchOnce({ status: 200, body: TENANT_USER_ME });
    const { bff, session } = makeService();

    await bff.bootstrap();

    expect(session.isInstitutionUser()).toBe(true);
    expect(session.currentUser()?.homeTenantId).toBe('tenant-1');
  });

  it('leaves the session empty and resolves null on 401', async () => {
    mockFetchOnce({ status: 401 });
    const { bff, session } = makeService();

    const me = await bff.bootstrap();

    expect(me).toBeNull();
    expect(session.isSignedIn()).toBe(false);
    expect(session.currentUser()).toBeNull();
    expect(bff.bootstrapped()).toBe(true);
    expect(bff.hasBffSession()).toBe(false);
  });

  it('still flips bootstrapped() to true when /me throws on 5xx (so guards do not deadlock)', async () => {
    mockFetchOnce({ status: 500 });
    const { bff } = makeService();

    await expect(bff.bootstrap()).rejects.toThrow(/HTTP 500/);
    expect(bff.bootstrapped()).toBe(true);
  });
});

describe('BffAuthService.signOut()', () => {
  it('POSTs to /bff/auth/logout and clears the local session', async () => {
    // Pre-populate the session so we can assert it gets cleared.
    const { bff, session } = makeService();
    session.signInAsSuperUser({
      id: 'x',
      email: 'x@y.z',
      displayName: 'X',
      role: 'super_admin',
    });
    expect(session.isSignedIn()).toBe(true);

    const fetchSpy = mockFetchOnce({ status: 204 });
    await bff.signOut();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/bff/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(session.isSignedIn()).toBe(false);
    expect(session.currentUser()).toBeNull();
  });

  it('still clears the local session when the BFF call fails (offline)', async () => {
    const { bff, session } = makeService();
    session.signInAsSuperUser({
      id: 'x',
      email: 'x@y.z',
      displayName: 'X',
      role: 'super_admin',
    });

    mockFetchOnce(async () => {
      throw new TypeError('network down');
    });

    await expect(bff.signOut()).resolves.toBeUndefined();
    expect(session.isSignedIn()).toBe(false);
  });
});

describe('BffAuthService.signInWithGoogle()', () => {
  it('redirects the browser to /bff/auth/login with a sanitised returnUrl', () => {
    // Stub window.location to capture assignments.
    const originalWindow = (globalThis as { window?: unknown }).window;
    let assignedUrl = '';
    // @ts-expect-error – setting up a minimal window stub.
    globalThis.window = {
      location: {
        get pathname() {
          return '/dashboard';
        },
        get search() {
          return '';
        },
        set href(value: string) {
          assignedUrl = value;
        },
      },
    };

    try {
      const { bff } = makeService();
      bff.signInWithGoogle('/tenants/abc');
      expect(assignedUrl).toBe('/bff/auth/login?returnUrl=%2Ftenants%2Fabc');
    } finally {
      // @ts-expect-error – restore.
      globalThis.window = originalWindow;
    }
  });

  it('refuses to bounce the user back into /bff/* or /login', () => {
    let assignedUrl = '';
    const originalWindow = (globalThis as { window?: unknown }).window;
    // @ts-expect-error – minimal window stub.
    globalThis.window = {
      location: {
        get pathname() {
          return '/login';
        },
        get search() {
          return '';
        },
        set href(value: string) {
          assignedUrl = value;
        },
      },
    };

    try {
      const { bff } = makeService();
      bff.signInWithGoogle('/bff/auth/login');
      expect(assignedUrl).toBe('/bff/auth/login?returnUrl=%2F');
    } finally {
      // @ts-expect-error – restore.
      globalThis.window = originalWindow;
    }
  });
});

describe('BffAuthService.prepaintBrandingFromHost()', () => {
  // Minimal document stub so the painter (driven via the service) has
  // somewhere to write CSS variables / favicon hrefs to.
  function installFakeDocument(): { rootStyle: Map<string, string> } {
    const rootStyle = new Map<string, string>();
    const rootAttrs = new Map<string, string>();
    const favicon = { href: '/favicon.original' };
    const root = {
      style: {
        setProperty: (n: string, v: string) => rootStyle.set(n, v),
        removeProperty: (n: string) => void rootStyle.delete(n),
        getPropertyValue: (n: string) => rootStyle.get(n) ?? '',
      },
      setAttribute: (n: string, v: string) => rootAttrs.set(n, v),
      removeAttribute: (n: string) => void rootAttrs.delete(n),
      getAttribute: (n: string) => rootAttrs.get(n) ?? null,
    } as unknown as HTMLElement;
    const link = {
      setAttribute: (n: string, v: string) => {
        if (n === 'href') favicon.href = v;
      },
      getAttribute: (n: string) => (n === 'href' ? favicon.href : null),
    } as unknown as HTMLLinkElement;
    const document = {
      documentElement: root,
      head: { appendChild: (_c: unknown) => _c } as unknown as HTMLHeadElement,
      querySelector: (sel: string) => (sel.includes('icon') ? link : null),
      createElement: (_t: string) => ({ rel: '', setAttribute: () => undefined }) as unknown as HTMLElement,
    } as unknown as Document;
    // @ts-expect-error – global stub.
    globalThis.document = document;
    return { rootStyle };
  }

  afterEach(() => {
    // @ts-expect-error – tidy up so it doesn't leak across describes.
    delete globalThis.document;
  });

  it('hits /bff/branding/by-domain/<host> and paints when the BFF returns a summary', async () => {
    installFakeDocument();
    const summary: BffTenantSummary = {
      tenantId: 't-9',
      name: 'Little Stars',
      slug: 'little-stars',
      status: 'Active',
      displayName: 'Little Stars Preschool',
      primaryColor: '#112233',
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      surfaceColor: null,
      textColor: null,
      logoUrl: null,
      faviconUrl: null,
      customDomain: 'parents.little-stars.example',
      theme: 'System',
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
    };
    const fetchSpy = mockFetchOnce({ status: 200, body: summary });
    const { bff } = makeService();

    const result = await bff.prepaintBrandingFromHost('parents.little-stars.example');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/bff/branding/by-domain/parents.little-stars.example',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(result).toEqual(summary);
  });

  it('returns null and does not paint when the BFF returns 204 (no tenant claimed this host)', async () => {
    const { rootStyle } = installFakeDocument();
    mockFetchOnce({ status: 204 });
    const { bff } = makeService();

    const result = await bff.prepaintBrandingFromHost('app.wayel.example');

    expect(result).toBeNull();
    expect(rootStyle.size).toBe(0);
  });

  it('returns null on network failure (degrades to platform default)', async () => {
    installFakeDocument();
    mockFetchOnce(async () => {
      throw new TypeError('network down');
    });
    const { bff } = makeService();

    await expect(bff.prepaintBrandingFromHost('parents.example')).resolves.toBeNull();
  });

  it('returns null when called without a host and no window is present', async () => {
    installFakeDocument();
    const { bff } = makeService();
    // No `window` shim → service should bail early without touching fetch.
    const fetchSpy = vi.fn();
    // @ts-expect-error – stub global fetch.
    globalThis.fetch = fetchSpy;

    const result = await bff.prepaintBrandingFromHost();

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('honours ?previewHost= as the dev-only host override and persists it for the tab', async () => {
    installFakeDocument();
    // Stand up a minimal `window` so resolveHostForBranding() can
    // read the search string, the host, and sessionStorage. We use
    // the same Map-backed sessionStorage we already shimmed in the
    // top-level beforeEach.
    // @ts-expect-error – test-only window shim.
    globalThis.window = {
      location: {
        search: '?previewHost=parents.sun-valley.example',
        host: 'localhost:4200',
      },
      sessionStorage: globalThis.sessionStorage,
    };

    const summary: BffTenantSummary = {
      tenantId: 't-sun-valley',
      name: 'Sun Valley',
      slug: 'sun-valley',
      status: 'Active',
      displayName: 'Sun Valley Preschool',
      primaryColor: '#abcdef',
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      surfaceColor: null,
      textColor: null,
      logoUrl: null,
      faviconUrl: null,
      customDomain: 'parents.sun-valley.example',
      theme: 'Light',
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
    };
    const fetchSpy = mockFetchOnce({ status: 200, body: summary });
    const { bff } = makeService();

    const result = await bff.prepaintBrandingFromHost();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/bff/branding/by-domain/parents.sun-valley.example',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result?.tenantId).toBe('t-sun-valley');
    // Persisted for sticky preview across route changes.
    expect(globalThis.sessionStorage.getItem('wayel.previewHost')).toBe(
      'parents.sun-valley.example',
    );

    // @ts-expect-error – clean up the window shim so it doesn't leak.
    delete globalThis.window;
  });

  it('reuses the sessionStorage preview when the URL no longer carries ?previewHost', async () => {
    installFakeDocument();
    globalThis.sessionStorage.setItem('wayel.previewHost', 'parents.sticky.example');
    // @ts-expect-error – test-only window shim.
    globalThis.window = {
      location: { search: '', host: 'localhost:4200' },
      sessionStorage: globalThis.sessionStorage,
    };
    const fetchSpy = mockFetchOnce({ status: 204 });
    const { bff } = makeService();

    await bff.prepaintBrandingFromHost();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/bff/branding/by-domain/parents.sticky.example',
      expect.anything(),
    );

    // @ts-expect-error – cleanup.
    delete globalThis.window;
  });
});

describe('BffAuthService.lookupTenantByHost()', () => {
  it('returns the BFF summary for a 200', async () => {
    const summary: BffTenantSummary = {
      tenantId: 't-abc',
      name: 'Acme',
      slug: 'acme',
      status: 'Active',
      displayName: 'Acme Preschool',
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      surfaceColor: null,
      textColor: null,
      logoUrl: null,
      faviconUrl: null,
      customDomain: 'parents.acme.example',
      theme: 'System',
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
    };
    const fetchSpy = mockFetchOnce({ status: 200, body: summary });
    const { bff } = makeService();

    const result = await bff.lookupTenantByHost('  parents.acme.example  ');

    // Trimming happens in the service so the BFF only ever gets the
    // canonical form — confirm via the URL the spy saw.
    expect(fetchSpy).toHaveBeenCalledWith(
      '/bff/branding/by-domain/parents.acme.example',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(result?.tenantId).toBe('t-abc');
  });

  it('returns null on 204 without consuming a body', async () => {
    mockFetchOnce({ status: 204 });
    const { bff } = makeService();

    await expect(bff.lookupTenantByHost('parents.nobody.example')).resolves.toBeNull();
  });

  it('returns null on network failure (verify must never crash the form)', async () => {
    mockFetchOnce(async () => {
      throw new TypeError('offline');
    });
    const { bff } = makeService();

    await expect(bff.lookupTenantByHost('parents.acme.example')).resolves.toBeNull();
  });

  it('returns null and skips the fetch when given an empty host', async () => {
    const fetchSpy = vi.fn();
    // @ts-expect-error – stub fetch.
    globalThis.fetch = fetchSpy;
    const { bff } = makeService();

    await expect(bff.lookupTenantByHost('   ')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('TenantBrandingPainter', () => {
  // Minimal in-memory document so the painter can do its thing without
  // dragging jsdom into the unit-test environment. We only need
  // `documentElement` (style.setProperty / removeProperty / setAttribute /
  // removeAttribute / getAttribute) and `head.appendChild` /
  // `querySelector` for the favicon swap.
  function fakeDocument(): {
    document: Document;
    rootStyle: Map<string, string>;
    rootAttrs: Map<string, string>;
    favicon: { href: string };
  } {
    const rootStyle = new Map<string, string>();
    const rootAttrs = new Map<string, string>();
    const favicon = { href: '/favicon.original' };
    const root = {
      style: {
        setProperty: (name: string, value: string) => rootStyle.set(name, value),
        removeProperty: (name: string) => void rootStyle.delete(name),
        getPropertyValue: (name: string) => rootStyle.get(name) ?? '',
      },
      setAttribute: (name: string, value: string) => rootAttrs.set(name, value),
      removeAttribute: (name: string) => void rootAttrs.delete(name),
      getAttribute: (name: string) => rootAttrs.get(name) ?? null,
    } as unknown as HTMLElement;
    const link = {
      get rel() {
        return 'icon';
      },
      set rel(_v: string) {},
      setAttribute: (name: string, value: string) => {
        if (name === 'href') favicon.href = value;
      },
      getAttribute: (name: string) => (name === 'href' ? favicon.href : null),
    } as unknown as HTMLLinkElement;
    const head = {
      appendChild: (_child: unknown) => _child,
    } as unknown as HTMLHeadElement;
    const document = {
      documentElement: root,
      head,
      querySelector: (sel: string) => (sel.includes('icon') ? link : null),
      createElement: (_tag: string) =>
        ({
          rel: '',
          setAttribute: (n: string, v: string) => {
            if (n === 'href') favicon.href = v;
          },
        }) as unknown as HTMLElement,
    } as unknown as Document;
    return { document, rootStyle, rootAttrs, favicon };
  }

  it('paints the curated CSS variables from a branding blob', () => {
    const { document, rootStyle } = fakeDocument();
    // @ts-expect-error – global stub for the painter's `typeof document` guard.
    globalThis.document = document;

    const painter = new TenantBrandingPainter();
    const tenant: BffTenantSummary = {
      tenantId: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      status: 'Active',
      displayName: 'Sun Valley Preschool',
      primaryColor: '#5ba8e0',
      secondaryColor: '#3b82b5',
      accentColor: '#f4a261',
      backgroundColor: '#f6f8fb',
      surfaceColor: '#ffffff',
      textColor: '#1e2433',
      logoUrl: null,
      faviconUrl: null,
      customDomain: null,
      theme: 'Light',
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
    };
    painter.paint(tenant);

    expect(rootStyle.get('--nk-sky')).toBe('#5ba8e0');
    expect(rootStyle.get('--nk-sky-deep')).toBe('#3b82b5');
    expect(rootStyle.get('--nk-coral')).toBe('#f4a261');
    expect(rootStyle.get('--nk-bg')).toBe('#f6f8fb');
    // Legacy --sd-color-* aliases are mirrored from the primary trio.
    expect(rootStyle.get('--sd-color-primary')).toBe('#5ba8e0');
    expect(rootStyle.get('--sd-color-accent')).toBe('#f4a261');
  });

  it('reset() removes everything paint() touched', () => {
    const { document, rootStyle, rootAttrs, favicon } = fakeDocument();
    // @ts-expect-error – global stub.
    globalThis.document = document;

    const painter = new TenantBrandingPainter();
    painter.paint({
      tenantId: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      status: 'Active',
      displayName: null,
      primaryColor: '#abcdef',
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      surfaceColor: null,
      textColor: null,
      logoUrl: null,
      faviconUrl: 'https://cdn/example.ico',
      customDomain: null,
      theme: 'Dark',
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
    });

    expect(rootStyle.get('--nk-sky')).toBe('#abcdef');
    expect(rootAttrs.get('data-theme')).toBe('dark');
    expect(favicon.href).toBe('https://cdn/example.ico');

    painter.reset();

    expect(rootStyle.has('--nk-sky')).toBe(false);
    expect(rootAttrs.has('data-theme')).toBe(false);
    expect(favicon.href).toBe('/favicon.original');
  });

  it('layered paint() then reset() restores the *first* paint, not the unset state', () => {
    // Real-world flow: BFF sign-in painter lays down the tenant
    // chrome, then the Branding tab's preview painter paints the
    // unsaved form values on top. When the user clicks Revert, the
    // chrome must drop *back to the saved branding*, not to the
    // platform default.
    const { document, rootStyle, rootAttrs, favicon } = fakeDocument();
    // @ts-expect-error – global stub.
    globalThis.document = document;

    const signInPainter = new TenantBrandingPainter();
    signInPainter.paint({
      tenantId: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      status: 'Active',
      displayName: 'Sun Valley Preschool',
      primaryColor: '#5ba8e0',
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      surfaceColor: null,
      textColor: null,
      logoUrl: null,
      faviconUrl: '/saved-favicon.ico',
      customDomain: null,
      theme: 'Light',
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
    });
    expect(rootStyle.get('--nk-sky')).toBe('#5ba8e0');
    expect(rootAttrs.get('data-theme')).toBe('light');
    expect(favicon.href).toBe('/saved-favicon.ico');

    const previewPainter = new TenantBrandingPainter();
    previewPainter.paint({
      tenantId: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      status: 'Active',
      displayName: 'Sun Valley Preschool',
      primaryColor: '#ff0000',
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      surfaceColor: null,
      textColor: null,
      logoUrl: null,
      faviconUrl: '/preview-favicon.ico',
      customDomain: null,
      theme: 'Dark',
      supportEmail: null,
      supportPhone: null,
      websiteUrl: null,
    });
    expect(rootStyle.get('--nk-sky')).toBe('#ff0000');
    expect(rootAttrs.get('data-theme')).toBe('dark');
    expect(favicon.href).toBe('/preview-favicon.ico');

    previewPainter.reset();

    expect(rootStyle.get('--nk-sky')).toBe('#5ba8e0');
    expect(rootAttrs.get('data-theme')).toBe('light');
    expect(favicon.href).toBe('/saved-favicon.ico');
  });

  it('paint(null) is a no-op (used for SuperAdmin users with no tenant)', () => {
    const { document, rootStyle } = fakeDocument();
    // @ts-expect-error – global stub.
    globalThis.document = document;

    const painter = new TenantBrandingPainter();
    painter.paint(null);

    expect(rootStyle.size).toBe(0);
  });

  afterEach(() => {
    // @ts-expect-error – clean up the document stub for the next test.
    delete globalThis.document;
  });
});

describe('mapRole()', () => {
  it.each([
    ['SuperAdmin', 'super_admin'],
    ['super_admin', 'super_admin'],
    ['Support', 'support'],
    ['TenantAdmin', 'institution_user'],
    ['TenantManager', 'institution_user'],
    ['Parent', 'institution_user'],
    ['SomethingNew', 'institution_user'],
    ['', 'institution_user'],
  ])('maps %s -> %s', (input, expected) => {
    expect(mapRole(input)).toBe(expected);
  });
});
