/**
 * Phase 0 API sketch for institution-side child roster.
 *
 * Domain reminder:
 *   - A **child** is a real person with developmental needs (skills to learn).
 *     They are NOT scoped to one institution.
 *   - An **institution** offers one or more skill programs (music, art,
 *     swimming, karate, preschool, …).
 *   - A **subscription** (a.k.a. membership) binds one child to one
 *     institution. A child can have many subscriptions in parallel — e.g. the
 *     same child might be `active` at a swim school AND `paused` at a karate
 *     dojo at the same time. Membership-state, classroom, enrolled-at and
 *     history all live on the *subscription*, not on the child.
 *   - A **skill entry** is permanent and lives on the child, but is tagged
 *     with the institution that taught/observed it so the record retains
 *     provenance even after a subscription ends.
 *
 * Suggested base path: `/api/children`. Endpoints are scoped to the
 * institution resolved from the current session — staff only see children who
 * have a subscription at *their* institution.
 */

import type { Phase0PagedResult } from './platform-tenant.phase0';

export type Phase0ChildMembershipState = 'pending' | 'active' | 'paused' | 'ended';

/**
 * GET /api/children — list item shape.
 *
 * Scoped to the current institution. `membershipState` is the state of *this*
 * institution's subscription. `otherSubscriptionsCount` lets the UI render an
 * "also at N" badge without needing a second roundtrip.
 */
export interface Phase0ChildDto {
  id: string;
  displayName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  guardianNames: string[];
  /** State of the subscription at the *current* institution. */
  membershipState: Phase0ChildMembershipState;
  /** Number of *other* institutions this child is also subscribed to. */
  otherSubscriptionsCount: number;
}

export interface Phase0ListChildrenQuery {
  /** Substring match against displayName + guardianNames (case-insensitive). */
  search?: string;
  membershipState?: Phase0ChildMembershipState;
  page?: number;
  pageSize?: number;
}

export type Phase0ChildListResult = Phase0PagedResult<Phase0ChildDto>;

/** GET /api/children/{id} — richer profile shape. */
export interface Phase0ChildGuardian {
  /** Stable id; used for follow-up actions (invite, remove). */
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  /** Free-form label, e.g. `Mother`, `Grandmother`, `Foster carer`. */
  relationship: string;
}

export interface Phase0ChildMembershipEvent {
  id: string;
  /** ISO 8601 timestamp. */
  occurredAt: string;
  /** Resulting state after this event. */
  state: Phase0ChildMembershipState;
  /** Optional human-readable note. */
  note: string | null;
  actorEmail: string | null;
}

/**
 * The child's subscription at one specific institution. Each child has zero or
 * one of these per institution they are subscribed to.
 */
export interface Phase0ChildSubscription {
  /** Stable subscription id. */
  id: string;
  /** Live API only: Guid of the open subscription period (staff end-flow). */
  subscriptionPeriodId?: string | null;
  institutionId: string;
  institutionName: string;
  state: Phase0ChildMembershipState;
  /** ISO 8601 date this subscription started, if known. */
  enrolledAt: string | null;
  /** Free-form classroom or program label at this institution. */
  classroom: string | null;
  /** Most recent first; bounded by the server (typically last 10). */
  history: Phase0ChildMembershipEvent[];
}

/** Compact summary of another institution this child is subscribed to. */
export interface Phase0ChildOtherSubscription {
  id: string;
  institutionId: string;
  institutionName: string;
  state: Phase0ChildMembershipState;
  /** ISO 8601 date this subscription started, if known. */
  enrolledAt: string | null;
}

/**
 * Kinds of events that can be recorded on a child's subscription period.
 *
 * The lifetime timeline is append-only while a period is open and frozen once
 * the period has ended. Anything that happens to the child during their
 * enrolment — state changes, skills earned, milestones, free-form notes —
 * lands here so the parent's archive at the end of the period is complete.
 */
export type Phase0ChildLifetimeEventKind =
  | 'enrolled'
  | 'state_change'
  | 'paused'
  | 'resumed'
  | 'ended'
  | 'skill_earned'
  | 'milestone'
  | 'note';

/** One entry on a subscription period's lifetime timeline. */
export interface Phase0ChildLifetimeEvent {
  id: string;
  /** ISO 8601 timestamp. */
  occurredAt: string;
  kind: Phase0ChildLifetimeEventKind;
  /** Short human-readable summary, safe to render inline. */
  summary: string;
  /**
   * Optional kind-specific payload. Documented per-kind:
   *   - `enrolled`        : `{ classroom?, requestId? }`
   *   - `state_change` /
   *     `paused` /
   *     `resumed` /
   *     `ended`           : `{ from, to, reason? }`
   *   - `skill_earned`    : `{ skillName, programName, instructorEmail, instructorName? }`
   *   - `milestone` /
   *     `note`            : `{ note }`
   */
  details: Record<string, unknown> | null;
  actorEmail: string | null;
  actorName: string | null;
}

/**
 * One subscription period in the child's lifetime — i.e. one enrolment cycle
 * at one institution. Periods are owned by the *child* (via the canonical
 * `parentChildId`), not by the institution. They are immutable once `endedAt`
 * is set.
 *
 * Re-enrolling at the same institution after a period ends creates a *new*
 * period (new `id`); the previous period's events are preserved verbatim. At
 * the end of every period the parent can take an archive snapshot — that's
 * what `archivedAt` records.
 */
