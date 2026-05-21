import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';

/**
 * HTTP client for the co-parenting surface, mirroring
 * `Wayel.Api.Endpoints.CoParentInvitationEndpoints`. Routes:
 *
 * - `GET    /api/v1/me/parents`                               (list all households the caller belongs to)
 * - `POST   /api/v1/me/co-parent-invitations`                 (Primary issues invite)
 * - `GET    /api/v1/me/co-parent-invitations`                 (Primary lists invites)
 * - `POST   /api/v1/me/co-parent-invitations/{id}/resend`     (Primary resends)
 * - `POST   /api/v1/me/co-parent-invitations/{id}/revoke`     (Primary revokes)
 * - `DELETE /api/v1/me/co-parents/{userId}`                   (Primary removes a co-parent)
 * - `GET    /api/v1/co-parent-invitations/preview?token=…`    (anonymous, used by accept page)
 * - `POST   /api/v1/co-parent-invitations/accept`             (signed-in, redeems token)
 *
 * Errors are thrown as `CoParentInvitationsHttpError` carrying the
 * Wayel error code (e.g. `co_parent_invitation.email_mismatch`) so the
 * SPA can render targeted UX rather than a generic banner.
 */

export type CoParentRole = 'Primary' | 'CoParent';

export type CoParentInvitationStatus =
  | 'Pending'
  | 'Accepted'
  | 'Revoked'
  | 'Expired';

export interface CoParentMemberSummary {
  /**
   * Mirrors the backend `ParentMemberSummary.MemberId` (camelCase
   * `memberId` on the wire). Earlier drafts called this
   * `parentMemberId`, which the API never returns — the SPA's
   * `@for (… ; track m.parentMemberId)` was effectively keying every
   * row on `undefined`, hurting change detection on member-list edits.
   */
  memberId: string;
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  role: CoParentRole;
  joinedOnUtc: string;
}

export interface CoParentParentChild {
  parentChildId: string;
  displayName: string;
  dateOfBirth: string;
  notes: string | null;
  photoUrl: string | null;
  createdOnUtc: string;
  updatedOnUtc: string;
}

export interface CoParentParentSummary {
  parentId: string;
  ownerUserId: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: CoParentRole;
  members: CoParentMemberSummary[];
  children: CoParentParentChild[];
  createdOnUtc: string;
  updatedOnUtc: string;
}

export interface CoParentInvitationDto {
  /** Matches API `InvitationId` (camelCase JSON). */
  invitationId: string;
  parentId: string;
  email: string;
  message: string | null;
  status: CoParentInvitationStatus;
  createdOnUtc: string;
  expiresOnUtc: string;
  acceptedOnUtc: string | null;
  revokedOnUtc: string | null;
  lastSentOnUtc: string | null;
  resendCount: number;
  invitedByUserId: string;
  invitedByDisplayName: string;
  acceptedByUserId: string | null;
}

export interface CreateCoParentInvitationRequest {
  email: string;
  message?: string | null;
  /**
   * When `false`, the API persists the invitation but skips the
   * outbound email. The Primary can then share `acceptUrl` from the
   * response over their own channel (WhatsApp, iMessage, etc.).
   * Defaults to `true` server-side to keep older clients on the
   * email path.
   */
  sendEmail?: boolean;
}

export interface CreateCoParentInvitationResponse {
  invitation: CoParentInvitationDto;
  /** Plaintext token; only returned on Create + Resend. */
  token: string;
  /** Best-effort accept URL the SES email points at. */
  acceptUrl: string | null;
}

export interface ResendCoParentInvitationResponse {
  invitation: CoParentInvitationDto;
  token: string;
  acceptUrl: string | null;
}

export type CoParentInvitationPreviewStatus =
  | 'Pending'
  | 'Expired'
  | 'Accepted'
  | 'Revoked';

export interface CoParentInvitationPreviewDto {
  status: CoParentInvitationPreviewStatus;
  email: string;
  householdLabel: string;
  invitedByDisplayName: string;
  expiresOnUtc: string;
  message: string | null;
}

export interface AcceptCoParentInvitationResponse {
  invitationId: string;
  parentId: string;
  acceptedByUserId: string;
  acceptedByEmail: string;
  acceptedOnUtc: string;
}

export interface CoParentInvitationsHttpError extends Error {
  status: number;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class CoParentInvitationsApiService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async listHouseholds(): Promise<CoParentParentSummary[]> {
    return this.request<CoParentParentSummary[]>('/api/v1/me/parents', {
      method: 'GET',
    });
  }

  async list(): Promise<CoParentInvitationDto[]> {
    return this.request<CoParentInvitationDto[]>(
      '/api/v1/me/co-parent-invitations',
      { method: 'GET' },
    );
  }

  async create(
    body: CreateCoParentInvitationRequest,
  ): Promise<CreateCoParentInvitationResponse> {
    return this.request<CreateCoParentInvitationResponse>(
      '/api/v1/me/co-parent-invitations',
      {
        method: 'POST',
        body: JSON.stringify({
          email: body.email,
          message: body.message ?? null,
          // Always serialise the toggle so the API doesn't have to
          // guess; nullish coalesce to `true` for compat with older
          // call sites that don't pass the flag.
          sendEmail: body.sendEmail ?? true,
        }),
      },
    );
  }

  async resend(id: string): Promise<ResendCoParentInvitationResponse> {
    return this.request<ResendCoParentInvitationResponse>(
      `/api/v1/me/co-parent-invitations/${encodeURIComponent(id)}/resend`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async revoke(id: string): Promise<void> {
    await this.request<void>(
      `/api/v1/me/co-parent-invitations/${encodeURIComponent(id)}/revoke`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async removeMember(userId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/me/co-parents/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
  }

  /** Anonymous — does not require auth. Drives the accept page banner. */
  async preview(token: string): Promise<CoParentInvitationPreviewDto> {
    const params = new URLSearchParams({ token });
    return this.request<CoParentInvitationPreviewDto>(
      `/api/v1/co-parent-invitations/preview?${params.toString()}`,
      { method: 'GET' },
      { anonymous: true },
    );
  }

  async accept(token: string): Promise<AcceptCoParentInvitationResponse> {
    return this.request<AcceptCoParentInvitationResponse>(
      '/api/v1/co-parent-invitations/accept',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      },
    );
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    options: { anonymous?: boolean } = {},
  ): Promise<T> {
    const isStateChanging =
      init.method !== undefined &&
      init.method !== 'GET' &&
      init.method !== 'HEAD' &&
      init.method !== 'OPTIONS';

    const response = await fetch(url, {
      ...init,
      credentials: options.anonymous ? 'omit' : 'include',
      headers: {
        ...this.baseHeaders,
        ...(isStateChanging ? bffStateChangingHeaders() : {}),
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }

    let detail = `Request failed with HTTP ${response.status}.`;
    let code: string | undefined;
    try {
      const payload = (await response.json()) as {
        title?: string;
        detail?: string;
        type?: string;
        code?: string;
        error?: string;
      };
      detail = payload.detail || payload.title || detail;
      if (payload.code) {
        code = payload.code;
      } else if (payload.error) {
        code = payload.error;
      } else if (payload.title && payload.title.includes('.')) {
        code = payload.title;
      } else if (payload.type) {
        const marker = '/errors/';
        const idx = payload.type.indexOf(marker);
        code =
          idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as CoParentInvitationsHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useCoParentInvitations = (): CoParentInvitationsApiService =>
  inject(CoParentInvitationsApiService);
