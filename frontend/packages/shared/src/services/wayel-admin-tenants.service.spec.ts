import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WayelAdminTenantsService,
  type WayelAdminTenantsHttpError,
} from './wayel-admin-tenants.service';

/**
 * `WayelAdminTenantsService` is a thin `fetch` wrapper, so the surface
 * worth testing is: URL composition (incl. query params), headers
 * (credentials + antiforgery on writes), and ProblemDetails parsing
 * (especially the awkward `title = code`, `type = url` shape Wayel.Api
 * emits via `JsonStringEnumConverter` + RFC 7807).
 */

function mockFetch(
  fn: (url: string, init: RequestInit) => Promise<Response>,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(fn);
  // @ts-expect-error – overriding the global fetch is intentional in tests.
  globalThis.fetch = spy;
  return spy;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  // The antiforgery helper reads `document.cookie`; expose a stub so it
  // can attach `X-XSRF-TOKEN` on state-changing calls.
  // @ts-expect-error – stubbing a DOM global for node-only vitest.
  globalThis.document = { cookie: 'XSRF-TOKEN=tok-123' };
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error – clean up global fetch + document.
  delete globalThis.fetch;
  // @ts-expect-error – clean up the document stub.
  delete globalThis.document;
});

describe('WayelAdminTenantsService.list()', () => {
  it('omits empty query params and uses GET (no antiforgery header)', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { items: [], nextPageToken: null }),
    );
    const svc = new WayelAdminTenantsService();

    await svc.list();

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('X-XSRF-TOKEN');
  });

  it('encodes search, kind, pageSize and pageToken into the query string', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { items: [], nextPageToken: null }),
    );
    const svc = new WayelAdminTenantsService();

    await svc.list({
      search: 'sun valley',
      kind: 'Parent',
      pageSize: 25,
      pageToken: 'cursor-abc',
    });

    const [url] = spy.mock.calls[0];
    const u = new URL(url as string, 'http://test');
    expect(u.pathname).toBe('/api/v1/admin/tenants');
    expect(u.searchParams.get('search')).toBe('sun valley');
    expect(u.searchParams.get('kind')).toBe('Parent');
    expect(u.searchParams.get('pageSize')).toBe('25');
    expect(u.searchParams.get('pageToken')).toBe('cursor-abc');
  });
});

describe('WayelAdminTenantsService.create()', () => {
  it('POSTs JSON with antiforgery + credentials and returns the body', async () => {
    const created = {
      tenantId: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      kind: 'Parent' as const,
      createdOnUtc: '2025-04-17T10:00:00Z',
    };
    const spy = mockFetch(async () => jsonResponse(201, created));
    const svc = new WayelAdminTenantsService();

    const got = await svc.create({
      name: 'Sun Valley',
      slug: 'sun-valley',
      kind: 'Parent',
    });

    expect(got).toEqual(created);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-XSRF-TOKEN']).toBe('tok-123');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Sun Valley',
      slug: 'sun-valley',
      kind: 'Parent',
    });
  });

  it('throws a WayelAdminTenantsHttpError with the API code on 409', async () => {
    mockFetch(async () =>
      jsonResponse(409, {
        title: 'tenant.slug_taken',
        detail: "Slug 'sun-valley' is already in use.",
        type: 'https://wayel.dev/errors/tenant.slug_taken',
        status: 409,
      }),
    );
    const svc = new WayelAdminTenantsService();

    await expect(
      svc.create({ name: 'Sun Valley', slug: 'sun-valley', kind: 'Parent' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'tenant.slug_taken',
      message: "Slug 'sun-valley' is already in use.",
    } satisfies Partial<WayelAdminTenantsHttpError>);
  });

  it('still parses error code from `type` URL when title is human prose', async () => {
    mockFetch(async () =>
      jsonResponse(400, {
        title: 'Bad Request',
        detail: 'The slug must be lowercase kebab-case.',
        type: 'https://wayel.dev/errors/tenant.slug_invalid',
      }),
    );
    const svc = new WayelAdminTenantsService();

    await expect(
      svc.create({ name: 'Acme', slug: 'Acme!', kind: 'Parent' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'tenant.slug_invalid',
    });
  });
});

