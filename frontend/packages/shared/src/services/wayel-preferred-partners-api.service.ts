import { Injectable, inject } from '@angular/core';
import { wayelAdminFetch, type WayelAdminHttpError } from './wayel-admin-http';

/**
 * HTTP client for the staff / tenant-admin "preferred partners"
 * surface, mirroring `Wayel.Api.Endpoints.PreferredPartnersEndpoints`.
 *
 * - `GET /api/v1/preferred-partners?status=&search=&includeArchived=`
 * - `GET /api/v1/preferred-partners/{id}`
 * - `POST /api/v1/preferred-partners`         (TenantAdmin)
 * - `PATCH /api/v1/preferred-partners/{id}`   (TenantAdmin)
 * - `POST /api/v1/preferred-partners/{id}/suspend`
 * - `POST /api/v1/preferred-partners/{id}/reinstate`
 * - `POST /api/v1/preferred-partners/{id}/archive`
 *
 * Plus the invitation funnel:
 * - `GET  /api/v1/preferred-partners/invitations`
 * - `POST /api/v1/preferred-partners/{id}/invitations { email, message }`
 * - `POST /api/v1/preferred-partners/invitations/{id}/resend`
 * - `POST /api/v1/preferred-partners/invitations/{id}/revoke`
 */

export type PreferredPartnerStatus = 'Active' | 'Suspended' | 'Archived';

export interface PreferredPartnerSummary {
  preferredPartnerId: string;
  tenantId: string;
  name: string;
  contactEmail: string;
  contactPhone: string | null;
  description: string | null;
  logoUrl: string | null;
  status: PreferredPartnerStatus;
  createdByUserId: string;
  createdOnUtc: string;
  updatedOnUtc: string;
}

export interface ListPreferredPartnersParams {
  includeArchived?: boolean;
  status?: PreferredPartnerStatus | null;
  search?: string | null;
}

export interface ListPreferredPartnersResponse {
  items: PreferredPartnerSummary[];
}

export interface CreatePreferredPartnerBody {
  name: string;
  contactEmail: string;
  contactPhone: string | null;
  description: string | null;
  logoUrl: string | null;
}

export interface UpdatePreferredPartnerBody {
  name?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  clearContactPhone?: boolean;
  description?: string | null;
  clearDescription?: boolean;
  logoUrl?: string | null;
  clearLogoUrl?: boolean;
}

export type PreferredPartnerInvitationStatus =
  | 'Pending'
  | 'Accepted'
  | 'Revoked'
  | 'Expired';

export interface PreferredPartnerInvitationSummary {
  invitationId: string;
  preferredPartnerId: string;
  tenantId: string;
  email: string;
  status: PreferredPartnerInvitationStatus;
  invitedByUserId: string;
  invitedOnUtc: string;
  expiresOnUtc: string;
  acceptedOnUtc: string | null;
  revokedOnUtc: string | null;
  message: string | null;
}

export interface ListPreferredPartnerInvitationsResponse {
  items: PreferredPartnerInvitationSummary[];
}

export interface IssuePreferredPartnerInvitationBody {
  email: string;
  message: string | null;
}

export interface InvitePreferredPartnerResponse {
  invitationId: string;
  preferredPartnerId: string;
  email: string;
  expiresOnUtc: string;
  /** Plaintext token shown once so staff can copy / resend manually. */
  plaintextToken: string;
  acceptUrl: string;
  status: PreferredPartnerInvitationStatus;
}

/** Local alias for the shared admin HTTP error shape. */
export type WayelPreferredPartnersHttpError = WayelAdminHttpError;

const BASE = '/api/v1/preferred-partners';

@Injectable({ providedIn: 'root' })
export class WayelPreferredPartnersApiService {
  list(
    params: ListPreferredPartnersParams = {},
  ): Promise<ListPreferredPartnersResponse> {
    const qs = new URLSearchParams();
    if (params.includeArchived) qs.set('includeArchived', 'true');
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;
    return wayelAdminFetch<ListPreferredPartnersResponse>(url, { method: 'GET' });
  }

  get(id: string): Promise<PreferredPartnerSummary> {
    return wayelAdminFetch<PreferredPartnerSummary>(
      `${BASE}/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
  }

  create(body: CreatePreferredPartnerBody): Promise<PreferredPartnerSummary> {
    return wayelAdminFetch<PreferredPartnerSummary>(BASE, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  update(
    id: string,
    body: UpdatePreferredPartnerBody,
  ): Promise<PreferredPartnerSummary> {
    return wayelAdminFetch<PreferredPartnerSummary>(
      `${BASE}/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  suspend(id: string): Promise<PreferredPartnerSummary> {
    return wayelAdminFetch<PreferredPartnerSummary>(
      `${BASE}/${encodeURIComponent(id)}/suspend`,
      { method: 'POST', body: '{}' },
    );
  }

  reinstate(id: string): Promise<PreferredPartnerSummary> {
    return wayelAdminFetch<PreferredPartnerSummary>(
      `${BASE}/${encodeURIComponent(id)}/reinstate`,
      { method: 'POST', body: '{}' },
    );
  }

  archive(id: string): Promise<PreferredPartnerSummary> {
    return wayelAdminFetch<PreferredPartnerSummary>(
      `${BASE}/${encodeURIComponent(id)}/archive`,
      { method: 'POST', body: '{}' },
    );
  }

  listInvitations(
    params: {
      preferredPartnerId?: string | null;
      status?: PreferredPartnerInvitationStatus | null;
    } = {},
  ): Promise<ListPreferredPartnerInvitationsResponse> {
    const qs = new URLSearchParams();
    if (params.preferredPartnerId) {
      qs.set('preferredPartnerId', params.preferredPartnerId);
    }
    if (params.status) qs.set('status', params.status);
    const url = qs.toString()
      ? `${BASE}/invitations?${qs.toString()}`
      : `${BASE}/invitations`;
    return wayelAdminFetch<ListPreferredPartnerInvitationsResponse>(url, {
      method: 'GET',
    });
  }

  invite(
    preferredPartnerId: string,
    body: IssuePreferredPartnerInvitationBody,
  ): Promise<InvitePreferredPartnerResponse> {
    return wayelAdminFetch<InvitePreferredPartnerResponse>(
      `${BASE}/${encodeURIComponent(preferredPartnerId)}/invitations`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  resendInvitation(invitationId: string): Promise<InvitePreferredPartnerResponse> {
    return wayelAdminFetch<InvitePreferredPartnerResponse>(
      `${BASE}/invitations/${encodeURIComponent(invitationId)}/resend`,
      { method: 'POST', body: '{}' },
    );
  }

  revokeInvitation(invitationId: string): Promise<void> {
    return wayelAdminFetch<void>(
      `${BASE}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      { method: 'POST', body: '{}' },
    );
  }
}

export const useWayelPreferredPartners = (): WayelPreferredPartnersApiService =>
  inject(WayelPreferredPartnersApiService);
