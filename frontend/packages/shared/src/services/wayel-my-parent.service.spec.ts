import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WayelMyParentService,
  type WayelMyParentHttpError,
} from './wayel-my-parent.service';

/**
 * `WayelMyParentService` is a thin `fetch` wrapper that also normalises the
 * casing of the gender enum at the boundary. The surface worth covering is
 * therefore: URL composition, antiforgery + credentials on writes, the
 * casing translation in both directions, and the ProblemDetails parsing
 * chain.
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

const SAMPLE_CHILD_WIRE = {
  parentChildId: 'pc-1',
  displayName: 'Liam Mokoena',
  dateOfBirth: '2020-07-18',
  notes: 'tree-nut allergy',
  photoUrl: null,
  profile: {
    firstName: 'Liam',
    lastName: 'Mokoena',
    gender: 'Male' as const,
    hasEpilepsyHistory: false,
    allowSocialMediaSharing: true,
    ailmentsAllergiesConditions: 'Tree nuts',
  },
  createdOnUtc: '2026-01-01T00:00:00Z',
  updatedOnUtc: '2026-01-01T00:00:00Z',
};

const SAMPLE_PARENT_WIRE = {
  parentId: 'p-1',
  ownerUserId: 'u-1',
  displayName: 'Naledi Mokoena',
  email: 'naledi@example.com',
  phone: '+27 11 555 0211',
  children: [SAMPLE_CHILD_WIRE],
  createdOnUtc: '2026-01-01T00:00:00Z',
  updatedOnUtc: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  // @ts-expect-error – stubbing a DOM global for node-only vitest.
  globalThis.document = { cookie: 'XSRF-TOKEN=tok-parent' };
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error – clean up global fetch + document.
  delete globalThis.fetch;
  // @ts-expect-error – clean up the document stub.
  delete globalThis.document;
});

describe('WayelMyParentService.get()', () => {
  it('GETs /api/v1/me/parent without antiforgery', async () => {
    const spy = mockFetch(async () => jsonResponse(200, SAMPLE_PARENT_WIRE));
    const svc = new WayelMyParentService();

    const result = await svc.get();

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/me/parent');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBeUndefined();

    expect(result.parentId).toBe('p-1');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].profile.gender).toBe('male');
  });
});

describe('WayelMyParentService.addChild()', () => {
  it('POSTs to /api/v1/me/parent/children with antiforgery + credentials', async () => {
    const spy = mockFetch(async () => jsonResponse(201, SAMPLE_CHILD_WIRE));
    const svc = new WayelMyParentService();

    await svc.addChild({
      displayName: 'Liam Mokoena',
      dateOfBirth: '2020-07-18',
      notes: 'tree-nut allergy',
      profile: {
        firstName: 'Liam',
        lastName: 'Mokoena',
        gender: 'male',
        hasEpilepsyHistory: false,
        allowSocialMediaSharing: true,
        ailmentsAllergiesConditions: 'Tree nuts',
      },
      clinicCard: {
        fileName: 'clinic.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        mediaUrl: 'https://media.example/clinic.pdf',
      },
      birthCertificate: {
        fileName: 'birth.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048,
        mediaUrl: 'https://media.example/birth.pdf',
      },
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/me/parent/children');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('tok-parent');

    const body = JSON.parse(init?.body as string);
    expect(body.profile.gender).toBe('Male');
    expect(body.dateOfBirth).toBe('2020-07-18');
    expect(body.clinicCard).toMatchObject({
      fileName: 'clinic.pdf',
      contentType: 'application/pdf',
      mediaUrl: 'https://media.example/clinic.pdf',
    });
    expect(body.birthCertificate).toMatchObject({
      fileName: 'birth.pdf',
      contentType: 'application/pdf',
      mediaUrl: 'https://media.example/birth.pdf',
    });
  });

  it('translates a 409 conflict ProblemDetails into a typed error with code', async () => {
    mockFetch(async () =>
      jsonResponse(409, {
        title: 'parent.child_name_duplicate',
        detail: 'A child with that name already exists.',
      }),
    );
    const svc = new WayelMyParentService();

    let caught: WayelMyParentHttpError | null = null;
    try {
      await svc.addChild({
        displayName: 'Liam',
        dateOfBirth: '2020-01-01',
        clinicCard: {
          fileName: 'clinic.pdf',
          contentType: 'application/pdf',
          mediaUrl: 'https://media.example/clinic.pdf',
        },
        birthCertificate: {
          fileName: 'birth.pdf',
          contentType: 'application/pdf',
          mediaUrl: 'https://media.example/birth.pdf',
        },
      });
    } catch (e) {
      caught = e as WayelMyParentHttpError;
    }

    expect(caught).not.toBeNull();
    expect(caught!.status).toBe(409);
    expect(caught!.code).toBe('parent.child_name_duplicate');
    expect(caught!.message).toContain('already exists');
  });
});

describe('WayelMyParentService.updateChild()', () => {
  it('PATCHes to /api/v1/me/parent/children/{id} with clear flags', async () => {
    const spy = mockFetch(async () => jsonResponse(200, SAMPLE_CHILD_WIRE));
    const svc = new WayelMyParentService();

    await svc.updateChild('pc-1', {
      displayName: 'Liam Patel',
      clearNotes: true,
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/me/parent/children/pc-1');
    expect(init?.method).toBe('PATCH');
    const body = JSON.parse(init?.body as string);
    expect(body.displayName).toBe('Liam Patel');
    expect(body.clearNotes).toBe(true);
    expect(body.clearPhoto).toBe(false);
  });
});

describe('WayelMyParentService.removeChild()', () => {
  it('DELETEs and tolerates an empty 204 response', async () => {
    const spy = mockFetch(async () => new Response(null, { status: 204 }));
    const svc = new WayelMyParentService();

    await svc.removeChild('pc-1');

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/v1/me/parent/children/pc-1');
    expect(init?.method).toBe('DELETE');
    expect((init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('tok-parent');
  });
});
