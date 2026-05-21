import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0AcceptStaffInvitationRequest,
  Phase0AcceptStaffInvitationResponse,
  Phase0CreateStaffInvitationRequest,
  Phase0CreateStaffInvitationResponse,
  Phase0InvitationChannel,
  Phase0ListStaffInvitationsQuery,
  Phase0ResendStaffInvitationRequest,
  Phase0ResendStaffInvitationResponse,
  Phase0RevokeStaffInvitationRequest,
  Phase0StaffInvitationDto,
  Phase0StaffInvitationListResult,
  Phase0StaffInvitationLookupDto,
  Phase0StaffInvitationStatus,
} from '../core/contracts/staff-invitations.phase0';

/**
 * HTTP client for the institution-side staff invitation surface (Phase 0).
 *
 * Routes are mounted under `/api/v1/staff-invitations` by Wayel.Api. The
 * legacy `accept-invite?token=...` flow has been retired in favour of the
 * SSO-bound `/invitations/accept` page (see `BffSsoAdmissionPolicy` in
 * Wayel.Bff.Shared) — the lookup-by-token methods on this service are
 * preserved only so the mock bridge keeps working.
 */
@Injectable({ providedIn: 'root' })
export class StaffInvitationsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  list(
    query: Phase0ListStaffInvitationsQuery = {},
  ): Observable<Phase0StaffInvitationListResult> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', toWireStatus(query.status));
    return this.http
      .get<ReadonlyArray<WireStaffInvitation>>(
        `${this.base()}/api/v1/staff-invitations`,
        { params },
      )
      .pipe(
        map((rows) => {
          // Backend returns the unpaged array today. Apply search +
          // client-side paging here so the SPA's paged contract keeps
          // working until the server gains a paged listing.
          let items = rows.map(fromWireInvitation);
          const s = query.search?.trim().toLowerCase();
          if (s) {
            items = items.filter((r) =>
              `${r.email} ${r.role}`.toLowerCase().includes(s),
            );
          }
          const totalsByStatus = computeTotals(rows);
          const page = query.page ?? 1;
          const pageSize = query.pageSize ?? (items.length || 20);
          const start = (page - 1) * pageSize;
          const sliced = items.slice(start, start + pageSize);
          return {
            items: sliced,
            totalCount: items.length,
            page,
            pageSize,
            totalsByStatus,
          } satisfies Phase0StaffInvitationListResult;
        }),
      );
  }

  create(
    body: Phase0CreateStaffInvitationRequest,
  ): Observable<Phase0CreateStaffInvitationResponse> {
    const channel = (body.sendVia ?? 'email') as Phase0InvitationChannel;
    return this.http
      .post<WireCreateInvitationResponse>(
        `${this.base()}/api/v1/staff-invitations`,
        {
          email: body.email,
          role: body.role,
          channel: toWireChannel(channel),
          phone: body.phone ?? null,
          // The backend command optionally takes a message; we don't
          // surface it on the contract yet.
          message: null,
        },
      )
      .pipe(
        map((wire) => ({
          invitation: synthesiseInvitationFromCreate(wire, body, channel),
        })),
      );
  }

  resend(
    id: string,
    _body: Phase0ResendStaffInvitationRequest = {},
  ): Observable<Phase0ResendStaffInvitationResponse> {
    return this.http
      .post<WireResendInvitationResponse>(
        `${this.base()}/api/v1/staff-invitations/${encodeURIComponent(id)}/resend`,
        {},
      )
      .pipe(
        map((wire) => ({
          resentAt: new Date().toISOString(),
          expiresAt: wire.expiresOnUtc,
          via: 'email' as const,
        })),
      );
  }

  revoke(id: string, body: Phase0RevokeStaffInvitationRequest): Observable<void> {
    return this.http.post<void>(
      `${this.base()}/api/v1/staff-invitations/${encodeURIComponent(id)}/revoke`,
      // Backend command currently doesn't take a reason in the body
      // (it's captured by the audit log entry instead). Forward it as
      // a header-friendly metadata field so we don't drop the value.
      { reason: body.reason },
    );
  }

  /**
   * Legacy: opaque-token lookup. The Phase 1+ accept flow runs through
   * the BFF (`/auth/sso/google?invitation=<token>`) so this is mock-only;
   * called against the live backend it surfaces an error rather than a
   * silent 404.
   */
  lookupByToken(_token: string): Observable<Phase0StaffInvitationLookupDto> {
    return throwError(
      () =>
        new Error(
          'Token-based invitation lookup is not supported by the live API; ' +
            'use the /invitations/accept SSO flow instead.',
        ),
    );
  }

  /** Legacy mock-only — see {@link lookupByToken}. */
  acceptByToken(
    _token: string,
    _body: Phase0AcceptStaffInvitationRequest,
  ): Observable<Phase0AcceptStaffInvitationResponse> {
    return throwError(
      () =>
        new Error(
          'Token-based invitation acceptance is not supported by the live API; ' +
            'use the /invitations/accept SSO flow instead.',
        ),
    );
  }
}

