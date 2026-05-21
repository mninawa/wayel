import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@app/environment';
import type {
  Phase0ApproveSubscriptionRequestRequest,
  Phase0ApproveSubscriptionRequestResponse,
  Phase0CreateSubscriptionRequestRequest,
  Phase0CreateSubscriptionRequestResponse,
  Phase0ListSubscriptionRequestsQuery,
  Phase0RejectSubscriptionRequestRequest,
  Phase0SubscriptionRequestDto,
  Phase0SubscriptionRequestStatus,
} from '../core/contracts/subscription-requests.phase0';
import {
  appendPeriodEvent,
  findLatestPeriod,
  findMockParentChild,
  findOpenPeriod,
  nextMockEventId,
  nextMockSubscriptionPeriodId,
  type MockParentChildSubscription,
  type MockParentChildSubscriptionEvent,
} from '../core/mock/mock-parents';
import { MOCK_CHILDREN, type MockChildRow } from '../core/mock/mock-data';
import {
  MOCK_INSTITUTIONS,
  type MockInstitution,
  type MockInstitutionCategory,
} from '../core/mock/mock-institutions';
import { ChildrenBridgeService } from './children-bridge.service';
import {
  InstitutionsApiService,
  projectCategory,
  type WirePublicInstitutionEntry,
} from './institutions-api.service';
import { SubscriptionRequestsApiService } from './subscription-requests-api.service';

/**
 * Public-facing directory entry for the parent subscribe page.
 *
 * This is the rich shape the parent app renders as cards (logo, area,
 * monthly fee, blurb, etc.) — separate from the lean `{ id, name }` we
 * use to back `<select>` lists and resolve institution IDs internally.
 */
export interface InstitutionDirectoryEntry {
  id: string;
  /**
   * Tenant slug — the public identifier used by `/api/v1/tenants/{slug}/...`
   * routes. Always present on live entries; mock entries reuse the
   * institution id since the catalogue table doesn't carry a separate
   * slug.
   */
  slug: string;
  name: string;
  kind: 'daycare' | 'session';
  category: MockInstitutionCategory;
  area: string;
  city: string;
  tagline: string;
  description: string;
  monthlyFeeZar: number | null;
  ageRangeYears: { min: number; max: number };
  accentColor: string;
  imageUrl: string | null;
  website?: string;
  /**
   * Institution's annual subscription open/close envelope (already
   * resolved against the platform default). Drives the "closed for
   * the school break" banner on parent-facing surfaces. Optional on
   * the type for back-compat with mock entries that pre-date the
   * field — `undefined` is treated as the platform default.
   */
  subscriptionWindow?: {
    openMonth: number;
    openDay: number;
    closeMonth: number;
    closeDay: number;
    isCustom: boolean;
  };
  /**
   * Documents this institution requires on every subscribed child's
   * vault. Already resolved against the platform DOCUMENT_CATEGORY
   * catalogue server-side so each entry carries a friendly
   * `displayName` and (optionally) the tenant-authored `customHint`
   * shown beneath the upload tile in the subscribe drawer. Optional
   * on the type for back-compat with mock entries; `undefined` and
   * `[]` both mean "no extras beyond the platform baseline".
   */
  requiredDocuments?: ReadonlyArray<{
    categoryCode: string;
    displayName: string;
    description: string | null;
    customHint: string | null;
  }>;
}

/** Query for `listInstitutionDirectoryPaged()`. */
export interface InstitutionDirectoryQuery {
  search?: string;
  category?: MockInstitutionCategory | 'all';
  kind?: 'daycare' | 'session' | 'all';
  city?: string | 'all';
  page?: number;
  pageSize?: number;
}

/** Paged response for the directory. */
export interface InstitutionDirectoryResult {
  items: InstitutionDirectoryEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  /** Counts per category across the full (unfiltered) directory. */
  totalsByCategory: Record<MockInstitutionCategory, number>;
  /** Distinct cities, sorted alphabetically. */
  cities: string[];
}

