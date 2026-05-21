import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import {
  EMPTY_PHASE0_CHILD_PROFILE,
  EMPTY_PHASE0_GUARDIAN_PROFILE,
  type Phase0AddParentChildRequest,
  type Phase0AddParentChildResponse,
  type Phase0ChildGender,
  type Phase0ChildProfile,
  type Phase0CreateMemoryRequest,
  type Phase0GuardianIdType,
  type Phase0GuardianProfile,
  type Phase0GuardianTitle,
  type Phase0LifetimeArchive,
  type Phase0ListParentsQuery,
  type Phase0Memory,
  type Phase0OnboardParentRequest,
  type Phase0OnboardParentResponse,
  type Phase0Parent,
  type Phase0ParentChild,
  type Phase0ParentListResult,
} from '../core/contracts/parents.phase0';

/**
 * HTTP client for the parent-app surface (Phase 0).
 * Used both by the parent app proper (in production) and by the in-admin
 * simulator that rehearses the subscribe → approve cycle.
 *
 * Routes are mounted under /api/v1 by the API host; the BFFs forward the
 * path verbatim. Read endpoints (list/get) are served by ParentsEndpoints
 * in Wayel.Api; mutations (onboard/addChild/memories/archive) currently
 * fall through to the parent self-service surface — see MeParentEndpoints
 * for the authoritative shapes.
 */
