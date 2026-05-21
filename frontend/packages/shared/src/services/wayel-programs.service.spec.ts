import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WayelProgramsService,
  type WayelProgramsHttpError,
} from './wayel-programs.service';

/**
 * `WayelProgramsService` is a thin `fetch` wrapper that also normalises the
 * casing of the kind/schedule/cadence enums at the boundary. The surface
 * worth covering is therefore: URL composition, antiforgery + credentials
 * on writes, the casing translation in both directions, and the
 * ProblemDetails parsing chain (the same `title = code` shape Wayel.Api
 * emits and that the staff/tenants services already exercise).
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

const SAMPLE_WIRE = {
  programId: 'p-1',
  tenantId: 't-1',
  name: 'Toddlers',
  description: null,
  kind: 'Daycare' as const,
  schedule: 'HalfDay' as const,
  capacity: 12,
  ageMin: 1,
  ageMax: 3,
  isActive: true,
  teacherStaffId: null,
  assistantStaffId: null,
  fees: [
    {
      year: 2026,
      amount: 5800,
      currency: 'ZAR',
      cadence: 'Month' as const,
      notes: null,
      updatedOnUtc: '2026-01-01T00:00:00Z',
    },
  ],
  createdOnUtc: '2026-01-01T00:00:00Z',
  updatedOnUtc: '2026-01-01T00:00:00Z',
  archivedOnUtc: null,
};

beforeEach(() => {
  // @ts-expect-error – stubbing a DOM global for node-only vitest.
  globalThis.document = { cookie: 'XSRF-TOKEN=tok-prog' };
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error – clean up global fetch + document.
  delete globalThis.fetch;
  // @ts-expect-error – clean up the document stub.
  delete globalThis.document;
});

describe('WayelProgramsService.list()', () => {
  it('GETs /api/v1/programs without query params and without antiforgery', async () => {
    const spy = mockFetch(async () => jsonResponse(200, { items: [] }));
    const svc = new WayelProgramsService();

    await svc.list();

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/programs');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('X-XSRF-TOKEN');
  });

  it('encodes activeOnly=false, kind, and search into the query string', async () => {
    const spy = mockFetch(async () => jsonResponse(200, { items: [] }));
    const svc = new WayelProgramsService();

    await svc.list({ activeOnly: false, kind: 'session', search: 'swim' });

    const [url] = spy.mock.calls[0];
    const u = new URL(url as string, 'http://test');
    expect(u.pathname).toBe('/api/v1/programs');
    expect(u.searchParams.get('activeOnly')).toBe('false');
    expect(u.searchParams.get('kind')).toBe('Session');
    expect(u.searchParams.get('search')).toBe('swim');
  });

  it('translates wire enum casing to the lower-case domain shape', async () => {
    mockFetch(async () => jsonResponse(200, { items: [SAMPLE_WIRE] }));
    const svc = new WayelProgramsService();

    const got = await svc.list();

    expect(got).toHaveLength(1);
    expect(got[0].kind).toBe('daycare');
    expect(got[0].schedule).toBe('half_day');
    expect(got[0].fees[0].cadence).toBe('month');
  });
});

describe('WayelProgramsService.create()', () => {
  it('POSTs /api/v1/programs with antiforgery and the upper-cased enum payload', async () => {
    const spy = mockFetch(async () => jsonResponse(201, SAMPLE_WIRE));
    const svc = new WayelProgramsService();

    const got = await svc.create({
      name: 'Toddlers',
      kind: 'daycare',
      schedule: 'half_day',
      capacity: 12,
      ageMin: 1,
      ageMax: 3,
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/programs');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-XSRF-TOKEN']).toBe('tok-prog');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Toddlers',
      description: null,
      kind: 'Daycare',
      schedule: 'HalfDay',
      capacity: 12,
      ageMin: 1,
      ageMax: 3,
    });
    expect(got.kind).toBe('daycare');
  });

  it('throws a typed http error with code on 409 program.name_taken', async () => {
    mockFetch(async () =>
      jsonResponse(409, {
        title: 'program.name_taken',
        detail: 'Another active program in this tenant already uses that name.',
        type: 'https://wayel.dev/errors/program.name_taken',
        status: 409,
      }),
    );
    const svc = new WayelProgramsService();

    await expect(
      svc.create({ name: 'Dup', kind: 'daycare', schedule: 'half_day' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'program.name_taken',
    } satisfies Partial<WayelProgramsHttpError>);
  });
});

describe('WayelProgramsService.update()', () => {
  it('PATCHes /api/v1/programs/{id} with the clearXxx flags filled in', async () => {
    const spy = mockFetch(async () => jsonResponse(200, SAMPLE_WIRE));
    const svc = new WayelProgramsService();

    await svc.update('p-1', {
      name: 'Renamed',
      clearDescription: true,
      capacity: 20,
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/programs/p-1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe('Renamed');
    expect(body.clearDescription).toBe(true);
    expect(body.capacity).toBe(20);
    // Untouched flags default to false / null so the PATCH doesn't
    // accidentally null out other columns.
    expect(body.clearSchedule).toBe(false);
    expect(body.clearAgeMin).toBe(false);
  });
});

describe('WayelProgramsService.archive()', () => {
  it('POSTs /api/v1/programs/{id}/archive and resolves on 204', async () => {
    const spy = mockFetch(async () => new Response(null, { status: 204 }));
    const svc = new WayelProgramsService();

    await svc.archive('p-1');

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/programs/p-1/archive');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe(
      'tok-prog',
    );
  });
});

describe('WayelProgramsService.assignStaff()', () => {
  it('PUTs /api/v1/programs/{id}/staff/Teacher with the staffUserId body', async () => {
    const spy = mockFetch(async () => jsonResponse(200, SAMPLE_WIRE));
    const svc = new WayelProgramsService();

    await svc.assignStaff('p-1', 'teacher', 'u-7');

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/programs/p-1/staff/Teacher');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ staffUserId: 'u-7' });
  });

  it('clears a slot by passing null for staffUserId', async () => {
    const spy = mockFetch(async () => jsonResponse(200, SAMPLE_WIRE));
    const svc = new WayelProgramsService();

    await svc.assignStaff('p-1', 'assistant', null);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/programs/p-1/staff/Assistant');
    expect(JSON.parse(init.body as string)).toEqual({ staffUserId: null });
  });
});

describe('WayelProgramsService.upsertFee()', () => {
  it('PUTs /api/v1/programs/{id}/fees/{year} with the upper-cased cadence', async () => {
    const spy = mockFetch(async () => jsonResponse(200, SAMPLE_WIRE));
    const svc = new WayelProgramsService();

    await svc.upsertFee('p-1', 2026, {
      amount: 5800,
      currency: 'ZAR',
      cadence: 'month',
      notes: 'v1',
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/programs/p-1/fees/2026');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 5800,
      currency: 'ZAR',
      cadence: 'Month',
      notes: 'v1',
    });
  });
});