/** Paged result mirroring `Phase0SubscriptionRequestListResult`. */
export interface SubscriptionRequestListResult {
  items: Phase0SubscriptionRequestDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  /**
   * Counts per status across the *unfiltered* dataset, useful for tab labels.
   * Optional so live mode can omit it without breaking the UI.
   */
  totalsByStatus?: Record<Phase0SubscriptionRequestStatus, number>;
}

/**
 * Seed the mock inbox. Each row points back to a parent + parent-child in
 * `MOCK_PARENTS`, mirroring the live shape (denormalized child/parent display
 * fields are snapshots, not the source of truth).
 */
function seedMockRequests(
  institutionId: string,
  institutionName: string,
): Phase0SubscriptionRequestDto[] {
  return [
    {
      id: 'sr_001',
      institutionId,
      institutionName,
      parentId: 'parent_priya',
      parentChildId: 'pchild_zara',
      institutionChildId: 'child_003',
      childDisplayName: 'Zara Naidoo',
      childDateOfBirth: '2022-01-20',
      parentEmail: 'priya.naidoo@example.com',
      parentDisplayName: 'Priya Naidoo',
      message: 'Zara is a quiet, gentle child — first time in any program.',
      classroomRequested: 'Sunflowers (3-4 yrs)',
      requestedProgramId: null,
      requestedCadence: 'yearly',
      requestedAt: '2026-04-16T09:15:00Z',
      status: 'pending',
      resolvedChildId: null,
      rejectionReason: null,
      resolvedAt: null,
      resolvedByEmail: null,
    },
    {
      id: 'sr_002',
      institutionId,
      institutionName,
      parentId: 'parent_ada',
      parentChildId: 'pchild_jamal',
      institutionChildId: null,
      childDisplayName: 'Jamal Okonkwo',
      childDateOfBirth: '2020-11-22',
      parentEmail: 'ada.okonkwo@example.com',
      parentDisplayName: 'Ada Okonkwo',
      message: null,
      classroomRequested: null,
      requestedProgramId: null,
      requestedCadence: null,
      requestedAt: '2026-04-15T14:40:00Z',
      status: 'pending',
      resolvedChildId: null,
      rejectionReason: null,
      resolvedAt: null,
      resolvedByEmail: null,
    },
    {
      id: 'sr_003',
      institutionId,
      institutionName,
      parentId: 'parent_mei',
      parentChildId: 'pchild_liam',
      institutionChildId: 'child_002',
      childDisplayName: 'Liam Chen',
      childDateOfBirth: '2020-11-02',
      parentEmail: 'mei.chen@example.com',
      parentDisplayName: 'Mei Chen',
      message: 'Currently at Sonata Music too — he loves music days.',
      classroomRequested: 'Sunflowers (3-4 yrs)',
      requestedProgramId: null,
      requestedCadence: 'termly',
      requestedAt: '2026-04-12T07:20:00Z',
      status: 'approved',
      resolvedChildId: 'child_002',
      rejectionReason: null,
      resolvedAt: '2026-04-12T08:05:00Z',
      resolvedByEmail: 'admin@littlestars.edu',
    },
  ];
}

function applyFilter(
  rows: Phase0SubscriptionRequestDto[],
  q: Phase0ListSubscriptionRequestsQuery,
): Phase0SubscriptionRequestDto[] {
  let out = rows;
  if (q.status) out = out.filter((r) => r.status === q.status);
  const s = q.search?.trim().toLowerCase();
  if (s) {
    out = out.filter((r) =>
      `${r.childDisplayName} ${r.parentEmail} ${r.parentDisplayName ?? ''}`
        .toLowerCase()
        .includes(s),
    );
  }
  return out;
}

