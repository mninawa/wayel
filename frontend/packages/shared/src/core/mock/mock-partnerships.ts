/**
 * In-memory partnership graph between institutions.
 *
 * Each row is a *directed* partnership owned by `ownerInstitutionId`. To
 * model mutual partnerships we store two rows that point at each other via
 * `reciprocalPartnershipId`. The mutability lets the bridge functions in
 * `workspace-partnership.ts` flip status, append rows on accept, etc.
 *
 * Once a real partnerships table exists this module goes away and the lookup
 * happens server-side from that table. The shape mirrors what we'd POST to
 * `/api/institutions/:id/partnerships` so the swap is mechanical.
 */

export type PartnershipStatus =
  /** Live; suggestions for this partner are visible to parents. */
  | 'active'
  /** Hidden from parents but kept on file. Owner can resume. */
  | 'paused'
  /** Awaiting the partner's acceptance. Not surfaced to parents. */
  | 'pending'
  /** Partner declined. Kept for audit; owner can re-invite later. */
  | 'declined';

/** Targeted scope of who the suggestion goes to. */
export type PartnershipScope =
  /** Applies to every program at the owner's institution. */
  | { kind: 'tenant' }
  /** Applies only to parents enrolled in the listed programs. */
  | { kind: 'programs'; programIds: string[] };

export type PartnershipBadge =
  /** Highest endorsement — first in the suggestion list. */
  | 'preferred'
  /** Neutral curated partner. */
  | 'partner'
  /** Formal academic affiliation. */
  | 'sister_school';

