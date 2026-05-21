import { Injectable, inject } from '@angular/core';
import { Observable, defer, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '@app/environment';
import type { AppEnvironment } from '../core/environment.types';
import type { Phase0ListTenantsQuery } from '../core/contracts/platform-tenant.phase0';
import type {
  MockPlatformTenant,
  MockPlatformTenantSsoProvider,
  PlatformTenantStatus,
  SsoProviderId,
} from '../core/mock/mock-data';
import {
  CreatePlatformTenantInput,
  MockPlatformTenantService,
  type UpdatePlatformTenantAdminInput,
  type UpdatePlatformTenantBrandingInput,
  type UpdatePlatformTenantProfileInput,
  type UpdatePlatformTenantRecordInput,
  type UpdatePlatformTenantSettingsInput,
} from './mock-platform-tenant.service';
import { phase0TenantDtoToMock } from './platform-tenant-mappers';
import { PlatformTenantApiService } from './platform-tenant-api.service';
import {
  WayelAdminTenantsService,
  type WayelAdminOnboardingAdminInvitationResult,
  type WayelAdminTenantsHttpError,
} from './wayel-admin-tenants.service';
import {
  mockAdminInputToWayel,
  mockBrandingInputToWayel,
  mockCreateInputToWayelCreate,
  mockProfileInputToWayel,
  mockRecordInputToWayel,
  mockSettingsInputToWayel,
  mockStatusToWayel,
  wayelTenantDetailToMock,
  wayelTenantSummaryToMock,
} from './wayel-admin-tenant-mappers';

export type {
  UpdatePlatformTenantAdminInput,
  UpdatePlatformTenantBrandingInput,
  UpdatePlatformTenantProfileInput,
  UpdatePlatformTenantRecordInput,
  UpdatePlatformTenantSettingsInput,
} from './mock-platform-tenant.service';

/** Paged tenant list (mock applies filters in-process; API uses query params). */
export interface PlatformTenantListResult {
  items: MockPlatformTenant[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Result of a successful tenant create. Wraps the freshly-projected
 * `MockPlatformTenant` together with the optional admin-invitation
 * outcome so the wizard's success screen can show "we sent an
 * invitation to ada@…" or surface the copy-link fallback when the
 * email could not be delivered. `adminInvitation` is `null` for mock
 * mode (no invitation flow), the legacy Phase-0 path (no API support
 * yet), or when the operator opted out via `sendAdminInvite: false`.
 */
export interface PlatformTenantCreateResult {
  tenant: MockPlatformTenant;
  adminInvitation: WayelAdminOnboardingAdminInvitationResult | null;
}

function filterMockTenants(rows: MockPlatformTenant[], q: Phase0ListTenantsQuery): MockPlatformTenant[] {
  let out = [...rows];
  if (q.status) {
    out = out.filter((t) => t.status === q.status);
  }
  if (q.plan) {
    out = out.filter((t) => t.plan === q.plan);
  }
  const slugExact = q.slug?.trim().toLowerCase();
  if (slugExact) {
    out = out.filter((t) => t.slug.toLowerCase() === slugExact);
  }
  const s = q.search?.trim().toLowerCase();
  if (s) {
    out = out.filter((t) =>
      [
        t.name,
        t.slug,
        t.type,
        t.plan,
        t.firstAdminEmail ?? '',
        t.firstAdminFirstName ?? '',
        t.firstAdminLastName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(s),
    );
  }
  return out;
}

/**
 * Routes platform-tenant calls to one of three back-ends, picked at
 * bootstrap from the active `environment` flags:
 *
 *   1. `useMock`           → `MockPlatformTenantService` (in-memory).
 *   2. `useWayelAdminApi`  → `WayelAdminTenantsService` against
 *                            `/api/v1/admin/tenants/...` via the BFF.
 *   3. otherwise           → `PlatformTenantApiService` (legacy
 *                            Phase-0 contract, kept for back-compat).
 *
 * The Wayel.Api surface is intentionally narrower than the rich mock
 * UI: it knows about id / name / slug / kind / createdOnUtc only. The
 * mappers in `wayel-admin-tenant-mappers.ts` project the slim DTO into
 * `MockPlatformTenant` with sensible defaults (plan = 'starter',
 * status = 'active', no admin contact). Mutations the API doesn't
 * model yet (status changes, branding, settings, SSO, profile) fall
 * back to the mock for bookkeeping; live counterparts will be wired in
 * as the Wayel.Api grows.
 */
@Injectable({ providedIn: 'root' })
export class PlatformTenantBridgeService {
  private readonly mock = inject(MockPlatformTenantService);
  private readonly api = inject(PlatformTenantApiService);
  private readonly wayel = inject(WayelAdminTenantsService);

  private readonly useWayel: boolean =
    !!(environment as AppEnvironment).useWayelAdminApi && !environment.useMock;

  /** Shown in platform shell / list subtitle. */
  readonly dataSourceLine: string = environment.useMock
    ? 'In-memory mock (US-A01).'
    : this.useWayel
      ? 'Wayel.Api admin tenants (live).'
      : environment.platformApiUrl
        ? `Backed by ${environment.platformApiUrl}.`
        : 'Live API (same origin).';

  /** Short pill for platform sidebar. */
  get dataPill(): string {
    if (environment.useMock) return 'Mock · no API';
    if (this.useWayel) return 'Wayel API';
    return 'Live API';
  }

  /**
   * @param query Omit or use defaults for dashboard-sized pulls (`pageSize` 1000+).
   */
  loadTenants(query: Phase0ListTenantsQuery = {}): Observable<PlatformTenantListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q: Phase0ListTenantsQuery = { ...query, page, pageSize };

    if (environment.useMock) {
      const filtered = filterMockTenants([...this.mock.tenants()], q);
      const totalCount = filtered.length;
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      return of({ items, totalCount, page, pageSize });
    }
    if (this.useWayel) {
      // The Wayel.Api surface uses opaque cursor pagination — we don't
      // have a totalCount, just an `items + nextPageToken` snapshot. The
      // catalogue UI pulls a "dashboard-sized" page (`pageSize: 1000`)
      // up-front and paginates client-side, so a single round-trip is
      // enough; we only honour `pageSize` and the search/slug filters.
      // `plan` isn't modelled server-side yet — applied post-hoc on the
      // projected mock rows. `status` IS modelled server-side and gets
      // pushed through as a filter so the catalogue chips don't have to
      // round-trip 'archived' rows just to drop them client-side.
      const search = q.slug?.trim() ?? q.search?.trim() ?? '';
      const requested = q.pageSize ?? 25;
      const apiPageSize = Math.min(100, Math.max(1, requested));
      const apiStatus = q.status ? mockStatusToWayel(q.status) : undefined;
      return defer(() =>
        from(
          this.wayel.list({
            search: search || undefined,
            pageSize: apiPageSize,
            status: apiStatus,
          }),
        ),
      ).pipe(
        map((apiPage) => {
          let items = apiPage.items.map(wayelTenantSummaryToMock);
          if (q.slug) {
            const exact = q.slug.trim().toLowerCase();
            items = items.filter((t) => t.slug.toLowerCase() === exact);
          }
          return filterMockTenants(items, q);
        }),
        map((rows) => ({
          items: rows,
          totalCount: rows.length,
          page,
          pageSize,
        })),
      );
    }
    return this.api.listTenants(q).pipe(
      map((r) => ({
        items: r.items.map(phase0TenantDtoToMock),
        totalCount: r.totalCount,
        page: r.page,
        pageSize: r.pageSize,
      })),
    );
  }

  getTenant(id: string): Observable<MockPlatformTenant | undefined> {
    if (environment.useMock) {
      return of(this.mock.getById(id));
    }
    if (this.useWayel) {
      // The detail endpoint returns the full TenantDetail (profile,
      // record, admin contact, branding, settings) as of slice #1–#3,
      // so we project the rich blob — earlier we only had the summary
      // fields, which is why every Institution-tab form looked empty.
      return defer(() => from(this.wayel.get(id))).pipe(
        map((dto) => wayelTenantDetailToMock(dto) as MockPlatformTenant | undefined),
        catchError(() => of(undefined)),
      );
    }
    return this.api.getTenant(id).pipe(
      map(phase0TenantDtoToMock),
      catchError(() => of(undefined)),
    );
  }

  createTenant(input: CreatePlatformTenantInput): Observable<PlatformTenantCreateResult> {
    if (environment.useMock) {
      if (this.mock.slugExists(input.slug)) {
        return throwError(() => new Error('SLUG_CONFLICT'));
      }
      // Mock mode has no invitation flow — synthesise a local result so
      // callers can hold a single shape regardless of the back-end.
      return of({ tenant: this.mock.create(input), adminInvitation: null });
    }
    if (this.useWayel) {
      const body = mockCreateInputToWayelCreate(input);
      return defer(() => from(this.wayel.create(body))).pipe(
        map((created) => ({
          tenant: wayelTenantSummaryToMock({
            tenantId: created.tenantId,
            name: created.name,
            slug: created.slug,
            kind: created.kind,
            status: created.status,
            createdOnUtc: created.createdOnUtc,
            // Newly-minted tenants start with zero on all badges. The
            // catalogue card profile fields, however, can be filled in
            // by what the wizard just sent — pull them straight off
            // `body.profile` so the freshly-projected mock row already
            // shows the institution's tagline / location / fee on the
            // optimistic redirect, instead of looking blank until the
            // next list refresh.
            activeChildrenCount: 0,
            staffCount: 0,
            programCount: 0,
            // A freshly-onboarded tenant always lacks a TenantAdmin user
            // (the recipient still needs to accept the invitation and
            // sign in). Project as `awaitingAdmin: true` so the post-
            // create list view immediately shows the badge without
            // waiting for the next list refresh round-trip.
            awaitingAdmin: true,
            adminEmail: body.adminContact?.email ?? null,
            category: body.profile?.category ?? null,
            institutionKind: body.profile?.institutionKind ?? 'Unknown',
            area: body.profile?.area ?? null,
            city: body.profile?.city ?? null,
            tagline: body.profile?.tagline ?? null,
            monthlyFeeZar: body.profile?.monthlyFeeZar ?? null,
            ageMinYears: body.profile?.ageMinYears ?? null,
            ageMaxYears: body.profile?.ageMaxYears ?? null,
            accentColor: body.profile?.accentColor ?? null,
            imageUrl: body.profile?.imageUrl ?? null,
            website: body.profile?.website ?? null,
          }),
          adminInvitation: created.adminInvitation,
        })),
        catchError((err: WayelAdminTenantsHttpError) => {
          // Normalise the conflict shape so `platform-tenant-create`
          // can still pattern-match on the well-known `'SLUG_CONFLICT'`
          // sentinel without knowing about Wayel error codes.
          if (err?.status === 409 || err?.code === 'tenant.slug_taken') {
            return throwError(() => new Error('SLUG_CONFLICT'));
          }
          return throwError(() => err);
        }),
      );
    }
    const initialStatus =
      input.status === 'archived' ? 'pending' : (input.status as 'pending' | 'active' | 'suspended');
    return this.api
      .onboard({
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        plan: input.plan,
        type: input.type.trim(),
        timezone: input.timezone.trim(),
        initialStatus,
        firstAdminEmail: input.firstAdminEmail,
        firstAdminFirstName: input.firstAdminFirstName,
        firstAdminLastName: input.firstAdminLastName,
      })
      .pipe(
        switchMap((res) => {
          const id = res.tenantId;
          if (!id) return throwError(() => new Error('NO_TENANT_ID'));
          return this.api.getTenant(id).pipe(
            map(phase0TenantDtoToMock),
            map((tenant) => ({ tenant, adminInvitation: null })),
          );
        }),
      );
  }

  setStatus(id: string, status: PlatformTenantStatus, reason?: string | null): Observable<void> {
    if (environment.useMock) {
      this.mock.setStatus(id, status);
      return of(void 0);
    }
    if (this.useWayel) {
      // Reason is required by the API for suspend/archive (3-500 chars).
      // Activate doesn't take one. The mock-only `'pending'` state has
      // no API counterpart and is rejected up-front rather than silently
      // mis-mapping it.
      const trimmedReason = (reason ?? '').trim();
      switch (status) {
        case 'suspended':
          return defer(() =>
            from(
              this.wayel.suspend(id, {
                reason: trimmedReason || 'Suspended via admin portal',
              }),
            ),
          ).pipe(map(() => void 0));
        case 'active':
          return defer(() => from(this.wayel.activate(id))).pipe(map(() => void 0));
        case 'archived':
          return defer(() =>
            from(
              this.wayel.archive(id, {
                reason: trimmedReason || 'Archived via admin portal',
              }),
            ),
          ).pipe(map(() => void 0));
        case 'pending':
          return throwError(
            () => new Error("Wayel.Api doesn't model the 'pending' tenant state."),
          );
      }
    }
    return this.api.patchStatus(id, { status, reason: reason ?? null });
  }

  /**
   * Update institution-profile fields (name, tagline, fee, age range, etc.).
   *
   * Mock-only mutation today — there's no Phase-0 contract for these fields
   * yet because they were folded onto `MockPlatformTenant` after the initial
   * SecureDocs-style onboarding API was sketched. When the live API catches
   * up this method will gain a `PATCH /platform/tenants/{id}/profile` branch.
   */
  updateProfile(id: string, input: UpdatePlatformTenantProfileInput): Observable<MockPlatformTenant> {
    if (environment.useMock) {
      const updated = this.mock.updateProfile(id, input);
      return updated ? of(updated) : throwError(() => new Error('NOT_FOUND'));
    }
    if (this.useWayel) {
      // Profile excludes `name` — display name lives on PATCH /admin/tenants/{id}
      // (see {@link WayelAdminTenantsService.rename}). When the form
      // submits a fresh `name`, fan out to a rename so the user sees
      // one atomic save from the UI's point of view.
      //
      // We refetch the full tenant detail at the end because the API's
      // PATCH endpoints only return the slice they updated (e.g. the
      // profile fields), not a full `TenantDetail`; without the GET the
      // mock projection would have undefined `settings` / `record` /
      // `branding` blobs and the UI would crash on the next render.
      const trimmedName = input.name.trim();
      const profileBody = mockProfileInputToWayel(input);
      return defer(() =>
        from(
          (async () => {
            await this.wayel.updateProfile(id, profileBody);
            let detail = await this.wayel.get(id);
            if (trimmedName && trimmedName !== detail.name) {
              await this.wayel.rename(id, { name: trimmedName });
              detail = await this.wayel.get(id);
            }
            return wayelTenantDetailToMock(detail);
          })(),
        ),
      );
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /**
   * Update the operator-facing platform record — plan, type, slug, timezone,
   * max children. Slug uniqueness is enforced; pass through `slugTaken$`
   * before calling if you want a clean error message.
   */
  updateRecord(id: string, input: UpdatePlatformTenantRecordInput): Observable<MockPlatformTenant> {
    if (environment.useMock) {
      if (this.mock.slugExists(input.slug, id)) {
        return throwError(() => new Error('SLUG_CONFLICT'));
      }
      const updated = this.mock.updateRecord(id, input);
      return updated ? of(updated) : throwError(() => new Error('NOT_FOUND'));
    }
    if (this.useWayel) {
      // Slug is immutable on the API side after creation, so we
      // intentionally don't forward `input.slug` even if the form
      // dirtied it — the server would just reject it. `maxChildren`
      // belongs on PATCH .../settings; the dedicated updateSettings
      // call handles capacity changes.
      const recordBody = mockRecordInputToWayel(input);
      return this.runPatchAndProject(id, () =>
        this.wayel.updateRecord(id, recordBody),
      );
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /** Reassign or clear the institution's primary admin contact. */
  updateAdmin(id: string, input: UpdatePlatformTenantAdminInput): Observable<MockPlatformTenant> {
    if (environment.useMock) {
      const updated = this.mock.updateAdmin(id, input);
      return updated ? of(updated) : throwError(() => new Error('NOT_FOUND'));
    }
    if (this.useWayel) {
      const body = mockAdminInputToWayel(input);
      return this.runPatchAndProject(id, () =>
        this.wayel.updateAdminContact(id, body),
      );
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /**
   * Replace the Settings blob (max children, retention, allowed extensions,
   * feature flags). Mock-only today; the live API will gain a `PATCH …/settings`
   * branch when those fields exist server-side.
   */
  updateSettings(
    id: string,
    input: UpdatePlatformTenantSettingsInput,
  ): Observable<MockPlatformTenant> {
    if (environment.useMock) {
      const updated = this.mock.updateSettings(id, input);
      return updated ? of(updated) : throwError(() => new Error('NOT_FOUND'));
    }
    if (this.useWayel) {
      const body = mockSettingsInputToWayel(input);
      return this.runPatchAndProject(id, () =>
        this.wayel.updateSettings(id, body),
      );
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /** Replace the Branding blob (display name, colours, logo, contact info). */
  updateBranding(
    id: string,
    input: UpdatePlatformTenantBrandingInput,
  ): Observable<MockPlatformTenant> {
    if (environment.useMock) {
      const updated = this.mock.updateBranding(id, input);
      return updated ? of(updated) : throwError(() => new Error('NOT_FOUND'));
    }
    if (this.useWayel) {
      const body = mockBrandingInputToWayel(input);
      return this.runPatchAndProject(id, () =>
        this.wayel.updateBranding(id, body),
      );
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /**
   * PATCH a single tenant slice (profile / record / admin / branding /
   * settings) and re-project the resulting tenant by GETting the full
   * detail.
   *
   * Each `PATCH /admin/tenants/{id}/{slice}` endpoint returns only the
   * slice it just touched (e.g. `UpdateTenantBrandingResponse` is just
   * the colours / logo / contact fields), not a complete `TenantDetail`.
   * The mock projection {@link wayelTenantDetailToMock} expects the full
   * shape, so feeding it a slice would dereference `t.settings.maxChildren`
   * (and similar) on `undefined` and crash the SPA.
   *
   * The cost is one extra HTTP round trip per save, which is the right
   * trade against the alternative (defensive nullable projection that
   * silently zeroes unrelated tabs after a save). When the API grows a
   * "return the whole detail" flag this helper is the single place to
   * remove the GET.
   */
  private runPatchAndProject(
    id: string,
    patch: () => Promise<unknown>,
  ): Observable<MockPlatformTenant> {
    return defer(() =>
      from(
        (async () => {
          await patch();
          const detail = await this.wayel.get(id);
          return wayelTenantDetailToMock(detail);
        })(),
      ),
    );
  }

  /** Configure (or update) a single SSO provider for an institution. */
  upsertSsoProvider(
    id: string,
    provider: SsoProviderId,
    config: MockPlatformTenantSsoProvider,
  ): Observable<MockPlatformTenant> {
    if (environment.useMock) {
      const updated = this.mock.upsertSsoProvider(id, provider, config);
      return updated ? of(updated) : throwError(() => new Error('NOT_FOUND'));
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /** Remove a previously-configured SSO provider entirely. */
  removeSsoProvider(id: string, provider: SsoProviderId): Observable<MockPlatformTenant> {
    if (environment.useMock) {
      const updated = this.mock.removeSsoProvider(id, provider);
      return updated ? of(updated) : throwError(() => new Error('NOT_FOUND'));
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /**
   * Hard-delete an institution. Mock-only — the live API equivalent should
   * be `DELETE /platform/tenants/{id}` and is expected to soft-delete on
   * the server. Until then we just drop the row from the in-memory registry.
   */
  delete(id: string): Observable<void> {
    if (environment.useMock) {
      const ok = this.mock.delete(id);
      return ok ? of(void 0) : throwError(() => new Error('NOT_FOUND'));
    }
    return throwError(() => new Error('NOT_IMPLEMENTED_LIVE'));
  }

  /**
   * Whether the slug is already taken (another tenant). Live mode uses
   * `GET .../tenants?slug=` exact match; mock uses in-memory registry.
   */
  slugTaken$(slug: string, excludeId?: string): Observable<boolean> {
    const s = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (!s) return of(false);
    if (environment.useMock) {
      return of(this.mock.slugExists(s, excludeId));
    }
    if (this.useWayel) {
      return defer(() => from(this.wayel.slugTaken(s, excludeId)));
    }
    return this.api.listTenants({ slug: s, page: 1, pageSize: 1 }).pipe(
      map((r) => {
        const hit = r.items[0];
        if (!hit || hit.slug.toLowerCase() !== s) return false;
        if (excludeId && hit.id === excludeId) return false;
        return true;
      }),
    );
  }
}