// --- wire ↔ contract conversion ----------------------------------------------

type WireStatus = 'Pending' | 'Accepted' | 'Expired' | 'Revoked';
type WireChannel = 'Email' | 'Whatsapp' | 'Both';

interface WireStaffInvitation {
  id: string;
  email: string;
  role: string;
  channel: WireChannel;
  phone: string | null;
  status: WireStatus;
  createdOnUtc: string;
  expiresOnUtc: string;
  acceptedOnUtc: string | null;
  revokedOnUtc: string | null;
  resendCount: number;
}

interface WireCreateInvitationResponse {
  invitationId: string;
  email: string;
  role: string;
  channel: WireChannel;
  expiresOnUtc: string;
  token: string;
  acceptUrl: string | null;
}

interface WireResendInvitationResponse {
  token: string;
  expiresOnUtc: string;
  acceptUrl: string | null;
}

function fromWireInvitation(
  wire: WireStaffInvitation,
): Phase0StaffInvitationDto {
  return {
    id: wire.id,
    // The backend list endpoint omits institution + inviter fields today;
    // synthesise them as empty so the SPA's table cells stay safe to render.
    institutionId: '',
    institutionName: '',
    email: wire.email,
    phone: wire.phone,
    role: wire.role,
    invitedAt: wire.createdOnUtc,
    invitedByEmail: '',
    expiresAt: wire.expiresOnUtc,
    status: fromWireStatus(wire.status),
    lastResentAt: wire.resendCount > 0 ? wire.createdOnUtc : null,
    lastSentVia: fromWireChannel(wire.channel),
    acceptedAt: wire.acceptedOnUtc,
    acceptedByName: null,
    revokedAt: wire.revokedOnUtc,
    revokedReason: null,
    acceptUrl: '',
  };
}

function synthesiseInvitationFromCreate(
  wire: WireCreateInvitationResponse,
  body: Phase0CreateStaffInvitationRequest,
  channel: Phase0InvitationChannel,
): Phase0StaffInvitationDto {
  const now = new Date().toISOString();
  return {
    id: wire.invitationId,
    institutionId: '',
    institutionName: '',
    email: wire.email,
    phone: body.phone ?? null,
    role: wire.role,
    invitedAt: now,
    invitedByEmail: '',
    expiresAt: wire.expiresOnUtc,
    status: 'pending',
    lastResentAt: null,
    lastSentVia: channel,
    acceptedAt: null,
    acceptedByName: null,
    revokedAt: null,
    revokedReason: null,
    acceptUrl: wire.acceptUrl ?? '',
  };
}

function fromWireStatus(value: WireStatus): Phase0StaffInvitationStatus {
  switch (value) {
    case 'Pending':
      return 'pending';
    case 'Accepted':
      return 'accepted';
    case 'Expired':
      return 'expired';
    case 'Revoked':
      return 'revoked';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown wire invitation status "${exhaustive as string}".`);
    }
  }
}

function toWireStatus(value: Phase0StaffInvitationStatus): WireStatus {
  switch (value) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Revoked';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown contract invitation status "${exhaustive as string}".`);
    }
  }
}

function fromWireChannel(value: WireChannel): Phase0InvitationChannel {
  switch (value) {
    case 'Email':
      return 'email';
    case 'Whatsapp':
      return 'whatsapp';
    case 'Both':
      return 'both';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown wire invitation channel "${exhaustive as string}".`);
    }
  }
}

function toWireChannel(value: Phase0InvitationChannel): WireChannel {
  switch (value) {
    case 'email':
      return 'Email';
    case 'whatsapp':
      return 'Whatsapp';
    case 'both':
      return 'Both';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown contract invitation channel "${exhaustive as string}".`);
    }
  }
}

function computeTotals(
  rows: ReadonlyArray<WireStaffInvitation>,
): Record<Phase0StaffInvitationStatus, number> {
  const out: Record<Phase0StaffInvitationStatus, number> = {
    pending: 0,
    accepted: 0,
    expired: 0,
    revoked: 0,
  };
  for (const r of rows) out[fromWireStatus(r.status)]++;
  return out;
}
