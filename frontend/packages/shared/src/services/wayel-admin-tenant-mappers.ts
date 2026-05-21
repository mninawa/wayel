import type {
  MockPlatformTenant,
  MockPlatformTenantBranding,
  MockPlatformTenantSettings,
  PlatformTenantPlan,
  PlatformTenantStatus,
} from '../core/mock/mock-data';
import type { MockInstitutionCategory } from '../core/mock/mock-institutions';
import type { Phase0InstitutionKind } from '../core/contracts/daily-reports.phase0';
import type {
  WayelAdminCreateTenantRequest,
  WayelAdminOnboardingAdminContactSection,
  WayelAdminOnboardingBrandingSection,
  WayelAdminOnboardingProfileSection,
  WayelAdminOnboardingRecordSection,
  WayelAdminTenantBranding,
  WayelAdminTenantDetail,
  WayelAdminTenantSummary,
  WayelAdminUpdateAdminContactRequest,
  WayelAdminUpdateBrandingRequest,
  WayelAdminUpdateProfileRequest,
  WayelAdminUpdateRecordRequest,
  WayelAdminUpdateSettingsRequest,
  WayelInstitutionKind,
  WayelTenantKind,
  WayelTenantPlan,
  WayelTenantStatus,
  WayelTenantTheme,
} from './wayel-admin-tenants.service';
import type {
  CreatePlatformTenantInput,
  UpdatePlatformTenantAdminInput,
  UpdatePlatformTenantBrandingInput,
  UpdatePlatformTenantProfileInput,
  UpdatePlatformTenantRecordInput,
  UpdatePlatformTenantSettingsInput,
} from './mock-platform-tenant.service';

/**
 * Map a Wayel.Api `TenantStatus` (PascalCase) to the mock UI's lowercase
 * status string. The mock model has `'pending'` which the API doesn't
 * model — we never produce it from the API side; new tenants are minted
 * directly into `Active`.
 */
export function wayelStatusToMock(status: WayelTenantStatus): PlatformTenantStatus {
  switch (status) {
    case 'Active':
      return 'active';
    case 'Suspended':
      return 'suspended';
    case 'Archived':
      return 'archived';
  }
}

/**
 * Map the mock UI's status string back to the API enum. Used by the
 * bridge service when forwarding catalogue filter chips. The mock-only
 * `'pending'` state has no API counterpart, so we collapse it to
 * `'Active'` (matches the previous behaviour where new live-mode
 * tenants were always projected as Active).
 */
export function mockStatusToWayel(status: PlatformTenantStatus): WayelTenantStatus {
  switch (status) {
    case 'suspended':
      return 'Suspended';
    case 'archived':
      return 'Archived';
    default:
      return 'Active';
  }
}

/**
 * Translate a slim Wayel.Api tenant row into the rich
 * `MockPlatformTenant` shape consumed by the REMOVED UI.
 *
 * The real API doesn't yet model plan / branding / SSO etc., so we
 * project sensible defaults — `'starter'` plan, empty admin contact —
 * and leave the rich profile fields (category, imageUrl, fees, ...)
 * undefined. Status, however, is now real: it's projected directly from
 * the API row and feeds the catalogue chips + lifecycle banner.
 *
 * `activatedAt` and `suspendedAt` are best-effort: the API doesn't yet
 * persist transition timestamps, so we use `createdOnUtc` for active
 * tenants and clear it for suspended/archived ones (the UI treats them
 * as "unknown when" rather than rendering misleading dates).
 */
