import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@app/environment';
import type {
  Phase0ChildDetailDto,
  Phase0ChildLifetimeEvent,
  Phase0ChildLifetimeEventKind,
  Phase0ChildLifetimeSubscription,
  Phase0ChildMembershipEvent,
  Phase0ChildMembershipState,
  Phase0ChildOtherSubscription,
  Phase0ChildSkillEntry,
  Phase0ChildSubscription,
  Phase0CreateChildRequest,
  Phase0CreateChildResponse,
  Phase0ListChildrenQuery,
  Phase0LogChildSkillRequest,
  Phase0LogChildSkillResponse,
  Phase0PatchChildMembershipStateRequest,
} from '../core/contracts/children.phase0';
import { MOCK_CHILDREN, type MockChildRow } from '../core/mock/mock-data';
import {
  MOCK_PARENTS,
  appendPeriodEvent,
  findLatestPeriod,
  findMockParentChild,
  findOpenPeriod,
  nextMockEventId,
  nextMockSubscriptionPeriodId,
  type MockParent,
  type MockParentChild,
  type MockParentChildSubscription,
  type MockParentChildSubscriptionEvent,
} from '../core/mock/mock-parents';
import { ChildrenApiService } from './children-api.service';
import { phase0ChildDtoToMock } from './children-mappers';

/** Paged child list — shape mirrors `PlatformTenantListResult`. */
export interface ChildrenListResult {
  items: MockChildRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * The "current" institution the staff user is acting on behalf of. In live mode
 * this comes from the session; the mock pretends to be Little Stars Preschool.
 */
const CURRENT_INSTITUTION = {
  id: 'tenant_little_stars',
  name: 'Little Stars Preschool',
} as const;

/**
 * Sibling institutions used to populate cross-institution subscriptions in mock
 * mode. Real children would be spread across these the way real life works:
 * preschool + a sport + an art/music club is a common shape.
 */
const OTHER_INSTITUTIONS: Array<{ id: string; name: string }> = [
  { id: 'inst_aqua_stars', name: 'Aqua Stars Swim Academy' },
  { id: 'inst_kintaro_karate', name: 'Kintaro Karate Dojo' },
  { id: 'inst_brushstrokes', name: 'Brushstrokes Art Studio' },
  { id: 'inst_sonata_music', name: 'Sonata Music School' },
];

function filterMockChildren(rows: MockChildRow[], q: Phase0ListChildrenQuery): MockChildRow[] {
  let out = rows;
  if (q.membershipState) {
    out = out.filter((c) => c.membershipState === q.membershipState);
  }
  const s = q.search?.trim().toLowerCase();
  if (s) {
    out = out.filter((c) =>
      [c.displayName, ...c.guardianNames].join(' ').toLowerCase().includes(s),
    );
  }
  return out;
}

/**
 * Switches between in-memory mocks (reading directly from `MOCK_CHILDREN` /
 * `MOCK_PARENTS`) and `ChildrenApiService` based on `environment.useMock`.
 * Filtering + paging happen client-side in mock mode and server-side in live
 * mode (same contract on both sides).
 */
@Injectable({ providedIn: 'root' })
export class ChildrenBridgeService {
  private readonly api = inject(ChildrenApiService);

  /**
   * Lazy cache of synthesized detail payloads in mock mode. We build on first
   * read and mutate on lifecycle changes so the UI sees a coherent timeline
   * across operations within a single page session.
   */
  private readonly mockDetails = new Map<string, Phase0ChildDetailDto>();

  /** The institution the current staff user is acting on behalf of. */
  readonly currentInstitution = CURRENT_INSTITUTION;

  /** All other institutions the platform knows about (for QA / picker UIs). */
  readonly siblingInstitutions: ReadonlyArray<{ id: string; name: string }> =
    OTHER_INSTITUTIONS;

