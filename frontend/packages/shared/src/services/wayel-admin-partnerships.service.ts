import { Injectable, inject } from '@angular/core';
import { wayelAdminFetch } from './wayel-admin-http';

/**
 * HTTP client for the institutional partnerships surface
 * (`/api/v1/partnerships/...`), called from the REMOVED tenant
 * workspace's "Partners" tab.
 *
 * Partnerships are stored as a directed graph — a mutual partnership
 * is a pair of reciprocal rows. This service mirrors that model
 * faithfully so the UI can show "incoming invite" vs. "outgoing
 * invite" without guessing.
 *
 * SuperAdmins can pass `tenantId` on every method to act on another
 * tenant; the API enforces the elevation server-side via
 * `EffectiveTenant`.
 */
export type WayelPartnershipStatus =
  | 'Active'
  | 'Paused'
  | 'Pending'
  | 'Declined';

export type WayelPartnershipBadge = 'Preferred' | 'Partner' | 'SisterSchool';
export type WayelPartnershipScopeKind = 'Tenant' | 'Programs';

export interface WayelPartnershipScope {
  kind: WayelPartnershipScopeKind;
  programIds: string[];
}

export interface WayelPartnershipSummary {
  partnershipId: string;
  ownerInstitutionId: string;
  partnerInstitutionId: string;
  scope: WayelPartnershipScope;
  status: WayelPartnershipStatus;
  badge: WayelPartnershipBadge;
  pitch: string;
  reciprocalPartnershipId: string | null;
  createdByUserId: string;
  createdByEmail: string;
  createdOnUtc: string;
  updatedOnUtc: string;
  declineReason: string | null;
  isMutual: boolean;
}

export interface WayelPartnershipsKpiSummary {
  active: number;
  paused: number;
  pendingIncoming: number;
  pendingOutgoing: number;
  declined: number;
  hasAnyMutual: boolean;
}

export interface WayelListPartnershipsResponse {
  owned: WayelPartnershipSummary[];
  incomingInvites: WayelPartnershipSummary[];
  summary: WayelPartnershipsKpiSummary;
}

/**
 * Cross-tenant partnership rollup powering the SuperAdmin dashboard
 * tiles. SuperAdmin-only at the API layer; non-SuperAdmin callers will
 * receive a 403.
 */
export interface WayelPartnershipsNetworkSummary {
  active: number;
  activeMutual: number;
  mutualPairs: number;
  pending: number;
  paused: number;
  declined: number;
  total: number;
}

export interface WayelInvitePartnershipBody {
  partnerInstitutionId: string;
  scopeKind: WayelPartnershipScopeKind;
  programIds?: string[] | null;
  badge: WayelPartnershipBadge;
  pitch: string;
}

export interface WayelAcceptPartnershipBody {
  scopeKind?: WayelPartnershipScopeKind | null;
  programIds?: string[] | null;
  badge?: WayelPartnershipBadge | null;
  pitch?: string | null;
}

export interface WayelUpdatePartnershipBody {
  scopeKind?: WayelPartnershipScopeKind | null;
  programIds?: string[] | null;
  badge?: WayelPartnershipBadge | null;
  pitch?: string | null;
}

const base = '/api/v1/partnerships';

@Injectable({ providedIn: 'root' })
export class WayelAdminPartnershipsService {
  networkSummary(): Promise<WayelPartnershipsNetworkSummary> {
    return wayelAdminFetch<WayelPartnershipsNetworkSummary>(
      `${base}/network-summary`,
      { method: 'GET' },
    );
  }

  list(tenantId: string): Promise<WayelListPartnershipsResponse> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelListPartnershipsResponse>(
      `${base}?${params.toString()}`,
      { method: 'GET' },
    );
  }

  invite(
    tenantId: string,
    body: WayelInvitePartnershipBody,
  ): Promise<WayelPartnershipSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelPartnershipSummary>(
      `${base}?${params.toString()}`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  update(
    tenantId: string,
    partnershipId: string,
    body: WayelUpdatePartnershipBody,
  ): Promise<WayelPartnershipSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelPartnershipSummary>(
      `${base}/${encodeURIComponent(partnershipId)}?${params.toString()}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  accept(
    tenantId: string,
    partnershipId: string,
    body: WayelAcceptPartnershipBody | null = null,
  ): Promise<WayelPartnershipSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelPartnershipSummary>(
      `${base}/${encodeURIComponent(partnershipId)}/accept?${params.toString()}`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
    );
  }

  decline(
    tenantId: string,
    partnershipId: string,
    reason: string | null = null,
  ): Promise<void> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<void>(
      `${base}/${encodeURIComponent(partnershipId)}/decline?${params.toString()}`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }

  pause(tenantId: string, partnershipId: string): Promise<WayelPartnershipSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelPartnershipSummary>(
      `${base}/${encodeURIComponent(partnershipId)}/pause?${params.toString()}`,
      { method: 'POST' },
    );
  }

  resume(tenantId: string, partnershipId: string): Promise<WayelPartnershipSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelPartnershipSummary>(
      `${base}/${encodeURIComponent(partnershipId)}/resume?${params.toString()}`,
      { method: 'POST' },
    );
  }

  remove(tenantId: string, partnershipId: string): Promise<void> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<void>(
      `${base}/${encodeURIComponent(partnershipId)}?${params.toString()}`,
      { method: 'DELETE' },
    );
  }
}

export const useWayelAdminPartnerships = (): WayelAdminPartnershipsService =>
  inject(WayelAdminPartnershipsService);