export function wayelTenantSummaryToMock(t: WayelAdminTenantSummary): MockPlatformTenant {
  const status = wayelStatusToMock(t.status);
  const ageMin = t.ageMinYears;
  const ageMax = t.ageMaxYears;
  return {
    id: t.tenantId,
    name: t.name,
    type: '',
    slug: t.slug,
    plan: 'starter',
    status,
    timezone: 'UTC',
    createdAt: t.createdOnUtc,
    firstAdminEmail: t.adminEmail,
    firstAdminFirstName: null,
    firstAdminLastName: null,
    onboardedByUserId: null,
    activatedAt: status === 'active' ? t.createdOnUtc : null,
    suspendedAt: null,
    settings: null,
    // Carry the live badge counts forward so the catalogue card uses
    // real numbers rather than scanning in-memory mock arrays.
    activeChildrenCount: t.activeChildrenCount,
    staffCount: t.staffCount,
    programCount: t.programCount,
    awaitingAdmin: t.awaitingAdmin,
    category: wayelCategoryToMock(t.category),
    // Profile fields needed by the catalogue card (cover image, accent
    // colour, location, fee, age range, tagline, kind pill).
    kind: wayelInstitutionKindToMock(t.institutionKind),
    area: t.area ?? undefined,
    city: t.city ?? undefined,
    tagline: t.tagline ?? undefined,
    monthlyFeeZar: t.monthlyFeeZar ?? undefined,
    ageRangeYears:
      ageMin != null && ageMax != null ? { min: ageMin, max: ageMax } : undefined,
    accentColor: t.accentColor ?? undefined,
    imageUrl: t.imageUrl ?? undefined,
    website: t.website ?? undefined,
  };
}

/**
 * Translate the rich onboarding form payload into the Wayel.Api
 * create-tenant body. The form's `kind` describes the *institution*
 * (`'daycare'` vs `'session'`); the API's `TenantKind` describes the
 * *org* (`'Parent'` vs `'Child'`). Until the org-graph is modelled, we
 * always create top-level orgs (`'Parent'`).
 *
 * The slug is normalised to lowercase + dashes here so the dev UX stays
 * forgiving (form lets you type "Acme" / spaces) while the backend
 * still gets a slug that matches `^[a-z0-9]+(-[a-z0-9]+)*$`.
 *
 * <p>
 * Optional sections (profile / branding / record / admin contact) are
 * folded onto the body when the form supplied any non-empty data — this
 * is what fixes the historical "wizard collected branding but the API
 * silently dropped it" bug. The handler applies each present section
 * via the matching aggregate <code>UpdateXxx</code> in a single unit
 * of work.
 * </p>
 *
 * <p>
 * <code>inviteAdmin</code> defaults to <code>true</code> server-side when
 * an admin email is supplied; the form's <code>sendAdminInvite</code>
 * toggle is forwarded only when the operator explicitly opts out.
 * </p>
 */
export function mockCreateInputToWayelCreate(
  input: CreatePlatformTenantInput,
): WayelAdminCreateTenantRequest {
  const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-');
  const body: WayelAdminCreateTenantRequest = {
    name: input.name.trim(),
    slug,
    kind: 'Parent' satisfies WayelTenantKind,
  };

  // Profile — populated whenever the wizard captured an institution
  // category, kind, area or city. The server tolerates partial sections.
  const profile = buildOnboardingProfile(input);
  if (profile) body.profile = profile;

  // Branding — colour pickers always have a value (the form pre-fills
  // platform defaults), but the wizard only sends them when the
  // operator visited the legacy step. Today the 3-step wizard skips
  // branding entirely so this section is rarely sent on create; it's
  // kept here so the bridge can still forward branding when a future
  // caller (CSV import, bulk tooling) does want to seed it.
  const branding = buildOnboardingBranding(input);
  if (branding) body.branding = branding;

  // Record — type / plan / timezone all come from the wizard's "org"
  // step (or its later equivalents). We forward whatever's set; the
  // server normalises empty strings.
  const record = buildOnboardingRecord(input);
  if (record) body.record = record;

  // Admin contact — anything filled here also implies "send an
  // invitation" unless the operator explicitly toggled it off.
  const adminContact = buildOnboardingAdminContact(input);
  if (adminContact) {
    body.adminContact = adminContact;
    // Only forward `inviteAdmin` when the form explicitly opts out.
    // Leaving it `undefined` lets the server use its default (true) —
    // mirrors the co-parent invite UX and avoids hard-coding a default
    // on the client that the server might evolve.
    if (input.sendAdminInvite === false) {
      body.inviteAdmin = false;
    }
  }

  return body;
}

function buildOnboardingProfile(
  input: CreatePlatformTenantInput,
): WayelAdminOnboardingProfileSection | undefined {
  const category = nullify(input.category ?? null);
  const area = nullify(input.area ?? null);
  const city = nullify(input.city ?? null);
  const institutionKind = mockInstitutionKindToWayel(input.kind);
  const hasAny =
    category != null
    || area != null
    || city != null
    || institutionKind !== 'Unknown';
  if (!hasAny) return undefined;
  return {
    category,
    institutionKind,
    area,
    city,
  };
}

