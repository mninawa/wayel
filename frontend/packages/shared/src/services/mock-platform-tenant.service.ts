import { Injectable, computed, signal } from '@angular/core';
import {
  MOCK_PLATFORM_TENANTS,
  MockPlatformTenant,
  MockPlatformTenantBranding,
  MockPlatformTenantSettings,
  MockPlatformTenantSso,
  MockPlatformTenantSsoProvider,
  PlatformTenantPlan,
  PlatformTenantStatus,
  SsoProviderId,
} from '../core/mock/mock-data';
import type { MockInstitutionCategory } from '../core/mock/mock-institutions';
import type { Phase0InstitutionKind } from '../core/contracts/daily-reports.phase0';

const MOCK_PLATFORM_ADMIN_ID = 'user_platform_001';

export interface CreatePlatformTenantInput {
  name: string;
  type: string;
  slug: string;
  plan: PlatformTenantPlan;
  status: PlatformTenantStatus;
  timezone: string;
  firstAdminEmail: string | null;
  firstAdminFirstName: string | null;
  firstAdminLastName: string | null;

  /**
   * Optional rich profile captured during the onboarding wizard. These map
   * straight onto the equivalent `MockPlatformTenant` fields and let the
   * wizard avoid a second `updateProfile()` call right after `create()`.
   */
  kind?: Phase0InstitutionKind;
  category?: MockInstitutionCategory;
  area?: string | null;
  city?: string | null;
  /** Optional branding overlay captured on the wizard's Branding step. */
  branding?: MockPlatformTenantBranding;

  /**
   * Whether to mint a `TenantAdmin` staff invitation for
   * <code>firstAdminEmail</code> as part of the create. <code>true</code>
   * (the default) sends the invitation email immediately; <code>false</code>
   * records the contact data on the tenant doc but suppresses the email
   * — useful when bulk-importing institutions or when the operator will
   * deliver the invite link out-of-band. Mirrors the co-parent invite
   * UX. <code>undefined</code> is equivalent to <code>true</code>; we
   * only forward an explicit <code>false</code> on the wire so the
   * server's default stays the source of truth.
   */
  sendAdminInvite?: boolean;
}

/** Editable institution-profile fields surfaced on the platform detail page. */
export interface UpdatePlatformTenantProfileInput {
  name: string;
  category: MockInstitutionCategory | undefined;
  kind: Phase0InstitutionKind | undefined;
  area: string | undefined;
  city: string | undefined;
  tagline: string | undefined;
  description: string | undefined;
  monthlyFeeZar: number | null | undefined;
  ageRangeYears: { min: number; max: number } | undefined;
  accentColor: string | undefined;
  imageUrl: string | null | undefined;
  website: string | undefined;
}

/** Editable platform-record fields (plan, type, timezone, slug, settings). */
export interface UpdatePlatformTenantRecordInput {
  type: string;
  slug: string;
  plan: PlatformTenantPlan;
  timezone: string;
  maxChildren: number | null;
}

/** Editable first-admin fields. */
export interface UpdatePlatformTenantAdminInput {
  firstAdminEmail: string | null;
  firstAdminFirstName: string | null;
  firstAdminLastName: string | null;
}

/**
 * Editable Settings-tab payload — replaces the full settings blob, including
 * feature flags, retention and the allowed-extensions list.
 */
export interface UpdatePlatformTenantSettingsInput {
  settings: MockPlatformTenantSettings;
}

/** Editable Branding-tab payload — replaces the full branding blob. */
export interface UpdatePlatformTenantBrandingInput {
  branding: MockPlatformTenantBranding;
}

@Injectable({ providedIn: 'root' })
export class MockPlatformTenantService {
  private readonly _tenants = signal<MockPlatformTenant[]>([...MOCK_PLATFORM_TENANTS]);

  readonly tenants = this._tenants.asReadonly();

  readonly activeCount = computed(() => this._tenants().filter((t) => t.status === 'active').length);

  getById(id: string): MockPlatformTenant | undefined {
    return this._tenants().find((t) => t.id === id);
  }

  slugExists(slug: string, excludeId?: string): boolean {
    const s = slug.trim().toLowerCase();
    return this._tenants().some((t) => t.slug.toLowerCase() === s && t.id !== excludeId);
  }

  create(input: CreatePlatformTenantInput): MockPlatformTenant {
    const now = new Date().toISOString();
    const status = input.status;
    const trimmedArea = input.area?.trim() || undefined;
    const trimmedCity = input.city?.trim() || undefined;
    const row: MockPlatformTenant = {
      id: `tenant_${Date.now()}`,
      name: input.name.trim(),
      type: input.type.trim(),
      slug: input.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      plan: input.plan,
      status,
      timezone: input.timezone.trim(),
      createdAt: now,
      firstAdminEmail: input.firstAdminEmail?.trim() || null,
      firstAdminFirstName: input.firstAdminFirstName?.trim() || null,
      firstAdminLastName: input.firstAdminLastName?.trim() || null,
      onboardedByUserId: MOCK_PLATFORM_ADMIN_ID,
      activatedAt: status === 'active' ? now : null,
      suspendedAt: status === 'suspended' ? now : null,
      settings: defaultSettingsForPlan(input.plan),
      kind: input.kind,
      category: input.category,
      area: trimmedArea,
      city: trimmedCity,
      accentColor: input.branding?.primaryColor,
      branding: input.branding && Object.keys(input.branding).length > 0 ? input.branding : undefined,
    };
    this._tenants.update((list) => [row, ...list]);
    return row;
  }

