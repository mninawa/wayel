import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOCK_PARTNERSHIPS } from '../core/mock/mock-partnerships';
import {
  acceptPartnership,
  addPartnership,
  declinePartnership,
  listAddablePartnerInstitutions,
  listIncomingInvitesForTenant,
  listPartnersForTenant,
  pausePartnership,
  removePartnership,
  resumePartnership,
  summarizePartnerships,
  updatePartnership,
} from './workspace-partnership';

const LITTLE_STARS = 'tenant_little_stars';
const AQUA_STARS = 'inst_aqua_stars';
const SONATA = 'inst_sonata_music';
const BRUSHSTROKES = 'inst_brushstrokes';
const KINTARO = 'inst_kintaro_karate';
const TINKER = 'inst_tinker_clay';

/**
 * `MOCK_PARTNERSHIPS` is a module-global, mutable array that the production
 * code mutates in place. We snapshot a deep copy before every test and
 * restore it afterwards so cases stay isolated, no matter the order they
 * run in.
 */
let snapshot: ReturnType<typeof structuredClone<typeof MOCK_PARTNERSHIPS>>;

beforeEach(() => {
  snapshot = structuredClone(MOCK_PARTNERSHIPS);
});

afterEach(() => {
  MOCK_PARTNERSHIPS.splice(0, MOCK_PARTNERSHIPS.length, ...snapshot);
});

describe('listPartnersForTenant()', () => {
  it('returns rows owned by the tenant, newest first', () => {
    const rows = listPartnersForTenant(LITTLE_STARS);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.partnership.ownerInstitutionId === LITTLE_STARS)).toBe(
      true,
    );
    for (let i = 1; i < rows.length; i++) {
      expect(
        rows[i - 1].partnership.createdAt >= rows[i].partnership.createdAt,
      ).toBe(true);
    }
  });

  it('decorates each row with partner, mutuality and scope label', () => {
    const rows = listPartnersForTenant(LITTLE_STARS);
    const aqua = rows.find((r) => r.partner.id === AQUA_STARS);
    expect(aqua).toBeDefined();
    expect(aqua!.isMutual).toBe(true);
    expect(aqua!.scopeLabel).toBe('All programs');

    const sonata = rows.find((r) => r.partner.id === SONATA);
    expect(sonata).toBeDefined();
    expect(sonata!.scopeLabel).toMatch(/Sunflowers|Pre-K|\+/);
    expect(sonata!.scopedPrograms.length).toBe(2);
  });
});

describe('listIncomingInvitesForTenant()', () => {
  it('only surfaces pending rows where we are the partner side', () => {
    const incoming = listIncomingInvitesForTenant(LITTLE_STARS);
    expect(incoming.length).toBeGreaterThan(0);
    expect(
      incoming.every(
        (r) =>
          r.partnership.partnerInstitutionId === LITTLE_STARS &&
          r.partnership.status === 'pending',
      ),
    ).toBe(true);
    expect(incoming.find((r) => r.partner.id === BRUSHSTROKES)).toBeDefined();
  });
});

describe('summarizePartnerships()', () => {
  it('aggregates active / paused / pendingOutgoing / pendingIncoming counts', () => {
    const s = summarizePartnerships(LITTLE_STARS);
    expect(s.active).toBeGreaterThan(0);
    expect(s.pendingIncoming).toBeGreaterThan(0);
    expect(s.pendingOutgoing).toBeGreaterThan(0);
    expect(s.hasAnyMutual).toBe(true);
  });
});

describe('addPartnership()', () => {
  it('creates a pending row and pushes onto the graph', () => {
    const before = MOCK_PARTNERSHIPS.length;
    const row = addPartnership({
      ownerInstitutionId: LITTLE_STARS,
      partnerInstitutionId: KINTARO,
      scope: { kind: 'tenant' },
      badge: 'partner',
      pitch: '  Karate after-school is in demand.  ',
      actorEmail: 'admin@littlestars.edu',
    });
    expect(MOCK_PARTNERSHIPS.length).toBe(before + 1);
    expect(row).toMatchObject({
      ownerInstitutionId: LITTLE_STARS,
      partnerInstitutionId: KINTARO,
      status: 'pending',
      reciprocalPartnershipId: null,
      pitch: 'Karate after-school is in demand.',
    });
  });

  it('rejects self-partnership', () => {
    expect(() =>
      addPartnership({
        ownerInstitutionId: LITTLE_STARS,
        partnerInstitutionId: LITTLE_STARS,
        scope: { kind: 'tenant' },
        badge: 'partner',
        pitch: 'me',
        actorEmail: 'a@b.c',
      }),
    ).toThrowError(/itself/i);
  });

  it('rejects duplicate partnerships in the same direction', () => {
    expect(() =>
      addPartnership({
        ownerInstitutionId: LITTLE_STARS,
        partnerInstitutionId: AQUA_STARS,
        scope: { kind: 'tenant' },
        badge: 'partner',
        pitch: 'dup',
        actorEmail: 'a@b.c',
      }),
    ).toThrowError(/already exists/i);
  });
});

