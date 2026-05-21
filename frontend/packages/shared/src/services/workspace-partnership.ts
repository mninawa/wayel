/**
 * Workspace partnerships helper.
 *
 * Backs the **Partners** tab on the institution workspace
 * (`/tenants/:tenantId/workspace` and `/staff/institution/workspace`) and
 * the parent-app suggestion surfaces (`/parent/children` carousel and
 * `/parent/children/:id` partner strip).
 *
 * Two responsibilities:
 *
 *   1. **Curation** — staff list/add/edit/pause/remove their institution's
 *      partnerships and accept/decline incoming invitations.
 *   2. **Suggestion engine** — given a `parentId`, walk the partnership
 *      graph for every institution the parent has an `active` subscription
 *      at, expand to active partnerships scoped to the matched program,
 *      dedupe and rank.
 *
 * All operations mutate `MOCK_PARTNERSHIPS` in place. When a real backend
 * exists the bridge becomes a thin adapter calling `/api/partnerships`.
 */
import {
  MOCK_PARTNERSHIPS,
  nextMockPartnershipId,
  type InstitutionPartnership,
  type PartnershipBadge,
  type PartnershipScope,
  type PartnershipStatus,
} from '../core/mock/mock-partnerships';
import {
  MOCK_INSTITUTIONS,
  institutionById,
  type MockInstitution,
} from '../core/mock/mock-institutions';
import {
  MOCK_PARENTS,
  type MockParent,
  type MockParentChild,
  type MockParentChildSubscription,
} from '../core/mock/mock-parents';
import {
  latestFeeFor,
  listProgramsForInstitution,
  type WorkspaceProgram,
  type WorkspaceProgramFee,
} from './workspace-program';

/* ────────────────────────────────────────────────────────────────────────── */
/* Decorated rows for the workspace UI                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export interface PartnershipRow {
  partnership: InstitutionPartnership;
  /** The other institution in the partnership (always present). */
  partner: MockInstitution;
  /** True when the partner has accepted us back (mutual). */
  isMutual: boolean;
  /**
   * For program-scoped rows: the resolved programs from the *owner's*
   * roster. Empty array for tenant-scoped rows.
   */
  scopedPrograms: WorkspaceProgram[];
  /** Human label for the scope, e.g. "All programs" or "Sunflowers, Pre-K". */
  scopeLabel: string;
}

export interface PartnershipSummary {
  active: number;
  paused: number;
  pendingIncoming: number;
  pendingOutgoing: number;
  /** Distinct programs covered by at least one active partnership. */
  programsCovered: number;
  /** True when any active partnership is mutual (used for KPI tile copy). */
  hasAnyMutual: boolean;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Read API                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Every partnership *owned* by `institutionId` (i.e. rows where this tenant
 * curated the entry), regardless of status. Newest first.
 */
export function listPartnersForTenant(institutionId: string): PartnershipRow[] {
  const programs = listProgramsForInstitution(institutionId);
  return MOCK_PARTNERSHIPS.filter((p) => p.ownerInstitutionId === institutionId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => decorate(p, programs));
}

/**
 * Pending invites *received* by `institutionId` — i.e. another tenant has
 * curated us and is waiting for our acceptance. Always shown in the inbox.
 */
export function listIncomingInvitesForTenant(
  institutionId: string,
): PartnershipRow[] {
  return MOCK_PARTNERSHIPS.filter(
    (p) => p.partnerInstitutionId === institutionId && p.status === 'pending',
  )
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => {
      // For incoming invites, the "partner" we want to show on the card is
      // the *owner* (the institution that sent the invite to us).
      const owner = institutionById(p.ownerInstitutionId);
      const programs = listProgramsForInstitution(p.ownerInstitutionId);
      const scoped = resolveScopedPrograms(p.scope, programs);
      return {
        partnership: p,
        partner: owner,
        isMutual: false,
        scopedPrograms: scoped,
        scopeLabel: scopeLabel(p.scope, scoped),
      };
    });
}

