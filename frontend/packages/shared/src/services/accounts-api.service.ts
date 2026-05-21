import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0Account,
  Phase0AccountRole,
  Phase0AuthResponse,
  Phase0LoginRequest,
  Phase0LogoutResponse,
  Phase0MeResponse,
  Phase0MyProgram,
  Phase0MyProgramsResponse,
  Phase0RegisterAccountRequest,
} from '../core/contracts/accounts.phase0';

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */
//
// The Phase0 contract was sketched against a fictional `/api/accounts/*`
// surface (PascalCase JSON, opaque session tokens, embedded `account` block).
// The real Wayel.Api ships:
//
//   * POST /api/v1/auth/register   -> AuthSession
//   * POST /api/v1/auth/login      -> AuthSession
//   * POST /api/v1/auth/logout     -> 204
//   * GET  /api/v1/auth/me         -> MeResponse
//   * GET  /api/v1/me/staff/programs -> { programs: [...] }
//
// Both responses are PascalCase JWT-bearing sessions, not opaque tokens. We
// map them down to the Phase0 shape here so the rest of the SPA (session
// service, guards, components) keeps its existing typing.
//
// Backend role enum is `Parent | Staff | TenantAdmin | SuperAdmin`. The
// public app only knows `parent | staff`; admins get redirected to the
// REMOVED SPA and aren't a normal customer-portal persona.

interface WireAuthSession {
  accessToken: string;
  accessTokenExpiresOnUtc: string;
  refreshToken: string;
  refreshTokenExpiresOnUtc: string;
  sessionId: string;
  userId: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: string;
}

interface WireMeResponse {
  userId: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: string;
  tenant?: {
    tenantId: string;
    name: string;
    slug: string;
    displayName: string | null;
  } | null;
}

interface WireMyProgramSummary {
  id: string;
  name: string;
  ageRange: string;
  enrolledCount: number;
  institutionId: string;
  institutionName: string;
}

interface WireMyProgramsResponse {
  programs: WireMyProgramSummary[];
}

function normaliseRole(role: string): Phase0AccountRole {
  // Backend role enum is `Parent | Staff | TenantAdmin | SuperAdmin |
  // Partner`. The public SPA only knows three personas — parent / staff
  // / preferred-partner. TenantAdmin / SuperAdmin are REMOVED
  // personas, but if one ever signs in here we treat them as staff so
  // the shell renders something usable instead of crashing.
  const lower = role.toLowerCase();
  if (lower === 'parent') return 'parent';
  if (lower === 'partner') return 'partner';
  return 'staff';
}

function wireToAccount(
  userId: string,
  email: string,
  displayName: string,
  role: string,
  tenantId: string | null,
  tenantName?: string | null,
): Phase0Account {
  const phaseRole = normaliseRole(role);
  const account: Phase0Account = {
    id: userId,
    role: phaseRole,
    email,
    displayName,
    phone: null,
    // Backend doesn't echo a creation timestamp on the session/me payloads;
    // the SPA surfaces this only on a few admin-y screens that aren't part
    // of customer-portal today, so an empty string is acceptable as a
    // sentinel "unknown" value.
    createdAt: '',
  };
  if (phaseRole === 'parent') {
    // The Parent aggregate is auto-provisioned by GET /me/parent on first
    // load; its ParentId is the canonical "parent" id everywhere downstream
    // in the parent SPA. The User.Id and Parent.Id are different. The SPA
    // doesn't actually read `parentId` off the account anywhere — it uses
    // /me/parent — so leaving it undefined is safe.
  } else if (tenantId) {
    account.staff = {
      institutionId: tenantId,
      institutionName: tenantName ?? 'My institution',
      assignedProgramIds: [],
    };
  }
  return account;
}

function wireToAuthResponse(wire: WireAuthSession): Phase0AuthResponse {
  const resp: Phase0AuthResponse & { refreshToken?: string } = {
    account: wireToAccount(
      wire.userId,
      wire.email,
      wire.displayName,
      wire.role,
      wire.tenantId,
    ),
    // Pass the JWT through as the Phase0 `sessionToken` — the existing
    // bearer-token interceptor stamps it on outbound API requests, which
    // is exactly what the JWT-protected endpoints expect.
    sessionToken: wire.accessToken,
    expiresAt: wire.accessTokenExpiresOnUtc,
  };
  // Stash the refresh token alongside so the session service can carry it
  // forward and pass it to /auth/logout on sign-out. The Phase0 contract
  // doesn't model refresh tokens (the mock used opaque single-tokens) — we
  // stuff it on as an extra field rather than forking the contract for now.
  resp.refreshToken = wire.refreshToken;
  return resp;
}

function wireToMeResponse(wire: WireMeResponse): Phase0MeResponse {
  return {
    account: wireToAccount(
      wire.userId,
      wire.email,
      wire.displayName,
      wire.role,
      wire.tenantId,
      wire.tenant?.displayName ?? wire.tenant?.name ?? null,
    ),
  };
}

function wireToMyPrograms(wire: WireMyProgramsResponse): Phase0MyProgramsResponse {
  const programs: Phase0MyProgram[] = wire.programs.map((p) => ({
    id: p.id,
    name: p.name,
    ageRange: p.ageRange,
    enrolledCount: p.enrolledCount,
    institutionId: p.institutionId,
    institutionName: p.institutionName,
  }));
  return { programs };
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * HTTP client for the customer-portal account surface, talking to the live
 * Wayel.Api auth endpoints (mounted at `/api/v1/auth/*`). The wire-shape
 * conversion above keeps the consumer-facing API in `Phase0` shape so the
 * bridge + components don't have to change.
 *
 * The bearer token isn't pulled from `AccountSessionService` here — the
 * `accountAuthInterceptor` attaches `Authorization: Bearer <token>` to every
 * outbound `/api/*` call, including the ones this service makes after sign-in.
 */
@Injectable({ providedIn: 'root' })
export class AccountsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  register(body: Phase0RegisterAccountRequest): Observable<Phase0AuthResponse> {
    return this.http
      .post<WireAuthSession>(`${this.base()}/api/v1/auth/register`, {
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        phone: body.phone ?? null,
        role: body.role,
      })
      .pipe(map(wireToAuthResponse));
  }

  login(body: Phase0LoginRequest): Observable<Phase0AuthResponse> {
    return this.http
      .post<WireAuthSession>(`${this.base()}/api/v1/auth/login`, {
        email: body.email,
        password: body.password,
      })
      .pipe(map(wireToAuthResponse));
  }

  /**
   * Logout is a one-shot fire — we explicitly forward the *refresh* token in
   * the body. The interceptor will also have attached the access-token
   * bearer header, but the backend handler revokes the entire session that
   * owns the refresh token (matching the BFF cookie path).
   */
  logout(refreshToken: string): Observable<Phase0LogoutResponse> {
    return this.http
      .post<void>(`${this.base()}/api/v1/auth/logout`, { refreshToken })
      .pipe(map(() => ({ ok: true }) as const));
  }

  me(): Observable<Phase0MeResponse> {
    return this.http
      .get<WireMeResponse>(`${this.base()}/api/v1/auth/me`)
      .pipe(map(wireToMeResponse));
  }

  myPrograms(): Observable<Phase0MyProgramsResponse> {
    return this.http
      .get<WireMyProgramsResponse>(`${this.base()}/api/v1/me/staff/programs`)
      .pipe(map(wireToMyPrograms));
  }
}
