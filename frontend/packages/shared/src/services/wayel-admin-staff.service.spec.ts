import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WayelAdminStaffService,
  type WayelAdminStaffHttpError,
} from './wayel-admin-staff.service';

/**
 * `WayelAdminStaffService` is a thin `fetch` wrapper. The surface worth
 * testing is the same as the tenants/outbox services: URL composition,
 * antiforgery + credentials on writes, and ProblemDetails parsing
 * (the awkward `title = code`, `type = url` shape Wayel.Api emits).
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
  globalThis.document = { cookie: 'XSRF-TOKEN=tok-staff' };
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error – clean up global fetch + document.
  delete globalThis.fetch;
  // @ts-expect-error – clean up the document stub.
  delete globalThis.document;
});

describe('WayelAdminStaffService.list()', () => {
  it('GETs /api/v1/admin/tenants/{id}/staff/ with no query params and no antiforgery header', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { items: [], nextPageToken: null }),
    );
    const svc = new WayelAdminStaffService();

    await svc.list('tenant-7');

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    // No query params → trailing slash so the route hits the GET "/" handler.
    expect(url).toBe('/api/v1/admin/tenants/tenant-7/staff/');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('X-XSRF-TOKEN');
  });

  it('encodes search, role, pageSize, and pageToken into the query string', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { items: [], nextPageToken: null }),
    );
    const svc = new WayelAdminStaffService();

    await svc.list('tenant-7', {
      search: 'amy',
      role: 'TenantAdmin',
      pageSize: 50,
      pageToken: 'cursor-xyz',
    });

    const [url] = spy.mock.calls[0];
    const u = new URL(url as string, 'http://test');
    expect(u.pathname).toBe('/api/v1/admin/tenants/tenant-7/staff');
    expect(u.searchParams.get('search')).toBe('amy');
    expect(u.searchParams.get('role')).toBe('TenantAdmin');
    expect(u.searchParams.get('pageSize')).toBe('50');
    expect(u.searchParams.get('pageToken')).toBe('cursor-xyz');
  });

  it('URL-encodes a tenant id with special characters', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { items: [], nextPageToken: null }),
    );
    const svc = new WayelAdminStaffService();

    await svc.list('te/nant 1');

    const [url] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants/te%2Fnant%201/staff/');
  });
});

describe('WayelAdminStaffService.changeRole()', () => {
  it('PATCHes /staff/{userId}/role with the role body, antiforgery + credentials', async () => {
    const spy = mockFetch(async () =>
      jsonResponse(200, { userId: 'u-1', role: 'TenantAdmin' }),
    );
    const svc = new WayelAdminStaffService();

    const got = await svc.changeRole('t-1', 'u-1', { role: 'TenantAdmin' });

    expect(got).toEqual({ userId: 'u-1', role: 'TenantAdmin' });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants/t-1/staff/u-1/role');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-XSRF-TOKEN']).toBe('tok-staff');
    expect(JSON.parse(init.body as string)).toEqual({ role: 'TenantAdmin' });
  });

  it('throws a typed http error with code on 404 staff.not_in_tenant', async () => {
    mockFetch(async () =>
      jsonResponse(404, {
        title: 'staff.not_in_tenant',
        detail: 'The user does not belong to the specified tenant.',
        type: 'https://wayel.dev/errors/staff.not_in_tenant',
        status: 404,
      }),
    );
    const svc = new WayelAdminStaffService();

    await expect(
      svc.changeRole('t-1', 'u-other', { role: 'Staff' }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'staff.not_in_tenant',
    } satisfies Partial<WayelAdminStaffHttpError>);
  });
});

describe('WayelAdminStaffService.invite()', () => {
  it('POSTs /staff/invitations with the invitation body', async () => {
    const created = {
      invitationId: 'inv-1',
      email: 'amy@example.com',
      role: 'Staff',
      channel: 'Email' as const,
      expiresOnUtc: '2025-04-24T10:00:00Z',
      token: 'plaintext-once',
    };
    const spy = mockFetch(async () => jsonResponse(201, created));
    const svc = new WayelAdminStaffService();

    const got = await svc.invite('t-1', {
      email: 'amy@example.com',
      role: 'Staff',
      channel: 'Email',
    });

    expect(got).toEqual(created);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/admin/tenants/t-1/staff/invitations');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-XSRF-TOKEN']).toBe('tok-staff');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'amy@example.com',
      role: 'Staff',
      channel: 'Email',
    });
  });

  it('extracts the error code from `type` when title is human prose', async () => {
    mockFetch(async () =>
      jsonResponse(400, {
        title: 'Bad Request',
        detail: 'Phone number is required for WhatsApp delivery.',
        type: 'https://wayel.dev/errors/invitation.phone_required',
      }),
    );
    const svc = new WayelAdminStaffService();

    await expect(
      svc.invite('t-1', {
        email: 'amy@example.com',
        role: 'Staff',
        channel: 'WhatsApp',
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invitation.phone_required',
    });
  });
});