@Injectable({ providedIn: 'root' })
export class ParentsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  list(query: Phase0ListParentsQuery = {}): Observable<Phase0ParentListResult> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null)
      params = params.set('pageSize', String(query.pageSize));
    return this.http
      .get<WireListParentsResponse>(`${this.base()}/api/v1/parents`, { params })
      .pipe(map(fromWireListResponse));
  }

  get(id: string): Observable<Phase0Parent> {
    return this.http
      .get<WireParentSummary>(
        `${this.base()}/api/v1/parents/${encodeURIComponent(id)}`,
      )
      .pipe(map(fromWireParent));
  }

  /**
   * Parent self-lookup. Uses the auth identity (no caller-supplied id) and
   * is the only `get`-shaped call the parent-portal SPA is allowed to make
   * in live mode — `/api/v1/parents/{id}` is staff-only and 403s for
   * parents.
   */
  getMe(): Observable<Phase0Parent> {
    return this.http
      .get<WireParentSummary>(`${this.base()}/api/v1/me/parent`)
      .pipe(map(fromWireParent));
  }

  /**
   * Persist the parent's own profile (display name, phone, and the full
   * guardian profile block — title, ID, mobile/telephone split, financial
   * email). The server enforces the same validation the SPA does so the
   * round-trip is safe to call on every save.
   *
   * `patch` semantics: when `profile` is omitted the existing block is
   * left untouched (used by code paths that just want to nudge the
   * legacy display-name / phone fields). When provided it replaces the
   * stored block in full — partial updates are made by reading the
   * current profile first and merging client-side.
   */
  patchMeProfile(
    body: PatchMeParentProfileBody,
  ): Observable<Phase0Parent> {
    return this.http
      .patch<WireParentSummary>(`${this.base()}/api/v1/me/parent`, body)
      .pipe(map(fromWireParent));
  }

  onboard(
    body: Phase0OnboardParentRequest,
  ): Observable<Phase0OnboardParentResponse> {
    // Onboard is a parent self-service write; staff impersonation isn't
    // wired yet, so we route to the parent app's /me surface. The mock
    // simulator never reaches here.
    return this.http.post<Phase0OnboardParentResponse>(
      `${this.base()}/api/v1/me/parent`,
      body,
    );
  }

  addChild(
    parentId: string,
    body: Phase0AddParentChildRequest,
  ): Observable<Phase0AddParentChildResponse> {
    // Same caveat as onboard — uses the caller's own roster regardless of
    // the supplied parentId until impersonation lands. parentId is kept
    // in the signature so the bridge contract doesn't change.
    void parentId;
    return this.http.post<Phase0AddParentChildResponse>(
      `${this.base()}/api/v1/me/parent/children`,
      body,
    );
  }

  /**
   * Archive one ended subscription period — stamps `archivedAt` server-side
   * and returns the parent-readable snapshot of the period.
   *
   * Routes to the parent self-service surface (`/me/parent/...`); `parentId`
   * is informational because the backend always uses the bearer's identity.
   */
  archivePeriod(
    parentId: string,
    parentChildId: string,
    subscriptionId: string,
  ): Observable<Phase0LifetimeArchive> {
    void parentId;
    return this.http
      .post<WireSubscriptionPeriod>(
        `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/subscriptions/${encodeURIComponent(subscriptionId)}/archive`,
        {},
      )
      // The single-period response is shaped close enough to the lifetime
      // archive that we wrap it; callers just need `archivedAt` updated.
      .pipe(map((p) => wrapArchivedPeriod(parentChildId, p)));
  }

  /**
   * Schedule the parent's subscription to end at the close of its
   * current billing term. Server stamps `scheduledEndsOn` on the
   * period; the renewal ticker auto-ends it on that date.
   *
   * Returns the updated period so the caller can refresh the row in
   * place without a full re-fetch.
   */
  cancelMyPeriodAtTermEnd(
    parentChildId: string,
    subscriptionId: string,
    reason: string | null,
  ): Observable<MyParentSubscriptionRow> {
    return this.http.post<MyParentSubscriptionRow>(
      `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel-at-term-end`,
      { reason },
    );
  }

  /**
   * Export the full lifetime of a parent-child as a single JSON snapshot.
   * Read-only: does not change anything server-side.
   */
  exportLifetime(
    parentId: string,
    parentChildId: string,
  ): Observable<Phase0LifetimeArchive> {
    void parentId;
    return this.http
      .get<WireLifetimeManifest>(
        `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/lifetime`,
      )
      .pipe(map(fromWireLifetime));
  }

  listMemories(
    parentId: string,
    parentChildId: string,
  ): Observable<Phase0Memory[]> {
    void parentId;
    return this.http
      .get<{ items: WireMemory[] }>(
        `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/memories`,
      )
      .pipe(map((r) => (r?.items ?? []).map((m) => fromWireMemory(m, parentChildId))));
  }

  addMemory(
    parentId: string,
    parentChildId: string,
    body: Phase0CreateMemoryRequest,
  ): Observable<Phase0Memory> {
    void parentId;
    const payload = {
      title: body.caption?.trim() || 'Memory',
      note: null,
      occurredOn: body.occurredAt,
      photos: body.kind === 'video' ? [] : [body.url],
      tags: body.tag ? [body.tag] : [],
    };
    return this.http
      .post<WireMemory>(
        `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/memories`,
        payload,
      )
      .pipe(map((m) => fromWireMemory(m, parentChildId)));
  }

  removeMemory(
    parentId: string,
    parentChildId: string,
    memoryId: string,
  ): Observable<void> {
    void parentId;
    return this.http.delete<void>(
      `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/memories/${encodeURIComponent(memoryId)}`,
    );
  }

  /**
   * List active + archived subscription periods for one of the caller's
   * children. Pure read; used by the lifetime / subscriptions screens.
   */
  listSubscriptions(
    parentChildId: string,
  ): Observable<WireSubscriptionPeriod[]> {
    return this.http
      .get<{ items: WireSubscriptionPeriod[] }>(
        `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/subscriptions`,
      )
      .pipe(map((r) => r?.items ?? []));
  }

  /**
   * Parent-wide enrolment history across every child the caller owns.
   * Powers the "My subscriptions" / "My requests" page so it isn't
   * artificially empty when the family has enrolments seeded directly
   * (no request paper trail) or when every prior request has resolved.
   *
   * The wire shape carries the child display name so the UI doesn't
   * have to re-resolve it from the parent profile per row.
   */
  listMySubscriptions(): Observable<MyParentSubscriptionRow[]> {
    return this.http
      .get<{ items: MyParentSubscriptionRow[] }>(
        `${this.base()}/api/v1/me/parent/subscriptions`,
      )
      .pipe(map((r) => r?.items ?? []));
  }

  /**
   * Preferred-partner endorsements visible to the caller, sourced from
   * the institutions the parent currently has an active subscription
   * at. Backs the "Preferred by …" pill on the
   * <c>/parent/subscribe</c> directory cards. Returns an empty list
   * when the parent has no curators or none of them have flagged
   * any partners as preferred.
   */
  listMyPreferredPartners(): Observable<WirePreferredPartner[]> {
    return this.http
      .get<{ items: WirePreferredPartner[] }>(
        `${this.base()}/api/v1/me/parent/preferred-partners`,
      )
      .pipe(map((r) => r?.items ?? []));
  }

  /**
   * Patch one child on the caller's roster (`/me/parent/children/{id}`).
   * `parentId` is ignored — kept for parity with the mock bridge signature.
   */
  patchMeChild(
    parentId: string,
    parentChildId: string,
    body: MeParentPatchChildBody,
  ): Observable<Phase0ParentChild> {
    void parentId;
    return this.http
      .patch<WireParentChildSummary>(
        `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}`,
        body,
      )
      .pipe(map(fromWireChild));
  }

  /**
   * Remove a child from the caller's roster (`DELETE .../children/{id}`).
   */
  removeMeChild(parentId: string, parentChildId: string): Observable<void> {
    void parentId;
    return this.http.delete<void>(
      `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}`,
    );
  }
}

