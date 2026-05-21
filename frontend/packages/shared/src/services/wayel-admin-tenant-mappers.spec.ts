import { describe, expect, it } from 'vitest';
import {
  mockAdminInputToWayel,
  mockBrandingInputToWayel,
  mockCreateInputToWayelCreate,
  mockProfileInputToWayel,
  mockRecordInputToWayel,
  mockSettingsInputToWayel,
  mockStatusToWayel,
  wayelStatusToMock,
  wayelTenantDetailToMock,
  wayelTenantSummaryToMock,
} from './wayel-admin-tenant-mappers';
import type { WayelAdminTenantDetail } from './wayel-admin-tenants.service';

/** Default profile / count fields on a slim summary fixture so each
 *  test only has to spell out the bits it cares about. Mirrors what
 *  Wayel.Api now always projects on the list endpoint. */
const SUMMARY_DEFAULTS = {
  staffCount: 0,
  programCount: 0,
  adminEmail: null,
  // `awaitingAdmin` is now part of the summary contract. Default to
  // `false` so any test not focused on the badge doesn't have to spell
  // it out; tests that care about the badge override locally.
  awaitingAdmin: false,
  category: null,
  institutionKind: 'Unknown' as const,
  area: null,
  city: null,
  tagline: null,
  monthlyFeeZar: null,
  ageMinYears: null,
  ageMaxYears: null,
  accentColor: null,
  imageUrl: null,
  website: null,
};

describe('wayelTenantSummaryToMock', () => {
  it('projects an Active API row into an active MockPlatformTenant', () => {
    const got = wayelTenantSummaryToMock({
      tenantId: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      kind: 'Parent',
      status: 'Active',
      createdOnUtc: '2025-04-17T10:00:00Z',
      activeChildrenCount: 7,
      ...SUMMARY_DEFAULTS,
    });

    expect(got).toMatchObject({
      id: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      // Status is now real (projected from the API). Plan + admin
      // contact remain synthesised until the API models them.
      status: 'active',
      plan: 'starter',
      timezone: 'UTC',
      firstAdminEmail: null,
      firstAdminFirstName: null,
      firstAdminLastName: null,
      activatedAt: '2025-04-17T10:00:00Z',
      suspendedAt: null,
      settings: null,
      activeChildrenCount: 7,
    });
  });

  it('projects a Suspended API row, clearing the synthetic activatedAt', () => {
    const got = wayelTenantSummaryToMock({
      tenantId: 't-2',
      name: 'Aqua Stars',
      slug: 'aqua-stars',
      kind: 'Parent',
      status: 'Suspended',
      createdOnUtc: '2025-09-12T08:00:00Z',
      activeChildrenCount: 0,
      ...SUMMARY_DEFAULTS,
    });

    expect(got.status).toBe('suspended');
    // We don't have the real suspend timestamp; better to render
    // "unknown" than to mis-claim createdAt as the activation date.
    expect(got.activatedAt).toBeNull();
    expect(got.suspendedAt).toBeNull();
    expect(got.activeChildrenCount).toBe(0);
  });

  it('projects an Archived API row', () => {
    const got = wayelTenantSummaryToMock({
      tenantId: 't-3',
      name: 'Old Org',
      slug: 'old-org',
      kind: 'Parent',
      status: 'Archived',
      createdOnUtc: '2024-01-01T00:00:00Z',
      activeChildrenCount: 0,
      ...SUMMARY_DEFAULTS,
    });

    expect(got.status).toBe('archived');
    expect(got.activatedAt).toBeNull();
  });
});

describe('wayelStatusToMock <-> mockStatusToWayel', () => {
  it('round-trips Active / Suspended / Archived', () => {
    expect(mockStatusToWayel(wayelStatusToMock('Active'))).toBe('Active');
    expect(mockStatusToWayel(wayelStatusToMock('Suspended'))).toBe('Suspended');
    expect(mockStatusToWayel(wayelStatusToMock('Archived'))).toBe('Archived');
  });

  it("collapses the mock-only 'pending' state to Active when sending to the API", () => {
    // The API doesn't model 'pending'; this matches the previous
    // create-side behaviour (new tenants always landed as Active).
    expect(mockStatusToWayel('pending')).toBe('Active');
  });
});