/**
 * Switches between in-memory mocks and `SubscriptionRequestsApiService` based
 * on `environment.useMock`. The mock paths read parent + child identities from
 * `MOCK_PARENTS` so the simulator and inbox always agree on who the child is.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionRequestsBridgeService {
  private readonly api = inject(SubscriptionRequestsApiService);
  private readonly institutions = inject(InstitutionsApiService);
  private readonly children = inject(ChildrenBridgeService);

  private readonly mockRows: Phase0SubscriptionRequestDto[] = seedMockRequests(
    this.children.currentInstitution.id,
    this.children.currentInstitution.name,
  );

  /** Subtitle line for the page. */
  readonly dataSourceLine: string = environment.useMock
    ? `In-memory mock — viewing as ${this.children.currentInstitution.name}.`
    : environment.platformApiUrl
      ? `Backed by ${environment.platformApiUrl}.`
      : 'Live API (same origin).';

  /**
   * Lean `{ id, name }` directory used by `<select>`-style pickers.
   *
   * Sources from `MOCK_INSTITUTIONS` so the parent app and staff app agree
   * on the same set; live mode will eventually call a directory endpoint.
   */
  listInstitutionDirectory(): Observable<
    Array<{ id: string; name: string }>
  > {
    if (environment.useMock) {
      return of(MOCK_INSTITUTIONS.map((i) => ({ id: i.id, name: i.name })));
    }
    return this.institutions
      .directory({ pageSize: 200 })
      .pipe(
        map((r) => r.items.map((i) => ({ id: i.id, name: i.name }))),
      );
  }

  /**
   * Rich, paginated directory for the parent subscribe catalogue.
   *
   * Filters (search / category / kind / city) are applied client-side in
   * mock mode; counts per category are computed across the *unfiltered*
   * dataset so chip badges stay stable as filters change.
   */
  listInstitutionDirectoryPaged(
    query: InstitutionDirectoryQuery = {},
  ): Observable<InstitutionDirectoryResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 6;

    if (environment.useMock) {
      const all = MOCK_INSTITUTIONS.map(toDirectoryEntry);
      const totalsByCategory = computeCategoryTotals(all);
      const cities = Array.from(new Set(all.map((i) => i.city))).sort();
      const filtered = filterDirectory(all, query);
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      return of({
        items,
        totalCount: filtered.length,
        page,
        pageSize,
        totalsByCategory,
        cities,
      });
    }

    return this.institutions
      .directory({
        search: query.search,
        category:
          query.category && query.category !== 'all' ? query.category : undefined,
        kind:
          query.kind === 'daycare'
            ? 'Daycare'
            : query.kind === 'session'
              ? 'Session'
              : undefined,
        city: query.city && query.city !== 'all' ? query.city : undefined,
        page,
        pageSize,
      })
      .pipe(
        map((wire) => ({
          items: wire.items.map(wireToDirectoryEntry),
          totalCount: wire.total,
          page: wire.page,
          pageSize: wire.pageSize,
          // The wire returns counts keyed by lowercased free-text category;
          // map back into the SPA's static union so chip totals render
          // without the UI having to learn about server-side taxonomy drift.
          totalsByCategory: projectCategoryTotals(wire.totalsByCategory),
          cities: [...wire.cities],
        })),
      );
  }

  /**
   * The signed-in parent's view of their own subscription requests across all
   * institutions and children. Mock mode pulls from `mockRows` (which we
   * synthesize per-institution above) and from any sibling-targeted requests
   * the parent has filed via `create()`. Live mode would call a parent-scoped
   * endpoint; for now we approximate with `list({ })` filtered client-side.
   */
  listMyRequests(parentId: string): Observable<Phase0SubscriptionRequestDto[]> {
    if (environment.useMock) {
      return of(this.mockRows.filter((r) => r.parentId === parentId));
    }
    // Live mode: the parent identity comes from the JWT, so the parentId
    // arg is informational only. Use the /me endpoint so we don't leak
    // other parents' requests through the staff-scoped /list surface.
    return this.api
      .listMine({ pageSize: 100 })
      .pipe(map((r) => r.items));
  }

  list(
    query: Phase0ListSubscriptionRequestsQuery = {},
  ): Observable<SubscriptionRequestListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q: Phase0ListSubscriptionRequestsQuery = { ...query, page, pageSize };

    if (environment.useMock) {
      // Staff inbox is always scoped to the current institution — sibling
      // requests live in the same `mockRows` array (so the parent can see
      // them in `listMyRequests`) but never leak into another inbox.
      const scoped = this.mockRows.filter(
        (r) => r.institutionId === this.children.currentInstitution.id,
      );
      const filtered = applyFilter([...scoped], q);
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      const totalsByStatus = computeTotals(scoped);
      return of({
        items,
        totalCount: filtered.length,
        page,
        pageSize,
        totalsByStatus,
      });
    }

    return this.api.list(q).pipe(
      map((r) => {
        // The API attaches totalsByStatus on the response object as an
        // extra field so the staff inbox tabs render correct badges in
        // live mode. We read it through a minimal cast and only forward
        // when present so the public contract shape stays unchanged.
        const totalsByStatus = (
          r as { totalsByStatus?: Record<Phase0SubscriptionRequestStatus, number> }
        ).totalsByStatus;
        return {
          items: r.items,
          totalCount: r.totalCount,
          page: r.page,
          pageSize: r.pageSize,
          ...(totalsByStatus ? { totalsByStatus } : {}),
        } satisfies SubscriptionRequestListResult;
      }),
    );
  }

  approve(
    id: string,
    body: Phase0ApproveSubscriptionRequestRequest,
    options: { tenantId?: string | null } = {},
  ): Observable<Phase0ApproveSubscriptionRequestResponse> {
    if (environment.useMock) {
      const idx = this.mockRows.findIndex((r) => r.id === id);
      if (idx < 0)
        return throwError(() => new Error(`No request with id "${id}".`));
      const req = this.mockRows[idx];
      if (req.status !== 'pending')
        return throwError(
          () => new Error(`Request "${id}" is already ${req.status}.`),
        );

      const link = findMockParentChild(req.parentChildId);
      if (!link)
        return throwError(
          () =>
            new Error(
              `Parent-child "${req.parentChildId}" missing from mock store.`,
            ),
        );
      const { parent, child: parentChild } = link;
      const classroom = body.classroom?.trim() || req.classroomRequested || null;
      const approvedAt = new Date().toISOString();
      // Use the request's own institutionId so admin operators viewing any
      // tenant's workspace can approve from outside the staff session's
      // `currentInstitution`. (Parent self-service still posts to the same
      // institution they target, so this stays correct for staff flows too.)
      const institutionId = req.institutionId;

      // Approving against the canonical timeline:
      //   - If there's already an open period (e.g. a `pending` one created
      //     by the parent submission), flip it `active` and append an
      //     `enrolled` event.
      //   - If the prior period at this institution is `ended`, open a NEW
      //     period — we never resurrect ended ones, so the prior period's
      //     events stay sealed and archivable to the parent.
      const open = findOpenPeriod(parentChild, institutionId);
      const latest = findLatestPeriod(parentChild, institutionId);

      let childId =
        req.institutionChildId ||
        open?.institutionChildId ||
        latest?.institutionChildId ||
        '';
      if (!childId) {
        childId = `child_${Math.random().toString(36).slice(2, 10)}`;
      }

      const enrolledEvent: MockParentChildSubscriptionEvent = {
        id: nextMockEventId('enrolled'),
        occurredAt: approvedAt,
        kind: 'enrolled',
        summary: 'Subscription approved by staff.',
        details: { classroom, requestId: req.id },
        actorEmail: 'admin@example.com',
        actorName: null,
      };

      if (open) {
        open.state = 'active';
        open.enrolledAt = approvedAt.slice(0, 10);
        open.classroom = classroom;
        open.institutionChildId = childId;
        appendPeriodEvent(open, enrolledEvent);
      } else {
        const newPeriod: MockParentChildSubscription = {
          id: nextMockSubscriptionPeriodId('approve'),
          institutionId,
          institutionChildId: childId,
          state: 'active',
          enrolledAt: approvedAt.slice(0, 10),
          endedAt: null,
          endedReason: null,
          archivedAt: null,
          classroom,
          events: [enrolledEvent],
        };
        parentChild.subscriptions.push(newPeriod);
      }

      const existingRow = MOCK_CHILDREN.find((c) => c.id === childId);
      if (existingRow) {
        existingRow.membershipState = 'active';
        existingRow.parentId = parent.id;
        existingRow.parentChildId = parentChild.id;
      } else {
        const row: MockChildRow = {
          id: childId,
          displayName: parentChild.displayName,
          dateOfBirth: parentChild.dateOfBirth,
          guardianNames: [parent.displayName],
          membershipState: 'active',
          parentId: parent.id,
          parentChildId: parentChild.id,
        };
        MOCK_CHILDREN.push(row);
      }

      this.children.invalidateChildDetailCache(childId);

      this.mockRows[idx] = {
        ...req,
        status: 'approved',
        institutionChildId: childId,
        resolvedChildId: childId,
        resolvedAt: approvedAt,
        resolvedByEmail: 'admin@example.com',
      };
      return of({
        childId,
        subscriptionId: `sub_${childId}_${institutionId}`,
        approvedAt,
      });
    }
    return this.api.approve(id, body, options);
  }

  /**
   * Tenant-scoped variant of {@link list} for callers that aren't bound to
   * the staff session's `currentInstitution` — e.g. the REMOVED
   * workspace, which can be navigated to *any* tenant.
   */
  listForInstitution(
    institutionId: string,
    query: Phase0ListSubscriptionRequestsQuery = {},
  ): Observable<SubscriptionRequestListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q: Phase0ListSubscriptionRequestsQuery = { ...query, page, pageSize };

    if (environment.useMock) {
      const scoped = this.mockRows.filter((r) => r.institutionId === institutionId);
      const filtered = applyFilter([...scoped], q);
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      const totalsByStatus = computeTotals(scoped);
      return of({
        items,
        totalCount: filtered.length,
        page,
        pageSize,
        totalsByStatus,
      });
    }

    // Live mode: use the standard list endpoint. The server already scopes
    // requests to the session's institution, so this is currently best-effort
    // for cross-tenant admin views (the platform-admin endpoint will replace
    // it once the contract lands).
    return this.api.list(q).pipe(
      map((r) => ({
        items: r.items.filter((x) => x.institutionId === institutionId),
        totalCount: r.totalCount,
        page: r.page,
        pageSize: r.pageSize,
      })),
    );
  }

  /**
   * Stand-in for the parent app's `POST /api/subscription-requests`.
   *
   * Mock: looks up the parent + parent-child by id, fills denormalized fields
   * from the parent record, validates that no active subscription already
   * exists at the chosen institution, and pushes the new request onto our
   * inbox if it's targeted at the current institution. Sibling-targeted
   * requests succeed (the request is "delivered") but don't appear in our
   * inbox — staff can only see their own institution's queue.
   */
  create(
    body: Phase0CreateSubscriptionRequestRequest,
  ): Observable<Phase0CreateSubscriptionRequestResponse> {
    if (environment.useMock) {
      const target = this.resolveInstitution(body.institutionId);
      if (!target)
        return throwError(
          () => new Error(`Unknown institutionId "${body.institutionId}".`),
        );
      const link = findMockParentChild(body.parentChildId);
      if (!link)
        return throwError(
          () =>
            new Error(
              `Unknown parentChildId "${body.parentChildId}" — onboard the child first.`,
            ),
        );
      const { parent, child: parentChild } = link;
      if (parent.id !== body.parentId)
        return throwError(
          () =>
            new Error(
              `parentChildId "${body.parentChildId}" does not belong to parent "${body.parentId}".`,
            ),
        );
      // Re-subscription after an `ended` period is allowed (and intended) —
      // it'll create a brand-new period on approval. Only an *open* period
      // (pending / active / paused) blocks a new request.
      const open = findOpenPeriod(parentChild, target.id);
      if (open) {
        return throwError(
          () =>
            new Error(
              `${parentChild.displayName} already has a ${open.state} subscription at ${target.name}.`,
            ),
        );
      }
      const latest = findLatestPeriod(parentChild, target.id);

      const requestId = `sr_${Math.random().toString(36).slice(2, 10)}`;
      const receivedAt = new Date().toISOString();
      // Always record the request in `mockRows` so the parent can see it in
      // their own "my subscriptions" view; the staff `list()` re-filters by
      // current institution so sibling requests stay invisible to staff.
      this.mockRows.unshift({
        id: requestId,
        institutionId: target.id,
        institutionName: target.name,
        parentId: parent.id,
        parentChildId: parentChild.id,
        institutionChildId: latest?.institutionChildId ?? null,
        childDisplayName: parentChild.displayName,
        childDateOfBirth: parentChild.dateOfBirth,
        parentEmail: parent.email,
        parentDisplayName: parent.displayName,
        message: body.message?.trim() || null,
        classroomRequested: body.classroomRequested?.trim() || null,
        requestedProgramId: body.requestedProgramId?.trim() || null,
        requestedCadence: body.requestedCadence ?? null,
        requestedAt: receivedAt,
        status: 'pending',
        resolvedChildId: null,
        rejectionReason: null,
        resolvedAt: null,
        resolvedByEmail: null,
      });
      return of({
        requestId,
        receivedAt,
        institutionId: target.id,
        institutionName: target.name,
      });
    }
    return this.api.create(body);
  }

  private resolveInstitution(id: string): { id: string; name: string } | null {
    if (id === this.children.currentInstitution.id)
      return this.children.currentInstitution;
    const sibling = this.children.siblingInstitutions.find((i) => i.id === id);
    if (sibling) return sibling;
    const dir = MOCK_INSTITUTIONS.find((i) => i.id === id);
    return dir ? { id: dir.id, name: dir.name } : null;
  }

  reject(
    id: string,
    body: Phase0RejectSubscriptionRequestRequest,
    options: { tenantId?: string | null } = {},
  ): Observable<void> {
    if (environment.useMock) {
      const reason = body.reason?.trim();
      if (!reason)
        return throwError(() => new Error('A rejection reason is required.'));
      const idx = this.mockRows.findIndex((r) => r.id === id);
      if (idx < 0)
        return throwError(() => new Error(`No request with id "${id}".`));
      const req = this.mockRows[idx];
      if (req.status !== 'pending')
        return throwError(
          () => new Error(`Request "${id}" is already ${req.status}.`),
        );
      this.mockRows[idx] = {
        ...req,
        status: 'rejected',
        rejectionReason: reason,
        resolvedAt: new Date().toISOString(),
        resolvedByEmail: 'admin@example.com',
      };
      return of(void 0);
    }
    return this.api.reject(id, body, options);
  }
}

