/**
 * Phase 0 API sketch for parent identities + their personal child rosters.
 *
 * Domain reminder:
 *   - A **parent** is an account that exists outside any single institution.
 *     They sign up to the platform once and from then on subscribe their
 *     children to one or more institutions.
 *   - A **parent-child** is the canonical identity of the human child as
 *     entered by their parent: name, date of birth, allergies/notes. This is
 *     the *backbone* identity that ties together the same child's enrolments
 *     across multiple institutions.
 *   - When the parent subscribes to an institution, staff at that institution
 *     get an **institution-side child record** (see `children.phase0.ts`) that
 *     references back to the parent-child via `parentChildId`. The
 *     institution-side record holds per-institution data (subscription state,
 *     classroom, history, skills earned at *this* institution).
 *
 * Onboarding: when a parent first signs up they are immediately offered the
 * chance to add one or more children to their personal roster. They can keep
 * adding more later. They subscribe by *picking from their own roster* — they
 * never re-type a child's name or DOB once it's recorded.
 *
 * Suggested base path: `/api/parents`. In production this lives in the
 * parent-facing app; the staff admin reads from it only via the simulator we
 * use to rehearse the flow end-to-end.
 */

import type { Phase0PagedResult } from './platform-tenant.phase0';

/**
 * Gender the parent records on the child profile. Mirrors the
 * `ChildGender` enum on the C# side (PascalCase strings on the wire
 * thanks to `JsonStringEnumConverter`). `Undisclosed` is the default
 * when the parent prefers not to say.
 */
export type Phase0ChildGender = 'Undisclosed' | 'Male' | 'Female' | 'Other';

/**
 * Extended child profile that ships alongside the legacy roster
 * fields. Mirrors `ChildProfileDto` on the C# side. Every field is
 * optional — when the parent hasn't filled it in the SPA renders an
 * em-dash. Carries first/last as a hint for any UI that wants to
 * split the display name (the canonical name still lives on
 * {@link Phase0ParentChild.displayName}).
 */
export interface Phase0ChildProfile {
  firstName: string | null;
  lastName: string | null;
  gender: Phase0ChildGender;
  hasEpilepsyHistory: boolean | null;
  allowSocialMediaSharing: boolean | null;
  ailmentsAllergiesConditions: string | null;
}

/**
 * Default child profile used when the wire omits the block (legacy
 * rows pre-dating the gender field) — keeps consumers free of null
 * checks at every read site.
 */
export const EMPTY_PHASE0_CHILD_PROFILE: Phase0ChildProfile = {
  firstName: null,
  lastName: null,
  gender: 'Undisclosed',
  hasEpilepsyHistory: null,
  allowSocialMediaSharing: null,
  ailmentsAllergiesConditions: null,
};

/**
 * Snapshot of which platform-required documents (clinic card +
 * birth certificate) a child currently carries on their vault.
 * Mirrors `RequiredChildDocumentsStatusDto` on the C# side.
 *
 * `null` indicates "the wire didn't include this field" — older
 * fixtures + the read-only mock seed return it that way and UIs
 * MUST treat that as "unknown" (fall through to the server-side
 * guard) rather than silently letting the parent submit a request
 * that will be rejected anyway.
 */
export interface Phase0RequiredChildDocumentsStatus {
  hasClinicCard: boolean;
  hasBirthCertificate: boolean;
  /** Convenience — true iff both platform-baseline documents are present. */
  hasAll: boolean;
  /**
   * Upper-cased `DOCUMENT_CATEGORY` codes the child currently has at
   * least one non-deleted document for. Drives the per-tenant
   * subscribe-time gate: the SPA / mobile / staff inbox compare this
   * against the institution's `requiredDocuments` list to decide
   * whether to show "Docs complete" or "Docs missing X, Y". The
   * platform baseline pair (clinic card + birth certificate) is
   * additionally exposed via the booleans above so legacy callers
   * keep working. Optional on the type for back-compat with mock
   * entries that pre-date the field — UI should treat `undefined` as
   * "unknown set" and fall back to the server-side guard.
   */
  categoryCodesPresent?: ReadonlyArray<string>;
}

