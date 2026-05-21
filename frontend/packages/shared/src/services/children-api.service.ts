import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0ChildDetailDto,
  Phase0ChildListResult,
  Phase0ChildMembershipState,
  Phase0CreateChildRequest,
  Phase0CreateChildResponse,
  Phase0ListChildrenQuery,
  Phase0LogChildSkillRequest,
  Phase0LogChildSkillResponse,
  Phase0PatchChildMembershipStateRequest,
} from '../core/contracts/children.phase0';

/**
 * HTTP client for institution-side child roster (Phase 0).
 * Use when `environment.useMock` is false.
 */
@Injectable({ providedIn: 'root' })
export class ChildrenApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  // Routes are mounted under /api/v1 by the API host; the BFFs forward the
  // path verbatim. See ChildrenEndpoints in Wayel.Api for the live shape.
  listChildren(query: Phase0ListChildrenQuery = {}): Observable<Phase0ChildListResult> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    if (query.membershipState) {
      params = params.set('membershipState', toWireMembershipState(query.membershipState));
    }
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null) params = params.set('pageSize', String(query.pageSize));
    return this.http
      .get<WireListChildrenResponse>(`${this.base()}/api/v1/children`, { params })
      .pipe(map(fromWireListResponse));
  }

  getChild(id: string): Observable<Phase0ChildDetailDto> {
    return this.http
      .get<WireChildDetail>(
        `${this.base()}/api/v1/children/${encodeURIComponent(id)}`,
      )
      .pipe(map(fromWireDetail));
  }

  createChild(body: Phase0CreateChildRequest): Observable<Phase0CreateChildResponse> {
    return this.http
      .post<WireCreateChildResponse>(`${this.base()}/api/v1/children`, {
        displayName: body.displayName,
        dateOfBirth: body.dateOfBirth,
        classroom: body.classroom ?? null,
        notes: body.notes ?? null,
        guardians: body.guardians.map((g) => ({
          displayName: g.displayName,
          email: g.email ?? null,
          phone: g.phone ?? null,
          relationship: g.relationship ?? null,
        })),
        initialMembershipState: body.initialMembershipState
          ? toWireMembershipState(body.initialMembershipState)
          : null,
      })
      .pipe(
        map((wire) => ({
          childId: wire.id,
          membershipState: fromWireMembershipState(wire.membershipState),
          institutionId: wire.institutionId,
          createdAt: wire.createdOnUtc,
        })),
      );
  }

  patchMembershipState(
    id: string,
    body: Phase0PatchChildMembershipStateRequest,
  ): Observable<void> {
    return this.http.patch<void>(
      `${this.base()}/api/v1/children/${encodeURIComponent(id)}/membership-state`,
      {
        state: toWireMembershipState(body.state),
        reason: body.reason ?? null,
      },
    );
  }

  logSkill(id: string, body: Phase0LogChildSkillRequest): Observable<Phase0LogChildSkillResponse> {
    // Skills aren't persisted in the Phase 0 backend slice yet — fall through
    // so the caller surfaces the 404 verbatim instead of pretending it worked.
    return this.http.post<Phase0LogChildSkillResponse>(
      `${this.base()}/api/v1/children/${encodeURIComponent(id)}/skills`,
      body,
    );
  }
}

// --- wire ↔ contract conversion ----------------------------------------------
//
// The C# API serialises enums as their literal PascalCase names (Pending,
// Active, Paused, Ended). The Phase 0 contract uses lowercase string unions
// to match the long-standing mock shape, so we translate at the seam to
// keep the rest of the SPA unchanged.

type WireMembershipState = 'Pending' | 'Active' | 'Paused' | 'Ended';

interface WireListChildrenResponse {
  items: ReadonlyArray<{
    id: string;
    displayName: string;
    dateOfBirth: string;
    guardianNames: string[];
    membershipState: WireMembershipState;
    otherSubscriptionsCount: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

interface WireChildDetail {
  id: string;
  displayName: string;
  dateOfBirth: string;
  notes: string | null;
  parentId: string | null;
  parentChildId: string | null;
  guardians: ReadonlyArray<{
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    relationship: string;
  }>;
  currentSubscription: {
    id: string;
    subscriptionPeriodId?: string | null;
    state: WireMembershipState;
    enrolledAt: string | null;
    classroom: string | null;
  };
  otherSubscriptions: ReadonlyArray<{
    id: string;
    institutionId: string;
    institutionName: string;
    state: WireMembershipState;
    enrolledAt: string | null;
  }>;
}

interface WireCreateChildResponse {
  id: string;
  membershipState: WireMembershipState;
  institutionId: string;
  createdOnUtc: string;
}

function fromWireListResponse(wire: WireListChildrenResponse): Phase0ChildListResult {
  return {
    items: wire.items.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      dateOfBirth: row.dateOfBirth,
      guardianNames: [...row.guardianNames],
      membershipState: fromWireMembershipState(row.membershipState),
      otherSubscriptionsCount: row.otherSubscriptionsCount,
    })),
    totalCount: wire.total,
    page: wire.page,
    pageSize: wire.pageSize,
  };
}

function fromWireDetail(wire: WireChildDetail): Phase0ChildDetailDto {
  return {
    id: wire.id,
    displayName: wire.displayName,
    dateOfBirth: wire.dateOfBirth,
    notes: wire.notes,
    parentId: wire.parentId,
    parentChildId: wire.parentChildId,
    parentDisplayName: null,
    guardians: wire.guardians.map((g) => ({
      id: g.id,
      displayName: g.displayName,
      email: g.email,
      phone: g.phone,
      relationship: g.relationship,
    })),
    currentSubscription: {
      id: wire.currentSubscription.id,
      subscriptionPeriodId: wire.currentSubscription.subscriptionPeriodId ?? null,
      // The current institution's name and id aren't on the wire detail
      // response yet — populated to a stable placeholder so the UI keeps
      // rendering. The full identity lands with the per-tenant lookup in
      // the next slice.
      institutionId: 'current',
      institutionName: 'Current institution',
      state: fromWireMembershipState(wire.currentSubscription.state),
      enrolledAt: wire.currentSubscription.enrolledAt,
      classroom: wire.currentSubscription.classroom,
      history: [],
    },
    otherSubscriptions: wire.otherSubscriptions.map((s) => ({
      id: s.id,
      institutionId: s.institutionId,
      institutionName: s.institutionName,
      state: fromWireMembershipState(s.state),
      enrolledAt: s.enrolledAt,
    })),
    skills: [],
    subscriptionTimeline: [],
  };
}

function fromWireMembershipState(value: WireMembershipState): Phase0ChildMembershipState {
  switch (value) {
    case 'Pending':
      return 'pending';
    case 'Active':
      return 'active';
    case 'Paused':
      return 'paused';
    case 'Ended':
      return 'ended';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown wire membership state "${exhaustive as string}".`);
    }
  }
}

function toWireMembershipState(value: Phase0ChildMembershipState): WireMembershipState {
  switch (value) {
    case 'pending':
      return 'Pending';
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'ended':
      return 'Ended';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown contract membership state "${exhaustive as string}".`);
    }
  }
}
