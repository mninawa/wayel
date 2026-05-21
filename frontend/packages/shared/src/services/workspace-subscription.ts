/**
 * Workspace subscriptions helper.
 *
 * Backs the **Subscriptions** tab on the institution workspace
 * (`/tenants/:tenantId/workspace`). Walks `MOCK_PARENTS`, decorates each
 * subscription period with the parent name, classroom, matched program,
 * latest fee and most recent lifetime event so the UI doesn't need to
 * cross-join itself.
 *
 * Read-only on purpose — period state changes are handled by the
 * lifecycle bridges (parent self-service / staff approvals); the
 * workspace tab is just an operations view over the live data.
 */
import {
  MOCK_PARENTS,
  appendPeriodEvent,
  findMockParentChild,
  nextMockEventId,
  type MockParent,
  type MockParentChild,
  type MockParentChildSubscription,
  type MockParentChildSubscriptionEvent,
} from '../core/mock/mock-parents';
import { MOCK_CHILDREN, type MockChildRow } from '../core/mock/mock-data';
import {
  formatMoney,
  latestFeeFor,
  listProgramsForInstitution,
  type WorkspaceProgram,
  type WorkspaceProgramFee,
} from './workspace-program';

export type SubscriptionState = MockParentChildSubscription['state'];

export interface SubscriptionRow {
  /** Stable id of the subscription period. */
  id: string;
  parent: MockParent;
  child: MockParentChild;
  subscription: MockParentChildSubscription;
  /** Display name = child name. */
  childName: string;
  /** Display name of the responsible parent. */
  parentName: string;
  parentEmail: string;
  classroom: string | null;
  /**
   * The first program whose name tokens overlap the subscription's
   * classroom string, plus the latest fee row for it. Falls back to the
   * cheapest program at the institution when no classroom match is
   * found, so revenue can still be estimated.
   */
  matchedProgram: WorkspaceProgram | null;
  fee: WorkspaceProgramFee | null;
  /**
   * Display label for the fee, e.g. "R5,800/month". `null` when no fee
   * row could be derived.
   */
  feeLabel: string | null;
  state: SubscriptionState;
  enrolledAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  archivedAt: string | null;
  ageYears: number;
  /** Most recent lifetime event, or `null` when none recorded. */
  lastEvent: MockParentChildSubscriptionEvent | null;
}

export interface SubscriptionSummary {
  totalPeriods: number;
  active: number;
  pending: number;
  paused: number;
  ended: number;
  /**
   * Monthly recurring revenue across all `active` subscriptions whose
   * matched program has a fee (cadence-normalised: term fees ÷ 4,
   * year fees ÷ 12).
   */
  mrr: number;
  /** Year-to-date revenue for active periods (months elapsed × monthly fee). */
  ytdRevenue: number;
  /** Currency the totals are denominated in (defaults to ZAR / first fee). */
  currency: string;
}

export interface ListSubscriptionsOptions {
  /** Pre-loaded program list — saves repeating the lookup per call. */
  programs?: WorkspaceProgram[];
}

/**
 * All subscription periods at the given institution, decorated with the
 * matched program + fee + parent details. Newest periods first.
 */
export function listSubscriptionsForTenant(
  institutionId: string,
  options: ListSubscriptionsOptions = {},
): SubscriptionRow[] {
  const programs = options.programs ?? listProgramsForInstitution(institutionId);
  const tokens = programs.map((p) => ({ program: p, tokens: nameTokens(p.name) }));

  const rows: SubscriptionRow[] = [];
  for (const parent of MOCK_PARENTS) {
    for (const child of parent.children) {
      for (const sub of child.subscriptions) {
        if (sub.institutionId !== institutionId) continue;
        const matched = matchProgram(sub, tokens);
        const fee = matched ? latestFeeFor(matched) : null;
        rows.push({
          id: sub.id,
          parent,
          child,
          subscription: sub,
          childName: child.displayName,
          parentName: parent.displayName,
          parentEmail: parent.email,
          classroom: sub.classroom,
          matchedProgram: matched,
          fee,
          feeLabel: fee
            ? `${formatMoney(fee.amount, fee.currency)}/${cadenceShort(fee.cadence)}`
            : null,
          state: sub.state,
          enrolledAt: sub.enrolledAt,
          endedAt: sub.endedAt,
          endedReason: sub.endedReason,
          archivedAt: sub.archivedAt,
          ageYears: ageInYears(child.dateOfBirth),
          lastEvent: sub.events.length > 0 ? sub.events[sub.events.length - 1] : null,
        });
      }
    }
  }

  rows.sort((a, b) => {
    // Active first, then most-recently-touched.
    const sa = stateOrder(a.state);
    const sb = stateOrder(b.state);
    if (sa !== sb) return sa - sb;
    const ta = touchTime(a);
    const tb = touchTime(b);
    return tb.localeCompare(ta);
  });
  return rows;
}

