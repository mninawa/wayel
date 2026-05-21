/**
 * In-memory account + session store mirroring `tools/platform-mock-api/server.mjs`.
 *
 * Used by the customer-portal app's bridge service when `environment.useMock`
 * is true. Mirrors what the mock server does on the wire so the UI behaves
 * identically whether it talks to the in-memory bridge or the local mock API.
 *
 * Two role-specific shapes:
 *   - parent accounts link to a `MockParent.id` (`parentId`), so signup
 *     immediately makes the parent's roster addressable.
 *   - staff accounts carry their institution + assigned programs inline so a
 *     single `me` call surfaces everything `/staff/programs` needs.
 *
 * Passwords are plaintext on purpose — this is mock-only and the contracts
 * intentionally don't expose the field outside this file.
 */

import type { Phase0AccountRole } from '../contracts/accounts.phase0';

export interface MockAccount {
  id: string;
  role: Phase0AccountRole;
  email: string;
  /** Mock-only plaintext. */
  password: string;
  displayName: string;
  phone: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;

  /** role === 'parent' */
  parentId?: string;

  /** role === 'staff' */
  staffInstitutionId?: string;
  staffAssignedProgramIds?: string[];
}

export interface MockSession {
  /** Opaque token sent in the `Authorization: Bearer ...` header. */
  token: string;
  accountId: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  expiresAt: string;
}

/** Mutable singleton — bridge services and the mock server append/read here. */
export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: 'acct_thandi',
    role: 'parent',
    email: 'thandi.mavuso@example.com',
    password: 'demo1234',
    displayName: 'Thandi Mavuso',
    phone: '+27 11 555 0100',
    createdAt: '2021-02-01T08:00:00Z',
    parentId: 'parent_thandi',
  },
  {
    id: 'acct_amara',
    role: 'parent',
    email: 'amara.lopez@example.com',
    password: 'demo1234',
    displayName: 'Amara Lopez',
    phone: '+27 21 555 0166',
    createdAt: '2024-08-12T08:00:00Z',
    parentId: 'parent_amara',
  },
  {
    id: 'acct_jane_staff',
    role: 'staff',
    email: 'jane@littlestars.test',
    password: 'demo1234',
    displayName: 'Jane Naidoo',
    phone: '+27 11 555 0142',
    createdAt: '2024-09-01T08:00:00Z',
    staffInstitutionId: 'tenant_little_stars',
    staffAssignedProgramIds: ['prog_1', 'prog_3'],
  },
  {
    id: 'acct_kabelo_staff',
    role: 'staff',
    email: 'kabelo@littlestars.test',
    password: 'demo1234',
    displayName: 'Kabelo Mahlangu',
    phone: '+27 11 555 0151',
    createdAt: '2025-02-14T08:00:00Z',
    staffInstitutionId: 'tenant_little_stars',
    staffAssignedProgramIds: ['prog_2'],
  },
  /** WeYell customer portal demo */
  {
    id: 'acct_sabelo_weyell',
    role: 'parent',
    email: 'sabelo@weyell.demo',
    password: 'demo1234',
    displayName: 'Sabelo Dlamini',
    phone: '+268 76 123 4567',
    createdAt: '2025-06-01T08:00:00Z',
    parentId: 'parent_sabelo',
  },
];

/** Mutable singleton — issued at login/register, invalidated at logout. */
export const MOCK_SESSIONS: MockSession[] = [];

/** Default session lifetime: 7 days. Plenty for dev. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function findAccountByEmail(email: string): MockAccount | undefined {
  const needle = email.trim().toLowerCase();
  return MOCK_ACCOUNTS.find((a) => a.email.toLowerCase() === needle);
}

export function findAccountById(id: string): MockAccount | undefined {
  return MOCK_ACCOUNTS.find((a) => a.id === id);
}

export function findSessionByToken(token: string): MockSession | undefined {
  return MOCK_SESSIONS.find((s) => s.token === token);
}

/** Generate an opaque session token. Mock-only — not cryptographically signed. */
export function makeSessionToken(): string {
  return (
    'sess_' +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

export function issueSession(accountId: string): MockSession {
  const now = Date.now();
  const session: MockSession = {
    token: makeSessionToken(),
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  MOCK_SESSIONS.push(session);
  return session;
}

export function revokeSession(token: string): void {
  const i = MOCK_SESSIONS.findIndex((s) => s.token === token);
  if (i !== -1) MOCK_SESSIONS.splice(i, 1);
}
