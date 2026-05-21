/**
 * Workspace staff helper.
 *
 * Builds the staff roster shown in `/tenants/:tenantId/workspace` (Staff tab)
 * from three sources, merged in this order:
 *
 *   1. The institution's `firstAdminEmail` / `firstAdmin*Name` overlay — the
 *      tenant admin contact that comes from the onboarding form. Always
 *      shown (when present) as a `TenantAdmin`.
 *   2. Any `MOCK_ACCOUNTS` whose `role === 'staff'` and
 *      `staffInstitutionId === tenantId` — real seeded login accounts.
 *   3. A small per-tenant seed defined here for richness so every workspace
 *      has at least a few staff cards to demo the UI against.
 *
 * Everything is in-memory / mock — no backend round trips. Updates happen
 * in-place on the synthesized record so the form save in the detail page
 * gives the user real feedback during the demo.
 */
import { MOCK_ACCOUNTS, type MockAccount } from '@wayel/shared/core/mock/mock-accounts';
import {
  type MockPlatformTenant,
} from '@wayel/shared/core/mock/mock-data';

export type WorkspaceStaffStatus = 'active' | 'invited' | 'inactive';

/**
 * Roles a staff member can hold. Mirrors the platform-side role catalogue
 * in the blueprint screenshot. Each role expands into a fixed permission
 * set via `permissionsForRole` below.
 */
export type WorkspaceStaffRole =
  | 'PlatformAdmin'
  | 'TenantAdmin'
  | 'DocumentManager'
  | 'Auditor'
  | 'Viewer';

export const AVAILABLE_ROLES: WorkspaceStaffRole[] = [
  'PlatformAdmin',
  'TenantAdmin',
  'DocumentManager',
  'Auditor',
  'Viewer',
];

/** Per-role permission grants. `*` is a wildcard. */
const ROLE_PERMISSIONS: Record<WorkspaceStaffRole, string[]> = {
  PlatformAdmin: ['*'],
  TenantAdmin: [
    'tenant.manage',
    'staff.manage',
    'subscription.manage',
    'document.read',
    'document.write',
  ],
  DocumentManager: ['document.read', 'document.write', 'document.delete', 'document.upload'],
  Auditor: ['audit.read', 'audit.export', 'document.read'],
  Viewer: ['document.read', 'document.download'],
};

/** A staff member as rendered in the workspace list & detail pages. */
export interface WorkspaceStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string | null;
  title: string;
  /** Roles assigned to this person. The first entry is the "primary" badge. */
  roles: WorkspaceStaffRole[];
  /**
   * Permissions granted to this user directly (in addition to anything
   * inherited from their roles). Stored as dotted strings, e.g.
   * `audit.export`.
   */
  directPermissions: string[];
  status: WorkspaceStaffStatus;
  /** ISO 8601 timestamp, or `null` if the user has never signed in. */
  lastLoginAt: string | null;
  /** ISO 8601 timestamp — when the staff record was created. */
  createdAt: string;
  photoUrl: string | null;
}

/** A single timeline entry shown on the Activity tab. */
export interface WorkspaceStaffActivity {
  id: string;
  /** ISO 8601 timestamp. */
  occurredAt: string;
  /** Material icon name. */
  icon: string;
  summary: string;
  detail?: string;
}