export interface Phase0ChildLifetimeSubscription {
  /** Stable id of this subscription period, e.g. `pcs_*`. */
  id: string;
  institutionId: string;
  institutionName: string;
  /** Institution-side child record this period materialised, if any. */
  institutionChildId: string | null;
  state: Phase0ChildMembershipState;
  /** Free-form classroom or program label at this institution. */
  classroom: string | null;
  /** ISO 8601 date the period was activated (`null` while pending). */
  enrolledAt: string | null;
  /** ISO 8601 date the period was ended (`null` while still open). */
  endedAt: string | null;
  /** Reason captured when the period was ended. */
  endedReason: string | null;
  /** ISO 8601 timestamp the parent archived this period (`null` if open or unarchived). */
  archivedAt: string | null;
  /** Chronological events on this period (ascending). */
  events: Phase0ChildLifetimeEvent[];
}

export interface Phase0CreateChildGuardian {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  relationship?: string | null;
}

/**
 * POST /api/children
 *
 * Stand-in for the parent-facing subscription flow. Creates the child record
 * (if they don't already exist) AND a subscription at the institution
 * specified by `institutionId`. When `institutionId` is omitted, the server
 * falls back to the institution resolved from the session (i.e. the current
 * staff user's institution) — this is the common case for the in-app
 * simulator. Real parent traffic will always specify it explicitly.
 */
export interface Phase0CreateChildRequest {
  displayName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  classroom?: string | null;
  notes?: string | null;
  /** At least one guardian is required by the server. */
  guardians: Phase0CreateChildGuardian[];
  /** Defaults to `pending` server-side; provide `active` to skip approval. */
  initialMembershipState?: Extract<Phase0ChildMembershipState, 'pending' | 'active'>;
  /** Institution to subscribe to. Defaults to the session's institution. */
  institutionId?: string;
}

export interface Phase0CreateChildResponse {
  childId: string;
  /** State of the newly-created subscription. */
  membershipState: Phase0ChildMembershipState;
  /** Institution the child was subscribed to. */
  institutionId: string;
  createdAt: string;
}

/**
 * PATCH /api/children/{id}/membership-state
 *
 * Operates on the child's subscription at the *current* institution. To touch
 * a different institution's subscription you'd need to be authenticated for
 * that institution.
 */
export interface Phase0PatchChildMembershipStateRequest {
  state: Phase0ChildMembershipState;
  /** Required when `state === 'paused' || state === 'ended'`. */
  reason?: string | null;
}

/**
 * A single skill captured against a child's record.
 *
 * Always tagged with the institution that taught/observed it so the record
 * retains provenance across the child's lifetime.
 */
export interface Phase0ChildSkillEntry {
  id: string;
  /** Short human label, e.g. `Front crawl: 25m`, `Counting to 20`. */
  skillName: string;
  /** Program/class the skill was earned in, e.g. `Beginner Swim — Term 2 2026`. */
  programName: string;
  /** ISO 8601 date the skill was acquired (YYYY-MM-DD). */
  occurredAt: string;
  /** Institution that taught/observed the skill. */
  institutionId: string;
  institutionName: string;
  /** Email of the staff member who logged the skill. */
  instructorEmail: string;
  /** Optional display name for the instructor; falls back to email when absent. */
  instructorName: string | null;
}

/**
 * POST /api/children/{id}/skills
 *
 * Logs a skill against the child's permanent record. The institution is
 * derived from the session (the staff user's institution); clients do not
 * specify it.
 */
export interface Phase0LogChildSkillRequest {
  skillName: string;
  programName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  occurredAt: string;
  instructorEmail: string;
  instructorName?: string | null;
}

export interface Phase0LogChildSkillResponse {
  entry: Phase0ChildSkillEntry;
}

/**
 * GET /api/children/{id} — the institution staff's view of one child.
 *
 * `currentSubscription` is *this* institution's subscription, the one staff
 * actively manage. `otherSubscriptions` is read-only context: the same child's
 * subscriptions at other institutions (because parents subscribe across
 * providers). Skills are the full cross-institution log; UI may filter.
 */
export interface Phase0ChildDetailDto {
  id: string;
  displayName: string;
  dateOfBirth: string;
  /** Short non-medical notes (allergies, dietary). */
  notes: string | null;
  /**
   * Canonical parent-side identity. Same `parentChildId` across institutions
   * means it's the same human child — this is how `otherSubscriptions` is
   * computed in the real system.
   */
  parentChildId: string | null;
  /** Canonical parent identity (the account that subscribed this child). */
  parentId: string | null;
  /** Display name of the parent, for staff context. */
  parentDisplayName: string | null;
  guardians: Phase0ChildGuardian[];
  currentSubscription: Phase0ChildSubscription;
  otherSubscriptions: Phase0ChildOtherSubscription[];
  /** Most recent first; cumulative across all institutions. */
  skills: Phase0ChildSkillEntry[];
  /**
   * The child's full lifetime of subscription periods across every institution
   * they have ever enrolled with — newest period first. This is the canonical,
   * parent-owned record. The legacy `currentSubscription` /
   * `otherSubscriptions` / `skills` fields above are projections of this list
   * (kept for back-compat); UIs that want the full picture should iterate
   * `subscriptionTimeline`.
   */
  subscriptionTimeline: Phase0ChildLifetimeSubscription[];
}
