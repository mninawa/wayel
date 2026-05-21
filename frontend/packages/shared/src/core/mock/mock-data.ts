/** Static mock data for UI development — replace with API calls later. */

export interface MockTenantSettings {
  tenantId: string;
  name: string;
  type: string;
  timezone: string;
  joinMode: 'invite-only' | 'approval-required' | 'open-join';
  joinCode: string;
  joinCodeActive: boolean;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface MockChildRow {
  id: string;
  displayName: string;
  dateOfBirth: string;
  guardianNames: string[];
  /** State of the subscription at the *current* institution. */
  membershipState: 'pending' | 'active' | 'paused' | 'ended';
  /**
   * Number of *other* institutions this child is also subscribed to, if known.
   * Optional so legacy code paths don't break; defaults to 0 in the UI.
   */
  otherSubscriptionsCount?: number;
  /** Canonical parent-side identity (see `mock-parents.ts`). */
  parentId?: string;
  parentChildId?: string;
}


export const MOCK_TENANT_SETTINGS: MockTenantSettings = {
  tenantId: 'tenant_little_stars',
  name: 'Little Stars Preschool',
  type: 'PRESCHOOL',
  timezone: 'Africa/Johannesburg',
  joinMode: 'approval-required',
  joinCode: 'STAR-2026',
  joinCodeActive: true,
  primaryColor: '#1e3a5f',
  accentColor: '#f59e0b',
  logoUrl: null,
};

export const MOCK_CHILDREN: MockChildRow[] = [
  {
    id: 'child_001',
    displayName: 'Azifani Mavuso',
    dateOfBirth: '2021-03-12',
    guardianNames: ['Thandi Mavuso'],
    membershipState: 'active',
    parentId: 'parent_thandi',
    parentChildId: 'pchild_azifani',
  },
  {
    id: 'child_002',
    displayName: 'Liam Chen',
    dateOfBirth: '2020-11-02',
    guardianNames: ['Mei Chen'],
    membershipState: 'active',
    parentId: 'parent_mei',
    parentChildId: 'pchild_liam',
  },
  {
    id: 'child_003',
    displayName: 'Zara Naidoo',
    dateOfBirth: '2022-01-20',
    guardianNames: ['Priya Naidoo'],
    membershipState: 'pending',
    parentId: 'parent_priya',
    parentChildId: 'pchild_zara',
  },
];

// Daily reports moved to the typed Phase-0 store. See:
//   packages/shared/src/core/contracts/daily-reports.phase0.ts
//   packages/shared/src/core/mock/mock-daily-reports.ts
//   packages/shared/src/services/daily-reports-bridge.service.ts

export interface MockProgram {
  id: string;
  name: string;
  ageRange: string;
  enrolledCount: number;
}

export const MOCK_PROGRAMS: MockProgram[] = [
  { id: 'prog_1', name: 'Toddlers A', ageRange: '2–3', enrolledCount: 14 },
  { id: 'prog_2', name: 'Pre-K B', ageRange: '4–5', enrolledCount: 18 },
  { id: 'prog_3', name: 'Aftercare', ageRange: '3–6', enrolledCount: 22 },
];

export interface MockEventRow {
  id: string;
  title: string;
  startsAt: string;
  audience: string;
  rsvpYes: number;
  rsvpMaybe: number;
}

export const MOCK_EVENTS: MockEventRow[] = [
  {
    id: 'ev_1',
    title: 'Spring picnic',
    startsAt: '2026-04-22T10:00:00Z',
    audience: 'Whole school',
    rsvpYes: 42,
    rsvpMaybe: 8,
  },
  {
    id: 'ev_2',
    title: 'Parent info evening',
    startsAt: '2026-04-28T17:30:00Z',
    audience: 'Pre-K families',
    rsvpYes: 24,
    rsvpMaybe: 3,
  },
];

export interface MockAttendanceRow {
  id: string;
  childName: string;
  direction: 'in' | 'out';
  at: string;
  program: string;
}

export const MOCK_ATTENDANCE_TODAY: MockAttendanceRow[] = [
  { id: 'att_1', childName: 'Azifani Mavuso', direction: 'in', at: '2026-04-17T07:42:00Z', program: 'Pre-K B' },
  { id: 'att_2', childName: 'Liam Chen', direction: 'in', at: '2026-04-17T07:55:00Z', program: 'Pre-K B' },
  { id: 'att_3', childName: 'Zara Naidoo', direction: 'out', at: '2026-04-17T15:10:00Z', program: 'Toddlers A' },
];

export interface MockParentInvitation {
  id: string;
  childName: string;
  parentEmail: string;
  sentAt: string;
  status: 'pending' | 'accepted' | 'expired';
}

export const MOCK_PARENT_INVITATIONS: MockParentInvitation[] = [
  {
    id: 'pinv_1',
    childName: 'Jamal Okonkwo',
    parentEmail: 'ada.okonkwo@example.com',
    sentAt: '2026-04-12T14:00:00Z',
    status: 'pending',
  },
  {
    id: 'pinv_2',
    childName: 'Liam Chen',
    parentEmail: 'mei.chen@example.com',
    sentAt: '2026-04-01T09:00:00Z',
    status: 'accepted',
  },
];

export interface MockTag {
  id: string;
  label: string;
  category: 'behaviour' | 'activity';
}

export const MOCK_BEHAVIOUR_TAGS: MockTag[] = [
  { id: 'b1', label: 'Cooperative play', category: 'behaviour' },
  { id: 'b2', label: 'Focused listening', category: 'behaviour' },
  { id: 'b3', label: 'Needs reassurance', category: 'behaviour' },
  { id: 'b4', label: 'Energetic', category: 'behaviour' },
];

export const MOCK_ACTIVITY_TAGS: MockTag[] = [
  { id: 'a1', label: 'Literacy / story', category: 'activity' },
  { id: 'a2', label: 'Outdoor play', category: 'activity' },
  { id: 'a3', label: 'Music & movement', category: 'activity' },
  { id: 'a4', label: 'STEM / exploration', category: 'activity' },
];

export interface MockAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
}

