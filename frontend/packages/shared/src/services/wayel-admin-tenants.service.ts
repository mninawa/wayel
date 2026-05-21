import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';
import { platformBearerAuthHeaders } from './wayel-admin-http';

/**
 * HTTP client for the Wayel.Api admin tenant surface
 * (`/api/v1/admin/tenants/...`), proxied through the admin BFF cookie
 * session. Mirrors `Wayel.Api.Endpoints.AdminTenantsEndpoints` 1:1.
 *
 * Hand-rolled `fetch` (rather than `HttpClient`) for the same reasons as
 * `WayelInvitationsService` — we need to surface 401/403 inline so the
 * SuperAdmin tenant screens can render targeted errors instead of being
 * bounced through the global `httpErrorInterceptor`. `credentials:
 * 'include'` keeps the request on the BFF's HttpOnly cookie session, and
 * `bffStateChangingHeaders()` attaches the antiforgery header for any
 * non-safe method (the BFF refuses to forward state-changing requests
 * without it).
 *
 * Enums on the Wayel.Api side are serialised as PascalCase strings via
 * `JsonStringEnumConverter`, so `TenantKind` arrives as `"Parent"` /
 * `"Child"`. The API uses cursor-based pagination (`pageToken`) — opaque
 * to clients; just round-trip the value.
 */
export type WayelTenantKind = 'Parent' | 'Child';

/**
 * Lifecycle state of a tenant on the API side. Mirrors
 * `Wayel.Domain.Tenants.TenantStatus`. Serialised PascalCase by
 * `JsonStringEnumConverter`. The mock UI uses lowercase status strings —
 * see `wayel-admin-tenant-mappers` for the projection.
 */
export type WayelTenantStatus = 'Active' | 'Suspended' | 'Archived';

export interface WayelAdminTenantSummary {
  tenantId: string;
  name: string;
  slug: string;
  kind: WayelTenantKind;
  status: WayelTenantStatus;
  createdOnUtc: string;
  /**
   * Distinct count of parent-side children that currently hold an
   * open (non-archived) subscription period at this tenant. Drives
   * the SuperAdmin tenants console "active children" badge so it no
   * longer has to fall back to scanning `MOCK_PARENTS`.
   */
  activeChildrenCount: number;
  /** Active Staff + TenantAdmin users for the tenant. */
  staffCount: number;
  /** Active programs configured for the tenant. */
  programCount: number;
  /** Primary admin contact email (null if not yet set).
   *  Falls back server-side to the first TenantAdmin user's email when
   *  the explicit AdminContact blob hasn't been populated. */
  adminEmail: string | null;
  /**
   * `true` when no `TenantAdmin` user exists in the user roster for
   * this tenant — i.e. the tenant has been minted but no human can
   * sign in as administrator yet. Computed by `ListTenantsQueryHandler`
   * from the same bulk admin-email lookup that drives `adminEmail`.
   * Drives the SuperAdmin catalogue's "Awaiting admin" badge and
   * replaces the old UI-only `'pending'` status fiction.
   */
  awaitingAdmin: boolean;
  /** Institution category string (null if not yet set). */
  category: string | null;
  /** Operational shape of the programme — drives the cover pill. */
  institutionKind: WayelInstitutionKind;
  area: string | null;
  city: string | null;
  tagline: string | null;
  monthlyFeeZar: number | null;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  accentColor: string | null;
  /** Cover image URL — drives the catalogue card hero image. */
  imageUrl: string | null;
  website: string | null;
}

/**
 * Theme preference. Mirrors `Wayel.Domain.Tenants.TenantTheme` and is
 * round-tripped as a PascalCase string via `JsonStringEnumConverter`.
 */
export type WayelTenantTheme = 'System' | 'Light' | 'Dark';

/**
 * Subscription plan on the operational record. Mirrors
 * `Wayel.Domain.Tenants.TenantPlan`.
 */
export type WayelTenantPlan =
  | 'Unspecified'
  | 'Starter'
  | 'Professional'
  | 'Enterprise';

/**
 * Operational kind of an institution. Mirrors
 * `Wayel.Domain.Tenants.InstitutionKind`. Distinct from `WayelTenantKind`,
 * which models the parent/child org graph.
 */