  setStatus(id: string, status: PlatformTenantStatus): void {
    const now = new Date().toISOString();
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        let activatedAt = t.activatedAt;
        let suspendedAt = t.suspendedAt;
        if (status === 'active') {
          suspendedAt = null;
          if (!activatedAt) activatedAt = now;
        } else if (status === 'suspended') {
          suspendedAt = now;
        } else if (status === 'pending') {
          activatedAt = null;
          suspendedAt = null;
        }
        return { ...t, status, activatedAt, suspendedAt };
      }),
    );
  }

  updateProfile(id: string, input: UpdatePlatformTenantProfileInput): MockPlatformTenant | undefined {
    let updated: MockPlatformTenant | undefined;
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        updated = {
          ...t,
          name: input.name.trim(),
          category: input.category ?? t.category,
          kind: input.kind ?? t.kind,
          area: emptyToUndef(input.area),
          city: emptyToUndef(input.city),
          tagline: emptyToUndef(input.tagline),
          description: emptyToUndef(input.description),
          monthlyFeeZar:
            input.monthlyFeeZar === undefined ? t.monthlyFeeZar : input.monthlyFeeZar,
          ageRangeYears: input.ageRangeYears ?? t.ageRangeYears,
          accentColor: emptyToUndef(input.accentColor),
          imageUrl: input.imageUrl === undefined ? t.imageUrl : input.imageUrl,
          website: emptyToUndef(input.website),
        };
        return updated;
      }),
    );
    return updated;
  }

  updateRecord(id: string, input: UpdatePlatformTenantRecordInput): MockPlatformTenant | undefined {
    let updated: MockPlatformTenant | undefined;
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-');
        updated = {
          ...t,
          type: input.type.trim(),
          slug,
          plan: input.plan,
          timezone: input.timezone.trim(),
          settings:
            input.maxChildren == null
              ? null
              : { ...(t.settings ?? { maxChildren: 0 }), maxChildren: input.maxChildren },
        };
        return updated;
      }),
    );
    return updated;
  }

  updateAdmin(id: string, input: UpdatePlatformTenantAdminInput): MockPlatformTenant | undefined {
    let updated: MockPlatformTenant | undefined;
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        updated = {
          ...t,
          firstAdminEmail: emptyToNull(input.firstAdminEmail),
          firstAdminFirstName: emptyToNull(input.firstAdminFirstName),
          firstAdminLastName: emptyToNull(input.firstAdminLastName),
        };
        return updated;
      }),
    );
    return updated;
  }

  delete(id: string): boolean {
    let removed = false;
    this._tenants.update((rows) => {
      const next = rows.filter((t) => t.id !== id);
      removed = next.length !== rows.length;
      return next;
    });
    return removed;
  }

  updateSettings(
    id: string,
    input: UpdatePlatformTenantSettingsInput,
  ): MockPlatformTenant | undefined {
    let updated: MockPlatformTenant | undefined;
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, settings: input.settings };
        return updated;
      }),
    );
    return updated;
  }

  updateBranding(
    id: string,
    input: UpdatePlatformTenantBrandingInput,
  ): MockPlatformTenant | undefined {
    let updated: MockPlatformTenant | undefined;
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, branding: input.branding };
        return updated;
      }),
    );
    return updated;
  }

  /**
   * Configure (or update) a single SSO provider for an institution. Pass
   * `enabled: false` to mark the entry "Not configured" without erasing the
   * detail string.
   */
  upsertSsoProvider(
    id: string,
    provider: SsoProviderId,
    config: MockPlatformTenantSsoProvider,
  ): MockPlatformTenant | undefined {
    let updated: MockPlatformTenant | undefined;
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        const sso: MockPlatformTenantSso = { ...(t.sso ?? {}) };
        sso[provider] = config;
        updated = { ...t, sso };
        return updated;
      }),
    );
    return updated;
  }

  /** Remove a previously-configured SSO provider entirely. */
  removeSsoProvider(id: string, provider: SsoProviderId): MockPlatformTenant | undefined {
    let updated: MockPlatformTenant | undefined;
    this._tenants.update((rows) =>
      rows.map((t) => {
        if (t.id !== id) return t;
        if (!t.sso || !t.sso[provider]) {
          updated = t;
          return t;
        }
        const sso: MockPlatformTenantSso = { ...t.sso };
        delete sso[provider];
        updated = { ...t, sso };
        return updated;
      }),
    );
    return updated;
  }
}

function emptyToUndef(v: string | undefined | null): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function defaultSettingsForPlan(plan: PlatformTenantPlan): MockPlatformTenantSettings | null {
  const maxChildren = plan === 'enterprise' ? 2000 : plan === 'professional' ? 500 : 120;
  return { maxChildren };
}