export const MOCK_AUDIT_LOG: MockAuditEntry[] = [
  {
    id: 'au_1',
    at: '2026-04-17T08:02:00Z',
    actor: 'admin@littlestars.edu',
    action: 'consent.updated',
    entity: 'child_001 / vault',
  },
  {
    id: 'au_2',
    at: '2026-04-16T16:40:00Z',
    actor: 'support@wayelkids.mock',
    action: 'membership.approved',
    entity: 'mr_1',
  },
  {
    id: 'au_3',
    at: '2026-04-15T11:05:00Z',
    actor: 'ms.dlamini@littlestars.edu',
    action: 'report.submitted',
    entity: 'rep_1',
  },
];

export interface MockConsentRow {
  childName: string;
  vaultSharing: boolean;
  parentVisible: boolean;
  aiEligible: boolean;
  crossInstitutionAi: boolean;
}

export const MOCK_CONSENTS: MockConsentRow[] = [
  {
    childName: 'Azifani Mavuso',
    vaultSharing: true,
    parentVisible: true,
    aiEligible: true,
    crossInstitutionAi: false,
  },
  {
    childName: 'Liam Chen',
    vaultSharing: true,
    parentVisible: true,
    aiEligible: false,
    crossInstitutionAi: false,
  },
  {
    childName: 'Zara Naidoo',
    vaultSharing: false,
    parentVisible: true,
    aiEligible: false,
    crossInstitutionAi: false,
  },
];

export interface MockMilestoneRow {
  id: string;
  childName: string;
  title: string;
  date: string;
  visibility: string;
}

export const MOCK_MILESTONES: MockMilestoneRow[] = [
  {
    id: 'mil_1',
    childName: 'Azifani Mavuso',
    title: 'First independent puzzle',
    date: '2026-04-10',
    visibility: 'parent + vault',
  },
  {
    id: 'mil_2',
    childName: 'Liam Chen',
    title: 'Shared materials unprompted',
    date: '2026-04-08',
    visibility: 'parent visible',
  },
];

