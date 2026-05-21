import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WayelMilestonesService,
  type WayelMilestonesHttpError,
} from './wayel-milestones.service';

/**
 * `WayelMilestonesService` is a thin `fetch` wrapper that also normalises
 * the casing of the visibility enum at the boundary. The surface worth
 * covering is therefore: URL composition (including query-string filters),
 * antiforgery + credentials on writes, the casing translation in both
 * directions, and the ProblemDetails parsing chain.
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
  milestoneId: 'mil-1',
  tenantId: 't-1',
  childName: 'Liam Mokoena',
  title: 'First independent puzzle',
  achievedOn: '2026-04-10',
  visibility: 'ParentAndVault' as const,
  notes: 'Completed a 12-piece on his own.',
  createdOnUtc: '2026-04-10T08:00:00Z',
  updatedOnUtc: '2026-04-10T08:00:00Z',
};

beforeEach(() => {
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

describe('WayelMilestonesService.list()', () => {
  it('GETs /api/v1/milestones with no query when nothing supplied', async () => {
    const spy = mockFetch(async () => jsonResponse(200, { items: [SAMPLE_WIRE] }));
    const svc = new WayelMilestonesService();

    const result = await svc.list();

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/milestones');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result[0].visibility).toBe('parentAndVault');
  });

  it('serialises filters and translates the visibility enum to PascalCase', async () => {
    const spy = mockFetch(async () => jsonResponse(200, { items: [] }));
    const svc = new WayelMilestonesService();

    await svc.list({
      search: 'puzzle',
      visibility: 'parentVisible',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
    });

    const [url] = spy.mock.calls[0];
    expect(url).toContain('search=puzzle');
    expect(url).toContain('visibility=ParentVisible');
    expect(url).toContain('from=2026-04-01');
    expect(url).toContain('to=2026-04-30');
  });
});

describe('WayelMilestonesService.record()', () => {
  it('POSTs to /api/v1/milestones with antiforgery + credentials and translated visibility', async () => {
    const spy = mockFetch(async () => jsonResponse(201, SAMPLE_WIRE));
    const svc = new WayelMilestonesService();

    await svc.record({
      childName: 'Liam Mokoena',
      title: 'First independent puzzle',
      achievedOn: '2026-04-10',
      visibility: 'parentAndVault',
      notes: 'Completed a 12-piece on his own.',
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/milestones');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('tok-staff');

    const body = JSON.parse(init?.body as string);
    expect(body.visibility).toBe('ParentAndVault');
    expect(body.achievedOn).toBe('2026-04-10');
  });

  it('translates a 400 ProblemDetails into a typed error with code', async () => {
    mockFetch(async () =>
      jsonResponse(400, {
        title: 'milestone.title_required',
        detail: 'Title is required.',
      }),
    );
    const svc = new WayelMilestonesService();

    let caught: WayelMilestonesHttpError | null = null;
    try {
      await svc.record({
        childName: 'Liam',
        title: '',
        achievedOn: '2026-04-10',
        visibility: 'internal',
      });
    } catch (e) {
      caught = e as WayelMilestonesHttpError;
    }

    expect(caught).not.toBeNull();
    expect(caught!.status).toBe(400);
    expect(caught!.code).toBe('milestone.title_required');
    expect(caught!.message).toContain('Title');
  });
});

describe('WayelMilestonesService.update()', () => {
  it('PATCHes /api/v1/milestones/{id} with the clearNotes flag preserved', async () => {
    const spy = mockFetch(async () => jsonResponse(200, SAMPLE_WIRE));
    const svc = new WayelMilestonesService();

    await svc.update('mil-1', {
      title: 'First puzzle solo',
      visibility: 'parentVisible',
      clearNotes: true,
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/milestones/mil-1');
    expect(init?.method).toBe('PATCH');
    const body = JSON.parse(init?.body as string);
    expect(body.title).toBe('First puzzle solo');
    expect(body.visibility).toBe('ParentVisible');
    expect(body.clearNotes).toBe(true);
    expect(body.notes).toBe(null);
  });
});

describe('WayelMilestonesService.remove()', () => {
  it('DELETEs and tolerates an empty 204 response', async () => {
    const spy = mockFetch(async () => new Response(null, { status: 204 }));
    const svc = new WayelMilestonesService();

    await svc.remove('mil-1');

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/milestones/mil-1');
    expect(init?.method).toBe('DELETE');
    expect((init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('tok-staff');
  });
});