  /** Subtitle line for the children page. */
  readonly dataSourceLine: string = environment.useMock
    ? `In-memory mock — viewing as ${CURRENT_INSTITUTION.name}.`
    : environment.platformApiUrl
      ? `Backed by ${environment.platformApiUrl}.`
      : 'Live API (same origin).';

  /**
   * @param query Defaults: `page=1`, `pageSize=20`.
   */
  loadChildren(query: Phase0ListChildrenQuery = {}): Observable<ChildrenListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q: Phase0ListChildrenQuery = { ...query, page, pageSize };

    if (environment.useMock) {
      const filtered = filterMockChildren([...MOCK_CHILDREN], q);
      const totalCount = filtered.length;
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize).map((row) => ({
        ...row,
        otherSubscriptionsCount:
          row.otherSubscriptionsCount ??
          (row.parentChildId
            ? otherSubscriptionsFromParent(row.parentChildId).length
            : 0),
      }));
      return of({ items, totalCount, page, pageSize });
    }

    return this.api.listChildren(q).pipe(
      map((r) => ({
        items: r.items.map(phase0ChildDtoToMock),
        totalCount: r.totalCount,
        page: r.page,
        pageSize: r.pageSize,
      })),
    );
  }

  /**
   * Drop the cached detail for `id` so the next read re-derives from current
   * mock state. Useful after writes that bypass this service (e.g. the
   * subscription-requests bridge approving a request).
   */
  invalidateChildDetailCache(id?: string): void {
    if (id == null) this.mockDetails.clear();
    else this.mockDetails.delete(id);
  }

  /** Fetch the detailed profile for one child. Errors surface to subscribers. */
  getChild$(id: string): Observable<Phase0ChildDetailDto> {
    if (environment.useMock) {
      const cached = this.mockDetails.get(id);
      if (cached) return of(cached);
      const row = MOCK_CHILDREN.find((c) => c.id === id);
      if (!row) return throwError(() => new Error(`No mock child with id "${id}".`));
      const detail = buildMockDetail(row);
      this.mockDetails.set(id, detail);
      return of(detail);
    }
    return this.api.getChild(id);
  }

  createChild(body: Phase0CreateChildRequest): Observable<Phase0CreateChildResponse> {
    if (environment.useMock) {
      const error = validateCreateChild(body);
      if (error) return throwError(() => new Error(error));

      const targetInstitution = resolveInstitution(body.institutionId);
      if (!targetInstitution) {
        return throwError(
          () => new Error(`Unknown institutionId "${body.institutionId}".`),
        );
      }
      const subscribeToCurrent = targetInstitution.id === CURRENT_INSTITUTION.id;

      const id = `child_${Math.random().toString(36).slice(2, 10)}`;
      const initialState = body.initialMembershipState ?? 'pending';
      const createdAt = new Date().toISOString();
      const notes = body.notes?.trim() || null;
      const classroom = body.classroom?.trim() || null;

      // Resolve (or auto-create) the parent identity from the first guardian
      // so the staff-bypass path stays consistent with the parent-driven flow.
      const primaryGuardian = body.guardians[0];
      const primaryEmail = primaryGuardian?.email?.trim().toLowerCase() ?? null;
      let parent: MockParent | null = primaryEmail
        ? MOCK_PARENTS.find((p) => p.email.toLowerCase() === primaryEmail) ?? null
        : null;
      if (!parent) {
        parent = {
          id: `parent_${Math.random().toString(36).slice(2, 10)}`,
          displayName: primaryGuardian.displayName.trim(),
          email:
            primaryEmail ||
            `${slugifyName(primaryGuardian.displayName)}@example.com`,
          phone: primaryGuardian?.phone?.trim() || null,
          createdAt,
          children: [],
        };
        MOCK_PARENTS.push(parent);
      }

      const periodId = nextMockSubscriptionPeriodId('staff');
      const enrolledAt =
        initialState === 'pending' ? null : createdAt.slice(0, 10);
      const period: MockParentChildSubscription = {
        id: periodId,
        institutionId: targetInstitution.id,
        institutionChildId: subscribeToCurrent ? id : undefined,
        state: initialState,
        enrolledAt,
        endedAt: null,
        endedReason: null,
        archivedAt: null,
        classroom,
        events:
          initialState === 'pending'
            ? []
            : [
                {
                  id: nextMockEventId('enrolled'),
                  occurredAt: createdAt,
                  kind: 'enrolled',
                  summary: 'Subscribed via staff-bypass simulator.',
                  details: { classroom },
                  actorEmail: 'admin@example.com',
                  actorName: null,
                },
              ],
      };
      const parentChild: MockParentChild = {
        id: `pchild_${Math.random().toString(36).slice(2, 10)}`,
        displayName: body.displayName.trim(),
        dateOfBirth: body.dateOfBirth,
        notes,
        photoUrl: null,
        subscriptions: [period],
      };
      parent.children.push(parentChild);

      // Only the current institution actually adds a row to its roster; if the
      // staff-bypass targeted a sibling institution, no current-institution
      // child record exists yet.
      if (subscribeToCurrent) {
        const row: MockChildRow = {
          id,
          displayName: body.displayName.trim(),
          dateOfBirth: body.dateOfBirth,
          guardianNames: body.guardians
            .map((g) => g.displayName.trim())
            .filter(Boolean),
          membershipState: initialState,
          parentId: parent.id,
          parentChildId: parentChild.id,
        };
        MOCK_CHILDREN.push(row);

        // Drop the cache so the detail page re-derives from MOCK_PARENTS,
        // including the freshly-created subscription period and timeline.
        this.mockDetails.delete(id);
      }

      return of({
        childId: id,
        membershipState: subscribeToCurrent ? initialState : 'ended',
        institutionId: targetInstitution.id,
        createdAt,
      });
    }
    return this.api.createChild(body);
  }

  /**
   * Append a skill entry to a child's permanent record.
   *
   * Skills accumulate over the lifetime of the child profile and are not
   * intended to be edited or deleted from the staff UI — that's why the only
   * write surface here is `POST`. The mock implementation mirrors that.
   *
   * Tagged with the current institution; staff can only log skills for skills
   * earned at *their* institution.
   */
  logSkill(
    id: string,
    body: Phase0LogChildSkillRequest,
  ): Observable<Phase0LogChildSkillResponse> {
    if (environment.useMock) {
      const error = validateLogSkill(body);
      if (error) return throwError(() => new Error(error));
      const row = MOCK_CHILDREN.find((c) => c.id === id);
      if (!row) return throwError(() => new Error(`No mock child with id "${id}".`));

      const link = row.parentChildId ? findMockParentChild(row.parentChildId) : null;
      if (!link) {
        return throwError(
          () =>
            new Error(
              `Child "${id}" is not linked to a parent-child; cannot record a skill.`,
            ),
        );
      }
      // Skills are owned by the *child* and recorded onto the active period
      // at the institution that taught the skill. If the period is closed,
      // staff cannot back-fill into it — they must re-enrol the child first.
      const period = findOpenPeriod(link.child, CURRENT_INSTITUTION.id);
      if (!period) {
        return throwError(
          () =>
            new Error(
              `${link.child.displayName} has no open subscription at ${CURRENT_INSTITUTION.name}; re-enrol before logging skills.`,
            ),
        );
      }

      const occurredAtIso = `${body.occurredAt}T12:00:00Z`;
      const event: MockParentChildSubscriptionEvent = {
        id: nextMockEventId('skill'),
        occurredAt: occurredAtIso,
        kind: 'skill_earned',
        summary: body.skillName.trim(),
        details: {
          skillName: body.skillName.trim(),
          programName: body.programName.trim(),
          instructorEmail: body.instructorEmail.trim(),
          instructorName: body.instructorName?.trim() || null,
        },
        actorEmail: body.instructorEmail.trim(),
        actorName: body.instructorName?.trim() || null,
      };
      appendPeriodEvent(period, event);
      this.mockDetails.delete(id);

      const entry: Phase0ChildSkillEntry = {
        id: event.id,
        skillName: body.skillName.trim(),
        programName: body.programName.trim(),
        occurredAt: body.occurredAt,
        institutionId: CURRENT_INSTITUTION.id,
        institutionName: CURRENT_INSTITUTION.name,
        instructorEmail: body.instructorEmail.trim(),
        instructorName: body.instructorName?.trim() || null,
      };
      return of({ entry });
    }
    return this.api.logSkill(id, body);
  }

  patchMembershipState(
    id: string,
    body: Phase0PatchChildMembershipStateRequest,
  ): Observable<void> {
    if (environment.useMock) {
      const reasonError = validateMembershipPatch(body);
      if (reasonError) return throwError(() => new Error(reasonError));
      const idx = MOCK_CHILDREN.findIndex((c) => c.id === id);
      if (idx < 0) return throwError(() => new Error(`No mock child with id "${id}".`));

      const row = MOCK_CHILDREN[idx];
      const link = row.parentChildId ? findMockParentChild(row.parentChildId) : null;
      if (!link) {
        return throwError(
          () =>
            new Error(
              `Child "${id}" is not linked to a parent-child; cannot change membership.`,
            ),
        );
      }

      const nowIso = new Date().toISOString();
      const reason = body.reason?.trim() || null;
      const desired = body.state;

      const open = findOpenPeriod(link.child, CURRENT_INSTITUTION.id);
      const latest = findLatestPeriod(link.child, CURRENT_INSTITUTION.id);

      // Re-enrolment: there is no open period (or only an ended one) and
      // staff is bringing the child back. We *never* resurrect an ended
      // period — we open a brand-new one so the prior period's events stay
      // sealed and archivable.
      if (!open && desired === 'active') {
        const newPeriod: MockParentChildSubscription = {
          id: nextMockSubscriptionPeriodId('reenrol'),
          institutionId: CURRENT_INSTITUTION.id,
          institutionChildId: id,
          state: 'active',
          enrolledAt: nowIso.slice(0, 10),
          endedAt: null,
          endedReason: null,
          archivedAt: null,
          classroom: latest?.classroom ?? null,
          events: [
            {
              id: nextMockEventId('enrolled'),
              occurredAt: nowIso,
              kind: 'enrolled',
              summary: 'Re-enrolled at ' + CURRENT_INSTITUTION.name + '.',
              details: {
                classroom: latest?.classroom ?? null,
                priorPeriodId: latest?.id ?? null,
              },
              actorEmail: 'admin@example.com',
              actorName: null,
            },
          ],
        };
        link.child.subscriptions.push(newPeriod);
        MOCK_CHILDREN[idx] = { ...row, membershipState: 'active' };
        this.mockDetails.delete(id);
        return of(void 0);
      }

      if (!open) {
        return throwError(
          () =>
            new Error(
              `${link.child.displayName} has no open subscription at ${CURRENT_INSTITUTION.name}; re-enrol first.`,
            ),
        );
      }

      const from = open.state;
      const to = desired;
      // No-op transitions still get a refusal so callers don't accidentally
      // log a meaningless event.
      if (from === to) {
        return throwError(
          () => new Error(`Subscription is already ${to}.`),
        );
      }

      // Translate the transition into a kind so the timeline reads naturally.
      const kind: Phase0ChildLifetimeEventKind =
        to === 'ended'
          ? 'ended'
          : to === 'paused'
            ? 'paused'
            : from === 'paused' && to === 'active'
              ? 'resumed'
              : from === 'pending' && to === 'active'
                ? 'enrolled'
                : 'state_change';

      const summary =
        kind === 'ended'
          ? 'Period ended.'
          : kind === 'paused'
            ? 'Period paused.'
            : kind === 'resumed'
              ? 'Period resumed.'
              : kind === 'enrolled'
                ? 'Enrolment approved.'
                : `State changed: ${from} → ${to}.`;

      // Mutate the open period (it's still open while we apply the event).
      const event: MockParentChildSubscriptionEvent = {
        id: nextMockEventId(kind),
        occurredAt: nowIso,
        kind,
        summary,
        details: { from, to, reason },
        actorEmail: 'admin@example.com',
        actorName: null,
      };
      appendPeriodEvent(open, event);
      open.state = to;
      if (to === 'active' && !open.enrolledAt) {
        open.enrolledAt = nowIso.slice(0, 10);
      }
      if (to === 'ended') {
        open.endedAt = nowIso.slice(0, 10);
        open.endedReason = reason;
      }

      MOCK_CHILDREN[idx] = { ...row, membershipState: to };
      this.mockDetails.delete(id);
      return of(void 0);
    }
    return this.api.patchMembershipState(id, body);
  }
}

