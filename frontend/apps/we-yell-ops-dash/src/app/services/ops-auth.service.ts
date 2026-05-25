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
  };
  capabilities: string[];
}

export interface OpsUserDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isDisabled: boolean;
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
}

export interface OpsInvitationDto {
  id: string;
  email: string;
  role: string;
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
  expiresAtUtc: string;
  isValid: boolean;
}

@Injectable({ providedIn: 'root' })
export class OpsAuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops`;

  signInWithGoogle(idToken: string): Observable<OpsAuthSessionDto> {
    return this.http.post<OpsAuthSessionDto>(`${this.base}/auth/google`, { idToken });
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
  ): Observable<OpsInvitationDto> {
    return this.http.post<OpsInvitationDto>(
      `${this.base}/admin/invitations`,
      { email, role },
      { headers: this.bearer(accessToken) },
    );
  }

  revokeInvitation(accessToken: string, invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/invitations/${invitationId}`, {
      headers: this.bearer(accessToken),
    });
  }

  updateUserRole(accessToken: string, userId: string, role: string): Observable<OpsUserDto> {
    return this.http.patch<OpsUserDto>(
      `${this.base}/admin/users/${userId}/role`,
      { role },
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

  private bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
}