function computeTotals(
  rows: Phase0SubscriptionRequestDto[],
): Record<Phase0SubscriptionRequestStatus, number> {
  const out: Record<Phase0SubscriptionRequestStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const r of rows) out[r.status]++;
  return out;
}

function toDirectoryEntry(i: MockInstitution): InstitutionDirectoryEntry {
  return {
    id: i.id,
    // Mock institutions don't carry a slug; reuse the id so the contract
    // shape stays uniform. The mock subscribe drawer never calls the
    // live `/tenants/{slug}/programs` endpoint anyway — it falls back to
    // `listProgramsForInstitution(id)` against MOCK_PROGRAMS.
    slug: i.id,
    name: i.name,
    kind: i.kind,
    category: i.category,
    area: i.area,
    city: i.city,
    tagline: i.tagline,
    description: i.description,
    monthlyFeeZar: i.monthlyFeeZar,
    ageRangeYears: i.ageRangeYears,
    accentColor: i.accentColor,
    imageUrl: i.imageUrl,
    website: i.website,
  };
}

function computeCategoryTotals(
  entries: InstitutionDirectoryEntry[],
): Record<MockInstitutionCategory, number> {
  const out: Record<MockInstitutionCategory, number> = {
    daycare: 0,
    preschool: 0,
    aftercare: 0,
    swim: 0,
    music: 0,
    art: 0,
    martial_arts: 0,
    dance: 0,
    sports: 0,
    robotics: 0,
    language: 0,
  };
  for (const e of entries) out[e.category]++;
  return out;
}