/** Body for PATCH `/api/v1/me/parent/children/{id}` (camelCase JSON). */
export interface MeParentPatchChildBody {
  displayName?: string | null;
  dateOfBirth?: string | null;
  notes?: string | null;
  clearNotes?: boolean;
  photoUrl?: string | null;
  clearPhoto?: boolean;
  /**
   * Extended profile block (gender, first/last name, consent flags,
   * ailments). When omitted the server leaves the existing block
   * untouched; pass a full block to replace it. Mirrors
   * `UpdateChildCommand.Profile` on the C# side.
   */
  profile?: Phase0ChildProfile | null;
}

// --- wire ↔ contract conversion ----------------------------------------------
//
// The C# API returns `ParentSummary` field-for-field but uses the
// canonical `parentId` / `parentChildId` names plus separate
// `createdOnUtc` / `updatedOnUtc` timestamps. The Phase 0 contract uses
// `id` and a single `createdAt` per the original mock shape, so we
// translate at the seam to keep the rest of the SPA unchanged.

interface WireChildProfile {
  firstName: string | null;
  lastName: string | null;
  gender: Phase0ChildGender;
  hasEpilepsyHistory: boolean | null;
  allowSocialMediaSharing: boolean | null;
  ailmentsAllergiesConditions: string | null;
}

interface WireRequiredChildDocumentsStatus {
  hasClinicCard: boolean;
  hasBirthCertificate: boolean;
  hasAll?: boolean;
  /**
   * Upper-cased `DOCUMENT_CATEGORY` codes the child currently has on
   * their vault. Optional on the wire for back-compat with deploys
   * that pre-date the per-tenant required-documents feature.
   */
  categoryCodesPresent?: ReadonlyArray<string>;
}

interface WireParentChildSummary {
  parentChildId: string;
  displayName: string;
  dateOfBirth: string;
  notes: string | null;
  photoUrl: string | null;
  /**
   * Optional on the wire to keep us forward-compatible with builds
   * that haven't shipped the gender field yet — readers fall back to
   * {@link EMPTY_PHASE0_CHILD_PROFILE} so call-sites can rely on the
   * block being present.
   */
  profile: WireChildProfile | null;
  createdOnUtc: string;
  updatedOnUtc: string;
  /**
   * Optional snapshot of "does this child carry the platform-required
   * documents (clinic card + birth certificate)?". Older deploys won't
   * include this — the SPA treats missing as "unknown" and falls
   * back to the server-side guard.
   */
  requiredDocuments?: WireRequiredChildDocumentsStatus | null;
}