function validateCreateChild(body: Phase0CreateChildRequest): string | null {
  if (!body.displayName?.trim()) return 'Display name is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth)) {
    return 'Date of birth must be in YYYY-MM-DD format.';
  }
  if (!body.guardians?.length) return 'At least one guardian is required.';
  if (body.guardians.some((g) => !g.displayName?.trim())) {
    return 'Each guardian must have a name.';
  }
  return null;
}

function validateMembershipPatch(
  body: Phase0PatchChildMembershipStateRequest,
): string | null {
  if (!['pending', 'active', 'paused', 'ended'].includes(body.state)) {
    return `Unknown state "${body.state}".`;
  }
  if ((body.state === 'paused' || body.state === 'ended') && !body.reason?.trim()) {
    return `A reason is required to ${body.state === 'paused' ? 'pause' : 'end'} a membership.`;
  }
  return null;
}

function validateLogSkill(body: Phase0LogChildSkillRequest): string | null {
  if (!body.skillName?.trim()) return 'Skill name is required.';
  if (!body.programName?.trim()) return 'Program/class is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.occurredAt)) {
    return 'Date must be in YYYY-MM-DD format.';
  }
  if (!body.instructorEmail?.trim()) return 'Instructor email is required.';
  return null;
}

function resolveInstitution(id: string | undefined): { id: string; name: string } | null {
  if (!id || id === CURRENT_INSTITUTION.id) return CURRENT_INSTITUTION;
  return OTHER_INSTITUTIONS.find((i) => i.id === id) ?? null;
}

