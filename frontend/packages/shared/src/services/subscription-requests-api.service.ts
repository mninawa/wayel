import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0ApproveSubscriptionRequestRequest,
  Phase0ApproveSubscriptionRequestResponse,
  Phase0CreateSubscriptionRequestRequest,
  Phase0CreateSubscriptionRequestResponse,
  Phase0ListSubscriptionRequestsQuery,
  Phase0RejectSubscriptionRequestRequest,
  Phase0SubscriptionRequestDto,
  Phase0SubscriptionRequestListResult,
  Phase0SubscriptionRequestStatus,
} from '../core/contracts/subscription-requests.phase0';

/**
 * HTTP client for institution-side subscription-request inbox (Phase 0).
 * Use when `environment.useMock` is false.
 *
 * Routes are mounted under /api/v1 by the API host; the BFFs forward the
 * path verbatim. See SubscriptionRequestsEndpoints in Wayel.Api for the
 * live shape.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionRequestsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  list(
    query: Phase0ListSubscriptionRequestsQuery = {},
  ): Observable<Phase0SubscriptionRequestListResult> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', toWireStatus(query.status));
    if (query.search) params = params.set('search', query.search);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null) params = params.set('pageSize', String(query.pageSize));
    return this.http
      .get<WireListResponse>(`${this.base()}/api/v1/subscription-requests`, { params })
      .pipe(map(fromWireListResponse));
  }

  /**
   * Parent-scoped listing — returns only requests submitted by the
   * currently signed-in parent across every institution they've reached
   * out to. Backed by `GET /api/v1/me/subscription-requests`, which the
   * server resolves from the JWT (no parent id on the wire).
   */
  listMine(
    query: Phase0ListSubscriptionRequestsQuery = {},
  ): Observable<Phase0SubscriptionRequestListResult> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', toWireStatus(query.status));
    if (query.search) params = params.set('search', query.search);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null) params = params.set('pageSize', String(query.pageSize));
    return this.http
      .get<WireListResponse>(`${this.base()}/api/v1/me/subscription-requests`, { params })
      .pipe(map(fromWireListResponse));
  }

  approve(
    id: string,
    body: Phase0ApproveSubscriptionRequestRequest,
    options: { tenantId?: string | null } = {},
  ): Observable<Phase0ApproveSubscriptionRequestResponse> {
    return this.http
      .post<WireApproveResponse>(
        `${this.base()}/api/v1/subscription-requests/${encodeURIComponent(id)}/approve${queryWithTenant(options.tenantId)}`,
        { classroom: body.classroom ?? null },
      )
      .pipe(
        map((wire) => ({
          childId: wire.childId,
          subscriptionId: wire.subscriptionId,
          approvedAt: wire.approvedAt,
        })),
      );
  }

  reject(
    id: string,
    body: Phase0RejectSubscriptionRequestRequest,
    options: { tenantId?: string | null } = {},
  ): Observable<void> {
    return this.http.post<void>(
      `${this.base()}/api/v1/subscription-requests/${encodeURIComponent(id)}/reject${queryWithTenant(options.tenantId)}`,
      { reason: body.reason },
    );
  }

  create(
    body: Phase0CreateSubscriptionRequestRequest,
  ): Observable<Phase0CreateSubscriptionRequestResponse> {
    // For parent-app submissions we let the server hydrate child/parent
    // display fields from the parent's roster (the backend looks them
    // up by ParentId/ParentChildId). The simulator UI keeps passing
    // them explicitly via `WireSubmitExtras` for staff demo flows.
    //
    // `requestedProgramId` and `requestedCadence` are Phase 1 additions
    // — the Approve handler uses them to mint a SubscriptionPeriod with
    // the right billing rhythm. Both are optional; the server falls
    // back to program defaults / Yearly when missing.
    const extras = body as WireSubmitExtras;
    return this.http
      .post<WireSubmitResponse>(`${this.base()}/api/v1/subscription-requests`, {
        institutionId: body.institutionId,
        parentId: body.parentId,
        parentChildId: body.parentChildId,
        childDisplayName: extras.childDisplayName ?? null,
        childDateOfBirth: extras.childDateOfBirth ?? null,
        parentEmail: extras.parentEmail ?? null,
        parentDisplayName: extras.parentDisplayName ?? null,
        message: body.message ?? null,
        classroomRequested: body.classroomRequested ?? null,
        requestedProgramId: body.requestedProgramId ?? null,
        requestedCadence: body.requestedCadence ?? null,
      })
      .pipe(
        map((wire) => ({
          requestId: wire.requestId,
          receivedAt: wire.receivedAt,
          institutionId: wire.institutionId,
          institutionName: wire.institutionName,
        })),
      );
  }
}

// --- wire ↔ contract conversion ----------------------------------------------
//
// The C# API serialises enums as their literal PascalCase names
// (Pending, Approved, Rejected). The Phase 0 contract uses lowercase
// string unions to match the long-standing mock shape, so we translate
// at the seam to keep the rest of the SPA unchanged.