/**
 * Wire body for `PATCH /api/v1/me/parent`. Mirrors `UpdateMyParentProfileCommand`
 * on the C# side. Display name / phone are the legacy minimum; the
 * `profile` block carries the extended guardian fields the parent fills
 * in on `/parent/profile`. When `profile` is omitted the existing
 * stored block is left alone — caller patches the wider fields by
 * reading the current profile first and re-sending the merged shape.
 */
export interface PatchMeParentProfileBody {
  displayName?: string | null;
  phone?: string | null;
  clearPhone?: boolean;
  profile?: Phase0GuardianProfile | null;
}

interface WireGuardianProfile {
  title: Phase0GuardianTitle;
  firstName: string | null;
  lastName: string | null;
  idType: Phase0GuardianIdType;
  idNumber: string | null;
  mobile: string | null;
  telephone: string | null;
  financialEmail: string | null;
}

interface WireParentSummary {
  parentId: string;
  ownerUserId: string;
  displayName: string;
  email: string;
  phone: string | null;
  /**
   * Optional on the wire (server omits the block until the rest of the
   * payload migrates), so consumers fall back to the empty profile when
   * absent. Once the API is on a build that includes this it'll always
   * be present.
   */
  profile: WireGuardianProfile | null;
  children: ReadonlyArray<WireParentChildSummary>;
  createdOnUtc: string;
  updatedOnUtc: string;
}

interface WireListParentsResponse {
  items: ReadonlyArray<WireParentSummary>;
  total: number;
  page: number;
  pageSize: number;
}

function fromWireParent(wire: WireParentSummary): Phase0Parent {
  return {
    id: wire.parentId,
    displayName: wire.displayName,
    email: wire.email,
    phone: wire.phone,
    profile: wire.profile
      ? {
          title: wire.profile.title,
          firstName: wire.profile.firstName,
          lastName: wire.profile.lastName,
          idType: wire.profile.idType,
          idNumber: wire.profile.idNumber,
          mobile: wire.profile.mobile,
          telephone: wire.profile.telephone,
          financialEmail: wire.profile.financialEmail,
        }
      : { ...EMPTY_PHASE0_GUARDIAN_PROFILE },
    createdAt: wire.createdOnUtc,
    children: wire.children.map(fromWireChild),
  };
}

function fromWireChild(wire: WireParentChildSummary): Phase0ParentChild {
  const requiredDocuments = wire.requiredDocuments
    ? {
        hasClinicCard: !!wire.requiredDocuments.hasClinicCard,
        hasBirthCertificate: !!wire.requiredDocuments.hasBirthCertificate,
        hasAll:
          !!wire.requiredDocuments.hasClinicCard &&
          !!wire.requiredDocuments.hasBirthCertificate,
        categoryCodesPresent: Array.isArray(wire.requiredDocuments.categoryCodesPresent)
          ? wire.requiredDocuments.categoryCodesPresent.map((c) => c.toUpperCase())
          : undefined,
      }
    : null;
  return {
    id: wire.parentChildId,
    displayName: wire.displayName,
    dateOfBirth: wire.dateOfBirth,
    notes: wire.notes,
    photoUrl: wire.photoUrl,
    profile: wire.profile
      ? {
          firstName: wire.profile.firstName,
          lastName: wire.profile.lastName,
          gender: wire.profile.gender,
          hasEpilepsyHistory: wire.profile.hasEpilepsyHistory,
          allowSocialMediaSharing: wire.profile.allowSocialMediaSharing,
          ailmentsAllergiesConditions: wire.profile.ailmentsAllergiesConditions,
        }
      : { ...EMPTY_PHASE0_CHILD_PROFILE },
    requiredDocuments,
  };
}

function fromWireListResponse(
  wire: WireListParentsResponse,
): Phase0ParentListResult {
  return {
    items: wire.items.map(fromWireParent),
    totalCount: wire.total,
    page: wire.page,
    pageSize: wire.pageSize,
  };
}