/**
 * Platform-level tenant registry (super-admin) — US-A01.
 *
 * In product terms a "tenant" is an *institution* — preschool, swim school,
 * robotics club, etc. — that runs programs parents subscribe their kids to.
 * The platform admin uses this registry to onboard, suspend or archive
 * those institutions. The UI label is "Institutions"; we keep the
 * `MockPlatformTenant` type name for code-level continuity (it's referenced
 * by mappers, contracts and the bridge service).
 *
 * Shaped similarly to SecureDocs `TenantSummary` / `TenantDetail` for a future
 * `POST /platform/tenants` (onboard) contract, with optional rich-profile
 * fields (`category`, `area`, `tagline`, `monthlyFeeZar`, …) that the
 * REMOVED catalogue surfaces and the parent app's subscribe page
 * already shows.
 */
export type PlatformTenantStatus = 'pending' | 'active' | 'suspended' | 'archived';
export type PlatformTenantPlan = 'starter' | 'professional' | 'enterprise';

/** Operational toggles surfaced on the Settings tab. */
export interface MockPlatformTenantFeatureFlags {
  /** All staff must enrol multi-factor authentication. */
  requireMfaForStaff: boolean;
  /** Daily-report media must be approved by a parent before going public. */
  parentMediaApproval: boolean;
  /** Show parents the weekly trends graphs on a child's profile. */
  weeklyTrendsEnabled: boolean;
  /** Premium "Print shop / animate" surface enabled for parents. */
  printShopEnabled: boolean;
  /** Parents may export a lifetime archive ZIP of their child's records. */
  lifetimeArchiveEnabled: boolean;
}

/** Compliance-style settings backing the Settings tab. */
export interface MockPlatformTenantSettings {
  /** Maximum simultaneously enrolled children. */
  maxChildren: number;
  /** Maximum staff seats — null means uncapped. */
  maxStaff?: number | null;
  /** How long to retain daily reports + media (days). */
  defaultRetentionDays?: number;
  /** Lower-case file extensions allowed on media uploads (no dots). */
  allowedFileExtensions?: string[];
  /** Operational feature flags. */
  featureFlags?: MockPlatformTenantFeatureFlags;
}

/** Branding configuration backing the Branding tab. */
export interface MockPlatformTenantBranding {
  displayName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  customDomain?: string;
  defaultTheme?: 'system' | 'light' | 'dark';
  supportEmail?: string;
  supportPhone?: string;
  websiteUrl?: string;
}

/** Identity-provider catalogue surfaced on the SSO tab. */
export type SsoProviderId = 'entra' | 'okta' | 'oidc' | 'saml';

/** Per-provider config; only `enabled === true` providers are honoured. */
export interface MockPlatformTenantSsoProvider {
  enabled: boolean;
  /** Free-text descriptor (tenant id, issuer URL, …) shown under the title. */
  detail?: string;
}

export type MockPlatformTenantSso = Partial<
  Record<SsoProviderId, MockPlatformTenantSsoProvider>
>;

export interface MockPlatformTenant {
  id: string;
  name: string;
  type: string;
  slug: string;
  plan: PlatformTenantPlan;
  status: PlatformTenantStatus;
  timezone: string;
  createdAt: string;
  /** First tenant admin — mirrors `firstAdminEmail` in onboard APIs. */
  firstAdminEmail: string | null;
  firstAdminFirstName: string | null;
  firstAdminLastName: string | null;
  onboardedByUserId: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  settings: MockPlatformTenantSettings | null;

  // ── Rich profile (mirrors `MockInstitution`) — optional so the live API
  //     mapper and existing tests stay happy without populating these.
  /** High-level category used for filter chips on the catalogue. */
  category?: import('./mock-institutions').MockInstitutionCategory;
  /** `'daycare'` (full-day) vs `'session'` (short activity) — drives kind pill. */
  kind?: import('../contracts/daily-reports.phase0').Phase0InstitutionKind;
  /** Suburb / neighbourhood. */
  area?: string;
  /** City. */
  city?: string;
  /** One-line hook shown on the card. */
  tagline?: string;
  /** Longer paragraph shown on the detail page. */
  description?: string;
  /** ZAR per month, or null for "varies". */
  monthlyFeeZar?: number | null;
  /** Inclusive min/max age in years. */
  ageRangeYears?: { min: number; max: number };
  /** Decorative card accent colour. */
  accentColor?: string;
  /** Cover image URL. */
  imageUrl?: string | null;
  /** Optional public website. */
  website?: string;

  /** Branding overrides surfaced on the Branding tab. */
  branding?: MockPlatformTenantBranding;
  /** Identity-provider catalogue surfaced on the SSO tab. */
  sso?: MockPlatformTenantSso;