function buildOnboardingBranding(
  input: CreatePlatformTenantInput,
): WayelAdminOnboardingBrandingSection | undefined {
  const b = input.branding;
  if (!b) return undefined;
  const out: WayelAdminOnboardingBrandingSection = {};
  let any = false;
  const set = <K extends keyof WayelAdminOnboardingBrandingSection>(
    key: K,
    value: WayelAdminOnboardingBrandingSection[K] | null | undefined,
  ): void => {
    if (value == null || value === '') return;
    out[key] = value;
    any = true;
  };
  set('primaryColor', b.primaryColor);
  set('secondaryColor', b.secondaryColor);
  set('accentColor', b.accentColor);
  set('logoUrl', b.logoUrl ?? null);
  return any ? out : undefined;
}

function buildOnboardingRecord(
  input: CreatePlatformTenantInput,
): WayelAdminOnboardingRecordSection | undefined {
  const type = nullify(input.type);
  const timezone = nullify(input.timezone);
  const plan = mockPlanToWayel(input.plan);
  // `plan` always has a value — `mockPlanToWayel` collapses missing to
  // 'Starter'. We only consider the section meaningful when one of the
  // string fields was filled or the operator picked something other
  // than the (default) Starter plan.
  if (!type && !timezone && plan === 'Starter') return undefined;
  return { type, plan, timezone };
}

function buildOnboardingAdminContact(
  input: CreatePlatformTenantInput,
): WayelAdminOnboardingAdminContactSection | undefined {
  const email = nullify(input.firstAdminEmail);
  const firstName = nullify(input.firstAdminFirstName);
  const lastName = nullify(input.firstAdminLastName);
  if (!email && !firstName && !lastName) return undefined;
  return { email, firstName, lastName };
}

// ── Plan / institution-kind / theme projections ───────────────────────

const KNOWN_CATEGORIES: ReadonlySet<MockInstitutionCategory> = new Set<MockInstitutionCategory>([
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
]);

/** API plan → mock plan. The API has an `Unspecified` slot that the
 *  mock UI doesn't model — collapse it to `'starter'` so the dropdown
 *  always has something to select. */
export function wayelPlanToMock(plan: WayelTenantPlan): PlatformTenantPlan {
  switch (plan) {
    case 'Professional':
      return 'professional';
    case 'Enterprise':
      return 'enterprise';
    case 'Starter':
    case 'Unspecified':
    default:
      return 'starter';
  }
}

/** Mock plan → API plan. */
export function mockPlanToWayel(plan: PlatformTenantPlan): WayelTenantPlan {
  switch (plan) {
    case 'professional':
      return 'Professional';
    case 'enterprise':
      return 'Enterprise';
    case 'starter':
    default:
      return 'Starter';
  }
}

/** API institution kind → Phase-0 mock kind. The API's `Unknown` slot
 *  has no mock counterpart; we return `undefined` so the form leaves the
 *  field blank rather than misrepresenting it as a daycare. */
export function wayelInstitutionKindToMock(
  kind: WayelInstitutionKind,
): Phase0InstitutionKind | undefined {
  switch (kind) {
    case 'Daycare':
      return 'daycare';
    case 'Session':
      return 'session';
    case 'Unknown':
    default:
      return undefined;
  }
}

/** Phase-0 mock kind (or `undefined`) → API enum. `undefined` becomes
 *  `'Unknown'` so the API's enum stays exhaustive. */
export function mockInstitutionKindToWayel(
  kind: Phase0InstitutionKind | undefined,
): WayelInstitutionKind {
  switch (kind) {
    case 'daycare':
      return 'Daycare';
    case 'session':
      return 'Session';
    default:
      return 'Unknown';
  }
}

/** API category string → mock category enum. Unknown / null values
 *  return `undefined` so the catalogue chip simply doesn't filter. */
export function wayelCategoryToMock(
  category: string | null,
): MockInstitutionCategory | undefined {
  if (!category) return undefined;
  const lower = category.trim().toLowerCase();
  return KNOWN_CATEGORIES.has(lower as MockInstitutionCategory)
    ? (lower as MockInstitutionCategory)
    : undefined;
}

function wayelThemeToMock(
  theme: WayelTenantTheme | null,
): MockPlatformTenantBranding['defaultTheme'] {
  switch (theme) {
    case 'Light':
      return 'light';
    case 'Dark':
      return 'dark';
    case 'System':
    default:
      return 'system';
  }
}