// --- Memory / subscription / lifetime wire shapes ---------------------------

interface WireMemory {
  id: string;
  parentId: string;
  parentChildId: string;
  title: string;
  note: string | null;
  occurredOn: string;
  source: string;
  photos: string[] | null;
  tags: string[] | null;
  authorUserId: string | null;
  createdOnUtc: string;
}

interface WireSubscriptionPeriod {
  id: string;
  parentId: string;
  parentChildId: string;
  institutionId: string;
  institutionChildId: string | null;
  institutionName: string;
  startedOnUtc: string;
  archivedOnUtc: string | null;
  archiveReason: string | null;
  isActive: boolean;
}

/**
 * Subscription billing rhythm — mirrors the
 * `Wayel.Domain.Subscriptions.SubscriptionCadence` enum on the wire.
 * "None" is reserved for legacy / seeded data that pre-dates Phase 1.
 */
export type SubscriptionCadenceWire =
  | 'None'
  | 'Monthly'
  | 'Termly'
  | 'SixMonths'
  | 'NineMonths'
  | 'Yearly';

/**
 * Wire shape returned by `GET /api/v1/me/parent/subscriptions`. Mirrors
 * `MyParentSubscriptionDto` on the C# side and adds the child display
 * name so the SPA doesn't have to fan out per-row.
 *
 * The lifecycle block (cadence / currentTerm... / nextRenewalOn /
 * scheduledEndsOn / trialDays / renewalCount) drives the "Renews on" /
 * "Ends on" / "Trial ends on" pills on the parent's "My subscriptions"
 * page. All date strings are inclusive ISO calendar dates ("yyyy-MM-dd").
 */
export interface MyParentSubscriptionRow {
  id: string;
  parentId: string;
  parentChildId: string;
  childDisplayName: string;
  institutionId: string;
  institutionChildId: string | null;
  institutionName: string;
  startedOnUtc: string;
  archivedOnUtc: string | null;
  archiveReason: string | null;
  isActive: boolean;
  programId?: string | null;
  endReason?: string | null;
  cadence?: SubscriptionCadenceWire | null;
  currentTermStartsOn?: string | null;
  currentTermEndsOn?: string | null;
  nextRenewalOn?: string | null;
  scheduledEndsOn?: string | null;
  trialDays?: number;
  renewalCount?: number;
  /**
   * The parent's tokenised default card, surfaced alongside each
   * active subscription row so the SPA can render
   * "Next charge: 1 Jul 2027 · Visa •••• 4081" without a follow-up
   * fetch. `null` when the parent hasn't added a card yet, or the
   * row is archived. The shape mirrors the C# {@link
   * Wayel.Application.Features.Me.Parents.Subscriptions.DefaultPaymentMethodDto}.
   */
  defaultPaymentMethod?: DefaultPaymentMethodSummary | null;
  /**
   * Optional classroom assignment captured by the curator at approve
   * time (e.g. "Sunbeams 2-3"). Free text — null when the
   * institution doesn't use classroom assignments. Surfaced inline
   * on the parent's subscription card so the household can see which
   * group the child landed in without contacting the school.
   */
  classroom?: string | null;
  /**
   * Approval-time billing snapshot. Drives the "Next charge" line
   * and the "Add a card before {date}" banner on the SPA. `null` for
   * free programmes / legacy rows opened before approval-time
   * snapshotting was wired.
   */
  billing?: BillingSnapshotSummary | null;
  /**
   * Reference to the proforma invoice minted at approval time so the
   * SPA can deep-link "Invoice INV-2026-000123" and surface the
   * upcoming charge as a real artefact. `null` when the programme is
   * free (no proforma was minted) or for legacy rows.
   */
  proformaInvoice?: ProformaInvoiceSummary | null;
}

export interface DefaultPaymentMethodSummary {
  paymentMethodId: string;
  brand: string;
  last4: string;
  expiryYear: number;
  expiryMonth: number;
}