  /**
   * Distinct count of parent-side children currently holding an open
   * subscription period at this tenant. Only ever populated on rows
   * projected from the live API; mock-only rows leave it `undefined`
   * so the catalogue card falls back to the in-memory `MOCK_PARENTS`
   * scan via `countActiveChildrenFor()`.
   */
  activeChildrenCount?: number;
  /** Active staff count from the live API (undefined in mock mode). */
  staffCount?: number;
  /** Active program count from the live API (undefined in mock mode). */
  programCount?: number;
  /**
   * `true` when no `TenantAdmin` user has been provisioned for this
   * tenant yet — the freshly-onboarded "no human can sign in here"
   * state. Computed server-side (`ListTenants` checks the user roster
   * for any `TenantAdmin` row) and projected onto the catalogue card
   * as a yellow "Awaiting admin" badge. Replaces the old UI fiction of
   * a `'pending'` status, which had no domain backing and was never
   * cleared. Only ever populated on live-API rows; mock-only rows
   * leave it `undefined` (the catalogue treats `undefined` and
   * `false` as "not awaiting").
   */
  awaitingAdmin?: boolean;
}

import { MOCK_INSTITUTIONS, type MockInstitution } from './mock-institutions';

/**
 * Per-institution platform-admin overlays.
 *
 * Most institutions in the directory don't yet have a tenant admin assigned
 * (they're pre-seeded so the parent catalogue feels rich); a couple have
 * been "onboarded" in the platform sense and get fuller metadata here.
 * Add to this map as institutions move from "directory listing" to
 * "actively running on Wayel".
 */
interface PlatformOverlay {
  type?: string;
  plan?: PlatformTenantPlan;
  status?: PlatformTenantStatus;
  timezone?: string;
  createdAt?: string;
  firstAdminEmail?: string | null;
  firstAdminFirstName?: string | null;
  firstAdminLastName?: string | null;
  onboardedByUserId?: string | null;
  activatedAt?: string | null;
  suspendedAt?: string | null;
  settings?: MockPlatformTenantSettings | null;
  branding?: MockPlatformTenantBranding;
  sso?: MockPlatformTenantSso;
}

const DEFAULT_FEATURE_FLAGS: MockPlatformTenantFeatureFlags = {
  requireMfaForStaff: true,
  parentMediaApproval: false,
  weeklyTrendsEnabled: true,
  printShopEnabled: false,
  lifetimeArchiveEnabled: true,
};

const DEFAULT_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'mp4'];