export interface InstitutionPartnership {
  id: string;
  /** Tenant who curated this entry (the "from" side of the directed edge). */
  ownerInstitutionId: string;
  /** Tenant being recommended (the "to" side of the directed edge). */
  partnerInstitutionId: string;
  scope: PartnershipScope;
  status: PartnershipStatus;
  badge: PartnershipBadge;
  /** Owner-authored pitch shown to parents on the suggestion card. */
  pitch: string;
  /**
   * When the partner has accepted this and curated us back, this points at
   * the *partner's* matching `InstitutionPartnership` row so the UI can show
   * a mutuality indicator. `null` when the relationship isn't (yet) mutual.
   */
  reciprocalPartnershipId: string | null;
  /** ISO 8601 timestamp of when the row was created. */
  createdAt: string;
  /** Email of the staff member who created the row. */
  createdByEmail: string;
  /** ISO 8601 timestamp of the last edit. */
  updatedAt: string;
  /** Set when status === 'declined' — captured for audit. */
  declineReason?: string | null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Seed data                                                                  */
/*                                                                            */
/* Pre-seeded relationships so the workspace doesn't open empty:              */
/*                                                                            */
/*   - Little Stars ↔ Aqua Stars  (mutual, tenant-wide, "preferred")          */
/*   - Little Stars ↔ Sonata Music (mutual, scoped to Sunflowers + Pre-K,     */
/*                                  "sister_school")                          */
/*   - Little Stars → Brushstrokes (outgoing pending invite, art for         */
/*                                  Aftercare program only)                   */
/*   - Brushstrokes → Little Stars (incoming pending invite, tenant-wide,    */
/*                                  shows up in our inbox)                    */
/*   - Aqua Stars ↔ Sonata Music   (mutual, both session institutions, used  */
/*                                  to show the section works on non-tenant  */
/*                                  institutions too)                         */
/* ────────────────────────────────────────────────────────────────────────── */

let counter = 0;
function pid(slug: string): string {
  return `prtn_${slug}_${(++counter).toString(36)}`;
}

const SEED_LS_AQUA_OUT = pid('ls_aqua_out');
const SEED_LS_AQUA_IN = pid('aqua_ls_in');
const SEED_LS_SON_OUT = pid('ls_son_out');
const SEED_LS_SON_IN = pid('son_ls_in');
const SEED_LS_BRUSH_OUT = pid('ls_brush_out');
const SEED_BRUSH_LS_IN = pid('brush_ls_in');
const SEED_AQUA_SON_OUT = pid('aqua_son_out');
const SEED_SON_AQUA_IN = pid('son_aqua_in');

const NOW = '2026-04-10T08:00:00Z';

export const MOCK_PARTNERSHIPS: InstitutionPartnership[] = [
  // ── Little Stars ↔ Aqua Stars (mutual, tenant-wide, preferred) ──────────
  {
    id: SEED_LS_AQUA_OUT,
    ownerInstitutionId: 'tenant_little_stars',
    partnerInstitutionId: 'inst_aqua_stars',
    scope: { kind: 'tenant' },
    status: 'active',
    badge: 'preferred',
    pitch:
      'Their Saturday parent-and-child class is the easiest way to dip a toe in — we send a lot of Sunflowers families their way.',
    reciprocalPartnershipId: SEED_LS_AQUA_IN,
    createdAt: '2025-09-04T10:30:00Z',
    createdByEmail: 'admin@littlestars.edu',
    updatedAt: NOW,
  },
  {
    id: SEED_LS_AQUA_IN,
    ownerInstitutionId: 'inst_aqua_stars',
    partnerInstitutionId: 'tenant_little_stars',
    scope: { kind: 'tenant' },
    status: 'active',
    badge: 'preferred',
    pitch:
      'Little Stars graduates arrive ready to swim — their water-readiness work pairs perfectly with our beginner intake.',
    reciprocalPartnershipId: SEED_LS_AQUA_OUT,
    createdAt: '2025-09-05T14:10:00Z',
    createdByEmail: 'office@aquastars.example',
    updatedAt: NOW,
  },

  // ── Little Stars ↔ Sonata Music (mutual, program-scoped, sister school) ──
  {
    id: SEED_LS_SON_OUT,
    ownerInstitutionId: 'tenant_little_stars',
    partnerInstitutionId: 'inst_sonata_music',
    scope: {
      kind: 'programs',
      programIds: ['pgm_ls_sunflowers_full', 'pgm_ls_prek_full'],
    },
    status: 'active',
    badge: 'sister_school',
    pitch:
      "Sister-school for Sunflowers + Pre-K. Their Tiny Strings programme runs straight after our 14:00 nap.",
    reciprocalPartnershipId: SEED_LS_SON_IN,
    createdAt: '2024-11-12T09:00:00Z',
    createdByEmail: 'admin@littlestars.edu',
    updatedAt: NOW,
  },
  {
    id: SEED_LS_SON_IN,
    ownerInstitutionId: 'inst_sonata_music',
    partnerInstitutionId: 'tenant_little_stars',
    scope: { kind: 'tenant' },
    status: 'active',
    badge: 'sister_school',
    pitch:
      'Sister-school for our Tiny Strings cohort. Most of our 3-5 yr olds come from Little Stars.',
    reciprocalPartnershipId: SEED_LS_SON_OUT,
    createdAt: '2024-11-12T11:30:00Z',
    createdByEmail: 'maestro@sonata.example',
    updatedAt: NOW,
  },

  // ── Little Stars → Brushstrokes (outgoing PENDING invite, scoped) ───────
  {
    id: SEED_LS_BRUSH_OUT,
    ownerInstitutionId: 'tenant_little_stars',
    partnerInstitutionId: 'inst_brushstrokes',
    scope: { kind: 'programs', programIds: ['pgm_ls_aftercare'] },
    status: 'pending',
    badge: 'partner',
    pitch:
      'Aftercare families keep asking for a structured art class — Brushstrokes runs a 16:30 slot that fits the pickup window.',
    reciprocalPartnershipId: null,
    createdAt: '2026-04-08T15:20:00Z',
    createdByEmail: 'admin@littlestars.edu',
    updatedAt: '2026-04-08T15:20:00Z',
  },

  // ── Brushstrokes → Little Stars (INCOMING pending invite for our inbox) ─
  {
    id: SEED_BRUSH_LS_IN,
    ownerInstitutionId: 'inst_brushstrokes',
    partnerInstitutionId: 'tenant_little_stars',
    scope: { kind: 'tenant' },
    status: 'pending',
    badge: 'partner',
    pitch:
      "We've had three Little Stars referrals this term — would love to make it official and send our families your way for daycare.",
    reciprocalPartnershipId: null,
    createdAt: '2026-04-12T10:05:00Z',
    createdByEmail: 'lead@brushstrokes.example',
    updatedAt: '2026-04-12T10:05:00Z',
  },

  // ── Aqua Stars ↔ Sonata Music (mutual, demonstrates non-daycare flow) ───
  {
    id: SEED_AQUA_SON_OUT,
    ownerInstitutionId: 'inst_aqua_stars',
    partnerInstitutionId: 'inst_sonata_music',
    scope: { kind: 'tenant' },
    status: 'active',
    badge: 'partner',
    pitch:
      'Music ear-training and water rhythm work hand-in-hand — our weekend swimmers love their Tiny Strings class.',
    reciprocalPartnershipId: SEED_SON_AQUA_IN,
    createdAt: '2025-06-01T08:00:00Z',
    createdByEmail: 'office@aquastars.example',
    updatedAt: NOW,
  },
  {
    id: SEED_SON_AQUA_IN,
    ownerInstitutionId: 'inst_sonata_music',
    partnerInstitutionId: 'inst_aqua_stars',
    scope: { kind: 'tenant' },
    status: 'active',
    badge: 'partner',
    pitch:
      'Aqua Stars puts our Tiny Strings parents in good hands for water-confidence work.',
    reciprocalPartnershipId: SEED_AQUA_SON_OUT,
    createdAt: '2025-06-02T08:00:00Z',
    createdByEmail: 'maestro@sonata.example',
    updatedAt: NOW,
  },
];

/* ────────────────────────────────────────────────────────────────────────── */
/* ID generators (used by the bridge to mint new rows)                        */
/* ────────────────────────────────────────────────────────────────────────── */

export function nextMockPartnershipId(slug = 'new'): string {
  return pid(slug);
}
