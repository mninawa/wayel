/**
 * Phase 0 API sketch for the institution-side subscription-request inbox.
 *
 * Domain reminder: parents subscribe their children to institutions via the
 * parent-facing app. Each subscription that requires staff approval lands in
 * this inbox. Approving creates (or attaches to an existing) child record and
 * a `Phase0ChildSubscription` at the *current institution*. Rejecting closes
 * the request out with a reason.
 *
 * Suggested base path: `/api/subscription-requests`. Endpoints are scoped to
 * the institution resolved from the session — staff only see requests
 * targeted at their institution.
 */

import type { Phase0PagedResult } from './platform-tenant.phase0';

export type Phase0SubscriptionRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

/**
 * One pending (or recently-decided) subscription request.
 *
 * Every request points back to a `parentId` + `parentChildId` (the canonical
 * identities owned by the parent). The denormalized child/parent display
 * fields (`childDisplayName`, `childDateOfBirth`, `parentEmail`,
 * `parentDisplayName`) are populated server-side at submit time so the staff
 * inbox can render without a roundtrip — they're snapshots, not the source of
 * truth.
 *
 * `institutionChildId` is non-null only when the parent is subscribing a
 * child who is *already* enrolled at this institution (e.g. re-subscribing
 * after `ended`). For first-time enrolments it stays null until the request
 * is approved, at which point the server materialises an institution-side
 * child record (or attaches to one that exists for the same `parentChildId`).
 */
export interface Phase0SubscriptionRequestDto {
  id: string;
  /** ID of the institution the request is targeted at. */
  institutionId: string;
  institutionName: string;
  /** Canonical parent identity that submitted the request. */
  parentId: string;
  /** Canonical child identity (on the parent's roster) being subscribed. */
  parentChildId: string;
  /** Existing institution-side child id if one already exists, else null. */
  institutionChildId: string | null;
  childDisplayName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  childDateOfBirth: string;
  parentEmail: string;
  parentDisplayName: string | null;
  /** Free-form note attached by the parent on submission. */
  message: string | null;
  /** Classroom/program the parent picked from the parent app, if any. */
  classroomRequested: string | null;
  requestedProgramId?: string | null;
  requestedCadence?: string | null;
  /** ISO 8601 timestamp. */
  requestedAt: string;
  status: Phase0SubscriptionRequestStatus;
  /** Set when `status === 'approved'` so the UI can deep-link to the child. */
  resolvedChildId: string | null;
  /** Set when `status === 'rejected'`. */
  rejectionReason: string | null;
  /** ISO 8601 timestamp; null while pending. */
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  /**
   * Required-document presence on the parent's child as known by the
   * server at list time. Populated by the staff list endpoint so the
   * approval inbox can flag rows whose parent hasn't filed both the
   * clinic card and birth certificate yet (the same documents the
   * AddChild flow now collects up-front). `null` for legacy servers
   * / mock rows; UI must treat that as "unknown" and not gate.
   */
  requiredDocuments?: Phase0SubscriptionRequestRequiredDocuments | null;
}

export interface Phase0SubscriptionRequestRequiredDocuments {
  hasClinicCard: boolean;
  hasBirthCertificate: boolean;
  /** Convenience precomputed `hasClinicCard && hasBirthCertificate`. */
  hasAll: boolean;
  /**
   * Upper-cased `DOCUMENT_CATEGORY` codes the child currently has at
   * least one non-deleted document for. Drives the per-tenant
   * subscribe-time gate on the staff inbox: compared against the
   * institution's `requiredDocuments` list to decide whether the
   * parent vault is ready ("Docs ✓") or missing specific entries
   * ("Docs missing X, Y"). Optional on the type for back-compat with
   * mock entries / legacy server builds — UI treats `undefined` /
   * absent as "unknown set" and falls back to the platform-baseline
   * booleans above.
   */
  categoryCodesPresent?: ReadonlyArray<string>;
}

export interface Phase0ListSubscriptionRequestsQuery {
  status?: Phase0SubscriptionRequestStatus;
  /** Substring match against childDisplayName + parentEmail. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export type Phase0SubscriptionRequestListResult =
  Phase0PagedResult<Phase0SubscriptionRequestDto>;

/**
 * POST /api/subscription-requests/{id}/approve
 *
 * Optionally override the classroom the parent requested. Server creates the
 * child record (if needed) and a fresh `active` subscription, then returns the
 * resulting child id so the UI can navigate.
 */
export interface Phase0ApproveSubscriptionRequestRequest {
  classroom?: string | null;
}

export interface Phase0ApproveSubscriptionRequestResponse {
  childId: string;
  subscriptionId: string;
  /** ISO 8601. */
  approvedAt: string;
}

/**
 * POST /api/subscription-requests/{id}/reject
 *
 * Reason is required so the parent has something to read; no silent rejects.
 */
export interface Phase0RejectSubscriptionRequestRequest {
  reason: string;
}

/**
 * POST /api/subscription-requests
 *
 * The parent-side write surface. In production this lives in the parent app
 * and is callable without staff auth (the parent is authenticated as
 * themselves). In staging/QA we expose it from inside the admin UI as a
 * simulator so we can rehearse the full subscribe → approve → enrol cycle
 * without spinning up two clients.
 *
 * The parent picks one of their own children (`parentChildId`) from their
 * personal roster and one institution from the directory (`institutionId`).
 * The server resolves the child's name/DOB and the parent's email/name from
 * the parent's profile — clients do not re-type those fields. Brand-new
 * children must first be added to the parent's roster via
 * `POST /api/parents/{id}/children` (or as part of onboarding).
 */
export interface Phase0CreateSubscriptionRequestRequest {
  institutionId: string;
  /** Canonical parent identity. */
  parentId: string;
  /** Must be one of `parent.children[].id`. */
  parentChildId: string;
  /** Free-form note from the parent (allergies, motivation, etc.). */
  message?: string | null;
  /** Classroom/program the parent picked, if the institution exposes a list. */
  classroomRequested?: string | null;
  /** Programme id the server uses when minting the period on approval. */
  requestedProgramId?: string | null;
  /** Billing rhythm — matches server SubscriptionCadence wire parsing. */
  requestedCadence?:
    | 'Monthly'
    | 'Termly'
    | 'SixMonths'
    | 'NineMonths'
    | 'Yearly'
    | null;
}

export interface Phase0CreateSubscriptionRequestResponse {
  requestId: string;
  /** ISO 8601. */
  receivedAt: string;
  /** Echoed so the parent UI can show "your request is in the queue at X". */
  institutionId: string;
  institutionName: string;
}