describe('mockCreateInputToWayelCreate', () => {
  it('normalises the slug, forces TenantKind.Parent, and forwards the rich onboarding sections', () => {
    const got = mockCreateInputToWayelCreate({
      name: '  Sun Valley  ',
      slug: 'Sun Valley',
      type: 'School',
      plan: 'professional',
      status: 'pending',
      timezone: 'Africa/Johannesburg',
      firstAdminEmail: 'admin@sunvalley.example',
      firstAdminFirstName: 'Ada',
      firstAdminLastName: 'Lovelace',
      sendAdminInvite: true,
    });

    // `inviteAdmin` is intentionally OMITTED here: the mapper only
    // forwards the flag when the operator explicitly opts out
    // (`sendAdminInvite: false`), letting the server own the default.
    expect(got).toEqual({
      name: 'Sun Valley',
      slug: 'sun-valley',
      kind: 'Parent',
      record: {
        type: 'School',
        plan: 'Professional',
        timezone: 'Africa/Johannesburg',
      },
      adminContact: {
        email: 'admin@sunvalley.example',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    });
  });

  it('omits the admin contact (and invite flag) when no admin email is provided', () => {
    const got = mockCreateInputToWayelCreate({
      name: 'Acme',
      slug: 'acme',
      type: 'Activity',
      plan: 'starter',
      status: 'pending',
      timezone: 'UTC',
      firstAdminEmail: null,
      firstAdminFirstName: null,
      firstAdminLastName: null,
    });

    expect(got.slug).toBe('acme');
    expect(got.kind).toBe('Parent');
    expect(got.adminContact).toBeUndefined();
    expect(got.inviteAdmin).toBeUndefined();
    // Record is still emitted from type / plan / timezone, since those
    // are always supplied on the create-input contract.
    expect(got.record).toEqual({
      type: 'Activity',
      plan: 'Starter',
      timezone: 'UTC',
    });
  });

  it('respects sendAdminInvite=false when an admin email is provided', () => {
    const got = mockCreateInputToWayelCreate({
      name: 'Acme',
      slug: 'acme',
      type: 'Activity',
      plan: 'starter',
      status: 'pending',
      timezone: 'UTC',
      firstAdminEmail: 'admin@acme.example',
      firstAdminFirstName: null,
      firstAdminLastName: null,
      sendAdminInvite: false,
    });

    expect(got.adminContact).toEqual({
      email: 'admin@acme.example',
      firstName: null,
      lastName: null,
    });
    expect(got.inviteAdmin).toBe(false);
  });
});

// ── Detail → MockPlatformTenant ─────────────────────────────────────

function detailFixture(over: Partial<WayelAdminTenantDetail> = {}): WayelAdminTenantDetail {
  return {
    tenantId: 't-1',
    name: 'Sun Valley',
    slug: 'sun-valley',
    kind: 'Parent',
    status: 'Active',
    createdOnUtc: '2025-04-17T10:00:00Z',
    activeChildrenCount: 0,
    profile: {
      category: 'preschool',
      institutionKind: 'Daycare',
      area: 'Sea Point',
      city: 'Cape Town',
      tagline: 'Learning by play',
      description: 'A small play-based preschool.',
      monthlyFeeZar: 4500,
      ageMinYears: 2,
      ageMaxYears: 6,
      accentColor: '#5ba8e0',
      imageUrl: 'https://cdn.example/cover.jpg',
      website: 'https://sunvalley.example',
    },
    record: {
      type: 'School',
      plan: 'Professional',
      timezone: 'Africa/Johannesburg',
    },
    adminContact: {
      email: 'admin@sunvalley.example',
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
    branding: {
      displayName: 'Sun Valley Preschool',
      primaryColor: '#5ba8e0',
      secondaryColor: '#3b82b5',
      accentColor: '#f4a261',
      backgroundColor: '#f6f8fb',
      surfaceColor: '#ffffff',
      textColor: '#1e2433',
      logoUrl: 'https://cdn.example/logo.svg',
      faviconUrl: 'https://cdn.example/favicon.ico',
      customDomain: 'parents.sunvalley.example',
      defaultTheme: 'Light',
      supportEmail: 'help@sunvalley.example',
      supportPhone: '+27-21-555-0100',
      websiteUrl: 'https://sunvalley.example',
    },
    settings: {
      maxChildren: 60,
      maxStaff: 12,
      defaultRetentionDays: 365,
      allowedFileExtensions: ['jpg', 'png', 'pdf'],
      featureFlags: {
        requireMfaForStaff: true,
        parentMediaApproval: true,
        weeklyTrendsEnabled: false,
        printShopEnabled: false,
        lifetimeArchiveEnabled: true,
      },
    },
    ...over,
  };
}

describe('wayelTenantDetailToMock', () => {
  it('projects the full nested detail into a rich MockPlatformTenant', () => {
    const got = wayelTenantDetailToMock(detailFixture());

    expect(got).toMatchObject({
      id: 't-1',
      name: 'Sun Valley',
      slug: 'sun-valley',
      type: 'School',
      plan: 'professional',
      timezone: 'Africa/Johannesburg',
      firstAdminEmail: 'admin@sunvalley.example',
      firstAdminFirstName: 'Ada',
      firstAdminLastName: 'Lovelace',
      category: 'preschool',
      kind: 'daycare',
      area: 'Sea Point',
      city: 'Cape Town',
      tagline: 'Learning by play',
      description: 'A small play-based preschool.',
      monthlyFeeZar: 4500,
      ageRangeYears: { min: 2, max: 6 },
      accentColor: '#5ba8e0',
      imageUrl: 'https://cdn.example/cover.jpg',
      website: 'https://sunvalley.example',
    });
    expect(got.branding).toEqual({
      displayName: 'Sun Valley Preschool',
      primaryColor: '#5ba8e0',
      secondaryColor: '#3b82b5',
      accentColor: '#f4a261',
      backgroundColor: '#f6f8fb',
      surfaceColor: '#ffffff',
      textColor: '#1e2433',
      logoUrl: 'https://cdn.example/logo.svg',
      faviconUrl: 'https://cdn.example/favicon.ico',
      customDomain: 'parents.sunvalley.example',
      defaultTheme: 'light',
      supportEmail: 'help@sunvalley.example',
      supportPhone: '+27-21-555-0100',
      websiteUrl: 'https://sunvalley.example',
    });
    expect(got.settings).toMatchObject({
      maxChildren: 60,
      maxStaff: 12,
      defaultRetentionDays: 365,
      allowedFileExtensions: ['jpg', 'png', 'pdf'],
      featureFlags: { requireMfaForStaff: true, parentMediaApproval: true },
    });
  });

  it('falls back when nested optional fields are null', () => {
    const got = wayelTenantDetailToMock(
      detailFixture({
        record: { type: null, plan: 'Unspecified', timezone: null },
        adminContact: { email: null, firstName: null, lastName: null },
        profile: {
          category: null,
          institutionKind: 'Unknown',
          area: null,
          city: null,
          tagline: null,
          description: null,
          monthlyFeeZar: null,
          ageMinYears: null,
          ageMaxYears: null,
          accentColor: null,
          imageUrl: null,
          website: null,
        },
      }),
    );

    expect(got.type).toBe('');
    expect(got.timezone).toBe('UTC');
    expect(got.plan).toBe('starter');
    expect(got.firstAdminEmail).toBeNull();
    expect(got.kind).toBeUndefined();
    expect(got.category).toBeUndefined();
    expect(got.ageRangeYears).toBeUndefined();
  });
});

describe('mockProfileInputToWayel', () => {
  it('packs the form payload into a total-replacement PATCH body', () => {
    const got = mockProfileInputToWayel({
      name: 'Sun Valley',
      category: 'preschool',
      kind: 'daycare',
      area: 'Sea Point',
      city: 'Cape Town',
      tagline: '  Learning by play  ',
      description: '   ',
      monthlyFeeZar: 4500,
      ageRangeYears: { min: 2, max: 6 },
      accentColor: '#5ba8e0',
      imageUrl: null,
      website: 'https://sunvalley.example',
    });

    expect(got).toEqual({
      category: 'preschool',
      institutionKind: 'Daycare',
      area: 'Sea Point',
      city: 'Cape Town',
      tagline: 'Learning by play',
      description: null,
      monthlyFeeZar: 4500,
      ageMinYears: 2,
      ageMaxYears: 6,
      accentColor: '#5ba8e0',
      imageUrl: null,
      website: 'https://sunvalley.example',
    });
  });
});

describe('mockRecordInputToWayel', () => {
  it("ignores slug + maxChildren — they don't belong on PATCH .../record", () => {
    const got = mockRecordInputToWayel({
      type: 'School',
      slug: 'sun-valley',
      plan: 'enterprise',
      timezone: 'Africa/Johannesburg',
      maxChildren: 80,
    });

    expect(got).toEqual({
      type: 'School',
      plan: 'Enterprise',
      timezone: 'Africa/Johannesburg',
    });
    expect(got).not.toHaveProperty('slug');
    expect(got).not.toHaveProperty('maxChildren');
  });
});

describe('mockAdminInputToWayel', () => {
  it('renames the form fields and strips empty strings to null', () => {
    const got = mockAdminInputToWayel({
      firstAdminEmail: ' Admin@SunValley.Example ',
      firstAdminFirstName: '',
      firstAdminLastName: 'Lovelace',
    });

    expect(got).toEqual({
      // Email is *not* lowercased here — the API normalises it server-side
      // and the test only asserts the trimming + field-name shape.
      email: 'Admin@SunValley.Example',
      firstName: null,
      lastName: 'Lovelace',
    });
  });
});

describe('mockBrandingInputToWayel', () => {
  it('forwards the branding blob with theme PascalCased and empty strings nulled', () => {
    const got = mockBrandingInputToWayel({
      branding: {
        displayName: 'Sun Valley',
        primaryColor: '#5ba8e0',
        secondaryColor: '',
        defaultTheme: 'dark',
        supportEmail: 'help@sunvalley.example',
      },
    });

    expect(got.displayName).toBe('Sun Valley');
    expect(got.primaryColor).toBe('#5ba8e0');
    expect(got.secondaryColor).toBeNull();
    expect(got.defaultTheme).toBe('Dark');
    expect(got.supportEmail).toBe('help@sunvalley.example');
  });
});

describe('mockSettingsInputToWayel', () => {
  it('maps the maxChildren=0 sentinel to null (uncapped) and lower-cases extensions', () => {
    const got = mockSettingsInputToWayel({
      settings: {
        maxChildren: 0,
        maxStaff: null,
        defaultRetentionDays: 180,
        allowedFileExtensions: ['JPG', ' Png ', 'pdf'],
        featureFlags: {
          requireMfaForStaff: false,
          parentMediaApproval: true,
          weeklyTrendsEnabled: false,
          printShopEnabled: false,
          lifetimeArchiveEnabled: false,
        },
      },
    });

    expect(got.maxChildren).toBeNull();
    expect(got.maxStaff).toBeNull();
    expect(got.defaultRetentionDays).toBe(180);
    expect(got.allowedFileExtensions).toEqual(['jpg', 'png', 'pdf']);
    expect(got.featureFlags?.parentMediaApproval).toBe(true);
  });
});