const PLATFORM_OVERLAYS: Record<string, PlatformOverlay> = {
  tenant_little_stars: {
    type: 'PRESCHOOL',
    plan: 'professional',
    status: 'active',
    createdAt: '2025-08-01T10:00:00Z',
    firstAdminEmail: 'admin@littlestars.edu',
    firstAdminFirstName: 'Thandi',
    firstAdminLastName: 'Mavuso',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2025-08-01T10:05:00Z',
    settings: {
      maxChildren: 500,
      maxStaff: 60,
      defaultRetentionDays: 1825,
      allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'mp4'],
      featureFlags: {
        requireMfaForStaff: true,
        parentMediaApproval: true,
        weeklyTrendsEnabled: true,
        printShopEnabled: true,
        lifetimeArchiveEnabled: true,
      },
    },
    branding: {
      displayName: 'Little Stars Preschool',
      primaryColor: '#1d4ed8',
      secondaryColor: '#0c4a6e',
      accentColor: '#f59e0b',
      backgroundColor: '#f8fafc',
      surfaceColor: '#ffffff',
      textColor: '#0f172a',
      logoUrl: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=120',
      customDomain: 'parents.littlestars.edu',
      defaultTheme: 'system',
      supportEmail: 'support@littlestars.edu',
      supportPhone: '+27 11 555 0144',
      websiteUrl: 'https://www.littlestars.edu',
    },
    sso: {
      entra: { enabled: true, detail: 'a1b2c3d4-corp.onmicrosoft.com' },
    },
  },
  inst_aqua_stars: {
    type: 'SWIM_SCHOOL',
    plan: 'starter',
    status: 'active',
    createdAt: '2025-09-12T08:00:00Z',
    firstAdminEmail: 'coach@aquastars.example.com',
    firstAdminFirstName: 'Lerato',
    firstAdminLastName: 'Khumalo',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2025-09-12T08:30:00Z',
    settings: { maxChildren: 200 },
    branding: {
      displayName: 'Aqua Stars Swim School',
      primaryColor: '#0ea5e9',
      accentColor: '#f97316',
      customDomain: 'parents.aquastars.co.za',
      supportEmail: 'help@aquastars.example.com',
      supportPhone: '+27 21 555 0182',
    },
    sso: {
      okta: { enabled: true, detail: 'aquastars.okta.com' },
    },
  },
  inst_kintaro_karate: {
    type: 'MARTIAL_ARTS',
    plan: 'starter',
    status: 'active',
    createdAt: '2025-10-04T11:15:00Z',
    firstAdminEmail: 'sensei@kintaro.example.com',
    firstAdminFirstName: 'Kabelo',
    firstAdminLastName: 'Mokoena',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2025-10-04T11:30:00Z',
    settings: { maxChildren: 150 },
  },
  inst_brushstrokes: {
    type: 'ART_STUDIO',
    plan: 'starter',
    status: 'active',
    createdAt: '2025-11-20T09:45:00Z',
    firstAdminEmail: 'studio@brushstrokes.example.com',
    firstAdminFirstName: 'Naledi',
    firstAdminLastName: 'Mabaso',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2025-11-20T10:00:00Z',
    settings: { maxChildren: 120 },
  },
  inst_sonata_music: {
    type: 'MUSIC_SCHOOL',
    plan: 'professional',
    status: 'active',
    createdAt: '2025-09-30T14:00:00Z',
    firstAdminEmail: 'admin@sonatamusic.example.com',
    firstAdminFirstName: 'Anika',
    firstAdminLastName: 'Pillay',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2025-09-30T14:10:00Z',
    settings: { maxChildren: 300 },
  },
  inst_codecubs: {
    type: 'ROBOTICS_CLUB',
    plan: 'starter',
    status: 'active',
    createdAt: '2026-01-15T14:30:00Z',
    firstAdminEmail: 'ops@codecubs.example.com',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2026-01-15T14:35:00Z',
    settings: { maxChildren: 120 },
  },
  inst_blue_marlin_swim: {
    type: 'SWIM_SCHOOL',
    plan: 'starter',
    status: 'pending',
    createdAt: '2026-04-02T07:00:00Z',
    firstAdminEmail: 'admin@bluemarlin.example.com',
    onboardedByUserId: 'user_platform_001',
  },
  inst_jacaranda_preschool: {
    type: 'PRESCHOOL',
    plan: 'professional',
    status: 'suspended',
    createdAt: '2025-07-19T13:20:00Z',
    firstAdminEmail: 'admin@jacaranda.example.com',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2025-07-19T13:25:00Z',
    suspendedAt: '2026-03-10T09:00:00Z',
    settings: { maxChildren: 240 },
  },
};

/**
 * Map a directory category onto a "type" string used by the platform admin.
 * Kept simple and uppercase to mirror what an onboard form would persist.
 */
function defaultTypeFor(category: MockInstitution['category']): string {
  switch (category) {
    case 'daycare':
      return 'DAYCARE';
    case 'preschool':
      return 'PRESCHOOL';
    case 'aftercare':
      return 'AFTERCARE';
    case 'swim':
      return 'SWIM_SCHOOL';
    case 'music':
      return 'MUSIC_SCHOOL';
    case 'art':
      return 'ART_STUDIO';
    case 'martial_arts':
      return 'MARTIAL_ARTS';
    case 'dance':
      return 'DANCE_STUDIO';
    case 'sports':
      return 'SPORTS_CLUB';
    case 'robotics':
      return 'ROBOTICS_CLUB';
    case 'language':
      return 'LANGUAGE_SCHOOL';
  }
}

/** Synthesize a stable created-at so the catalogue isn't all "today". */
function syntheticCreatedAt(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  const daysAgo = 60 + (Math.abs(h) % 540); // 2 months .. ~20 months
  const t = Date.now() - daysAgo * 86_400_000;
  return new Date(t).toISOString();
}

function slugifyId(id: string, name: string): string {
  // Prefer `name` as the slug source so the public-by-slug lookup stays human.
  const fromName = name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return fromName || id;
}