/** Aggregate counts powering the KPI tiles. */
export function summarizePartnerships(
  institutionId: string,
): PartnershipSummary {
  const owned = MOCK_PARTNERSHIPS.filter(
    (p) => p.ownerInstitutionId === institutionId,
  );
  const incoming = MOCK_PARTNERSHIPS.filter(
    (p) =>
      p.partnerInstitutionId === institutionId && p.status === 'pending',
  );

  const active = owned.filter((p) => p.status === 'active');
  const programIds = new Set<string>();
  for (const p of active) {
    if (p.scope.kind === 'programs') {
      for (const id of p.scope.programIds) programIds.add(id);
    }
  }
  const tenantWide = active.some((p) => p.scope.kind === 'tenant');

  return {
    active: active.length,
    paused: owned.filter((p) => p.status === 'paused').length,
    pendingIncoming: incoming.length,
    pendingOutgoing: owned.filter((p) => p.status === 'pending').length,
    programsCovered: tenantWide
      ? listProgramsForInstitution(institutionId).length
      : programIds.size,
    hasAnyMutual: active.some((p) => p.reciprocalPartnershipId != null),
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Write API (mock-only mutations)                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export interface AddPartnershipInput {
  ownerInstitutionId: string;
  partnerInstitutionId: string;
  scope: PartnershipScope;
  badge: PartnershipBadge;
  pitch: string;
  actorEmail: string;
}

export interface UpdatePartnershipInput {
  scope?: PartnershipScope;
  badge?: PartnershipBadge;
  pitch?: string;
}

/**
 * Create an outgoing partnership invitation (status = `pending`). Once the
 * partner accepts, a reciprocal row is created and both rows flip to
 * `active`. If a row already exists between the same pair (in either
 * direction) we throw — staff are expected to use that existing row.
 */
export function addPartnership(
  input: AddPartnershipInput,
): InstitutionPartnership {
  if (input.ownerInstitutionId === input.partnerInstitutionId) {
    throw new Error('Cannot partner an institution with itself.');
  }
  const existing = MOCK_PARTNERSHIPS.find(
    (p) =>
      p.ownerInstitutionId === input.ownerInstitutionId &&
      p.partnerInstitutionId === input.partnerInstitutionId,
  );
  if (existing) {
    throw new Error(
      `A partnership with ${institutionById(input.partnerInstitutionId).name} already exists.`,
    );
  }
  const now = new Date().toISOString();
  const row: InstitutionPartnership = {
    id: nextMockPartnershipId('out'),
    ownerInstitutionId: input.ownerInstitutionId,
    partnerInstitutionId: input.partnerInstitutionId,
    scope: cloneScope(input.scope),
    status: 'pending',
    badge: input.badge,
    pitch: input.pitch.trim(),
    reciprocalPartnershipId: null,
    createdAt: now,
    createdByEmail: input.actorEmail,
    updatedAt: now,
  };
  MOCK_PARTNERSHIPS.push(row);
  return row;
}

/**
 * Edit fields on a partnership the caller owns. No-op if the row's owner
 * isn't `institutionId` (defensive — UI shouldn't show edit on others).
 */
export function updatePartnership(
  institutionId: string,
  partnershipId: string,
  patch: UpdatePartnershipInput,
): InstitutionPartnership | null {
  const row = MOCK_PARTNERSHIPS.find(
    (p) => p.id === partnershipId && p.ownerInstitutionId === institutionId,
  );
  if (!row) return null;
  if (patch.scope) row.scope = cloneScope(patch.scope);
  if (patch.badge) row.badge = patch.badge;
  if (patch.pitch != null) row.pitch = patch.pitch.trim();
  row.updatedAt = new Date().toISOString();
  return row;
}

/**
 * Accept an incoming `pending` invite addressed to `institutionId`. Flips
 * the inviter's row to `active` and creates a reciprocal `active` row that
 * we own. Returns the new row, or `null` if no matching pending row was
 * found.
 *
 * The caller may supply a `pitch` and `scope` for the reciprocal row; if
 * omitted we mirror the inviter's pitch and use a tenant-wide scope (the
 * sensible default — staff can edit afterwards).
 */
export interface AcceptPartnershipInput {
  /** Email of the staff member accepting. */
  actorEmail: string;
  /** Optional reciprocal pitch — defaults to mirroring the inviter's. */
  pitch?: string;
  /** Optional reciprocal scope — defaults to `{ kind: 'tenant' }`. */
  scope?: PartnershipScope;
  /** Optional reciprocal badge — defaults to mirroring the inviter's. */
  badge?: PartnershipBadge;
}

export function acceptPartnership(
  institutionId: string,
  partnershipId: string,
  input: AcceptPartnershipInput,
): InstitutionPartnership | null {
  const inviter = MOCK_PARTNERSHIPS.find(
    (p) =>
      p.id === partnershipId &&
      p.partnerInstitutionId === institutionId &&
      p.status === 'pending',
  );
  if (!inviter) return null;
  const now = new Date().toISOString();

  const reciprocal: InstitutionPartnership = {
    id: nextMockPartnershipId('rec'),
    ownerInstitutionId: institutionId,
    partnerInstitutionId: inviter.ownerInstitutionId,
    scope: cloneScope(input.scope ?? { kind: 'tenant' }),
    status: 'active',
    badge: input.badge ?? inviter.badge,
    pitch: (input.pitch ?? inviter.pitch).trim(),
    reciprocalPartnershipId: inviter.id,
    createdAt: now,
    createdByEmail: input.actorEmail,
    updatedAt: now,
  };
  MOCK_PARTNERSHIPS.push(reciprocal);

  inviter.status = 'active';
  inviter.reciprocalPartnershipId = reciprocal.id;
  inviter.updatedAt = now;

  return reciprocal;
}

/**
 * Decline an incoming `pending` invite. Marks it `declined` and stamps the
 * reason. The inviter's UI should show "they declined" the next time they
 * load the section.
 */
export function declinePartnership(
  institutionId: string,
  partnershipId: string,
  reason: string,
): InstitutionPartnership | null {
  const inviter = MOCK_PARTNERSHIPS.find(
    (p) =>
      p.id === partnershipId &&
      p.partnerInstitutionId === institutionId &&
      p.status === 'pending',
  );
  if (!inviter) return null;
  inviter.status = 'declined';
  inviter.declineReason = reason.trim() || 'No reason provided.';
  inviter.updatedAt = new Date().toISOString();
  return inviter;
}

/** Pause an active partnership we own (hides it from parents but keeps it). */
export function pausePartnership(
  institutionId: string,
  partnershipId: string,
): InstitutionPartnership | null {
  const row = MOCK_PARTNERSHIPS.find(
    (p) =>
      p.id === partnershipId &&
      p.ownerInstitutionId === institutionId &&
      p.status === 'active',
  );
  if (!row) return null;
  row.status = 'paused';
  row.updatedAt = new Date().toISOString();
  return row;
}

/** Resume a previously-paused partnership. */
export function resumePartnership(
  institutionId: string,
  partnershipId: string,
): InstitutionPartnership | null {
  const row = MOCK_PARTNERSHIPS.find(
    (p) =>
      p.id === partnershipId &&
      p.ownerInstitutionId === institutionId &&
      p.status === 'paused',
  );
  if (!row) return null;
  row.status = 'active';
  row.updatedAt = new Date().toISOString();
  return row;
}

/**
 * Remove a partnership we own. Also clears the reciprocal pointer on the
 * partner's matching row (if any) so they can re-invite us cleanly.
 */
export function removePartnership(
  institutionId: string,
  partnershipId: string,
): boolean {
  const idx = MOCK_PARTNERSHIPS.findIndex(
    (p) => p.id === partnershipId && p.ownerInstitutionId === institutionId,
  );
  if (idx === -1) return false;
  const [removed] = MOCK_PARTNERSHIPS.splice(idx, 1);
  if (removed.reciprocalPartnershipId) {
    const partnerRow = MOCK_PARTNERSHIPS.find(
      (p) => p.id === removed.reciprocalPartnershipId,
    );
    if (partnerRow) {
      partnerRow.reciprocalPartnershipId = null;
      partnerRow.updatedAt = new Date().toISOString();
    }
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Suggestion engine                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface SuggestionRow {
  /** The partnership row that produced this suggestion. */
  partnership: InstitutionPartnership;
  /** The institution being recommended (the partner). */
  partner: MockInstitution;
  /** The owner institution that curated the partnership. */
  curator: MockInstitution;
  /** The child whose enrolment matched this suggestion. */
  child: MockParentChild;
  /** The matched program at the curator (used for the "because you're enrolled in X" line). */
  matchedProgram: WorkspaceProgram | null;
  /** Latest fee on the partner's cheapest program (for at-a-glance pricing). */
  partnerFromFee: WorkspaceProgramFee | null;
  /** True when the partnership is mutual (badge in the UI). */
  isMutual: boolean;
}

/**
 * Suggestions for a given parent. Walks every `active` subscription on the
 * parent's roster, expands the curator's `active` partnerships scoped to
 * the matched program (or tenant-wide), excludes any partner the child is
 * already subscribed to, and ranks: preferred → sister_school → partner.
 *
 * Capped at 12 rows so the UI doesn't have to truncate aggressively.
 */
export function listSuggestionsForParent(parentId: string): SuggestionRow[] {
  const parent = MOCK_PARENTS.find((p) => p.id === parentId);
  if (!parent) return [];
  return collectSuggestions(parent, /* childFilter */ null);
}

/**
 * Same as {@link listSuggestionsForParent} but scoped to a single child.
 * Used by the partner strip on the child detail page.
 */
export function listSuggestionsForChild(
  parentId: string,
  parentChildId: string,
): SuggestionRow[] {
  const parent = MOCK_PARENTS.find((p) => p.id === parentId);
  if (!parent) return [];
  return collectSuggestions(parent, parentChildId);
}

function collectSuggestions(
  parent: MockParent,
  childFilter: string | null,
): SuggestionRow[] {
  const rows: SuggestionRow[] = [];
  const seenPair = new Set<string>(); // `${childId}:${partnerInstitutionId}`

  for (const child of parent.children) {
    if (childFilter && child.id !== childFilter) continue;

    // Institutions the child is currently subscribed to (active or pending) —
    // we exclude these from suggestions so we don't recommend the place the
    // child is already at, or one they're already in line for.
    const enrolledInstitutionIds = new Set(
      child.subscriptions
        .filter((s) => s.state === 'active' || s.state === 'pending')
        .map((s) => s.institutionId),
    );

    // Active subscriptions that drive suggestions.
    const drivers = child.subscriptions.filter((s) => s.state === 'active');

    for (const sub of drivers) {
      const curatorPrograms = listProgramsForInstitution(sub.institutionId);
      const matchedProgram = matchProgramByClassroom(sub, curatorPrograms);

      const candidates = MOCK_PARTNERSHIPS.filter((p) => {
        if (p.ownerInstitutionId !== sub.institutionId) return false;
        if (p.status !== 'active') return false;
        if (enrolledInstitutionIds.has(p.partnerInstitutionId)) return false;
        if (p.scope.kind === 'tenant') return true;
        // Program-scoped: the matched program must be in the scope list. If
        // no program matched, fall back to "show only tenant-scoped" — too
        // risky to assume the family belongs to the program.
        if (!matchedProgram) return false;
        return p.scope.programIds.includes(matchedProgram.id);
      });

      for (const cand of candidates) {
        const key = `${child.id}:${cand.partnerInstitutionId}`;
        if (seenPair.has(key)) continue;
        seenPair.add(key);

        const partner = institutionById(cand.partnerInstitutionId);
        const curator = institutionById(sub.institutionId);
        const partnerPrograms = listProgramsForInstitution(partner.id);
        const partnerFromFee = cheapestFee(partnerPrograms);

        rows.push({
          partnership: cand,
          partner,
          curator,
          child,
          matchedProgram,
          partnerFromFee,
          isMutual: cand.reciprocalPartnershipId != null,
        });
      }
    }
  }

  rows.sort((a, b) => badgeWeight(a.partnership.badge) - badgeWeight(b.partnership.badge));
  return rows.slice(0, 12);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Preferred-partner endorsements                                              */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Lightweight institution descriptor surfaced inside a
 * {@link PreferredEndorsement}. Carries only the fields the directory
 * UI actually reads (id, display name, optional accent colour) so the
 * type is portable across mock and live wires — the live API returns
 * the same three fields and the bridge maps wire → this shape without
 * having to manufacture full `MockInstitution` records.
 */
export interface EndorsementInstitution {
  id: string;
  name: string;
  /** Brand accent (CSS hex / colour token). `null` when not branded. */
  accentColor: string | null;
}

export interface PreferredEndorsement {
  /** Institution being endorsed. */
  partner: EndorsementInstitution;
  /**
   * Curator institutions the parent already actively subscribes to that
   * have flagged `partner` as a `preferred` partner. Order is stable
   * (insertion order across the parent's children + subscriptions) so
   * the UI can render attribution like "Preferred by Little Stars + 1
   * more" deterministically.
   */
  curators: EndorsementInstitution[];
}

/**
 * For a given parent, build a lookup keyed by partner institution id of
 * preferred-partner endorsements coming from institutions the parent
 * already actively subscribes to.
 *
 * Used by the parent-subscribe directory cards to surface a "Preferred
 * partner of {curator}" trust signal — the parent sees, at a glance,
 * which institutions in the catalogue are vouched for by a place their
 * child is already at.
 *
 * Mock-only today (mirrors {@link listSuggestionsForParent}). The live
 * surface needs a parent-readable partnerships endpoint that this
 * helper would adapt to once available.
 *
 * Rules:
 *   - Only `active` subscriptions count as drivers — pending or ended
 *     subscriptions don't earn the parent any endorsements.
 *   - Only `active` partnerships with `badge === 'preferred'` are
 *     surfaced; `partner` and `sister_school` rows are intentionally
 *     filtered out so the badge stays meaningful.
 *   - Program scope is ignored: the endorsement applies even when the
 *     parent isn't in the matching program at the curator. Subscribing
 *     to a curator at all is enough trust for the badge to show.
 *   - Self-endorsements (curator endorsing itself) cannot occur in the
 *     domain but are defensively excluded.
 */
export function listPreferredPartnersForParent(
  parentId: string,
): Map<string, PreferredEndorsement> {
  const map = new Map<string, PreferredEndorsement>();
  const parent = MOCK_PARENTS.find((p) => p.id === parentId);
  if (!parent) return map;

  const curatorIds = new Set<string>();
  for (const child of parent.children) {
    for (const sub of child.subscriptions) {
      if (sub.state === 'active') curatorIds.add(sub.institutionId);
    }
  }
  if (curatorIds.size === 0) return map;

  for (const p of MOCK_PARTNERSHIPS) {
    if (p.status !== 'active') continue;
    if (p.badge !== 'preferred') continue;
    if (!curatorIds.has(p.ownerInstitutionId)) continue;
    if (p.ownerInstitutionId === p.partnerInstitutionId) continue;

    const curator = toEndorsementInstitution(institutionById(p.ownerInstitutionId));
    const partner = toEndorsementInstitution(institutionById(p.partnerInstitutionId));
    const existing = map.get(partner.id);
    if (existing) {
      if (!existing.curators.some((c) => c.id === curator.id)) {
        existing.curators.push(curator);
      }
    } else {
      map.set(partner.id, { partner, curators: [curator] });
    }
  }

  return map;
}

/**
 * Project a fat `MockInstitution` down to the lean
 * {@link EndorsementInstitution} shape consumed by the directory UI.
 * Centralised here so the bridge's mock and live paths produce
 * identical values for the same institution — the directory's
 * "Preferred by …" pill renders the same way regardless of source.
 */
function toEndorsementInstitution(i: MockInstitution): EndorsementInstitution {
  return {
    id: i.id,
    name: i.name,
    accentColor: i.accentColor ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function decorate(
  p: InstitutionPartnership,
  ownerPrograms: WorkspaceProgram[],
): PartnershipRow {
  const partner = institutionById(p.partnerInstitutionId);
  const scoped = resolveScopedPrograms(p.scope, ownerPrograms);
  return {
    partnership: p,
    partner,
    isMutual: p.reciprocalPartnershipId != null,
    scopedPrograms: scoped,
    scopeLabel: scopeLabel(p.scope, scoped),
  };
}

function resolveScopedPrograms(
  scope: PartnershipScope,
  ownerPrograms: WorkspaceProgram[],
): WorkspaceProgram[] {
  if (scope.kind === 'tenant') return [];
  return ownerPrograms.filter((pr) => scope.programIds.includes(pr.id));
}

function scopeLabel(scope: PartnershipScope, resolved: WorkspaceProgram[]): string {
  if (scope.kind === 'tenant') return 'All programs';
  if (resolved.length === 0) return 'No matching program';
  if (resolved.length === 1) return resolved[0].name;
  if (resolved.length === 2) return `${resolved[0].name}, ${resolved[1].name}`;
  return `${resolved[0].name} +${resolved.length - 1}`;
}

function cloneScope(s: PartnershipScope): PartnershipScope {
  return s.kind === 'tenant' ? { kind: 'tenant' } : { kind: 'programs', programIds: [...s.programIds] };
}

function badgeWeight(b: PartnershipBadge): number {
  switch (b) {
    case 'preferred':
      return 0;
    case 'sister_school':
      return 1;
    case 'partner':
      return 2;
  }
}

function matchProgramByClassroom(
  sub: MockParentChildSubscription,
  programs: WorkspaceProgram[],
): WorkspaceProgram | null {
  if (programs.length === 0) return null;
  const room = (sub.classroom ?? '').toLowerCase();
  if (!room) return null;
  return (
    programs.find((p) => {
      const tokens = p.name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4);
      return tokens.some((t) => room.includes(t));
    }) ?? null
  );
}

function cheapestFee(programs: WorkspaceProgram[]): WorkspaceProgramFee | null {
  const fees = programs
    .map((p) => latestFeeFor(p))
    .filter((f): f is WorkspaceProgramFee => f != null)
    .sort((a, b) => a.amount - b.amount);
  return fees[0] ?? null;
}

/** Convenience used by the "Add partner" drawer to populate the search list. */
export function listAddablePartnerInstitutions(
  ownerInstitutionId: string,
): MockInstitution[] {
  const taken = new Set(
    MOCK_PARTNERSHIPS.filter((p) => p.ownerInstitutionId === ownerInstitutionId).map(
      (p) => p.partnerInstitutionId,
    ),
  );
  return MOCK_INSTITUTIONS.filter(
    (i) => i.id !== ownerInstitutionId && !taken.has(i.id),
  );
}