export interface BillingSnapshotSummary {
  currency: string;
  amountCents: number;
  /** Locale-formatted "R450.00" / "$5.00" — single source of truth for display. */
  formattedAmount: string;
  firstChargeOnUtc: string;
  trialEndsOnUtc: string | null;
}

export interface ProformaInvoiceSummary {
  invoiceId: string;
  number: string;
  totalCents: number;
  currency: string;
  /** Server-formatted "R450.00" — same convention as billing.formattedAmount. */
  formattedTotal: string;
  issuedOnUtc: string;
  dueOnUtc: string;
}

/**
 * Curator descriptor inside a {@link WirePreferredPartner}. Mirrors
 * the backend's <c>EndorsingCuratorDto</c>: just enough metadata for
 * the SPA to render "Preferred by {curator}" attribution and apply
 * the curator's brand accent on the directory card / drawer.
 */
export interface WireEndorsingCurator {
  institutionId: string;
  name: string;
  /** CSS hex / colour token; `null` when the curator has no branding. */
  accentColor: string | null;
}

/**
 * Wire shape returned by `GET /api/v1/me/parent/preferred-partners`.
 * One row per partner institution endorsed by at least one curator
 * the parent currently subscribes to. The bridge collapses this into
 * the `Map<partnerId, PreferredEndorsement>` consumed by the
 * directory UI.
 */
export interface WirePreferredPartner {
  partnerInstitutionId: string;
  partnerName: string;
  partnerAccentColor: string | null;
  curators: WireEndorsingCurator[];
}

interface WireLifetimeManifest {
  exportVersion: string;
  exportedOnUtc: string;
  child: WireParentChildSummary;
  subscriptions: WireSubscriptionPeriod[];
  memories: WireMemory[];
  // Daily reports come back in DailyReportSummary shape; we surface them as
  // opaque blobs in the lifetime export so the caller can render later.
  dailyReports: unknown[];
}

function fromWireMemory(w: WireMemory, parentChildId: string): Phase0Memory {
  const photo = (w.photos ?? [])[0] ?? '';
  return {
    id: w.id,
    parentChildId,
    kind: 'photo',
    url: photo,
    caption: w.title || w.note || null,
    occurredAt: w.occurredOn,
    createdAt: w.createdOnUtc,
    tag: (w.tags ?? [])[0] ?? null,
    institutionId: null,
    institutionName: null,
  };
}

function wrapArchivedPeriod(
  parentChildId: string,
  p: WireSubscriptionPeriod,
): Phase0LifetimeArchive {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    parent: { id: p.parentId, displayName: '', email: '', phone: null },
    child: {
      id: parentChildId,
      displayName: '',
      dateOfBirth: '',
      notes: null,
      photoUrl: null,
    },
    periods: [periodToArchive(p)],
    memories: [],
  };
}

function periodToArchive(p: WireSubscriptionPeriod) {
  return {
    id: p.id,
    institutionId: p.institutionId,
    institutionName: p.institutionName,
    institutionChildId: p.institutionChildId,
    state: (p.isActive ? 'active' : 'ended') as 'active' | 'ended',
    classroom: null as string | null,
    enrolledAt: p.startedOnUtc,
    endedAt: p.archivedOnUtc,
    endedReason: p.archiveReason,
    archivedAt: p.archivedOnUtc,
    sealed: !p.isActive,
    events: [],
  };
}

function fromWireLifetime(w: WireLifetimeManifest): Phase0LifetimeArchive {
  return {
    schemaVersion: 1,
    exportedAt: w.exportedOnUtc,
    parent: { id: '', displayName: '', email: '', phone: null },
    child: {
      id: w.child.parentChildId,
      displayName: w.child.displayName,
      dateOfBirth: w.child.dateOfBirth,
      notes: w.child.notes,
      photoUrl: w.child.photoUrl,
    },
    periods: (w.subscriptions ?? []).map(periodToArchive),
    memories: (w.memories ?? []).map((m) => fromWireMemory(m, w.child.parentChildId)),
  };
}