function buildPlatformTenantFrom(inst: MockInstitution): MockPlatformTenant {
  const overlay = PLATFORM_OVERLAYS[inst.id] ?? {};
  const createdAt = overlay.createdAt ?? syntheticCreatedAt(inst.id);
  const status: PlatformTenantStatus = overlay.status ?? 'active';
  const activatedAt =
    overlay.activatedAt ?? (status === 'active' ? createdAt : null);
  const suspendedAt = overlay.suspendedAt ?? null;

  return {
    id: inst.id,
    name: inst.name,
    type: overlay.type ?? defaultTypeFor(inst.category),
    slug: slugifyId(inst.id, inst.name),
    plan: overlay.plan ?? 'starter',
    status,
    timezone: overlay.timezone ?? 'Africa/Johannesburg',
    createdAt,
    firstAdminEmail: overlay.firstAdminEmail ?? null,
    firstAdminFirstName: overlay.firstAdminFirstName ?? null,
    firstAdminLastName: overlay.firstAdminLastName ?? null,
    onboardedByUserId: overlay.onboardedByUserId ?? null,
    activatedAt,
    suspendedAt,
    settings: mergeSettings(overlay),

    // Rich profile carried straight from the directory.
    category: inst.category,
    kind: inst.kind,
    area: inst.area,
    city: inst.city,
    tagline: inst.tagline,
    description: inst.description,
    monthlyFeeZar: inst.monthlyFeeZar,
    ageRangeYears: inst.ageRangeYears,
    accentColor: inst.accentColor,
    imageUrl: inst.imageUrl,
    website: inst.website,

    branding: mergeBranding(inst, overlay.branding),
    sso: overlay.sso ?? {},
  };
}

function mergeSettings(overlay: PlatformOverlay): MockPlatformTenantSettings {
  const base: MockPlatformTenantSettings = {
    maxChildren:
      overlay.plan === 'enterprise'
        ? 2000
        : overlay.plan === 'professional'
          ? 500
          : 120,
    maxStaff:
      overlay.plan === 'enterprise' ? 200 : overlay.plan === 'professional' ? 60 : 25,
    defaultRetentionDays: 1095,
    allowedFileExtensions: [...DEFAULT_ALLOWED_EXTENSIONS],
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
  };
  if (!overlay.settings) return base;
  return {
    ...base,
    ...overlay.settings,
    featureFlags: {
      ...base.featureFlags!,
      ...(overlay.settings.featureFlags ?? {}),
    },
  };
}

function mergeBranding(
  inst: MockInstitution,
  overlay: MockPlatformTenantBranding | undefined,
): MockPlatformTenantBranding {
  const base: MockPlatformTenantBranding = {
    displayName: inst.name,
    primaryColor: inst.accentColor,
    accentColor: inst.accentColor,
    backgroundColor: '#f6f8fb',
    surfaceColor: '#ffffff',
    textColor: '#1e2433',
    defaultTheme: 'system',
    websiteUrl: inst.website,
  };
  return overlay ? { ...base, ...overlay } : base;
}

/**
 * Build the seed array from the institution directory + per-id overlays so
 * the REMOVED catalogue and the parent-app subscribe page agree on the
 * same set. Mutated by `MockPlatformTenantService.create()` / `setStatus()`.
 */
export const MOCK_PLATFORM_TENANTS: MockPlatformTenant[] = MOCK_INSTITUTIONS.map(
  buildPlatformTenantFrom,
);

/** Cross-tenant platform operators & support (super-admin scope). */
export type MockPlatformUserRole = 'platform_admin' | 'support';

export interface MockPlatformUser {
  id: string;
  email: string;
  displayName: string;
  role: MockPlatformUserRole;
  /** When set, user is primarily tied to one institution (e.g. escalations). */
  homeTenantId: string | null;
  homeTenantName: string | null;
  status: 'active' | 'invited' | 'suspended';
  lastLoginAt: string | null;
  createdAt: string;
}

