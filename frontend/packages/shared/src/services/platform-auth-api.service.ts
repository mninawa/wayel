import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';

/**
 * Admin-portal flavoured wrapper around `POST /api/v1/auth/login`.
 *
 * Why a separate service from `AccountsApiService`: the customer-portal
 * service deliberately collapses the backend's full role enum down to
 * `parent | staff`, because the parent SPA only knows those two
 * personas. The REMOVED needs to distinguish `SuperAdmin` /
 * `TenantAdmin` / `Staff` so it can route to the right home shell and
 * pick the right `PlatformSessionService` sign-in method.
 *
 * Mirrors the `Wayel.Application.Features.Auth.Login.LoginCommand`
 * response 1:1, with field names normalised to camelCase for SPA
 * ergonomics.
 */
export type WayelUserRole =
  | 'Parent'
  | 'Staff'
  | 'TenantAdmin'
  | 'SuperAdmin';

export interface WayelAuthSession {
  accessToken: string;
  accessTokenExpiresOnUtc: string;
  refreshToken: string;
  refreshTokenExpiresOnUtc: string;
  sessionId: string;
  userId: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: WayelUserRole;
}

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

@Injectable({ providedIn: 'root' })
export class PlatformAuthApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  login(email: string, password: string): Observable<WayelAuthSession> {
    return this.http
      .post<WireAuthSession>(`${this.base()}/api/v1/auth/login`, {
        email,
        password,
      })
      .pipe(map(toSession));
  }
}

function toSession(w: WireAuthSession): WayelAuthSession {
  return {
    accessToken: w.accessToken,
    accessTokenExpiresOnUtc: w.accessTokenExpiresOnUtc,
    refreshToken: w.refreshToken,
    refreshTokenExpiresOnUtc: w.refreshTokenExpiresOnUtc,
    sessionId: w.sessionId,
    userId: w.userId,
    tenantId: w.tenantId,
    email: w.email,
    displayName: w.displayName,
    role: normaliseRole(w.role),
  };
}

function normaliseRole(role: string): WayelUserRole {
  switch ((role ?? '').toLowerCase()) {
    case 'superadmin':
      return 'SuperAdmin';
    case 'tenantadmin':
      return 'TenantAdmin';
    case 'staff':
      return 'Staff';
    default:
      return 'Parent';
  }
}
