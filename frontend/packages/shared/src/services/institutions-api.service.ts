import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type { MockInstitutionCategory } from '../core/mock/mock-institutions';

/**
 * Wire shape for `/api/v1/tenants/directory` — see
 * `GetPublicInstitutionDirectoryQuery` in the API for the canonical
 * definition. Optional everywhere because tenants can exist with an
 * empty profile and still appear in the catalogue (with degraded cards).
 */
export interface WirePublicInstitutionEntry {
  id: string;
  name: string;
  slug: string;
  kind: 'Unknown' | 'Daycare' | 'Session';
  category: string | null;
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
  /**
   * Resolved annual subscription window — the institution's custom
   * override or the platform default 8 Jan – 10 Dec. Always present;
   * the SPA gates submit / approval banners off this rather than
   * recomputing the platform fallback locally.
   */
  subscriptionWindow: WirePublicSubscriptionWindow;
  /**
   * Documents this institution requires on every subscribed child's
   * vault. Resolved against the platform DOCUMENT_CATEGORY catalogue
   * server-side so the SPA can render "Clinic Card" labels (and the
   * tenant-authored hint, when set) without a follow-up call. Empty
   * list means the institution gates only on the platform baseline
   * that AddChild already enforces. Optional in the type because
   * legacy SPA builds may parse a wire response without the field;
   * production servers always populate it (possibly to `[]`).
   */
  requiredDocuments?: ReadonlyArray<WirePublicRequiredDocument> | null;
}

/** Wire shape mirroring `PublicSubscriptionWindowDto` on the server. */
export interface WirePublicSubscriptionWindow {
  openMonth: number;
  openDay: number;
  closeMonth: number;
  closeDay: number;
  isCustom: boolean;
}

/** Wire shape mirroring `PublicRequiredDocumentDto` on the server. */
export interface WirePublicRequiredDocument {
  categoryCode: string;
  displayName: string;
  description: string | null;
  customHint: string | null;
}

export interface WirePublicInstitutionDirectoryResponse {
  items: ReadonlyArray<WirePublicInstitutionEntry>;
  total: number;
  page: number;
  pageSize: number;
  cities: ReadonlyArray<string>;
  totalsByCategory: Record<string, number>;
}

/** Query knobs for {@link InstitutionsApiService.directory}. */
export interface InstitutionDirectoryQueryWire {
  search?: string;
  category?: string;
  kind?: 'Daycare' | 'Session';
  city?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Wire shape for `/api/v1/tenants/{slug}/programs` — see
 * `GetPublicTenantProgramsQuery` in the API for the canonical
 * definition. Slim, parent-facing programme entries (no staff
 * assignments, no audit timestamps).
 */
export interface WirePublicTenantPrograms {
  tenantId: string;
  slug: string;
  name: string;
  programs: ReadonlyArray<WirePublicProgram>;
}

export interface WirePublicProgram {
  programId: string;
  name: string;
  description: string | null;
  kind: 'Daycare' | 'Session';
  capacity: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fees: ReadonlyArray<WirePublicProgramFee>;
}

export interface WirePublicProgramFee {
  year: number;
  amount: number;
  currency: string;
  cadence: 'Month' | 'Term' | 'Year';
}

/**
 * Lean, anonymous-only client for the parent subscribe catalogue. Read-only
 * by design — institutions are surfaced from the SuperAdmin tenant
 * onboarding flow, never minted from this API.
 */
@Injectable({ providedIn: 'root' })
export class InstitutionsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  directory(
    query: InstitutionDirectoryQueryWire = {},
  ): Observable<WirePublicInstitutionDirectoryResponse> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    if (query.category) params = params.set('category', query.category);
    if (query.kind) params = params.set('kind', query.kind);
    if (query.city) params = params.set('city', query.city);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null)
      params = params.set('pageSize', String(query.pageSize));
    return this.http.get<WirePublicInstitutionDirectoryResponse>(
      `${this.base()}/api/v1/tenants/directory`,
      { params },
    );
  }

  /**
   * Public, unauthenticated lookup of a tenant's active programmes by
   * slug. Backs the parent-subscribe portfolio drawer so the SPA no
   * longer has to fall back to the in-memory MOCK_PROGRAMS table.
   */
  programsBySlug(slug: string): Observable<WirePublicTenantPrograms> {
    const safe = encodeURIComponent(slug);
    return this.http.get<WirePublicTenantPrograms>(
      `${this.base()}/api/v1/tenants/${safe}/programs`,
    );
  }
}

/**
 * Best-effort projection of the wire `category` (free text on the server)
 * into the SPA's static `MockInstitutionCategory` union. Unknown values
 * fall back to `'preschool'` so the chip totals still land somewhere
 * sensible for early tenants whose profile categories haven't been
 * normalised yet.
 */
export function projectCategory(
  wire: string | null | undefined,
): MockInstitutionCategory {
  const known: ReadonlyArray<MockInstitutionCategory> = [
    'daycare',
    'preschool',
    'aftercare',
    'swim',
    'music',
    'art',
    'martial_arts',
    'dance',
    'sports',
    'robotics',
    'language',
  ];
  const norm = (wire ?? '').trim().toLowerCase();
  return (known as ReadonlyArray<string>).includes(norm)
    ? (norm as MockInstitutionCategory)
    : 'preschool';
}