/** One child on a parent's personal roster. */
export interface Phase0ParentChild {
  id: string; // pchild_*
  displayName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  /** Allergies, dietary needs, special needs to flag to staff. */
  notes: string | null;
  /**
   * Optional avatar. In mock mode this is a `data:` URL captured from a file
   * input; in live mode it would be the public URL of an uploaded image. Null
   * means "render initials avatar instead".
   */
  photoUrl: string | null;
  /**
   * Extended profile (gender + consent + ailments). Always present —
   * defaults to {@link EMPTY_PHASE0_CHILD_PROFILE} for legacy children
   * the wire didn't return a profile block for.
   */
  profile: Phase0ChildProfile;
  /**
   * Server-resolved snapshot of "does this child carry both
   * required documents?". `null` when the wire / mock didn't
   * supply it.
   */
  requiredDocuments?: Phase0RequiredChildDocumentsStatus | null;
}

/**
 * Identity document the guardian provided for KYC-style verification.
 * `Undisclosed` is the explicit "haven't filled this in yet" default
 * — staff sees a `—` and the parent can update it from /parent/profile.
 */
export type Phase0GuardianIdType = 'Undisclosed' | 'RsaId' | 'Passport';

/**
 * Salutation the guardian prefers when addressed in correspondence.
 * `Undisclosed` is the default for legacy parents.
 */
export type Phase0GuardianTitle =
  | 'Undisclosed'
  | 'Mr'
  | 'Mrs'
  | 'Ms'
  | 'Mx'
  | 'Dr'
  | 'Prof';

/**
 * Extended guardian profile the parent fills in on `/parent/profile` and
 * staff reviews on the parent-profile drawer before approving a
 * subscription. Mirrors `GuardianProfileDto` on the C# side. Every text
 * field is nullable so partial saves work as the parent fills the form
 * in over multiple sessions.
 */
export interface Phase0GuardianProfile {
  title: Phase0GuardianTitle;
  firstName: string | null;
  lastName: string | null;
  idType: Phase0GuardianIdType;
  idNumber: string | null;
  mobile: string | null;
  telephone: string | null;
  /**
   * Where finance documents (invoices, receipts, statements) are sent.
   * When null the platform falls back to the primary `email`.
   */
  financialEmail: string | null;
}

export const EMPTY_PHASE0_GUARDIAN_PROFILE: Phase0GuardianProfile = {
  title: 'Undisclosed',
  firstName: null,
  lastName: null,
  idType: 'Undisclosed',
  idNumber: null,
  mobile: null,
  telephone: null,
  financialEmail: null,
};