export type WayelInstitutionKind = 'Unknown' | 'Daycare' | 'Session';

export interface WayelAdminTenantProfile {
  category: string | null;
  institutionKind: WayelInstitutionKind;
  area: string | null;
  city: string | null;
  tagline: string | null;
  description: string | null;
  monthlyFeeZar: number | null;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  accentColor: string | null;
  imageUrl: string | null;
  website: string | null;
}

export interface WayelAdminTenantRecord {
  type: string | null;
  plan: WayelTenantPlan;
  timezone: string | null;
}

export interface WayelAdminTenantAdminContact {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface WayelAdminTenantBranding {
  displayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  surfaceColor: string | null;
  textColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  customDomain: string | null;
  /**
   * `defaultTheme` arrives as the C# enum's `ToString()` ("System" /
   * "Light" / "Dark"). The API DTO field is technically nullable for
   * forward-compat, but in practice the enum always serialises a value.
   */
  defaultTheme: WayelTenantTheme | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
}

export interface WayelAdminTenantFeatureFlags {
  requireMfaForStaff: boolean;
  parentMediaApproval: boolean;
  weeklyTrendsEnabled: boolean;
  printShopEnabled: boolean;
  lifetimeArchiveEnabled: boolean;
}

export interface WayelAdminTenantSettings {
  maxChildren: number | null;
  maxStaff: number | null;
  defaultRetentionDays: number | null;
  allowedFileExtensions: string[] | null;
  featureFlags: WayelAdminTenantFeatureFlags;
}

/**
 * Rich tenant detail returned by `GET /admin/tenants/{id}`. Wraps the
 * summary with the five nested value-object blobs the API now persists.
 * Always present in the response — the API projects an empty record when
 * a slot has never been touched, so the client can bind to non-null
 * blob fields and only null-guard the leaf strings.
 */
export interface WayelAdminTenantDetail extends WayelAdminTenantSummary {
  profile: WayelAdminTenantProfile;
  record: WayelAdminTenantRecord;
  adminContact: WayelAdminTenantAdminContact;
  branding: WayelAdminTenantBranding;
  settings: WayelAdminTenantSettings;
}

/**
 * Total-replacement payload for `PATCH .../profile`. Omitted fields
 * deserialise as `null` server-side and clear the slot — matches what
 * the Institution → Profile form submits today.
 */
export interface WayelAdminUpdateProfileRequest {
  category?: string | null;
  institutionKind?: WayelInstitutionKind | null;
  area?: string | null;
  city?: string | null;
  tagline?: string | null;
  description?: string | null;
  monthlyFeeZar?: number | null;
  ageMinYears?: number | null;
  ageMaxYears?: number | null;
  accentColor?: string | null;
  imageUrl?: string | null;
  website?: string | null;
}

/** Total-replacement payload for `PATCH .../record`. Slug is immutable
 * here — use {@link WayelAdminTenantsService.rename} for the display
 * name and the server keeps the slug stable forever. */
export interface WayelAdminUpdateRecordRequest {
  type?: string | null;
  plan?: WayelTenantPlan | null;
  timezone?: string | null;
}

/** Total-replacement payload for `PATCH .../admin`. All-null clears the
 * first-admin slot. */
export interface WayelAdminUpdateAdminContactRequest {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** Total-replacement payload for `PATCH .../branding`. Colour fields
 * must be CSS hex literals (`#RGB` / `#RRGGBB` / `#RRGGBBAA`) — the
 * domain rejects anything else with `tenant.branding.color_invalid`. */
export interface WayelAdminUpdateBrandingRequest {
  displayName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  surfaceColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  customDomain?: string | null;
  defaultTheme?: WayelTenantTheme | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
}

/** Total-replacement payload for `PATCH .../settings`. Caps must be
 * non-negative; allowed-extensions entries must be lower-case + dot-less. */
export interface WayelAdminUpdateSettingsRequest {
  maxChildren?: number | null;
  maxStaff?: number | null;
  defaultRetentionDays?: number | null;
  allowedFileExtensions?: string[] | null;
  featureFlags?: WayelAdminTenantFeatureFlags;
}

export interface WayelAdminTenantsListPage {
  items: WayelAdminTenantSummary[];
  nextPageToken: string | null;
}

export interface WayelAdminListTenantsQuery {
  search?: string | null;
  kind?: WayelTenantKind | null;
  /**
   * Optional status filter. When omitted the server defaults to "all
   * non-archived" (Active + Suspended) so archived tenants stay hidden
   * from the catalogue UI by default — same behaviour as before this
   * filter existed.
   */
  status?: WayelTenantStatus | null;
  pageSize?: number | null;
  pageToken?: string | null;
}

/**
 * Optional sections accepted by the rich onboarding endpoint
 * (`POST /admin/tenants`). Each one mirrors the matching `PATCH` endpoint's
 * total-replacement body — see {@link WayelAdminUpdateProfileRequest} and
 * friends. Omitting a section is equivalent to "leave the slot at its
 * domain default" (empty TenantProfile / empty TenantBranding / etc.).
 *
 * Sending a section with all-null fields is also valid; the server
 * normalises empty strings to null so the persisted aggregate stays
 * canonical.
 */
export interface WayelAdminOnboardingProfileSection {
  category?: string | null;
  institutionKind?: WayelInstitutionKind;
  area?: string | null;
  city?: string | null;
  tagline?: string | null;
  description?: string | null;
  monthlyFeeZar?: number | null;
  ageMinYears?: number | null;
  ageMaxYears?: number | null;
  accentColor?: string | null;
  imageUrl?: string | null;
  website?: string | null;
}

export interface WayelAdminOnboardingBrandingSection {
  displayName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  surfaceColor?: string | null;
  textColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  customDomain?: string | null;
  defaultTheme?: WayelTenantTheme;
  supportEmail?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
}

export interface WayelAdminOnboardingRecordSection {
  type?: string | null;
  plan?: WayelTenantPlan;
  timezone?: string | null;
}

export interface WayelAdminOnboardingAdminContactSection {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface WayelAdminCreateTenantRequest {
  name: string;
  slug: string;
  kind: WayelTenantKind;
  profile?: WayelAdminOnboardingProfileSection | null;
  branding?: WayelAdminOnboardingBrandingSection | null;
  record?: WayelAdminOnboardingRecordSection | null;
  adminContact?: WayelAdminOnboardingAdminContactSection | null;
  /**
   * Whether the server should mint a `TenantAdmin` staff invitation as
   * part of the create. Defaults to `true` server-side when an admin
   * email is supplied; pass `false` to record the contact data without
   * triggering an email (useful for bulk imports). Has no effect when
   * `adminContact.email` is empty.
   */
  inviteAdmin?: boolean | null;
}

/**
 * Result of the optional admin invitation issued during onboarding.
 * Mirrors the co-parent invitation response so the SPA can reuse its
 * existing "copy link" component. `emailDispatched` is `false` when the
 * invitation row was persisted but the email could not be delivered;
 * the SPA should fall back to surfacing `acceptUrl` prominently.
 * `acceptUrl` is `null` only when no `Notifications:AcceptUrlBase` is
 * configured for the role (dev / minimal config) — same fallback
 * semantics as the staff-invitation endpoint.
 */
export interface WayelAdminOnboardingAdminInvitationResult {
  invitationId: string;
  email: string;
  expiresOnUtc: string;
  acceptUrl: string | null;
  emailDispatched: boolean;
}

export interface WayelAdminCreateTenantResponse {
  tenantId: string;
  name: string;
  slug: string;
  kind: WayelTenantKind;
  status: WayelTenantStatus;
  createdOnUtc: string;
  /**
   * Populated when the create handler minted a `TenantAdmin` staff
   * invitation as part of the onboarding flow. `null` when the caller
   * passed `inviteAdmin: false` or did not supply an admin email.
   */
  adminInvitation: WayelAdminOnboardingAdminInvitationResult | null;
}

export interface WayelAdminRenameTenantRequest {
  name: string;
}

export interface WayelAdminSuspendTenantRequest {
  reason: string;
}

export interface WayelAdminArchiveTenantRequest {
  reason: string;
}

export interface WayelAdminTenantStatusResponse {
  tenantId: string;
  status: WayelTenantStatus;
}

/**
 * Pre-flight count for the SuperAdmin "hard delete tenant" flow.
 * Mirrors `Wayel.Application.Features.Tenants.PurgeTenant
 * .TenantPurgePreviewResponse`. The SPA renders {@link counts}
 * verbatim on the confirmation modal so the operator sees the blast
 * radius before they type the tenant name.
 */
export interface WayelAdminTenantPurgePreview {
  tenantId: string;
  tenantName: string;
  /**
   * Map of `collection_name → row_count`. Keys are stable
   * snake_case identifiers (e.g. `users`, `daily_reports`) so the
   * UI can label them and group related entries together.
   */
  counts: Record<string, number>;
  total: number;
  durationMs: number;
}

/**
 * Confirm-by-typing payload for `DELETE /admin/tenants/{id}/purge`.
 * The server compares {@link confirmationName} against the tenant's
 * current name (case-insensitive, surrounding-whitespace trimmed)
 * and refuses with `tenant.confirmation_mismatch` on a mismatch.
 */
export interface WayelAdminHardDeleteTenantRequest {
  confirmationName: string;
  reason: string;
}

/**
 * Server-side response after the cascade runs. Same shape as the
 * preview plus per-collection {@link errors} surfaced when any
 * sub-cascade had to be skipped (best-effort across collections —
 * see `ITenantPurgeService` docstring).
 */
export interface WayelAdminHardDeleteTenantResponse {
  tenantId: string;
  tenantName: string;
  counts: Record<string, number>;
  total: number;
  /**
   * `collection_name → error message` for every collection whose
   * sub-cascade threw. Empty when the purge ran cleanly. The UI
   * renders these as a follow-up callout so ops can investigate.
   */
  errors: Record<string, string>;
  durationMs: number;
}

export interface WayelAdminTenantsHttpError extends Error {
  status: number;
  /** Wayel error code, e.g. `tenant.slug_taken`. */
  code?: string;
}

/**
 * Wire shape for one row of the institution's required-documents list.
 * The list is persisted on `TenantSettings.RequiredDocuments` server-
 * side; on the read path the server joins each entry against the
 * platform `DOCUMENT_CATEGORY` lookup catalogue so the SPA can render
 * a "Clinic Card — Latest immunisation card" chip without a follow-up
 * fetch.
 */
export interface WayelAdminTenantRequiredDocumentDto {
  /** Upper-case `DOCUMENT_CATEGORY` lookup code (e.g. `CLINIC_CARD`). */
  categoryCode: string;
  /** Lookup-resolved display name, falls back to the raw code. */
  displayName: string;
  /** Lookup row description (when one is set). */
  description: string | null;
  /** Tenant-authored one-liner shown to the parent on the subscribe
   * drawer next to the upload tile. Optional. */
  customHint: string | null;
}

/** Response shape of `GET /admin/tenants/{id}/required-documents`. */
export interface WayelAdminTenantRequiredDocumentsResponse {
  tenantId: string;
  items: WayelAdminTenantRequiredDocumentDto[];
}

/** Body for `PUT /admin/tenants/{id}/required-documents`. */
export interface WayelAdminSetRequiredDocumentsRequest {
  items: Array<{
    categoryCode: string;
    customHint: string | null;
  }>;
}

/** Echo of the saved list (post-normalisation) so the SPA can render
 *  without a follow-up read. */
export interface WayelAdminSetRequiredDocumentsResponse {
  tenantId: string;
  items: Array<{
    categoryCode: string;
    customHint: string | null;
  }>;
}

const BASE = '/api/v1/admin/tenants';

@Injectable({ providedIn: 'root' })
export class WayelAdminTenantsService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  list(query: WayelAdminListTenantsQuery = {}): Promise<WayelAdminTenantsListPage> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.kind) params.set('kind', query.kind);
    if (query.status) params.set('status', query.status);
    if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
    if (query.pageToken) params.set('pageToken', query.pageToken);
    const qs = params.toString();
    const url = qs ? `${BASE}?${qs}` : BASE;
    return this.request<WayelAdminTenantsListPage>(url, { method: 'GET' });
  }