function wireToDirectoryEntry(
  wire: WirePublicInstitutionEntry,
): InstitutionDirectoryEntry {
  return {
    id: wire.id,
    slug: wire.slug,
    name: wire.name,
    kind: wire.kind === 'Daycare' ? 'daycare' : 'session',
    category: projectCategory(wire.category),
    area: wire.area ?? '',
    city: wire.city ?? '',
    tagline: wire.tagline ?? '',
    description: wire.description ?? '',
    monthlyFeeZar: wire.monthlyFeeZar,
    ageRangeYears: {
      min: wire.ageMinYears ?? 0,
      max: wire.ageMaxYears ?? 18,
    },
    accentColor: wire.accentColor ?? '#1d4ed8',
    imageUrl: wire.imageUrl,
    ...(wire.website ? { website: wire.website } : {}),
    ...(wire.subscriptionWindow
      ? {
          subscriptionWindow: {
            openMonth: wire.subscriptionWindow.openMonth,
            openDay: wire.subscriptionWindow.openDay,
            closeMonth: wire.subscriptionWindow.closeMonth,
            closeDay: wire.subscriptionWindow.closeDay,
            isCustom: wire.subscriptionWindow.isCustom,
          },
        }
      : {}),
    ...(wire.requiredDocuments
      ? {
          requiredDocuments: wire.requiredDocuments.map((d) => ({
            categoryCode: d.categoryCode,
            displayName: d.displayName,
            description: d.description ?? null,
            customHint: d.customHint ?? null,
          })),
        }
      : {}),
  };
}