export const MOCK_PLATFORM_USERS: MockPlatformUser[] = [
  {
    id: 'user_platform_001',
    email: 'platform@wayel.example',
    displayName: 'Neo Dlamini',
    role: 'platform_admin',
    homeTenantId: null,
    homeTenantName: null,
    status: 'active',
    lastLoginAt: '2026-04-17T08:12:00Z',
    createdAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'user_platform_002',
    email: 'support@wayel.example',
    displayName: 'Priya Govender',
    role: 'support',
    homeTenantId: null,
    homeTenantName: null,
    status: 'active',
    lastLoginAt: '2026-04-16T14:30:00Z',
    createdAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'user_platform_003',
    email: 'liaison@littlestars.edu',
    displayName: 'Thandi Mavuso',
    role: 'support',
    homeTenantId: 'tenant_little_stars',
    homeTenantName: 'Little Stars Preschool',
    status: 'active',
    lastLoginAt: '2026-04-15T11:00:00Z',
    createdAt: '2025-08-02T00:00:00Z',
  },
  {
    id: 'user_platform_004',
    email: 'new.ops@wayel.example',
    displayName: 'Jamal Okonkwo',
    role: 'support',
    homeTenantId: null,
    homeTenantName: null,
    status: 'invited',
    lastLoginAt: null,
    createdAt: '2026-04-10T00:00:00Z',
  },
];

export interface MockPlatformAuditEntry {
  id: string;
  occurredAt: string;
  actorEmail: string;
  tenantId: string | null;
  tenantName: string | null;
  action: string;
  detail: string;
  /**
   * Optional opaque identifier of the entity this entry is *about*
   * (e.g. an invitation id, a partnership id). Used by feature surfaces to
   * show a per-row history without needing a separate audit table per domain.
   */
  subjectId?: string | null;
}

export const MOCK_PLATFORM_AUDIT: MockPlatformAuditEntry[] = [
  {
    id: 'pau_1',
    occurredAt: '2026-04-17T07:55:00Z',
    actorEmail: 'platform@wayel.example',
    tenantId: 'tenant_little_stars',
    tenantName: 'Little Stars Preschool',
    action: 'tenant.settings.viewed',
    detail: 'Reviewed max children cap (mock).',
  },
  {
    id: 'pau_2',
    occurredAt: '2026-04-16T16:20:00Z',
    actorEmail: 'support@wayel.example',
    tenantId: 'tenant_code_cubs',
    tenantName: 'Code Cubs Robotics',
    action: 'tenant.support_note',
    detail: 'Follow-up on onboarding checklist.',
  },
  {
    id: 'pau_3',
    occurredAt: '2026-04-16T09:00:00Z',
    actorEmail: 'platform@wayel.example',
    tenantId: null,
    tenantName: null,
    action: 'platform.report.exported',
    detail: 'Monthly tenant summary CSV (mock).',
  },
  {
    id: 'pau_4',
    occurredAt: '2026-04-15T13:40:00Z',
    actorEmail: 'liaison@littlestars.edu',
    tenantId: 'tenant_little_stars',
    tenantName: 'Little Stars Preschool',
    action: 'user.impersonation.started',
    detail: 'Time-boxed impersonation for ticket #4421 (mock).',
  },
  {
    id: 'pau_5',
    occurredAt: '2026-04-14T10:15:00Z',
    actorEmail: 'platform@wayel.example',
    tenantId: null,
    tenantName: null,
    action: 'platform.user.invited',
    detail: 'Invited support@wayel.example to platform role support.',
  },
];

/** Operator-facing document index per tenant (platform scope) — mock. */
export interface MockTenantDocumentRow {
  id: string;
  tenantId: string;
  title: string;
  uploadedAt: string;
  status: 'indexed' | 'pending';
}

export const MOCK_TENANT_DOCUMENTS: MockTenantDocumentRow[] = [
  {
    id: 'tdoc_ls_1',
    tenantId: 'tenant_little_stars',
    title: 'Facility fire safety certificate',
    uploadedAt: '2026-03-01T10:00:00Z',
    status: 'indexed',
  },
  {
    id: 'tdoc_ls_2',
    tenantId: 'tenant_little_stars',
    title: 'Staff background checks — Q1',
    uploadedAt: '2026-04-02T14:20:00Z',
    status: 'pending',
  },
  {
    id: 'tdoc_cc_1',
    tenantId: 'tenant_code_cubs',
    title: 'Equipment insurance',
    uploadedAt: '2026-01-20T09:00:00Z',
    status: 'indexed',
  },
];
