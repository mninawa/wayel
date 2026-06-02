import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OpsAuthSessionDto {
  accessToken: string;
  expiresAtUtc: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    isDisabled: boolean;
    createdAtUtc: string;
    lastLoginAtUtc: string | null;
    regions: string[];
  };
  capabilities: string[];
  regions: string[];
}

export interface OpsUserDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isDisabled: boolean;
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
  regions: string[];
}

export interface OpsInvitationDto {
  id: string;
  email: string;
  role: string;
  regions: string[];
  status: string;
  expiresAtUtc: string;
  invitedByEmail: string;
  createdAtUtc: string;
  acceptedAtUtc: string | null;
  invitePath: string | null;
}

export interface OpsInvitationPreviewDto {
  email: string;
  role: string;
  regions: string[];
  expiresAtUtc: string;
  isValid: boolean;
}

export interface OpsAuditEntryDto {
  action: string;
  outcome: string;
  occurredOnUtc: string;
  actorEmail: string | null;
  actorUserId: string | null;
  audience: string | null;
  reason: string | null;
  metadata: Record<string, string | null> | null;
}

export interface OpsAuditPageDto {
  items: OpsAuditEntryDto[];
  nextContinuationToken: string | null;
}

@Injectable({ providedIn: 'root' })
export class OpsAuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops`;

  signInWithGoogle(idToken: string, inviteToken?: string | null): Observable<OpsAuthSessionDto> {
    return this.http.post<OpsAuthSessionDto>(`${this.base}/auth/google`, {
      idToken,
      inviteToken: inviteToken?.trim() || null,
    });
  }

  previewInvitation(token: string): Observable<OpsInvitationPreviewDto> {
    return this.http.get<OpsInvitationPreviewDto>(`${this.base}/auth/invitations/preview`, {
      params: { token },
    });
  }

  listUsers(accessToken: string): Observable<OpsUserDto[]> {
    return this.http.get<OpsUserDto[]>(`${this.base}/admin/users`, {
      headers: this.bearer(accessToken),
    });
  }

  listInvitations(accessToken: string): Observable<OpsInvitationDto[]> {
    return this.http.get<OpsInvitationDto[]>(`${this.base}/admin/invitations`, {
      headers: this.bearer(accessToken),
    });
  }

  createInvitation(
    accessToken: string,
    email: string,
    role: string,
    regions: string[],
  ): Observable<OpsInvitationDto> {
    return this.http.post<OpsInvitationDto>(
      `${this.base}/admin/invitations`,
      { email, role, regions },
      { headers: this.bearer(accessToken) },
    );
  }

  revokeInvitation(accessToken: string, invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/invitations/${invitationId}`, {
      headers: this.bearer(accessToken),
    });
  }

  updateUserRole(
    accessToken: string,
    userId: string,
    role: string,
    regions: string[],
  ): Observable<OpsUserDto> {
    return this.http.patch<OpsUserDto>(
      `${this.base}/admin/users/${userId}/role`,
      { role, regions },
      { headers: this.bearer(accessToken) },
    );
  }

  setUserDisabled(accessToken: string, userId: string, isDisabled: boolean): Observable<OpsUserDto> {
    return this.http.patch<OpsUserDto>(
      `${this.base}/admin/users/${userId}/disabled`,
      { isDisabled },
      { headers: this.bearer(accessToken) },
    );
  }

  listRecentAudit(
    accessToken: string,
    options: { action?: string; pageSize?: number; cursor?: string } = {},
  ): Observable<OpsAuditPageDto> {
    const params: Record<string, string> = {};
    if (options.action) params['action'] = options.action;
    if (options.pageSize) params['pageSize'] = String(options.pageSize);
    if (options.cursor) params['cursor'] = options.cursor;
    return this.http.get<OpsAuditPageDto>(`${this.base}/admin/audit`, {
      headers: this.bearer(accessToken),
      params,
    });
  }

  private bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
}