/** Roll-up totals + revenue estimate for the rows. */
export function summarizeSubscriptions(
  rows: SubscriptionRow[],
  reference: Date = new Date(),
): SubscriptionSummary {
  let active = 0;
  let pending = 0;
  let paused = 0;
  let ended = 0;
  let mrr = 0;
  let ytdRevenue = 0;
  let currency = 'ZAR';

  const year = reference.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const monthsElapsed = Math.max(
    1,
    Math.min(
      12,
      (reference.getUTCFullYear() - yearStart.getUTCFullYear()) * 12 +
        (reference.getUTCMonth() - yearStart.getUTCMonth()) +
        1,
    ),
  );

  for (const row of rows) {
    switch (row.state) {
      case 'active':
        active += 1;
        break;
      case 'pending':
        pending += 1;
        break;
      case 'paused':
        paused += 1;
        break;
      case 'ended':
        ended += 1;
        break;
    }

    if (row.fee) {
      currency = row.fee.currency;
      const monthly = monthlyFromFee(row.fee);
      if (row.state === 'active') {
        mrr += monthly;

        // YTD revenue: months between max(enrolledAt, yearStart) and reference.
        const enrolled = row.enrolledAt ? new Date(row.enrolledAt) : null;
        const start = enrolled && enrolled > yearStart ? enrolled : yearStart;
        const months = Math.max(
          0,
          Math.min(
            monthsElapsed,
            (reference.getUTCFullYear() - start.getUTCFullYear()) * 12 +
              (reference.getUTCMonth() - start.getUTCMonth()) +
              1,
          ),
        );
        ytdRevenue += monthly * months;
      }
    }
  }

  return {
    totalPeriods: rows.length,
    active,
    pending,
    paused,
    ended,
    mrr,
    ytdRevenue,
    currency,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Display helpers                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export function subscriptionStateLabel(s: SubscriptionState): string {
  switch (s) {
    case 'active':
      return 'Active';
    case 'pending':
      return 'Pending';
    case 'paused':
      return 'Paused';
    case 'ended':
      return 'Ended';
  }
}

export function prettifyEventKind(kind: string): string {
  return kind.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Internal helpers                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

function matchProgram(
  sub: MockParentChildSubscription,
  tokens: Array<{ program: WorkspaceProgram; tokens: string[] }>,
): WorkspaceProgram | null {
  if (tokens.length === 0) return null;
  const room = (sub.classroom ?? '').toLowerCase();
  if (room) {
    const hit = tokens.find(
      (pt) => pt.tokens.length > 0 && pt.tokens.some((t) => room.includes(t)),
    );
    if (hit) return hit.program;
  }
  // Fallback: the cheapest program at the tenant so revenue isn't zero.
  const withFees = tokens
    .map((pt) => ({ program: pt.program, fee: latestFeeFor(pt.program) }))
    .filter((x): x is { program: WorkspaceProgram; fee: WorkspaceProgramFee } => x.fee != null)
    .sort((a, b) => a.fee.amount - b.fee.amount);
  return withFees[0]?.program ?? null;
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

function monthlyFromFee(fee: WorkspaceProgramFee): number {
  switch (fee.cadence) {
    case 'month':
      return fee.amount;
    case 'term':
      // Quarterly approximation: 4 terms / year ≈ amount × 4 / 12 = amount / 3.
      return Math.round(fee.amount / 3);
    case 'year':
      return Math.round(fee.amount / 12);
  }
}

function cadenceShort(c: WorkspaceProgramFee['cadence']): string {
  switch (c) {
    case 'month':
      return 'month';
    case 'term':
      return 'term';
    case 'year':
      return 'year';
  }
}

function stateOrder(s: SubscriptionState): number {
  switch (s) {
    case 'active':
      return 0;
    case 'pending':
      return 1;
    case 'paused':
      return 2;
    case 'ended':
      return 3;
  }
}

function touchTime(row: SubscriptionRow): string {
  return (
    row.lastEvent?.occurredAt ??
    row.endedAt ??
    row.enrolledAt ??
    row.subscription.archivedAt ??
    ''
  );
}

function ageInYears(dob: string): number {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return Math.max(0, age);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Period mutation helpers (admin workspace approve / reject buttons).        */
/*                                                                            */
/* These intentionally mutate `MOCK_PARENTS` + `MOCK_CHILDREN` directly so    */
/* the operator can resolve a `pending` *period* that wasn't paired with a   */
/* `Phase0SubscriptionRequestDto` row (or where the bridge isn't reachable). */
/* When a bridge request *does* exist, the workspace component is expected   */
/* to call `SubscriptionRequestsBridgeService.approve()` / `.reject()`       */
/* instead so the inbox stays in sync.                                        */
/* ────────────────────────────────────────────────────────────────────────── */

const ADMIN_OPERATOR_EMAIL = 'admin@platform.local';
const ADMIN_OPERATOR_NAME = 'Platform Operator';

export interface ApprovePeriodInput {
  /** ID of the period (`MockParentChildSubscription.id`) to flip active. */
  periodId: string;
  /** Optional override classroom; falls back to the period's existing one. */
  classroom?: string | null;
}

export interface RejectPeriodInput {
  /** ID of the period (`MockParentChildSubscription.id`) to end. */
  periodId: string;
  /** Required reason captured into `endedReason` and the lifecycle event. */
  reason: string;
}

export interface PeriodMutationResult {
  ok: boolean;
  /** Populated on success — the freshly-mutated period for re-rendering. */
  period?: MockParentChildSubscription;
  /** Populated on failure — human-readable explanation. */
  error?: string;
}

/**
 * Flip a `pending` period to `active`, append an `enrolled` event and
 * upsert the institution-side child row so the children roster picks
 * the child up immediately.
 */
export function approvePendingPeriod(
  institutionId: string,
  input: ApprovePeriodInput,
): PeriodMutationResult {
  const found = findPeriodAtTenant(institutionId, input.periodId);
  if (!found) return { ok: false, error: `No subscription "${input.periodId}" at this institution.` };
  const { parent, child, period } = found;
  if (period.state !== 'pending') {
    return { ok: false, error: `Subscription is already ${period.state}.` };
  }

  const approvedAt = new Date().toISOString();
  const classroom = input.classroom?.trim() || period.classroom || null;
  const childId = period.institutionChildId || `child_${Math.random().toString(36).slice(2, 10)}`;

  period.state = 'active';
  period.enrolledAt = approvedAt.slice(0, 10);
  period.classroom = classroom;
  period.institutionChildId = childId;
  appendPeriodEvent(period, {
    id: nextMockEventId('enrolled'),
    occurredAt: approvedAt,
    kind: 'enrolled',
    summary: 'Subscription approved by platform operator.',
    details: { classroom, periodId: period.id },
    actorEmail: ADMIN_OPERATOR_EMAIL,
    actorName: ADMIN_OPERATOR_NAME,
  });

  upsertChildRow(child, parent, childId, 'active');

  return { ok: true, period };
}

/**
 * End a `pending` period with the supplied reason and append an `ended`
 * lifecycle event. The institution-side child row (if any) is flipped to
 * `ended` too so the children roster reflects the decision.
 */
export function rejectPendingPeriod(
  institutionId: string,
  input: RejectPeriodInput,
): PeriodMutationResult {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'A rejection reason is required.' };

  const found = findPeriodAtTenant(institutionId, input.periodId);
  if (!found) return { ok: false, error: `No subscription "${input.periodId}" at this institution.` };
  const { period } = found;
  if (period.state !== 'pending') {
    return { ok: false, error: `Subscription is already ${period.state}.` };
  }

  const endedAt = new Date().toISOString();
  period.state = 'ended';
  period.endedAt = endedAt.slice(0, 10);
  period.endedReason = reason;
  appendPeriodEvent(period, {
    id: nextMockEventId('ended'),
    occurredAt: endedAt,
    kind: 'ended',
    summary: 'Subscription request declined by platform operator.',
    details: { reason, periodId: period.id },
    actorEmail: ADMIN_OPERATOR_EMAIL,
    actorName: ADMIN_OPERATOR_NAME,
  });

  if (period.institutionChildId) {
    const row = MOCK_CHILDREN.find((c) => c.id === period.institutionChildId);
    if (row) row.membershipState = 'ended';
  }

  return { ok: true, period };
}

/**
 * Find a parent-child + period at a given institution. Returns null when no
 * period with that id exists under the institution (so callers can surface a
 * helpful error instead of crashing on `undefined.state`).
 */
function findPeriodAtTenant(
  institutionId: string,
  periodId: string,
): { parent: MockParent; child: MockParentChild; period: MockParentChildSubscription } | null {
  for (const parent of MOCK_PARENTS) {
    for (const child of parent.children) {
      const period = child.subscriptions.find(
        (s) => s.id === periodId && s.institutionId === institutionId,
      );
      if (period) return { parent, child, period };
    }
  }
  return null;
}

/**
 * Re-derive the {@link findMockParentChild} link for a given period — useful
 * when the workspace section component needs to deep-link into the child
 * detail view after approval. Exported so callers don't need to import the
 * mock module directly.
 */
export function findParentChildForPeriod(periodId: string) {
  for (const parent of MOCK_PARENTS) {
    for (const child of parent.children) {
      if (child.subscriptions.some((s) => s.id === periodId)) {
        return findMockParentChild(child.id);
      }
    }
  }
  return null;
}

function upsertChildRow(
  child: MockParentChild,
  parent: MockParent,
  childId: string,
  state: MockChildRow['membershipState'],
): void {
  const existing = MOCK_CHILDREN.find((c) => c.id === childId);
  if (existing) {
    existing.membershipState = state;
    existing.parentId = parent.id;
    existing.parentChildId = child.id;
    return;
  }
  MOCK_CHILDREN.push({
    id: childId,
    displayName: child.displayName,
    dateOfBirth: child.dateOfBirth,
    guardianNames: [parent.displayName],
    membershipState: state,
    parentId: parent.id,
    parentChildId: child.id,
  });
}