type WireStatus = 'Pending' | 'Approved' | 'Rejected';

interface WireSummary {
  id: string;
  institutionId: string;
  institutionName: string;
  parentId: string;
  parentChildId: string;
  institutionChildId: string | null;
  childDisplayName: string;
  childDateOfBirth: string;
  parentEmail: string;
  parentDisplayName: string | null;
  message: string | null;
  classroomRequested: string | null;
  requestedProgramId?: string | null;
  requestedCadence?: string | null;
  requestedAt: string;
  status: WireStatus;
  resolvedChildId: string | null;
  rejectionReason: string | null;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  requiredDocuments?: WireRequiredDocuments | null;
}

interface WireRequiredDocuments {
  hasClinicCard?: boolean;
  hasBirthCertificate?: boolean;
  categoryCodesPresent?: ReadonlyArray<string> | null;
}

interface WireListResponse {
  items: ReadonlyArray<WireSummary>;
  total: number;
  page: number;
  pageSize: number;
  totalsByStatus?: Partial<Record<WireStatus, number>>;
}

interface WireApproveResponse {
  childId: string;
  subscriptionId: string;
  approvedAt: string;
}

interface WireSubmitResponse {
  requestId: string;
  receivedAt: string;
  institutionId: string;
  institutionName: string;
}

// Optional convenience fields the simulator UI passes alongside the
// canonical ids when it has them on hand. Kept off the public contract
// so the production parent app (which already knows the parent's roster)
// doesn't need to re-send them.
interface WireSubmitExtras {
  childDisplayName?: string;
  childDateOfBirth?: string;
  parentEmail?: string;
  parentDisplayName?: string | null;
}

function fromWireListResponse(wire: WireListResponse): Phase0SubscriptionRequestListResult {
  // Phase0PagedResult only requires items/totalCount/page/pageSize. We
  // attach the wire's totalsByStatus on a private property so the bridge
  // can hand it to the UI for the status-tab badges; the contract stays
  // unchanged so no other call sites have to learn about it.
  const result: Phase0SubscriptionRequestListResult & {
    totalsByStatus?: Record<Phase0SubscriptionRequestStatus, number>;
  } = {
    items: wire.items.map(fromWireSummary),
    totalCount: wire.total,
    page: wire.page,
    pageSize: wire.pageSize,
  };
  if (wire.totalsByStatus) {
    result.totalsByStatus = {
      pending: wire.totalsByStatus.Pending ?? 0,
      approved: wire.totalsByStatus.Approved ?? 0,
      rejected: wire.totalsByStatus.Rejected ?? 0,
    };
  }
  return result;
}

function fromWireSummary(wire: WireSummary): Phase0SubscriptionRequestDto {
  const requiredDocuments = wire.requiredDocuments
    ? {
        hasClinicCard: !!wire.requiredDocuments.hasClinicCard,
        hasBirthCertificate: !!wire.requiredDocuments.hasBirthCertificate,
        hasAll:
          !!wire.requiredDocuments.hasClinicCard &&
          !!wire.requiredDocuments.hasBirthCertificate,
        ...(wire.requiredDocuments.categoryCodesPresent != null &&
        wire.requiredDocuments.categoryCodesPresent.length > 0
          ? {
              categoryCodesPresent: wire.requiredDocuments.categoryCodesPresent.map((c) =>
                String(c).trim().toUpperCase(),
              ),
            }
          : {}),
      }
    : null;
  return {
    id: wire.id,
    institutionId: wire.institutionId,
    institutionName: wire.institutionName,
    parentId: wire.parentId,
    parentChildId: wire.parentChildId,
    institutionChildId: wire.institutionChildId,
    childDisplayName: wire.childDisplayName,
    childDateOfBirth: wire.childDateOfBirth,
    parentEmail: wire.parentEmail,
    parentDisplayName: wire.parentDisplayName,
    message: wire.message,
    classroomRequested: wire.classroomRequested,
    requestedAt: wire.requestedAt,
    status: fromWireStatus(wire.status),
    resolvedChildId: wire.resolvedChildId,
    rejectionReason: wire.rejectionReason,
    resolvedAt: wire.resolvedAt,
    resolvedByEmail: wire.resolvedByEmail,
    requiredDocuments,
  };
}

function fromWireStatus(value: WireStatus): Phase0SubscriptionRequestStatus {
  switch (value) {
    case 'Pending':
      return 'pending';
    case 'Approved':
      return 'approved';
    case 'Rejected':
      return 'rejected';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown wire subscription-request status "${exhaustive as string}".`);
    }
  }
}

function queryWithTenant(tenantId?: string | null): string {
  if (!tenantId) return '';
  const params = new URLSearchParams();
  params.set('tenantId', tenantId);
  return `?${params.toString()}`;
}

function toWireStatus(value: Phase0SubscriptionRequestStatus): WireStatus {
  switch (value) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown contract subscription-request status "${exhaustive as string}".`);
    }
  }
}
