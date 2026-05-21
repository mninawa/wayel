import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '@app/environment';
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
  Phase0StaffInvitationLookupDto,
  Phase0StaffInvitationStatus,
} from '../core/contracts/staff-invitations.phase0';
import {
  MOCK_ACCOUNTS,
  findAccountByEmail,
  issueSession,
  type MockAccount,
} from '../core/mock/mock-accounts';
import { isValidEmail } from '../utils/invitation-validators';
import { AccountSessionService } from './account-session.service';
import { ChildrenBridgeService } from './children-bridge.service';
import { MockPlatformAuditService } from './mock-platform-audit.service';
import { StaffInvitationsApiService } from './staff-invitations-api.service';

/** Paged result mirroring `Phase0StaffInvitationListResult`. */
export interface StaffInvitationListResult {
  items: Phase0StaffInvitationDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalsByStatus?: Record<Phase0StaffInvitationStatus, number>;
}

/**
 * Internal mock row carrying the secret token. Only the bridge layer ever
 * sees this; the wire DTO replaces it with a derived `acceptUrl`.
 */
interface MockInvitationRow extends Phase0StaffInvitationDto {
  token: string;
}

function buildAcceptUrl(token: string): string {
  // Best-effort base URL: in the browser we can use window.location.origin,
  // otherwise fall back to a sensible dev default.
  const origin =
    (typeof window !== 'undefined' && window.location?.origin) ||
    'http://127.0.0.1:4400';
  return `${origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

function generateInviteToken(): string {
  const a = Math.random().toString(36).slice(2);
  const b = Math.random().toString(36).slice(2);
  const c = Math.random().toString(36).slice(2);
  return `tok_${a}${b}${c}`.slice(0, 56);
}

/**
 * Seed the mock inbox with one of each interesting state so the UI can be
 * exercised without sending anything. Mirrors the live contract exactly.
 */
function seedMockInvitations(
  institutionId: string,
  institutionName: string,
): MockInvitationRow[] {
  const seeds: Array<Omit<MockInvitationRow, 'acceptUrl'>> = [
    {
      id: 'inv_seed_1',
      token: 'tok_seed_pending_nomsa',
      institutionId,
      institutionName,
      email: 'nomsa.k@littlestars.edu',
      phone: null,
      role: 'Teacher',
      invitedAt: '2026-04-14T11:00:00Z',
      invitedByEmail: 'admin@littlestars.edu',
      expiresAt: '2026-04-28T11:00:00Z',
      status: 'pending',
      lastResentAt: null,
      lastSentVia: 'email',
      acceptedAt: null,
      acceptedByName: null,
      revokedAt: null,
      revokedReason: null,
    },
    {
      id: 'inv_seed_2',
      token: 'tok_seed_accepted_thabo',
      institutionId,
      institutionName,
      email: 'coach.t@example.com',
      phone: '+27821234567',
      role: 'Coach / instructor',
      invitedAt: '2026-04-10T09:30:00Z',
      invitedByEmail: 'admin@littlestars.edu',
      expiresAt: '2026-04-24T09:30:00Z',
      status: 'accepted',
      lastResentAt: null,
      lastSentVia: 'whatsapp',
      acceptedAt: '2026-04-11T08:15:00Z',
      acceptedByName: 'Thabo Mokoena',
      revokedAt: null,
      revokedReason: null,
    },
    {
      id: 'inv_seed_3',
      token: 'tok_seed_expired_auntie',
      institutionId,
      institutionName,
      email: 'auntie.j@example.com',
      phone: null,
      role: 'Support',
      invitedAt: '2026-03-12T10:00:00Z',
      invitedByEmail: 'admin@littlestars.edu',
      expiresAt: '2026-03-26T10:00:00Z',
      status: 'expired',
      lastResentAt: null,
      lastSentVia: 'email',
      acceptedAt: null,
      acceptedByName: null,
      revokedAt: null,
      revokedReason: null,
    },
    {
      // Long-lived demo invite — handy for exercising /accept-invite.
      id: 'inv_seed_4',
      token: 'tok_seed_demo_open',
      institutionId,
      institutionName,
      email: 'demo.staff@littlestars.edu',
      phone: '+27831112233',
      role: 'Teacher',
      invitedAt: '2026-04-15T08:00:00Z',
      invitedByEmail: 'admin@littlestars.edu',
      expiresAt: '2099-01-01T00:00:00Z',
      status: 'pending',
      lastResentAt: null,
      lastSentVia: 'both',
      acceptedAt: null,
      acceptedByName: null,
      revokedAt: null,
      revokedReason: null,
    },
  ];
  return seeds.map((s) => ({ ...s, acceptUrl: buildAcceptUrl(s.token) }));
}

function applyFilter(
  rows: MockInvitationRow[],
  q: Phase0ListStaffInvitationsQuery,
): MockInvitationRow[] {
  let out = rows;
  if (q.status) out = out.filter((r) => r.status === q.status);
  const s = q.search?.trim().toLowerCase();
  if (s) {
    out = out.filter((r) => `${r.email} ${r.role}`.toLowerCase().includes(s));
  }
  return out;
}

function recomputeStatuses(rows: MockInvitationRow[]): void {
  const now = Date.now();
  for (const inv of rows) {
    if (inv.status === 'pending' && Date.parse(inv.expiresAt) <= now) {
      inv.status = 'expired';
    }
  }
}

/** Strip the `token` field before exposing a row to the UI layer. */
function toWireDto(row: MockInvitationRow): Phase0StaffInvitationDto {
  const { token: _token, ...wire } = row;
  return wire;
}

/**
 * Switches between in-memory mocks and `StaffInvitationsApiService` based on
 * `environment.useMock`. The mock store is local to the bridge so the
 * component layer never touches `MOCK_*` arrays directly — same shape as the
 * subscription-requests bridge.
 */
@Injectable({ providedIn: 'root' })
export class StaffInvitationsBridgeService {
  private readonly api = inject(StaffInvitationsApiService);
  private readonly children = inject(ChildrenBridgeService);
  private readonly session = inject(AccountSessionService);
  private readonly audit = inject(MockPlatformAuditService);

  private readonly mockRows: MockInvitationRow[] = seedMockInvitations(
    this.children.currentInstitution.id,
    this.children.currentInstitution.name,
  );

  /** Subtitle line for the staff invitations page. */
  readonly dataSourceLine: string = environment.useMock
    ? `In-memory mock — viewing as ${this.children.currentInstitution.name}.`
    : environment.platformApiUrl
      ? `Backed by ${environment.platformApiUrl}.`
      : 'Live API (same origin).';

  list(
    query: Phase0ListStaffInvitationsQuery = {},
  ): Observable<StaffInvitationListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q: Phase0ListStaffInvitationsQuery = { ...query, page, pageSize };

    if (environment.useMock) {
      recomputeStatuses(this.mockRows);
      const totalsByStatus = computeTotals(this.mockRows);
      const filtered = applyFilter([...this.mockRows], q);
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize).map(toWireDto);
      return of({
        items,
        totalCount: filtered.length,
        page,
        pageSize,
        totalsByStatus,
      });
    }
    return this.api.list(q);
  }

  create(
    body: Phase0CreateStaffInvitationRequest,
  ): Observable<Phase0CreateStaffInvitationResponse> {
    if (environment.useMock) {
      const email = body.email?.trim().toLowerCase() ?? '';
      const role = body.role?.trim() ?? '';
      const phone = body.phone?.trim() || null;
      const sendVia: Phase0InvitationChannel =
        body.sendVia === 'whatsapp' || body.sendVia === 'both'
          ? body.sendVia
          : 'email';
      if (!isValidEmail(email)) {
        return throwError(() => new Error('A valid email is required.'));
      }
      if (!role) {
        return throwError(() => new Error('Role is required.'));
      }
      if ((sendVia === 'whatsapp' || sendVia === 'both') && !phone) {
        return throwError(
          () =>
            new Error('A WhatsApp/SMS number is required to send via WhatsApp.'),
        );
      }
      recomputeStatuses(this.mockRows);
      const dup = this.mockRows.find(
        (r) => r.email.toLowerCase() === email && r.status === 'pending',
      );
      if (dup) {
        return throwError(
          () => new Error(`A pending invitation to "${email}" already exists.`),
        );
      }
      const expiresInDays = Math.min(
        90,
        Math.max(1, Number(body.expiresInDays ?? 14)),
      );
      const now = new Date();
      const token = generateInviteToken();
      const row: MockInvitationRow = {
        id: `inv_${Math.random().toString(36).slice(2, 10)}`,
        token,
        institutionId: this.children.currentInstitution.id,
        institutionName: this.children.currentInstitution.name,
        email,
        phone,
        role,
        invitedAt: now.toISOString(),
        invitedByEmail: 'admin@example.com',
        expiresAt: new Date(
          now.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
        ).toISOString(),
        status: 'pending',
        lastResentAt: null,
        lastSentVia: sendVia,
        acceptedAt: null,
        acceptedByName: null,
        revokedAt: null,
        revokedReason: null,
        acceptUrl: buildAcceptUrl(token),
      };
      this.mockRows.unshift(row);
      this.audit.record({
        actorEmail: row.invitedByEmail,
        tenantId: row.institutionId,
        tenantName: row.institutionName,
        action: 'staff_invitation.created',
        detail: `Invited ${row.email} as ${row.role} via ${sendVia}; expires ${row.expiresAt.slice(0, 10)}.`,
        subjectId: row.id,
      });
      return of({ invitation: toWireDto(row) });
    }
    return this.api.create(body);
  }

  resend(
    id: string,
    body: Phase0ResendStaffInvitationRequest = {},
  ): Observable<Phase0ResendStaffInvitationResponse> {
    if (environment.useMock) {
      recomputeStatuses(this.mockRows);
      const inv = this.mockRows.find((r) => r.id === id);
      if (!inv) return throwError(() => new Error(`No invitation "${id}".`));
      if (inv.status !== 'pending') {
        return throwError(
          () => new Error(`Cannot resend a ${inv.status} invitation.`),
        );
      }
      const requested = body.sendVia;
      const via: Phase0InvitationChannel =
        requested === 'email' || requested === 'whatsapp' || requested === 'both'
          ? requested
          : inv.lastSentVia ?? 'email';
      if ((via === 'whatsapp' || via === 'both') && !inv.phone) {
        return throwError(
          () =>
            new Error(
              'A WhatsApp/SMS number is required on this invitation to resend via WhatsApp.',
            ),
        );
      }
      const now = new Date();
      inv.lastResentAt = now.toISOString();
      inv.lastSentVia = via;
      inv.expiresAt = new Date(
        now.getTime() + 14 * 24 * 60 * 60 * 1000,
      ).toISOString();
      this.audit.record({
        actorEmail: inv.invitedByEmail,
        tenantId: inv.institutionId,
        tenantName: inv.institutionName,
        action: 'staff_invitation.resent',
        detail: `Resent invitation to ${inv.email} via ${via}; new expiry ${inv.expiresAt.slice(0, 10)}.`,
        subjectId: inv.id,
      });
      return of({
        resentAt: inv.lastResentAt,
        expiresAt: inv.expiresAt,
        via,
      });
    }
    return this.api.resend(id, body);
  }

  revoke(
    id: string,
    body: Phase0RevokeStaffInvitationRequest,
  ): Observable<void> {
    if (environment.useMock) {
      const reason = body.reason?.trim();
      if (!reason) {
        return throwError(() => new Error('A revocation reason is required.'));
      }
      recomputeStatuses(this.mockRows);
      const inv = this.mockRows.find((r) => r.id === id);
      if (!inv) return throwError(() => new Error(`No invitation "${id}".`));
      if (inv.status !== 'pending') {
        return throwError(
          () => new Error(`Cannot revoke a ${inv.status} invitation.`),
        );
      }
      inv.status = 'revoked';
      inv.revokedAt = new Date().toISOString();
      inv.revokedReason = reason;
      this.audit.record({
        actorEmail: inv.invitedByEmail,
        tenantId: inv.institutionId,
        tenantName: inv.institutionName,
        action: 'staff_invitation.revoked',
        detail: `Revoked invitation to ${inv.email}: ${reason}`,
        subjectId: inv.id,
      });
      return of(void 0);
    }
    return this.api.revoke(id, body);
  }

  /** Public: look up an invitation by its one-shot token. */
  lookupByToken(token: string): Observable<Phase0StaffInvitationLookupDto> {
    if (environment.useMock) {
      recomputeStatuses(this.mockRows);
      const inv = this.mockRows.find((r) => r.token === token);
      if (!inv) {
        return throwError(
          () => new Error('This invitation link is not valid.'),
        );
      }
      if (inv.status === 'expired') {
        return throwError(
          () =>
            new Error(
              'This invitation has expired. Please ask your institution to resend it.',
            ),
        );
      }
      if (inv.status === 'revoked') {
        return throwError(
          () => new Error('This invitation was cancelled by your institution.'),
        );
      }
      if (inv.status === 'accepted') {
        return throwError(
          () =>
            new Error(
              'This invitation has already been redeemed. Please sign in instead.',
            ),
        );
      }
      const lookup: Phase0StaffInvitationLookupDto = {
        id: inv.id,
        institutionId: inv.institutionId,
        institutionName: inv.institutionName,
        email: inv.email,
        role: inv.role,
        invitedByEmail: inv.invitedByEmail,
        expiresAt: inv.expiresAt,
        status: inv.status,
      };
      return of(lookup);
    }
    return this.api.lookupByToken(token);
  }

  /**
   * Public: redeem an invitation token. Mints a `staff` account in mock mode,
   * marks the invite `accepted`, and writes the issued session into
   * `AccountSessionService` so the caller can navigate straight into the app.
   */
  acceptByToken(
    token: string,
    body: Phase0AcceptStaffInvitationRequest,
  ): Observable<Phase0AcceptStaffInvitationResponse> {
    if (environment.useMock) {
      recomputeStatuses(this.mockRows);
      const inv = this.mockRows.find((r) => r.token === token);
      if (!inv) {
        return throwError(() => new Error('Invalid invitation link.'));
      }
      if (inv.status === 'expired' || inv.status === 'revoked') {
        return throwError(
          () =>
            new Error(
              `This invitation is ${inv.status} and can no longer be accepted.`,
            ),
        );
      }
      if (inv.status === 'accepted') {
        return throwError(
          () => new Error('This invitation has already been redeemed.'),
        );
      }
      const displayName = body.displayName?.trim() ?? '';
      const password = body.password ?? '';
      if (!displayName) {
        return throwError(() => new Error('Display name is required.'));
      }
      if (!password || password.length < 6) {
        return throwError(
          () => new Error('Password must be at least 6 characters.'),
        );
      }
      if (findAccountByEmail(inv.email)) {
        return throwError(
          () =>
            new Error(
              `An account with email "${inv.email}" already exists. Please sign in instead.`,
            ),
        );
      }
      const createdAt = new Date().toISOString();
      const accountId = `acct_${Math.random().toString(36).slice(2, 10)}`;
      const phone = body.phone?.trim() || inv.phone || null;
      const account: MockAccount = {
        id: accountId,
        role: 'staff',
        email: inv.email,
        password,
        displayName,
        phone,
        createdAt,
        staffInstitutionId: inv.institutionId,
        staffAssignedProgramIds: [],
      };
      MOCK_ACCOUNTS.push(account);
      inv.status = 'accepted';
      inv.acceptedAt = createdAt;
      inv.acceptedByName = displayName;
      this.audit.record({
        actorEmail: inv.email,
        tenantId: inv.institutionId,
        tenantName: inv.institutionName,
        action: 'staff_invitation.accepted',
        detail: `${displayName} (${inv.email}) joined as ${inv.role}.`,
        subjectId: inv.id,
      });
      const sessionRow = issueSession(account.id);
      const response: Phase0AcceptStaffInvitationResponse = {
        account: {
          id: account.id,
          role: 'staff',
          email: account.email,
          displayName: account.displayName,
          phone: account.phone,
          createdAt: account.createdAt,
          staff: {
            institutionId: inv.institutionId,
            institutionName: inv.institutionName,
            assignedProgramIds: [],
          },
        },
        sessionToken: sessionRow.token,
        expiresAt: sessionRow.expiresAt,
      };
      this.session.setSession(response);
      return of(response);
    }
    return this.api.acceptByToken(token, body).pipe(
      tap((resp) => {
        this.session.setSession(resp);
        const staff = resp.account.staff;
        this.audit.record({
          actorEmail: resp.account.email,
          tenantId: staff?.institutionId ?? null,
          tenantName: staff?.institutionName ?? null,
          action: 'staff_invitation.accepted',
          detail: `${resp.account.displayName} (${resp.account.email}) joined the staff panel.`,
        });
      }),
    );
  }
}

function computeTotals(
  rows: MockInvitationRow[],
): Record<Phase0StaffInvitationStatus, number> {
  const out: Record<Phase0StaffInvitationStatus, number> = {
    pending: 0,
    accepted: 0,
    expired: 0,
    revoked: 0,
  };
  for (const r of rows) out[r.status]++;
  return out;
}