describe('updatePartnership()', () => {
  it('patches scope/badge/pitch and bumps updatedAt', async () => {
    const owned = listPartnersForTenant(LITTLE_STARS);
    const target = owned.find((r) => r.partner.id === AQUA_STARS)!;
    const beforeUpdated = target.partnership.updatedAt;

    await new Promise((r) => setTimeout(r, 5));

    const patched = updatePartnership(LITTLE_STARS, target.partnership.id, {
      badge: 'partner',
      pitch: '  shorter pitch  ',
    });
    expect(patched).not.toBeNull();
    expect(patched!.badge).toBe('partner');
    expect(patched!.pitch).toBe('shorter pitch');
    expect(patched!.updatedAt > beforeUpdated).toBe(true);
  });

  it('returns null when the row does not exist for this owner', () => {
    expect(
      updatePartnership(LITTLE_STARS, 'prtn_does_not_exist', { badge: 'partner' }),
    ).toBeNull();
  });
});

describe('acceptPartnership()', () => {
  it('flips the inviter row to active and creates a reciprocal active row', () => {
    const incoming = listIncomingInvitesForTenant(LITTLE_STARS);
    const brushFromThem = incoming.find((r) => r.partner.id === BRUSHSTROKES)!;
    const inviterId = brushFromThem.partnership.id;
    const before = MOCK_PARTNERSHIPS.length;

    const reciprocal = acceptPartnership(LITTLE_STARS, inviterId, {
      actorEmail: 'admin@littlestars.edu',
      pitch: 'Brushstrokes art for our aftercare families.',
    });

    expect(reciprocal).not.toBeNull();
    expect(MOCK_PARTNERSHIPS.length).toBe(before + 1);

    const inviter = MOCK_PARTNERSHIPS.find((p) => p.id === inviterId)!;
    expect(inviter.status).toBe('active');
    expect(inviter.reciprocalPartnershipId).toBe(reciprocal!.id);

    expect(reciprocal!.status).toBe('active');
    expect(reciprocal!.ownerInstitutionId).toBe(LITTLE_STARS);
    expect(reciprocal!.partnerInstitutionId).toBe(BRUSHSTROKES);
    expect(reciprocal!.reciprocalPartnershipId).toBe(inviterId);
  });

  it('returns null when no matching pending invite is found', () => {
    expect(
      acceptPartnership(LITTLE_STARS, 'prtn_fake', { actorEmail: 'x@y.z' }),
    ).toBeNull();
  });
});

describe('declinePartnership()', () => {
  it('marks the inviter row as declined and stamps the reason', () => {
    const incoming = listIncomingInvitesForTenant(LITTLE_STARS);
    const target = incoming[0]!;

    const declined = declinePartnership(
      LITTLE_STARS,
      target.partnership.id,
      '  Not the right fit this term.  ',
    );

    expect(declined).not.toBeNull();
    expect(declined!.status).toBe('declined');
    expect(declined!.declineReason).toBe('Not the right fit this term.');
  });

  it('falls back to a default reason when an empty string is given', () => {
    const incoming = listIncomingInvitesForTenant(LITTLE_STARS);
    const target = incoming[0]!;

    const declined = declinePartnership(LITTLE_STARS, target.partnership.id, '   ');
    expect(declined!.declineReason).toBe('No reason provided.');
  });
});

describe('pause / resume', () => {
  it('pause moves an active owned row to paused; resume flips back', () => {
    const owned = listPartnersForTenant(LITTLE_STARS);
    const active = owned.find((r) => r.partnership.status === 'active')!;

    const paused = pausePartnership(LITTLE_STARS, active.partnership.id);
    expect(paused?.status).toBe('paused');

    const resumed = resumePartnership(LITTLE_STARS, active.partnership.id);
    expect(resumed?.status).toBe('active');
  });

  it('pause is a no-op for non-active rows; resume for non-paused rows', () => {
    const owned = listPartnersForTenant(LITTLE_STARS);
    const pending = owned.find((r) => r.partnership.status === 'pending')!;
    expect(pausePartnership(LITTLE_STARS, pending.partnership.id)).toBeNull();
    expect(resumePartnership(LITTLE_STARS, pending.partnership.id)).toBeNull();
  });
});

describe('removePartnership()', () => {
  it('removes the row and clears the reciprocal pointer on the partner row', () => {
    const owned = listPartnersForTenant(LITTLE_STARS);
    const aqua = owned.find((r) => r.partner.id === AQUA_STARS)!;
    const reciprocalId = aqua.partnership.reciprocalPartnershipId!;

    expect(removePartnership(LITTLE_STARS, aqua.partnership.id)).toBe(true);
    expect(MOCK_PARTNERSHIPS.find((p) => p.id === aqua.partnership.id)).toBeUndefined();

    const partnerRow = MOCK_PARTNERSHIPS.find((p) => p.id === reciprocalId);
    expect(partnerRow?.reciprocalPartnershipId).toBeNull();
  });

  it('returns false when the row does not exist for this owner', () => {
    expect(removePartnership(LITTLE_STARS, 'prtn_nope')).toBe(false);
  });
});

describe('listAddablePartnerInstitutions()', () => {
  it('excludes self and any institution we already partner with', () => {
    const addable = listAddablePartnerInstitutions(LITTLE_STARS);
    expect(addable.find((i) => i.id === LITTLE_STARS)).toBeUndefined();
    expect(addable.find((i) => i.id === AQUA_STARS)).toBeUndefined();
    expect(addable.find((i) => i.id === SONATA)).toBeUndefined();
    expect(addable.find((i) => i.id === BRUSHSTROKES)).toBeUndefined();
    expect(addable.find((i) => i.id === TINKER)).toBeDefined();
  });
});