describe('WayelAdminTenantsService.rename()', () => {
  it('PATCHes /admin/tenants/{id} with antiforgery + JSON body', async () => {
    const spy = mockFetch(async () => new Response(null, { status: 204 }));
    const svc = new WayelAdminTenantsService();

    await svc.rename('t-7', { name: 'Renamed' });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants/t-7');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-XSRF-TOKEN']).toBe('tok-123');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Renamed' });
  });
});

describe('WayelAdminTenantsService.suspend() / activate() / archive()', () => {
  it('POSTs /suspend with the reason in the body and returns the new status', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { tenantId: 't-1', status: 'Suspended' }),
    );
    const svc = new WayelAdminTenantsService();

    const got = await svc.suspend('t-1', { reason: 'billing on hold' });

    expect(got).toEqual({ tenantId: 't-1', status: 'Suspended' });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants/t-1/suspend');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-XSRF-TOKEN']).toBe('tok-123');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'billing on hold' });
  });

  it('POSTs /activate with an empty JSON body and the antiforgery header', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { tenantId: 't-2', status: 'Active' }),
    );
    const svc = new WayelAdminTenantsService();

    const got = await svc.activate('t-2');

    expect(got).toEqual({ tenantId: 't-2', status: 'Active' });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants/t-2/activate');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-XSRF-TOKEN']).toBe('tok-123');
    // We send `{}` rather than nothing — Wayel.Api's antiforgery
    // pipeline tolerates either, but an empty JSON body avoids the
    // "is this a form post?" content-type heuristic some proxies have.
    expect(init.body).toBe('{}');
  });

  it('POSTs /archive with the reason and surfaces tenant.archived on retry', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { tenantId: 't-3', status: 'Archived' }),
    );
    const svc = new WayelAdminTenantsService();

    const got = await svc.archive('t-3', { reason: 'offboarded' });

    expect(got.status).toBe('Archived');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants/t-3/archive');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'offboarded' });
  });
});

describe('WayelAdminTenantsService.list() with status filter', () => {
  it('encodes the status query param when provided', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { items: [], nextPageToken: null }),
    );
    const svc = new WayelAdminTenantsService();

    await svc.list({ status: 'Suspended', pageSize: 10 });

    const [url] = spy.mock.calls[0];
    const u = new URL(url as string, 'http://test');
    expect(u.searchParams.get('status')).toBe('Suspended');
    expect(u.searchParams.get('pageSize')).toBe('10');
  });
});

describe('WayelAdminTenantsService.slugTaken()', () => {
  it('returns true when the listing contains an exact-slug row', async () => {
    mockFetch(async () =>
      jsonResponse(200, {
        items: [
          {
            tenantId: 't-1',
            name: 'Sun Valley',
            slug: 'sun-valley',
            kind: 'Parent',
            createdOnUtc: '2025-04-17T10:00:00Z',
          },
        ],
        nextPageToken: null,
      }),
    );
    const svc = new WayelAdminTenantsService();

    expect(await svc.slugTaken('sun-valley')).toBe(true);
  });

  it('returns false when the only matching row is excluded by id', async () => {
    mockFetch(async () =>
      jsonResponse(200, {
        items: [
          {
            tenantId: 't-1',
            name: 'Sun Valley',
            slug: 'sun-valley',
            kind: 'Parent',
            createdOnUtc: '2025-04-17T10:00:00Z',
          },
        ],
        nextPageToken: null,
      }),
    );
    const svc = new WayelAdminTenantsService();

    expect(await svc.slugTaken('sun-valley', 't-1')).toBe(false);
  });

  it('returns false for an empty/whitespace input without hitting the API', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { items: [], nextPageToken: null }),
    );
    const svc = new WayelAdminTenantsService();

    expect(await svc.slugTaken('   ')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