function institutionFor(id: string): { id: string; name: string } {
  if (id === CURRENT_INSTITUTION.id) return CURRENT_INSTITUTION;
  return (
    OTHER_INSTITUTIONS.find((i) => i.id === id) ??
    ({ id, name: id } as const)
  );
}

/**
 * Compute the cross-institution subscriptions for a parent-child by walking
 * its `subscriptions` and dropping the current institution's entry. This is
 * what the live backend returns from a single GET; in mock mode we synthesize
 * it from `MOCK_PARENTS` so the same canonical identity ties everything
 * together. We collapse multiple periods at the same sibling institution to
 * the *latest* one so the legacy compact summary stays stable; the full
 * lifetime is available via `subscriptionTimeline`.
 */
function otherSubscriptionsFromParent(
  parentChildId: string,
): Phase0ChildOtherSubscription[] {
  const link = findMockParentChild(parentChildId);
  if (!link) return [];
  const byInstitution = new Map<string, MockParentChildSubscription>();
  for (const s of link.child.subscriptions) {
    if (s.institutionId === CURRENT_INSTITUTION.id) continue;
    const prev = byInstitution.get(s.institutionId);
    const sStart = s.enrolledAt ?? s.events[0]?.occurredAt ?? '';
    const pStart = prev?.enrolledAt ?? prev?.events[0]?.occurredAt ?? '';
    if (!prev || sStart > pStart) byInstitution.set(s.institutionId, s);
  }
  return [...byInstitution.values()].map((s) => {
    const inst = institutionFor(s.institutionId);
    return {
      id: `sub_${link.child.id}_${inst.id}`,
      institutionId: inst.id,
      institutionName: inst.name,
      state: s.state,
      enrolledAt: s.enrolledAt,
    } satisfies Phase0ChildOtherSubscription;
  });
}