  get(tenantId: string): Promise<WayelAdminTenantDetail> {
    return this.request<WayelAdminTenantDetail>(
      `${BASE}/${encodeURIComponent(tenantId)}`,
      { method: 'GET' },
    );
  }

  create(body: WayelAdminCreateTenantRequest): Promise<WayelAdminCreateTenantResponse> {
    return this.request<WayelAdminCreateTenantResponse>(BASE, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  rename(tenantId: string, body: WayelAdminRenameTenantRequest): Promise<void> {
    return this.request<void>(
      `${BASE}/${encodeURIComponent(tenantId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /**
   * Replace the public-identity profile (tagline, description, fee, age
   * range, location, …). Total-replacement semantics: any property
   * omitted from the body is treated as `null` server-side and clears
   * the slot. Returns the refreshed `TenantDetail` so callers can hand
   * it straight into the form models without a follow-up GET.
   */
  updateProfile(
    tenantId: string,
    body: WayelAdminUpdateProfileRequest,
  ): Promise<WayelAdminTenantDetail> {
    return this.request<WayelAdminTenantDetail>(
      `${BASE}/${encodeURIComponent(tenantId)}/profile`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /**
   * Replace the operational record (institution type, subscription
   * plan, timezone). Slug is intentionally not on this endpoint — it's
   * the tenant's stable URL identifier and never changes after creation.
   */
  updateRecord(
    tenantId: string,
    body: WayelAdminUpdateRecordRequest,
  ): Promise<WayelAdminTenantDetail> {
    return this.request<WayelAdminTenantDetail>(
      `${BASE}/${encodeURIComponent(tenantId)}/record`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /** Replace the first-admin contact (email, first name, last name).
   * An all-null body clears the slot. */
  updateAdminContact(
    tenantId: string,
    body: WayelAdminUpdateAdminContactRequest,
  ): Promise<WayelAdminTenantDetail> {
    return this.request<WayelAdminTenantDetail>(
      `${BASE}/${encodeURIComponent(tenantId)}/admin`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /** Replace the full branding blob (display name, 7 colour fields,
   * logo / favicon URLs, custom domain, default theme, support contact). */
  updateBranding(
    tenantId: string,
    body: WayelAdminUpdateBrandingRequest,
  ): Promise<WayelAdminTenantDetail> {
    return this.request<WayelAdminTenantDetail>(
      `${BASE}/${encodeURIComponent(tenantId)}/branding`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /** Replace operational settings (capacity caps, retention, allowed
   * file extensions, feature flags). */
  updateSettings(
    tenantId: string,
    body: WayelAdminUpdateSettingsRequest,
  ): Promise<WayelAdminTenantDetail> {
    return this.request<WayelAdminTenantDetail>(
      `${BASE}/${encodeURIComponent(tenantId)}/settings`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /**
   * Read this institution's currently-saved required-documents list.
   * The server resolves each persisted code against the platform
   * `DOCUMENT_CATEGORY` lookup catalogue and returns a `displayName` +
   * `description` per entry — saves the SPA from a follow-up
   * lookup-listing call when it just wants to render the saved chips.
   */
  getRequiredDocuments(
    tenantId: string,
  ): Promise<WayelAdminTenantRequiredDocumentsResponse> {
    return this.request<WayelAdminTenantRequiredDocumentsResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/required-documents`,
      { method: 'GET' },
    );
  }

  /**
   * Total-replacement of the institution's required-documents list.
   * Pass `[]` to clear the list (parents will then only need the
   * platform baseline that AddChild already enforces). Each entry
   * pairs a `DOCUMENT_CATEGORY` code with an optional one-line hint
   * shown to the parent on the subscribe drawer.
   */
  setRequiredDocuments(
    tenantId: string,
    body: WayelAdminSetRequiredDocumentsRequest,
  ): Promise<WayelAdminSetRequiredDocumentsResponse> {
    return this.request<WayelAdminSetRequiredDocumentsResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/required-documents`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
  }

  /**
   * Move a tenant into the Suspended state. Idempotent on the server.
   * Reason is required (3-500 chars) and surfaces in the audit log.
   */
  suspend(
    tenantId: string,
    body: WayelAdminSuspendTenantRequest,
  ): Promise<WayelAdminTenantStatusResponse> {
    return this.request<WayelAdminTenantStatusResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/suspend`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /**
   * Re-enable a previously suspended tenant. Idempotent. Rejected with
   * `tenant.archived` when the tenant is in the terminal Archived state.
   */
  activate(tenantId: string): Promise<WayelAdminTenantStatusResponse> {
    return this.request<WayelAdminTenantStatusResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/activate`,
      { method: 'POST', body: '{}' },
    );
  }

  /**
   * Terminal lifecycle transition — archives the tenant. Reason required.
   * Subsequent rename / suspend / activate calls return `tenant.archived`.
   */
  archive(
    tenantId: string,
    body: WayelAdminArchiveTenantRequest,
  ): Promise<WayelAdminTenantStatusResponse> {
    return this.request<WayelAdminTenantStatusResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/archive`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /**
   * Dry-run preview of the hard-delete cascade. Returns the
   * per-collection row counts the destructive endpoint would remove.
   * Cheap to call (single round-trip; runs every filter as a
   * `countDocuments` rather than a `deleteMany`) so the SPA can
   * render the confirmation modal without committing the operator
   * to anything.
   */
  previewPurge(tenantId: string): Promise<WayelAdminTenantPurgePreview> {
    return this.request<WayelAdminTenantPurgePreview>(
      `${BASE}/${encodeURIComponent(tenantId)}/purge-preview`,
      { method: 'GET' },
    );
  }

  /**
   * Run the hard-delete cascade for real. Irreversible. The caller
   * must echo the tenant's current name in
   * {@link WayelAdminHardDeleteTenantRequest.confirmationName} or
   * the server returns `tenant.confirmation_mismatch` (HTTP 400).
   * Returns the per-collection deletion summary so the UI can render
   * a "deleted X rows" outcome without re-listing.
   */
  hardDelete(
    tenantId: string,
    body: WayelAdminHardDeleteTenantRequest,
  ): Promise<WayelAdminHardDeleteTenantResponse> {
    return this.request<WayelAdminHardDeleteTenantResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/purge`,
      { method: 'DELETE', body: JSON.stringify(body) },
    );
  }

  /**
   * Slug uniqueness probe. The backend doesn't expose a dedicated
   * "is-slug-free?" endpoint — we just attempt a list with `search`
   * matching the slug and check whether any returned row has the exact
   * normalised slug. Fast enough (single round-trip, page-size 5) and
   * reuses the same auth + audit posture as the rest of the surface.
   */
  async slugTaken(slug: string, excludeTenantId?: string): Promise<boolean> {
    const normalised = slug.trim().toLowerCase();
    if (!normalised) return false;
    const page = await this.list({ search: normalised, pageSize: 5 });
    return page.items.some(
      (t) => t.slug === normalised && (!excludeTenantId || t.tenantId !== excludeTenantId),
    );
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const isStateChanging =
      init.method !== undefined &&
      init.method !== 'GET' &&
      init.method !== 'HEAD' &&
      init.method !== 'OPTIONS';

    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...this.baseHeaders,
        ...platformBearerAuthHeaders(),
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
      };
      detail = payload.detail || payload.title || detail;
      // Wayel.Api sets `title = error.code` and encodes `type` as
      // `https://wayel.dev/errors/<code>`. Prefer an explicit `code`
      // when present, then `title` (which is exactly the code), then
      // strip the prefix from `type` as a last resort. Same heuristic
      // as `WayelAcceptInvitationService` so error UX stays consistent.
      if (payload.code) {
        code = payload.code;
      } else if (payload.title && payload.title.includes('.')) {
        code = payload.title;
      } else if (payload.type) {
        const marker = '/errors/';
        const idx = payload.type.indexOf(marker);
        code = idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as WayelAdminTenantsHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelAdminTenants = (): WayelAdminTenantsService =>
  inject(WayelAdminTenantsService);