function mockThemeToWayel(
  theme: MockPlatformTenantBranding['defaultTheme'] | undefined,
): WayelTenantTheme {
  switch (theme) {
    case 'light':
      return 'Light';
    case 'dark':
      return 'Dark';
    case 'system':
    default:
      return 'System';
  }
}

// ── Branding round-trip ───────────────────────────────────────────────

function wayelBrandingToMock(b: WayelAdminTenantBranding): MockPlatformTenantBranding {
  // The mock model uses optional string fields (no `null`s); collapse
  // the API's nullable shape so downstream code can keep using the
  // `branding?.primaryColor` pattern unchanged.
  const out: MockPlatformTenantBranding = {};
  if (b.displayName) out.displayName = b.displayName;
  if (b.primaryColor) out.primaryColor = b.primaryColor;
  if (b.secondaryColor) out.secondaryColor = b.secondaryColor;
  if (b.accentColor) out.accentColor = b.accentColor;
  if (b.backgroundColor) out.backgroundColor = b.backgroundColor;
  if (b.surfaceColor) out.surfaceColor = b.surfaceColor;
  if (b.textColor) out.textColor = b.textColor;
  if (b.logoUrl) out.logoUrl = b.logoUrl;
  if (b.faviconUrl) out.faviconUrl = b.faviconUrl;
  if (b.customDomain) out.customDomain = b.customDomain;
  if (b.supportEmail) out.supportEmail = b.supportEmail;
  if (b.supportPhone) out.supportPhone = b.supportPhone;
  if (b.websiteUrl) out.websiteUrl = b.websiteUrl;
  out.defaultTheme = wayelThemeToMock(b.defaultTheme);
  return out;
}

// ── Detail → MockPlatformTenant ───────────────────────────────────────

/**
 * Project the rich `TenantDetail` returned by `GET /admin/tenants/{id}`
 * into the `MockPlatformTenant` shape consumed by the REMOVED UI.
 *
 * Slug / status / created-at come straight from the summary; the rich
 * profile, record, branding and settings blobs all unwrap into the
 * matching mock fields. This is the entry point the live tenant detail
 * screen uses to populate every tab — Profile, Record, Admin contact,
 * Branding, Settings — without mock-side fallbacks.
 */
export function wayelTenantDetailToMock(t: WayelAdminTenantDetail): MockPlatformTenant {
  const status = wayelStatusToMock(t.status);
  const settings: MockPlatformTenantSettings = {
    maxChildren: t.settings.maxChildren ?? 0,
    maxStaff: t.settings.maxStaff,
    defaultRetentionDays: t.settings.defaultRetentionDays ?? undefined,
    allowedFileExtensions: t.settings.allowedFileExtensions ?? undefined,
    featureFlags: { ...t.settings.featureFlags },
  };

  const branding = wayelBrandingToMock(t.branding);
  const ageMin = t.profile.ageMinYears;
  const ageMax = t.profile.ageMaxYears;

  return {
    id: t.tenantId,
    name: t.name,
    type: t.record.type ?? '',
    slug: t.slug,
    plan: wayelPlanToMock(t.record.plan),
    status,
    timezone: t.record.timezone ?? 'UTC',
    createdAt: t.createdOnUtc,
    firstAdminEmail: t.adminContact.email ?? null,
    firstAdminFirstName: t.adminContact.firstName ?? null,
    firstAdminLastName: t.adminContact.lastName ?? null,
    onboardedByUserId: null,
    activatedAt: status === 'active' ? t.createdOnUtc : null,
    suspendedAt: null,
    settings,
    category: wayelCategoryToMock(t.profile.category),
    kind: wayelInstitutionKindToMock(t.profile.institutionKind),
    area: t.profile.area ?? undefined,
    city: t.profile.city ?? undefined,
    tagline: t.profile.tagline ?? undefined,
    description: t.profile.description ?? undefined,
    monthlyFeeZar: t.profile.monthlyFeeZar,
    ageRangeYears:
      ageMin != null && ageMax != null ? { min: ageMin, max: ageMax } : undefined,
    accentColor: t.profile.accentColor ?? undefined,
    imageUrl: t.profile.imageUrl ?? undefined,
    website: t.profile.website ?? undefined,
    branding: Object.keys(branding).length > 0 ? branding : undefined,
  };
}

