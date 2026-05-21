/**
 * Phase 0 API sketch for the customer-portal surface (apps/customer-portal).
 *
 * The two existing portals (REMOVED, client-portal) are *internal* tools:
 * REMOVED uses a "paste a bearer token" mock; client-portal uses a "pick
 * which parent you are" chooser. The customer-portal app is the **public**
 * surface — actual parents at home and contract staff who haven't been issued
 * an institution-internal account yet. They go through a real signup/login
 * flow.
 *
 * Auth model in mock mode:
 *   - Passwords are stored in plaintext (mock only — replace with bcrypt +
 *     short-lived JWT when the real backend lands).
 *   - Sessions are random opaque tokens kept in-memory in the mock server +
 *     localStorage on the client.
 *   - The exact same shapes below carry over to the real backend; only the
 *     storage and crypto change.
 *
 * Suggested base path: `/api/accounts`.
 */

/**
 * Roles a self-registered account can take in the customer-portal app.
 *
 * <p><c>'partner'</c> covers preferred-partner-portal users — external
 * organisations (e.g. a robotics academy) that an institution has
 * approved to submit events. They sign in via the same `/auth/login`
 * funnel but end up on the partner-only `/partner/events` surface
 * because the canonical {@link Phase0Account.role} is `'partner'`.</p>
 */
export type Phase0AccountRole = 'parent' | 'staff' | 'partner';

/**
 * A user-facing account. Distinct from `Phase0Parent` (which models the
 * canonical parent identity that owns children) and from any internal staff
 * record an institution might keep — an account is the *credential* + role
 * binding, with optional links into either model.
 */
export interface Phase0Account {
  id: string; // acct_*
  role: Phase0AccountRole;
  email: string;
  displayName: string;
  phone: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;

  /**
   * For `role === 'parent'`: the parent_* id this account owns. The account
   * sees that parent's children, lifetime archives, subscription requests,
   * etc.
   */
  parentId?: string;

  /**
   * For `role === 'staff'`: the institution this staff account works at and
   * the programs the institution has assigned them to.
   */
  staff?: Phase0StaffAssignment;
}

/** Per-staff-account assignment data. */
export interface Phase0StaffAssignment {
  institutionId: string;
  institutionName: string;
  /** Empty array = staff member exists at the institution but hasn't been assigned yet. */
  assignedProgramIds: string[];
}

/* -------------------------------------------------------------------------- */
/* Register                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/accounts/register
 *
 * One endpoint serves both roles; the server branches on `role`. For parent
 * registration we *also* create a `MockParent` (or, in production, a real
 * `Parent` record) with the same email/displayName so the parent's children
 * roster is immediately addressable by the rest of the system.
 */
export interface Phase0RegisterAccountRequest {
  role: Phase0AccountRole;
  email: string;
  password: string;
  displayName: string;
  phone?: string | null;

  /**
   * Required when `role === 'staff'`. The institution slug the staff member
   * is registering against (e.g. handed to them by the institution as part of
   * their onboarding invite). Validated by the server.
   */
  institutionSlug?: string;
}

export interface Phase0AuthResponse {
  account: Phase0Account;
  sessionToken: string;
  /** ISO 8601 timestamp. */
  expiresAt: string;
}

/* -------------------------------------------------------------------------- */
/* Login + Session                                                            */
/* -------------------------------------------------------------------------- */

/** POST /api/accounts/login */
export interface Phase0LoginRequest {
  email: string;
  password: string;
}

/**
 * GET /api/accounts/me
 *
 * Returns the account for the bearer token in the `Authorization` header.
 * 401 if the token is missing or invalid.
 */
export type Phase0MeResponse = { account: Phase0Account };

/** POST /api/accounts/logout — invalidates the bearer token. Idempotent. */
export type Phase0LogoutResponse = { ok: true };

/* -------------------------------------------------------------------------- */
/* Staff "my programs"                                                        */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/staff/me/programs
 *
 * Returns the programs the logged-in staff account is assigned to. Requires
 * a `staff`-role account. 401 if unauthenticated, 403 if a parent account
 * tries to call it.
 */
export interface Phase0MyProgram {
  id: string;
  name: string;
  ageRange: string;
  enrolledCount: number;
  institutionId: string;
  institutionName: string;
}

export interface Phase0MyProgramsResponse {
  programs: Phase0MyProgram[];
}