/**
 * Project the canonical mock periods into the parent-owned lifetime view.
 * Newest period first; events kept in chronological (ascending) order inside
 * each period so the UI can render them as a top-down story.
 */
function lifetimeFromParent(
  parentChild: MockParentChild,
): Phase0ChildLifetimeSubscription[] {
  const sorted = [...parentChild.subscriptions].sort((a, b) => {
    const aStart = a.enrolledAt ?? a.events[0]?.occurredAt ?? '';
    const bStart = b.enrolledAt ?? b.events[0]?.occurredAt ?? '';
    return aStart < bStart ? 1 : aStart > bStart ? -1 : 0;
  });
  return sorted.map((s) => {
    const inst = institutionFor(s.institutionId);
    return {
      id: s.id,
      institutionId: inst.id,
      institutionName: inst.name,
      institutionChildId: s.institutionChildId ?? null,
      state: s.state,
      classroom: s.classroom,
      enrolledAt: s.enrolledAt,
      endedAt: s.endedAt,
      endedReason: s.endedReason,
      archivedAt: s.archivedAt,
      events: s.events.map(
        (e) =>
          ({
            id: e.id,
            occurredAt: e.occurredAt,
            kind: e.kind,
            summary: e.summary,
            details: e.details,
            actorEmail: e.actorEmail,
            actorName: e.actorName,
          }) satisfies Phase0ChildLifetimeEvent,
      ),
    } satisfies Phase0ChildLifetimeSubscription;
  });
}

