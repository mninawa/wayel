import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '@app/environment';
import type {
  Phase0Account,
  Phase0AuthResponse,
  Phase0LoginRequest,
  Phase0LogoutResponse,
  Phase0MeResponse,
  Phase0MyProgram,
  Phase0MyProgramsResponse,
  Phase0RegisterAccountRequest,
} from '../core/contracts/accounts.phase0';
import {
  MOCK_ACCOUNTS,
  MOCK_SESSIONS,
  findAccountByEmail,
  findAccountById,
  findSessionByToken,
  issueSession,
  revokeSession,
  type MockAccount,
} from '../core/mock/mock-accounts';
import { MOCK_PARENTS, type MockParent } from '../core/mock/mock-parents';
import { MOCK_PROGRAMS } from '../core/mock/mock-data';
import { AccountsApiService } from './accounts-api.service';
import { AccountSessionService } from './account-session.service';
import { ParentSessionHydratorService } from './parent-session-hydrator.service';

const CURRENT_INSTITUTION = {
  id: 'tenant_little_stars',
  name: 'Little Stars Preschool',
} as const;

/**
 * External-client bridge: account registration, login, "who am I?", logout,
 * and the staff "my programs" feed.
 *
 * Mock mode owns the in-memory tables in `core/mock/mock-accounts` so that
 * sessions issued by `register()` / `login()` survive page reloads only via
 * `AccountSessionService` (localStorage). Live mode delegates everything to
 * `AccountsApiService`.
 *
 * `AccountSessionService` is the single source of truth for the *currently*
 * signed-in account on the client — this bridge writes into it on success.
 */
@Injectable({ providedIn: 'root' })
export class AccountsBridgeService {
  private readonly api = inject(AccountsApiService);
  private readonly session = inject(AccountSessionService);
  private readonly parentHydrator = inject(ParentSessionHydratorService);