function projectCategoryTotals(
  wire: Record<string, number>,
): Record<MockInstitutionCategory, number> {
  const out: Record<MockInstitutionCategory, number> = {
    daycare: 0,
    preschool: 0,
    aftercare: 0,
    swim: 0,
    music: 0,
    art: 0,
    martial_arts: 0,
    dance: 0,
    sports: 0,
    robotics: 0,
    language: 0,
  };
  for (const [k, v] of Object.entries(wire)) {
    const cat = projectCategory(k);
    out[cat] += v;
  }
  return out;
}

function filterDirectory(
  rows: InstitutionDirectoryEntry[],
  q: InstitutionDirectoryQuery,
): InstitutionDirectoryEntry[] {
  let out = rows;
  if (q.category && q.category !== 'all') {
    out = out.filter((r) => r.category === q.category);
  }
  if (q.kind && q.kind !== 'all') {
    out = out.filter((r) => r.kind === q.kind);
  }
  if (q.city && q.city !== 'all') {
    out = out.filter((r) => r.city === q.city);
  }
  const s = q.search?.trim().toLowerCase();
  if (s) {
    out = out.filter((r) =>
      `${r.name} ${r.tagline} ${r.description} ${r.area} ${r.city} ${r.category}`
        .toLowerCase()
        .includes(s),
    );
  }
  return out;
}