/**
 * Project the per-institution `skill_earned` events on every period across
 * the child's lifetime into the flat skills list the institution-side detail
 * page renders. Most-recent-first.
 */
function skillsFromParent(
  parentChild: MockParentChild,
): Phase0ChildSkillEntry[] {
  const out: Phase0ChildSkillEntry[] = [];
  for (const s of parentChild.subscriptions) {
    const inst = institutionFor(s.institutionId);
    for (const ev of s.events) {
      if (ev.kind !== 'skill_earned') continue;
      const d = (ev.details ?? {}) as {
        skillName?: string;
        programName?: string;
        instructorEmail?: string;
        instructorName?: string | null;
      };
      out.push({
        id: ev.id,
        skillName: d.skillName ?? ev.summary,
        programName: d.programName ?? '—',
        occurredAt: ev.occurredAt.slice(0, 10),
        institutionId: inst.id,
        institutionName: inst.name,
        instructorEmail: d.instructorEmail ?? ev.actorEmail ?? 'unknown@example.com',
        instructorName: d.instructorName ?? ev.actorName ?? null,
      });
    }
  }
  return out.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

/**
 * Project the membership-state events on the latest period at the current
 * institution into the legacy `Phase0ChildSubscription.history` shape so the
 * old "Subscription history" panel keeps working until the UI fully
 * transitions to the lifetime view.
 */
function historyFromPeriod(
  period: MockParentChildSubscription | null,
): Phase0ChildMembershipEvent[] {
  if (!period) return [];
  const out: Phase0ChildMembershipEvent[] = [];
  for (const e of period.events) {
    let state: Phase0ChildMembershipState | null = null;
    if (e.kind === 'enrolled') state = 'active';
    else if (e.kind === 'paused') state = 'paused';
    else if (e.kind === 'resumed') state = 'active';
    else if (e.kind === 'ended') state = 'ended';
    else if (e.kind === 'state_change') {
      const to = (e.details as { to?: Phase0ChildMembershipState } | null)?.to;
      if (to) state = to;
    }
    if (!state) continue;
    out.push({
      id: e.id,
      occurredAt: e.occurredAt,
      state,
      note:
        (e.details as { reason?: string } | null)?.reason ??
        (e.kind === 'enrolled' ? e.summary : null),
      actorEmail: e.actorEmail,
    });
  }
  return out.reverse();
}

/**
 * Synthesize a detail payload from a list-row in mock mode. When the row is
 * linked back to a `MOCK_PARENTS` entry (via `parentChildId`), guardian info,
 * notes, current subscription metadata, and `otherSubscriptions` are all
 * sourced from the parent table so the institution-side detail stays coherent
 * with what the simulator and inbox produced.
 */
function buildMockDetail(row: MockChildRow): Phase0ChildDetailDto {
  const link = row.parentChildId ? findMockParentChild(row.parentChildId) : null;
  const parent: MockParent | null = link?.parent ?? null;
  const parentChild: MockParentChild | null = link?.child ?? null;

  // The "current" period at this institution = the latest one (open or
  // ended). Re-enrolment creates a new period, so this naturally follows
  // the child as they progress through years/age groups.
  const latestHere = parentChild
    ? findLatestPeriod(parentChild, CURRENT_INSTITUTION.id)
    : null;

  const guardians = parent
    ? [
        {
          id: `guard_${row.id}_1`,
          displayName: parent.displayName,
          email: parent.email,
          phone: parent.phone,
          relationship: 'Parent',
        },
      ]
    : row.guardianNames.map((name, idx) => ({
        id: `guard_${row.id}_${idx + 1}`,
        displayName: name,
        email: idx === 0 ? `${slugifyName(name)}@example.com` : null,
        phone: idx === 0 ? '+27 11 555 0100' : null,
        relationship: idx === 0 ? 'Primary guardian' : 'Guardian',
      }));

  const otherSubscriptions = parentChild
    ? otherSubscriptionsFromParent(parentChild.id)
    : [];
  const subscriptionTimeline = parentChild ? lifetimeFromParent(parentChild) : [];
  const skillsFromTimeline = parentChild ? skillsFromParent(parentChild) : [];

  const currentSubscription: Phase0ChildSubscription = {
    id: latestHere?.id ?? `sub_${row.id}_${CURRENT_INSTITUTION.id}`,
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    state: row.membershipState,
    enrolledAt:
      latestHere?.enrolledAt ??
      (row.membershipState === 'pending' ? null : '2024-01-15'),
    classroom:
      latestHere?.classroom ??
      (row.membershipState === 'ended' ? null : 'Sunflowers (3-4 yrs)'),
    history: parentChild
      ? historyFromPeriod(latestHere)
      : synthHistory(row.id, row.membershipState),
  };

  return {
    id: row.id,
    displayName: row.displayName,
    dateOfBirth: row.dateOfBirth,
    notes: parentChild?.notes ?? null,
    parentChildId: parentChild?.id ?? null,
    parentId: parent?.id ?? null,
    parentDisplayName: parent?.displayName ?? null,
    guardians,
    currentSubscription,
    otherSubscriptions,
    skills: parentChild
      ? skillsFromTimeline
      : synthSkills(row.id, row.membershipState, otherSubscriptions),
    subscriptionTimeline,
  };
}

/**
 * Seed a small but plausible skills timeline. `pending` children have nothing
 * yet; `active` / `paused` / `ended` accumulate progressively. Every entry is
 * tagged with the institution that earned it: most live at the current
 * institution, with one or two at a sibling institution when the child has
 * cross-institution subscriptions, so the UI can demonstrate provenance.
 */
function synthSkills(
  childId: string,
  current: Phase0ChildMembershipState,
  others: Phase0ChildOtherSubscription[],
): Phase0ChildSkillEntry[] {
  if (current === 'pending') return [];
  const here = CURRENT_INSTITUTION;
  const sibling = others[0];
  const out: Phase0ChildSkillEntry[] = [
    {
      id: `skill_${childId}_1`,
      skillName: 'Recognises own name',
      programName: 'Sunflowers — Term 1 2024',
      occurredAt: '2024-02-20',
      institutionId: here.id,
      institutionName: here.name,
      instructorEmail: 'thandi@example.com',
      instructorName: 'Thandi Mokoena',
    },
    {
      id: `skill_${childId}_2`,
      skillName: 'Counts to 10 unaided',
      programName: 'Sunflowers — Term 2 2024',
      occurredAt: '2024-05-14',
      institutionId: here.id,
      institutionName: here.name,
      instructorEmail: 'thandi@example.com',
      instructorName: 'Thandi Mokoena',
    },
  ];
  if (sibling) {
    out.unshift({
      id: `skill_${childId}_sib_1`,
      skillName: skillForInstitution(sibling.institutionId),
      programName: programForInstitution(sibling.institutionId),
      occurredAt: '2024-06-22',
      institutionId: sibling.institutionId,
      institutionName: sibling.institutionName,
      instructorEmail: 'coach@example.com',
      instructorName: 'Coach',
    });
  }
  if (current === 'paused' || current === 'ended') {
    out.unshift({
      id: `skill_${childId}_3`,
      skillName: 'Tying shoelaces',
      programName: 'Daily Living Skills — Term 3 2024',
      occurredAt: '2024-09-02',
      institutionId: here.id,
      institutionName: here.name,
      instructorEmail: 'sipho@example.com',
      instructorName: 'Sipho Dlamini',
    });
  }
  if (current === 'ended') {
    out.unshift({
      id: `skill_${childId}_4`,
      skillName: 'Reads simple sentences',
      programName: 'Pre-Reading — Term 4 2024',
      occurredAt: '2024-11-18',
      institutionId: here.id,
      institutionName: here.name,
      instructorEmail: 'sipho@example.com',
      instructorName: 'Sipho Dlamini',
    });
  }
  return out;
}

function skillForInstitution(id: string): string {
  if (id === 'inst_aqua_stars') return 'Front crawl: 25m';
  if (id === 'inst_kintaro_karate') return 'White belt kata: Heian Shodan';
  if (id === 'inst_brushstrokes') return 'Mixes secondary colours';
  if (id === 'inst_sonata_music') return 'Plays C major scale';
  return 'Skill earned';
}

function programForInstitution(id: string): string {
  if (id === 'inst_aqua_stars') return 'Beginner Swim — Term 2 2024';
  if (id === 'inst_kintaro_karate') return 'Little Tigers — Term 2 2024';
  if (id === 'inst_brushstrokes') return 'Mini Makers — Term 2 2024';
  if (id === 'inst_sonata_music') return 'Tiny Strings — Term 2 2024';
  return 'Program — Term 2 2024';
}

function slugifyName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

function synthHistory(
  childId: string,
  current: Phase0ChildMembershipState,
): Phase0ChildMembershipEvent[] {
  const events: Phase0ChildMembershipEvent[] = [
    {
      id: `mh_${childId}_1`,
      occurredAt: '2024-01-15T08:00:00Z',
      state: 'pending',
      note: 'Application submitted by parent.',
      actorEmail: 'parent@example.com',
    },
  ];
  if (current !== 'pending') {
    events.unshift({
      id: `mh_${childId}_2`,
      occurredAt: '2024-01-22T09:30:00Z',
      state: 'active',
      note: 'Approved by admin.',
      actorEmail: 'admin@example.com',
    });
  }
  if (current === 'paused') {
    events.unshift({
      id: `mh_${childId}_3`,
      occurredAt: '2025-09-01T10:00:00Z',
      state: 'paused',
      note: 'Family relocated temporarily.',
      actorEmail: 'admin@example.com',
    });
  }
  if (current === 'ended') {
    events.unshift({
      id: `mh_${childId}_4`,
      occurredAt: '2025-12-15T15:00:00Z',
      state: 'ended',
      note: 'Graduated to primary school.',
      actorEmail: 'admin@example.com',
    });
  }
  return events;
}