export interface Phase0Parent {
  id: string; // parent_*
  displayName: string;
  email: string;
  phone: string | null;
  /**
   * Extended guardian profile (title, ID document, mobile/telephone
   * split, financial billing email). Always present — defaults to
   * `EMPTY_PHASE0_GUARDIAN_PROFILE` for parents who haven't filled it
   * in yet so consumers never have to null-check the block itself.
   */
  profile: Phase0GuardianProfile;
  children: Phase0ParentChild[];
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface Phase0ListParentsQuery {
  /** Substring match against displayName + email. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export type Phase0ParentListResult = Phase0PagedResult<Phase0Parent>;

/**
 * POST /api/parents
 *
 * Onboards a new parent. Children entered up-front are added to their roster
 * in the same call so the parent isn't bounced through a multi-step form just
 * to sign up. Children can also be added later via
 * `POST /api/parents/{id}/children`.
 */
export interface Phase0OnboardParentRequest {
  displayName: string;
  email: string;
  phone?: string | null;
  /** Optional initial roster the parent fills in during onboarding. */
  children?: Array<{
    displayName: string;
    dateOfBirth: string;
    notes?: string | null;
    photoUrl?: string | null;
  }>;
}

export interface Phase0OnboardParentResponse {
  parent: Phase0Parent;
}

/** POST /api/parents/{id}/children — add another child to an existing roster. */
export interface Phase0AddParentChildRequest {
  displayName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  notes?: string | null;
  /** `data:` URL or absolute URL of the child's photo. Optional. */
  photoUrl?: string | null;
  /**
   * Extended profile block. When omitted the server creates the child
   * with {@link EMPTY_PHASE0_CHILD_PROFILE}. Used by the Add-Child
   * drawer to ship gender / split first+last name on creation.
   */
  profile?: Phase0ChildProfile | null;
}

export interface Phase0AddParentChildResponse {
  child: Phase0ParentChild;
}

/* -------------------------------------------------------------------------- */
/* Lifetime archive (parent-owned)                                            */
/* -------------------------------------------------------------------------- */

/**
 * One archived event in a snapshot. Mirrors the shape of
 * `Phase0ChildLifetimeEvent` so consumers (and downstream tools) can read the
 * archive without depending on the live API contracts.
 */
export interface Phase0LifetimeArchiveEvent {
  id: string;
  occurredAt: string;
  kind: string;
  summary: string;
  details: Record<string, unknown> | null;
  actorEmail: string | null;
  actorName: string | null;
}

/**
 * One subscription period inside an archive snapshot. `sealed = true` flags
 * periods that are closed (`state === 'ended'`) and therefore guaranteed to
 * be immutable from now on.
 */
export interface Phase0LifetimeArchivePeriod {
  id: string;
  institutionId: string;
  institutionName: string;
  institutionChildId: string | null;
  state: 'pending' | 'active' | 'paused' | 'ended';
  classroom: string | null;
  enrolledAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  archivedAt: string | null;
  sealed: boolean;
  events: Phase0LifetimeArchiveEvent[];
}

/**
 * The JSON the parent gets to keep. Self-contained: includes both the parent
 * and child identity so the file is meaningful on its own without any platform
 * context. Versioned so the schema can evolve without breaking older archives.
 *
 * Returned by:
 *   - `POST /api/parents/{pid}/children/{pcid}/subscriptions/{sid}/archive`
 *     (archive one ended period — also stamps `archivedAt` server-side)
 *   - `GET  /api/parents/{pid}/children/{pcid}/archive`
 *     (export the full lifetime — does not mutate)
 */
export interface Phase0LifetimeArchive {
  schemaVersion: 1;
  /** ISO 8601 timestamp of when this snapshot was generated. */
  exportedAt: string;
  parent: {
    id: string;
    displayName: string;
    email: string;
    phone: string | null;
  };
  child: {
    id: string;
    displayName: string;
    dateOfBirth: string;
    notes: string | null;
    photoUrl: string | null;
  };
  /** Newest period first. */
  periods: Phase0LifetimeArchivePeriod[];
  /** Standalone parent-uploaded memories (not tied to a daily report). */
  memories?: Phase0Memory[];
}

/* -------------------------------------------------------------------------- */
/* Standalone memories (parent uploads outside of a daily report)             */
/* -------------------------------------------------------------------------- */

/**
 * A memorable photo/video the parent uploaded directly — first day of school,
 * birthday, a recital, etc. Lives independently of any institution or daily
 * report so the keep-forever gallery isn't tied to a school's lifecycle.
 */
export interface Phase0Memory {
  /** mem_* */
  id: string;
  parentChildId: string;
  kind: 'photo' | 'video';
  /** Data URL (mock) or a remote URL. */
  url: string;
  caption: string | null;
  /** When the moment happened (parent-supplied, ISO date). */
  occurredAt: string;
  /** Server stamp of when the upload was created (ISO datetime). */
  createdAt: string;
  /** Optional free-text tag like "First day", "Birthday", "Recital". */
  tag: string | null;
  /** Optional institution association for filtering in the gallery. */
  institutionId: string | null;
  institutionName: string | null;
}

/** Body for `POST /api/parents/{pid}/children/{pcid}/memories`. */
export interface Phase0CreateMemoryRequest {
  kind: 'photo' | 'video';
  /** Data URL accepted in Phase 0 (mock storage). */
  url: string;
  caption?: string | null;
  occurredAt: string;
  tag?: string | null;
  institutionId?: string | null;
}