// ── Mock update inputs → API request bodies ───────────────────────────

function nullify(s: string | null | undefined): string | null {
  if (s == null) return null;
  const trimmed = s.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Translate the Profile-tab form payload into the API's PATCH body.
 * Strings are trimmed and empty values become `null` so omitted form
 * fields don't get persisted as whitespace. Age range round-trips via
 * the nested `ageRangeYears` object on the form; we split it back out.
 */
export function mockProfileInputToWayel(
  input: UpdatePlatformTenantProfileInput,
): WayelAdminUpdateProfileRequest {
  return {
    category: nullify(input.category),
    institutionKind: mockInstitutionKindToWayel(input.kind),
    area: nullify(input.area),
    city: nullify(input.city),
    tagline: nullify(input.tagline),
    description: nullify(input.description),
    monthlyFeeZar: input.monthlyFeeZar ?? null,
    ageMinYears: input.ageRangeYears?.min ?? null,
    ageMaxYears: input.ageRangeYears?.max ?? null,
    accentColor: nullify(input.accentColor),
    imageUrl: input.imageUrl ?? null,
    website: nullify(input.website),
  };
}

/** Translate the Settings-tab "operational record" half (type, plan,
 *  timezone) into the PATCH .../record body. The mock form bundles
 *  `slug` and `maxChildren` here too — those flow elsewhere (slug is
 *  immutable server-side; capacity is on PATCH .../settings). */
export function mockRecordInputToWayel(
  input: UpdatePlatformTenantRecordInput,
): WayelAdminUpdateRecordRequest {
  return {
    type: nullify(input.type),
    plan: mockPlanToWayel(input.plan),
    timezone: nullify(input.timezone),
  };
}

export function mockAdminInputToWayel(
  input: UpdatePlatformTenantAdminInput,
): WayelAdminUpdateAdminContactRequest {
  return {
    email: nullify(input.firstAdminEmail),
    firstName: nullify(input.firstAdminFirstName),
    lastName: nullify(input.firstAdminLastName),
  };
}

export function mockBrandingInputToWayel(
  input: UpdatePlatformTenantBrandingInput,
): WayelAdminUpdateBrandingRequest {
  const b = input.branding;
  return {
    displayName: nullify(b.displayName),
    primaryColor: nullify(b.primaryColor),
    secondaryColor: nullify(b.secondaryColor),
    accentColor: nullify(b.accentColor),
    backgroundColor: nullify(b.backgroundColor),
    surfaceColor: nullify(b.surfaceColor),
    textColor: nullify(b.textColor),
    logoUrl: nullify(b.logoUrl),
    faviconUrl: nullify(b.faviconUrl),
    customDomain: nullify(b.customDomain),
    defaultTheme: mockThemeToWayel(b.defaultTheme),
    supportEmail: nullify(b.supportEmail),
    supportPhone: nullify(b.supportPhone),
    websiteUrl: nullify(b.websiteUrl),
  };
}

/**
 * Translate the Settings-tab payload (capacity caps + retention +
 * allowed extensions + feature flags) into the API's PATCH body.
 *
 * The mock model carries `maxChildren` as a non-nullable number with a
 * `0` sentinel for "uncapped"; the API uses an explicit `null`. We map
 * the sentinel back to `null` so the server's "no cap" semantics are
 * preserved on round-trip. Allowed extensions are lower-cased here
 * defensively even though the API also enforces it — saves a 400 when
 * a user types `JPG`.
 */
export function mockSettingsInputToWayel(
  input: UpdatePlatformTenantSettingsInput,
): WayelAdminUpdateSettingsRequest {
  const s = input.settings;
  const flags = s.featureFlags ?? {
    requireMfaForStaff: false,
    parentMediaApproval: false,
    weeklyTrendsEnabled: false,
    printShopEnabled: false,
    lifetimeArchiveEnabled: false,
  };
  return {
    maxChildren: s.maxChildren > 0 ? s.maxChildren : null,
    maxStaff: s.maxStaff ?? null,
    defaultRetentionDays: s.defaultRetentionDays ?? null,
    allowedFileExtensions:
      s.allowedFileExtensions?.map((e) => e.trim().toLowerCase()).filter(Boolean) ?? null,
    featureFlags: { ...flags },
  };
}
