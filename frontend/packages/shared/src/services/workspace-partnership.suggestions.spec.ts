import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOCK_PARTNERSHIPS } from '../core/mock/mock-partnerships';
import {
  listPreferredPartnersForParent,
  listSuggestionsForChild,
  listSuggestionsForParent,
} from './workspace-partnership';

const PARENT_THANDI = 'parent_thandi';
const PCHILD_AZIFANI = 'pchild_azifani';
const LITTLE_STARS = 'tenant_little_stars';
const AQUA_STARS = 'inst_aqua_stars';
const SONATA = 'inst_sonata_music';
const BRUSHSTROKES = 'inst_brushstrokes';

let snapshot: ReturnType<typeof structuredClone<typeof MOCK_PARTNERSHIPS>>;

beforeEach(() => {
  snapshot = structuredClone(MOCK_PARTNERSHIPS);
});

afterEach(() => {
  MOCK_PARTNERSHIPS.splice(0, MOCK_PARTNERSHIPS.length, ...snapshot);
});

describe('listSuggestionsForParent()', () => {
  it('returns an empty list for an unknown parent id', () => {
    expect(listSuggestionsForParent('parent_does_not_exist')).toEqual([]);
  });

  it('walks every active subscription and surfaces the curator institution', () => {
    const rows = listSuggestionsForParent(PARENT_THANDI);
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((r) =>
        [LITTLE_STARS, AQUA_STARS, SONATA, BRUSHSTROKES].includes(r.curator.id),
      ),
    ).toBe(true);
  });

  it('excludes institutions the child is already subscribed to (active or pending)', () => {
    const rows = listSuggestionsForParent(PARENT_THANDI);
    const azifaniRows = rows.filter((r) => r.child.id === PCHILD_AZIFANI);
    expect(
      azifaniRows.every(
        (r) => r.partner.id !== LITTLE_STARS && r.partner.id !== AQUA_STARS,
      ),
    ).toBe(true);
  });

  it('only emits rows for active partnerships', () => {
    const rows = listSuggestionsForParent(PARENT_THANDI);
    expect(rows.every((r) => r.partnership.status === 'active')).toBe(true);
  });

  it('dedupes (childId, partnerInstitutionId) pairs across multiple curators', () => {
    const rows = listSuggestionsForParent(PARENT_THANDI);
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.child.id}:${r.partner.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('ranks preferred → sister_school → partner', () => {
    const rows = listSuggestionsForParent(PARENT_THANDI);
    const weight = (b: string) =>
      b === 'preferred' ? 0 : b === 'sister_school' ? 1 : 2;
    for (let i = 1; i < rows.length; i++) {
      expect(
        weight(rows[i - 1].partnership.badge) <=
          weight(rows[i].partnership.badge),
      ).toBe(true);
    }
  });

  it('caps results at 12 rows', () => {
    const rows = listSuggestionsForParent(PARENT_THANDI);
    expect(rows.length).toBeLessThanOrEqual(12);
  });
});

describe('listPreferredPartnersForParent()', () => {
  it('returns an empty map for an unknown parent id', () => {
    const map = listPreferredPartnersForParent('parent_does_not_exist');
    expect(map.size).toBe(0);
  });

  it('only includes partnerships flagged as preferred', () => {
    const map = listPreferredPartnersForParent(PARENT_THANDI);
    for (const endorsement of map.values()) {
      for (const curator of endorsement.curators) {
        const matches = MOCK_PARTNERSHIPS.filter(
          (p) =>
            p.ownerInstitutionId === curator.id &&
            p.partnerInstitutionId === endorsement.partner.id,
        );
        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some((p) => p.badge === 'preferred' && p.status === 'active')).toBe(true);
      }
    }
  });

  it('only sources curators from the parent\'s active subscriptions', () => {
    const map = listPreferredPartnersForParent(PARENT_THANDI);
    const expectedCurators = new Set([LITTLE_STARS, AQUA_STARS, SONATA, BRUSHSTROKES]);
    for (const endorsement of map.values()) {
      for (const curator of endorsement.curators) {
        expect(expectedCurators.has(curator.id)).toBe(true);
      }
    }
  });

  it('keys the map by partner institution id', () => {
    const map = listPreferredPartnersForParent(PARENT_THANDI);
    for (const [key, endorsement] of map) {
      expect(key).toBe(endorsement.partner.id);
    }
  });

  it('dedupes curators when the same partner is endorsed by multiple subscriptions', () => {
    const map = listPreferredPartnersForParent(PARENT_THANDI);
    for (const endorsement of map.values()) {
      const ids = endorsement.curators.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('drops endorsements when the only matching partnership is paused or pending', () => {
    const map = listPreferredPartnersForParent(PARENT_THANDI);
    for (const endorsement of map.values()) {
      const haveActive = MOCK_PARTNERSHIPS.some(
        (p) =>
          p.partnerInstitutionId === endorsement.partner.id &&
          p.badge === 'preferred' &&
          p.status === 'active',
      );
      expect(haveActive).toBe(true);
    }
  });
});

describe('listSuggestionsForChild()', () => {
  it('only returns rows for the targeted child', () => {
    const rows = listSuggestionsForChild(PARENT_THANDI, PCHILD_AZIFANI);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.child.id === PCHILD_AZIFANI)).toBe(true);
  });

  it('returns nothing when the child id does not belong to the parent', () => {
    const rows = listSuggestionsForChild(PARENT_THANDI, 'pchild_unknown');
    expect(rows).toEqual([]);
  });

  it('returns nothing when the parent id is unknown', () => {
    expect(listSuggestionsForChild('parent_unknown', PCHILD_AZIFANI)).toEqual([]);
  });
});