  register(body: Phase0RegisterAccountRequest): Observable<Phase0AuthResponse> {
    if (environment.useMock) {
      const error = validateRegister(body);
      if (error) return throwError(() => new Error(error));
      if (body.role !== 'parent') {
        // Staff accounts can only be created by redeeming a one-shot
        // invitation token. See StaffInvitationsBridgeService.acceptByToken.
        return throwError(
          () =>
            new Error(
              'Staff accounts can only be created from an institution invite link. Ask your institution to send you one.',
            ),
        );
      }
      const email = body.email.trim();
      if (findAccountByEmail(email)) {
        return throwError(
          () =>
            new Error(`An account with email "${email}" already exists.`),
        );
      }
      const createdAt = new Date().toISOString();
      const id = `acct_${randomId()}`;
      const account: MockAccount = {
        id,
        role: 'parent',
        email,
        password: body.password,
        displayName: body.displayName.trim(),
        phone: body.phone?.trim() || null,
        createdAt,
      };
      let parent = MOCK_PARENTS.find(
        (p) => p.email.toLowerCase() === email.toLowerCase(),
      );
      if (!parent) {
        parent = {
          id: `parent_${randomId()}`,
          displayName: account.displayName,
          email,
          phone: account.phone,
          createdAt,
          children: [],
        } satisfies MockParent;
        MOCK_PARENTS.push(parent);
      }
      account.parentId = parent.id;
      MOCK_ACCOUNTS.push(account);
      const session = issueSession(account.id);
      const response: Phase0AuthResponse = {
        account: toDto(account),
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      };
      this.session.setSession(response);
      return of(response);
    }

    return new Observable<Phase0AuthResponse>((subscriber) => {
      const sub = this.api.register(body).subscribe({
        next: (resp) => {
          this.session.setSession(resp);
          void this.parentHydrator.hydrateIfParent();
          subscriber.next(resp);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
      return () => sub.unsubscribe();
    });
  }

  login(body: Phase0LoginRequest): Observable<Phase0AuthResponse> {
    if (environment.useMock) {
      const account = findAccountByEmail(body.email);
      if (!account || account.password !== body.password) {
        return throwError(() => new Error('Invalid email or password.'));
      }
      const session = issueSession(account.id);
      const response: Phase0AuthResponse = {
        account: toDto(account),
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      };
      this.session.setSession(response);
      return of(response);
    }

    return new Observable<Phase0AuthResponse>((subscriber) => {
      const sub = this.api.login(body).subscribe({
        next: (resp) => {
          this.session.setSession(resp);
          void this.parentHydrator.hydrateIfParent();
          subscriber.next(resp);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
      return () => sub.unsubscribe();
    });
  }

  /**
   * Logout — clears local session immediately. The mock variant also revokes
   * the in-memory session token so a stale token can't be replayed within the
   * same dev session. In live mode we forward the *refresh* token (not the
   * access token) to /auth/logout so the backend can revoke the entire
   * session chain; if no refresh token is present (mock-issued, BFF cookie
   * mode) the call is skipped because there's nothing for the backend to
   * revoke beyond what BFF already cleared on the cookie.
   */
  logout(): Observable<Phase0LogoutResponse> {
    const accessToken = this.session.getSessionToken();
    const refreshToken = this.session.getRefreshToken();
    this.session.clear();
    if (environment.useMock) {
      if (accessToken) revokeSession(accessToken);
      return of({ ok: true } as const);
    }
    if (!refreshToken) return of({ ok: true } as const);
    return this.api.logout(refreshToken);
  }

  /**
   * Refresh the local cache of "who am I?" from whichever source is authoritative.
   * Useful right after page-reload to confirm the bearer token still works.
   */
  me(): Observable<Phase0MeResponse> {
    if (environment.useMock) {
      const token = this.session.getSessionToken();
      if (!token) {
        return throwError(() => new Error('Not signed in.'));
      }
      const sess = findSessionByToken(token);
      if (!sess || Date.parse(sess.expiresAt) < Date.now()) {
        this.session.clear();
        return throwError(() => new Error('Session expired.'));
      }
      const account = findAccountById(sess.accountId);
      if (!account) {
        this.session.clear();
        return throwError(() => new Error('Account no longer exists.'));
      }
      return of({ account: toDto(account) });
    }
    return this.api.me();
  }

  /** Programs the signed-in staff account is assigned to. */
  myPrograms(): Observable<Phase0MyProgramsResponse> {
    if (environment.useMock) {
      const account = this.session.currentAccount();
      if (!account) {
        return throwError(() => new Error('Not signed in.'));
      }
      if (account.role !== 'staff' || !account.staff) {
        return throwError(() => new Error('Only staff accounts have programs.'));
      }
      const ids = new Set(account.staff.assignedProgramIds);
      const programs: Phase0MyProgram[] = MOCK_PROGRAMS.filter((p) =>
        ids.has(p.id),
      ).map((p) => ({
        ...p,
        institutionId: account.staff!.institutionId,
        institutionName: account.staff!.institutionName,
      }));
      return of({ programs });
    }
    return this.api.myPrograms();
  }
}

function toDto(a: MockAccount): Phase0Account {
  const dto: Phase0Account = {
    id: a.id,
    role: a.role,
    email: a.email,
    displayName: a.displayName,
    phone: a.phone,
    createdAt: a.createdAt,
  };
  if (a.role === 'parent' && a.parentId) {
    dto.parentId = a.parentId;
  }
  if (a.role === 'staff' && a.staffInstitutionId) {
    dto.staff = {
      institutionId: a.staffInstitutionId,
      institutionName:
        a.staffInstitutionId === CURRENT_INSTITUTION.id
          ? CURRENT_INSTITUTION.name
          : a.staffInstitutionId,
      assignedProgramIds: a.staffAssignedProgramIds ?? [],
    };
  }
  return dto;
}

function validateRegister(body: Phase0RegisterAccountRequest): string | null {
  if (body.role !== 'parent' && body.role !== 'staff')
    return "Role must be 'parent' or 'staff'.";
  // Note: bridge.register() rejects role === 'staff' upstream; the validator
  // still allows it so the typed contract surface remains stable.
  if (!body.displayName?.trim()) return 'Display name is required.';
  if (!body.email?.trim()) return 'Email is required.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim()))
    return 'Email looks invalid.';
  if (!body.password || body.password.length < 6)
    return 'Password must be at least 6 characters.';
  return null;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// `MOCK_SESSIONS` re-exported so devtools can poke at it in mock mode.
export { MOCK_SESSIONS };