/** Audit-log shape — narrower & more structured than activity. */
export interface WorkspaceStaffAuditEntry {
  id: string;
  /** ISO 8601 timestamp. */
  occurredAt: string;
  /** Dotted event kind, e.g. `staff.role.granted`. */
  kind: string;
  /** Display name of who performed the action. */
  actor: string;
  summary: string;
  detail?: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Per-tenant seed                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Extra staff seeds, keyed by tenant id. Every entry is merged on top of the
 * tenant admin & MOCK_ACCOUNTS pulls. `id`s are stable so updates round-trip.
 */
const TENANT_STAFF_SEEDS: Record<string, WorkspaceStaffMember[]> = {
  tenant_little_stars: [
    {
      id: 'staff_ls_lindiwe',
      firstName: 'Lindiwe',
      lastName: 'Dube',
      displayName: 'Lindiwe Dube',
      email: 'l.dube@littlestars.edu',
      phone: '+27 82 555 0144',
      title: 'Senior Educator',
      roles: ['TenantAdmin'],
      directPermissions: ['document.download'],
      status: 'active',
      lastLoginAt: '2026-04-12T11:00:00Z',
      createdAt: '2024-01-08T09:00:00Z',
      photoUrl: null,
    },
    {
      id: 'staff_ls_sipho',
      firstName: 'Sipho',
      lastName: 'Ndlovu',
      displayName: 'Sipho Ndlovu',
      email: 'sipho@littlestars.edu',
      phone: '+27 82 555 0188',
      title: 'After-care Lead',
      roles: ['DocumentManager'],
      directPermissions: [],
      status: 'active',
      lastLoginAt: '2026-04-15T07:42:00Z',
      createdAt: '2024-03-22T09:00:00Z',
      photoUrl: null,
    },
    {
      id: 'staff_ls_amahle',
      firstName: 'Amahle',
      lastName: 'Khoza',
      displayName: 'Amahle Khoza',
      email: 'amahle@littlestars.edu',
      phone: null,
      title: 'Toddler Room Educator',
      roles: ['Viewer'],
      directPermissions: ['document.upload'],
      status: 'active',
      lastLoginAt: '2026-04-16T08:05:00Z',
      createdAt: '2025-01-15T09:00:00Z',
      photoUrl: null,
    },
    {
      id: 'staff_ls_invited',
      firstName: 'Pearl',
      lastName: 'Sithole',
      displayName: 'Pearl Sithole',
      email: 'pearl@littlestars.edu',
      phone: null,
      title: 'Pre-school Assistant',
      roles: ['Viewer'],
      directPermissions: [],
      status: 'invited',
      lastLoginAt: null,
      createdAt: '2026-04-09T09:00:00Z',
      photoUrl: null,
    },
  ],
  inst_aqua_stars: [
    {
      id: 'staff_aqua_zinzi',
      firstName: 'Zinzi',
      lastName: 'Mhlongo',
      displayName: 'Zinzi Mhlongo',
      email: 'zinzi@aquastars.example.com',
      phone: '+27 21 555 0182',
      title: 'Head Coach',
      roles: ['TenantAdmin', 'DocumentManager'],
      directPermissions: [],
      status: 'active',
      lastLoginAt: '2026-04-14T16:20:00Z',
      createdAt: '2025-09-15T08:00:00Z',
      photoUrl: null,
    },
    {
      id: 'staff_aqua_dean',
      firstName: 'Dean',
      lastName: 'Botha',
      displayName: 'Dean Botha',
      email: 'dean@aquastars.example.com',
      phone: '+27 21 555 0190',
      title: 'Junior Coach',
      roles: ['Viewer'],
      directPermissions: [],
      status: 'active',
      lastLoginAt: '2026-04-13T15:00:00Z',
      createdAt: '2025-10-02T08:00:00Z',
      photoUrl: null,
    },
  ],
  inst_kintaro_karate: [
    {
      id: 'staff_kintaro_yuki',
      firstName: 'Yuki',
      lastName: 'Nakamura',
      displayName: 'Yuki Nakamura',
      email: 'yuki@kintaro.example.com',
      phone: null,
      title: 'Sensei',
      roles: ['TenantAdmin'],
      directPermissions: [],
      status: 'active',
      lastLoginAt: '2026-04-10T18:30:00Z',
      createdAt: '2025-10-04T11:30:00Z',
      photoUrl: null,
    },
  ],
  inst_brushstrokes: [
    {
      id: 'staff_brush_zara',
      firstName: 'Zara',
      lastName: 'Patel',
      displayName: 'Zara Patel',
      email: 'zara@brushstrokes.example.com',
      phone: null,
      title: 'Studio Lead',
      roles: ['DocumentManager'],
      directPermissions: [],
      status: 'active',
      lastLoginAt: '2026-04-11T14:00:00Z',
      createdAt: '2025-11-22T09:00:00Z',
      photoUrl: null,
    },
  ],
  inst_sonata_music: [
    {
      id: 'staff_sonata_marcus',
      firstName: 'Marcus',
      lastName: 'Adler',
      displayName: 'Marcus Adler',
      email: 'marcus@sonatamusic.example.com',
      phone: null,
      title: 'Piano Instructor',
      roles: ['Viewer'],
      directPermissions: [],
      status: 'active',
      lastLoginAt: '2026-04-09T17:00:00Z',
      createdAt: '2025-10-05T09:00:00Z',
      photoUrl: null,
    },
    {
      id: 'staff_sonata_neha',
      firstName: 'Neha',
      lastName: 'Reddy',
      displayName: 'Neha Reddy',
      email: 'neha@sonatamusic.example.com',
      phone: null,
      title: 'Strings Coordinator',
      roles: ['Auditor'],
      directPermissions: [],
      status: 'active',
      lastLoginAt: '2026-03-30T13:15:00Z',
      createdAt: '2025-10-12T09:00:00Z',
      photoUrl: null,
    },
  ],
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Public API                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/** Primary role for a member (first entry, fallback `Viewer`). */
export function primaryRoleOf(member: WorkspaceStaffMember): WorkspaceStaffRole {
  return member.roles[0] ?? 'Viewer';
}

/** All staff members for a single institution, deduplicated by email. */
export function listStaffForTenant(tenant: MockPlatformTenant): WorkspaceStaffMember[] {
  const out: WorkspaceStaffMember[] = [];
  const seenEmails = new Set<string>();

  const push = (m: WorkspaceStaffMember | null) => {
    if (!m) return;
    const key = m.email.trim().toLowerCase();
    if (seenEmails.has(key)) return;
    seenEmails.add(key);
    out.push(m);
  };

  push(synthesizeFromTenantAdmin(tenant));

  for (const acct of MOCK_ACCOUNTS) {
    if (acct.role !== 'staff' || acct.staffInstitutionId !== tenant.id) continue;
    push(synthesizeFromAccount(acct));
  }

  for (const seed of TENANT_STAFF_SEEDS[tenant.id] ?? []) {
    push(seed);
  }

  // Active first, then invited, then inactive; within a bucket the most
  // recent activity wins so the demo workspace always has fresh entries
  // up top.
  out.sort((a, b) => {
    const sa = statusWeight(a.status);
    const sb = statusWeight(b.status);
    if (sa !== sb) return sa - sb;
    const la = a.lastLoginAt ?? a.createdAt;
    const lb = b.lastLoginAt ?? b.createdAt;
    return lb.localeCompare(la);
  });

  return out;
}

export function findStaffById(
  tenant: MockPlatformTenant,
  staffId: string,
): WorkspaceStaffMember | undefined {
  return listStaffForTenant(tenant).find((s) => s.id === staffId);
}

/**
 * Look up a staff member across every tenant by email (case-insensitive).
 *
 * Used by the REMOVED login page to auto-route an institution user
 * to their home workspace when they sign in with email + password.
 *
 * Returns the first match (tenant + member). When multiple tenants
 * happen to share an email (rare in practice), the active record wins.
 */
export function findStaffByEmailAcrossTenants(
  tenants: MockPlatformTenant[],
  email: string,
): { tenant: MockPlatformTenant; member: WorkspaceStaffMember } | null {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  let fallback: { tenant: MockPlatformTenant; member: WorkspaceStaffMember } | null = null;
  for (const tenant of tenants) {
    for (const member of listStaffForTenant(tenant)) {
      if (member.email.trim().toLowerCase() !== needle) continue;
      if (member.status === 'active') return { tenant, member };
      fallback ??= { tenant, member };
    }
  }
  return fallback;
}

/**
 * Apply a partial profile update to a seeded staff record (mock-only). For
 * now this just mutates the in-memory seed so re-renders pick it up; rows
 * synthesized from tenant overlays / MOCK_ACCOUNTS are not yet writable
 * because they live in shared mock files we don't want to mutate from here.
 *
 * Returns the updated record, or `null` if the staff isn't a writable seed.
 */
export function updateStaffProfile(
  staffId: string,
  patch: Partial<
    Pick<WorkspaceStaffMember, 'firstName' | 'lastName' | 'displayName' | 'phone' | 'title'>
  >,
): WorkspaceStaffMember | null {
  return mutateSeed(staffId, (current) => {
    const next = { ...current, ...patch };
    if (patch.firstName != null || patch.lastName != null) {
      next.displayName = `${next.firstName} ${next.lastName}`.trim();
    }
    return next;
  });
}

/** Toggle a role on or off for a writable staff member. */
export function toggleStaffRole(
  staffId: string,
  role: WorkspaceStaffRole,
): WorkspaceStaffMember | null {
  return mutateSeed(staffId, (current) => {
    const has = current.roles.includes(role);
    const roles = has ? current.roles.filter((r) => r !== role) : [...current.roles, role];
    return { ...current, roles };
  });
}

/** Add a single direct permission. No-op if it already exists. */
export function grantStaffPermission(
  staffId: string,
  permission: string,
): WorkspaceStaffMember | null {
  const trimmed = permission.trim();
  if (!trimmed) return null;
  return mutateSeed(staffId, (current) => {
    if (current.directPermissions.includes(trimmed)) return current;
    return { ...current, directPermissions: [...current.directPermissions, trimmed] };
  });
}

/** Remove a single direct permission. */
export function revokeStaffPermission(
  staffId: string,
  permission: string,
): WorkspaceStaffMember | null {
  return mutateSeed(staffId, (current) => ({
    ...current,
    directPermissions: current.directPermissions.filter((p) => p !== permission),
  }));
}

/** Switch the staff member between active / inactive (Suspend / Reactivate). */
export function setStaffStatus(
  staffId: string,
  status: WorkspaceStaffStatus,
): WorkspaceStaffMember | null {
  return mutateSeed(staffId, (current) => ({ ...current, status }));
}

/** Effective permissions = union of role-derived + direct. */
export function effectivePermissionsFor(member: WorkspaceStaffMember): string[] {
  const set = new Set<string>();
  for (const role of member.roles) {
    for (const perm of ROLE_PERMISSIONS[role] ?? []) set.add(perm);
  }
  for (const perm of member.directPermissions) set.add(perm);
  return Array.from(set).sort();
}

/** Which permissions come from a single role. */
export function permissionsForRole(role: WorkspaceStaffRole): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Activity & audit                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Synthesize a small "Recent Activity" timeline for a staff member based on
 * their status & lastLoginAt. Returns newest-first.
 */
export function listStaffActivity(member: WorkspaceStaffMember): WorkspaceStaffActivity[] {
  const out: WorkspaceStaffActivity[] = [];

  if (member.lastLoginAt) {
    out.push({
      id: `${member.id}_act_login`,
      occurredAt: member.lastLoginAt,
      icon: 'login',
      summary: 'Signed into the workspace',
      detail: 'From web browser · Cape Town, ZA',
    });
  }

  // A believable mid-life update event so cards don't look flat.
  const updatedAt = shiftIso(member.lastLoginAt ?? member.createdAt, -3 * 24 * 60 * 60 * 1000);
  out.push({
    id: `${member.id}_act_profile`,
    occurredAt: updatedAt,
    icon: 'edit',
    summary: 'Updated profile information',
    detail: 'Phone number changed',
  });

  if (member.status === 'invited') {
    out.push({
      id: `${member.id}_act_invite`,
      occurredAt: member.createdAt,
      icon: 'forward_to_inbox',
      summary: 'Invitation email sent',
      detail: `To ${member.email}`,
    });
  } else if (member.status === 'inactive') {
    out.push({
      id: `${member.id}_act_suspended`,
      occurredAt: shiftIso(member.lastLoginAt ?? member.createdAt, 12 * 60 * 60 * 1000),
      icon: 'block',
      summary: 'Account suspended',
      detail: 'Access revoked by an administrator',
    });
  }

  out.push({
    id: `${member.id}_act_created`,
    occurredAt: member.createdAt,
    icon: 'person_add',
    summary: 'Account created',
    detail: `Joined as ${primaryRoleOf(member)}`,
  });

  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * Synthesize an audit log timeline. More structured than activity — each
 * entry has a dotted `kind` so we can filter by event type in the UI.
 */
export function listStaffAuditEntries(member: WorkspaceStaffMember): WorkspaceStaffAuditEntry[] {
  const out: WorkspaceStaffAuditEntry[] = [];
  const platformActor = 'Platform Operator';

  out.push({
    id: `${member.id}_aud_created`,
    occurredAt: member.createdAt,
    kind: 'staff.created',
    actor: platformActor,
    summary: `Created account for ${member.displayName}`,
    detail: `Email: ${member.email}`,
  });

  for (const role of member.roles) {
    out.push({
      id: `${member.id}_aud_role_${role}`,
      occurredAt: shiftIso(member.createdAt, 60 * 60 * 1000),
      kind: 'staff.role.granted',
      actor: platformActor,
      summary: `Granted role ${role}`,
    });
  }

  if (member.directPermissions.length) {
    for (const perm of member.directPermissions) {
      out.push({
        id: `${member.id}_aud_perm_${perm}`,
        occurredAt: shiftIso(member.createdAt, 2 * 24 * 60 * 60 * 1000),
        kind: 'staff.permission.granted',
        actor: platformActor,
        summary: `Granted direct permission ${perm}`,
      });
    }
  }

  if (member.lastLoginAt) {
    out.push({
      id: `${member.id}_aud_login`,
      occurredAt: member.lastLoginAt,
      kind: 'staff.session.login',
      actor: member.displayName,
      summary: 'Signed in successfully',
      detail: 'web · 197.2.x.x',
    });
  }

  if (member.status === 'invited') {
    out.push({
      id: `${member.id}_aud_invited`,
      occurredAt: member.createdAt,
      kind: 'staff.invited',
      actor: platformActor,
      summary: `Invitation sent to ${member.email}`,
    });
  }
  if (member.status === 'inactive') {
    out.push({
      id: `${member.id}_aud_suspended`,
      occurredAt: shiftIso(member.lastLoginAt ?? member.createdAt, 12 * 60 * 60 * 1000),
      kind: 'staff.suspended',
      actor: platformActor,
      summary: 'Account suspended',
    });
  }

  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Internals                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function statusWeight(s: WorkspaceStaffStatus): number {
  switch (s) {
    case 'active':
      return 0;
    case 'invited':
      return 1;
    case 'inactive':
      return 2;
  }
}

/** Generic "find this seed and replace it via a transformer" helper. */
function mutateSeed(
  staffId: string,
  transform: (current: WorkspaceStaffMember) => WorkspaceStaffMember,
): WorkspaceStaffMember | null {
  for (const list of Object.values(TENANT_STAFF_SEEDS)) {
    const idx = list.findIndex((s) => s.id === staffId);
    if (idx === -1) continue;
    const next = transform(list[idx]);
    list[idx] = next;
    return next;
  }
  return null;
}

function synthesizeFromTenantAdmin(t: MockPlatformTenant): WorkspaceStaffMember | null {
  if (!t.firstAdminEmail) return null;
  const first = (t.firstAdminFirstName ?? '').trim();
  const last = (t.firstAdminLastName ?? '').trim();
  const display = [first, last].filter(Boolean).join(' ') || t.firstAdminEmail;
  return {
    id: `staff_admin_${t.id}`,
    firstName: first || display,
    lastName: last,
    displayName: display,
    email: t.firstAdminEmail,
    phone: null,
    title: 'Tenant Administrator',
    roles: ['TenantAdmin'],
    directPermissions: [],
    status: 'active',
    lastLoginAt: t.activatedAt ?? t.createdAt,
    createdAt: t.createdAt,
    photoUrl: null,
  };
}

function synthesizeFromAccount(acct: MockAccount): WorkspaceStaffMember {
  const parts = acct.displayName.trim().split(/\s+/);
  const first = parts[0] ?? acct.displayName;
  const last = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return {
    id: acct.id,
    firstName: first,
    lastName: last,
    displayName: acct.displayName,
    email: acct.email,
    phone: acct.phone,
    title: 'Programme Educator',
    roles: ['Viewer'],
    directPermissions: [],
    status: 'active',
    lastLoginAt: acct.createdAt,
    createdAt: acct.createdAt,
    photoUrl: null,
  };
}

/** Move an ISO timestamp by `deltaMs` (positive = forward). */
function shiftIso(iso: string, deltaMs: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Date(d.getTime() + deltaMs).toISOString();
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Avatar colour palette                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

const AVATAR_PALETTE = [
  '#ec4899', // pink (matches blueprint)
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#f97316', // orange
  '#a855f7', // purple
  '#22c55e', // green
  '#ef4444', // red
];

/** Deterministic colour for an avatar — same name → same hue every render. */
export function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
