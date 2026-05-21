/**
 * Phase 0 API sketch for the institution-side staff invitation surface.
 *
 * Domain reminder: a staff invitation is an *outbound* offer for someone to
 * join the current institution as a teacher / instructor / admin. It carries
 * a one-shot token (sent via email and/or WhatsApp) that the recipient
 * redeems to accept and become a real `PlatformUser`. Self-signup as staff
 * is not allowed — the only path to a staff account is redeeming a token
 * issued by an institution admin. While the token is outstanding the
 * invitation sits in the staff inbox in one of these states:
 *
 *   - `pending`  — sent, not yet accepted, still inside `expiresAt`.
 *   - `accepted` — the invitee redeemed the token; a user account now exists.
 *   - `expired`  — `expiresAt` passed without a redemption.
 *   - `revoked`  — staff cancelled the invitation before it was redeemed.
 *
 * Suggested base path: `/api/staff-invitations`. Endpoints are scoped to the
 * institution resolved from the session — staff only see invitations they
 * sent (or that were sent for their institution). Two endpoints under the
 * same prefix are PUBLIC so the recipient can redeem without already having
 * a session:
 *
 *   - `GET  /api/staff-invitations/lookup/{token}`
 *   - `POST /api/staff-invitations/lookup/{token}/accept`
 */

import type { Phase0AuthResponse } from './accounts.phase0';
import type { Phase0PagedResult } from './platform-tenant.phase0';

export type Phase0StaffInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'expired'
  | 'revoked';

/**
 * Free-form role label (e.g. "Teacher", "Coach / instructor", "Admin"). Kept
 * as a string so institutions can model their own staff structure without us
 * forcing a fixed enum at this stage. The UI nudges towards a small suggested
 * set but does not enforce it.
 */
export type Phase0StaffInvitationRole = string;

/** Channel(s) the invitation link was last delivered through. */
export type Phase0InvitationChannel = 'email' | 'whatsapp' | 'both';

export interface Phase0StaffInvitationDto {
  id: string;
  /** Institution the invitation is *for*. */
  institutionId: string;
  institutionName: string;
  email: string;
  /** Optional WhatsApp / SMS number, E.164 preferred. */
  phone: string | null;
  role: Phase0StaffInvitationRole;
  /** ISO 8601 timestamp the invitation was first sent. */
  invitedAt: string;
  /** Email of the staff member who issued the invitation. */
  invitedByEmail: string;
  /** ISO 8601 timestamp the token stops being redeemable. */
  expiresAt: string;
  status: Phase0StaffInvitationStatus;
  /** Most recent resend timestamp (ISO 8601). Null if never resent. */
  lastResentAt: string | null;
  /** Channel the invite was last sent through (initial send or resend). */
  lastSentVia: Phase0InvitationChannel | null;
  /** ISO 8601 timestamp the invitation was redeemed. */
  acceptedAt: string | null;
  /** Display name supplied by the invitee at acceptance time. */
  acceptedByName: string | null;
  /** ISO 8601 timestamp the invitation was revoked by staff. */
  revokedAt: string | null;
  /** Reason captured when staff revoked the invitation. */
  revokedReason: string | null;
  /**
   * Absolute URL the recipient should open to redeem the invitation. Always
   * `<customer-portal base>/accept-invite?token=<opaque>`. The token itself
   * is one-shot and never re-issued (resends keep the same URL).
   */
  acceptUrl: string;
}

export interface Phase0ListStaffInvitationsQuery {
  status?: Phase0StaffInvitationStatus;
  /** Substring match against email + role. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export type Phase0StaffInvitationListResult = Phase0PagedResult<
  Phase0StaffInvitationDto
> & {
  /**
   * Counts per status across the *unfiltered* dataset, so the UI can render
   * tab badges without a second roundtrip. Optional so live mode can omit it
   * without breaking clients.
   */
  totalsByStatus?: Record<Phase0StaffInvitationStatus, number>;
};

/**
 * POST /api/staff-invitations
 *
 * Issues a brand-new invitation. The server generates a one-shot opaque
 * token, computes `expiresAt` (`expiresInDays`, default 14) and stamps
 * `invitedByEmail` from the session. Resending an already-sent invitation
 * goes through `/resend`, not this endpoint, so duplicate active invitations
 * to the same email are a conflict (`409`).
 */
export interface Phase0CreateStaffInvitationRequest {
  email: string;
  role: Phase0StaffInvitationRole;
  /** Optional WhatsApp / SMS number for an additional delivery channel. */
  phone?: string | null;
  /**
   * Where to deliver the invite link. Defaults to `'email'`. `'whatsapp'`
   * and `'both'` require `phone` to be set.
   */
  sendVia?: Phase0InvitationChannel;
  /**
   * Days until the invitation token expires. Defaults to 14 server-side if
   * omitted. Capped at 90.
   */
  expiresInDays?: number;
}

export interface Phase0CreateStaffInvitationResponse {
  invitation: Phase0StaffInvitationDto;
}

/**
 * POST /api/staff-invitations/{id}/resend
 *
 * Resends the link and bumps `expiresAt` to a fresh window. Only valid while
 * `status === 'pending'`. The token itself does not change so any link the
 * invitee already has keeps working.
 */
export interface Phase0ResendStaffInvitationRequest {
  /** Channel for this resend. Defaults to whatever was last used. */
  sendVia?: Phase0InvitationChannel;
}

export interface Phase0ResendStaffInvitationResponse {
  /** ISO 8601 timestamp the resend happened. */
  resentAt: string;
  /** ISO 8601 timestamp of the new expiry window. */
  expiresAt: string;
  /** Channel the link was just resent on. */
  via: Phase0InvitationChannel;
}

/**
 * POST /api/staff-invitations/{id}/revoke
 *
 * Cancels a pending invitation. Reason is required so the audit log has
 * something to read; no silent revokes.
 */
export interface Phase0RevokeStaffInvitationRequest {
  reason: string;
}

/* -------------------------------------------------------------------------- */
/* Public lookup + accept (no session required)                               */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/staff-invitations/lookup/{token}
 *
 * Public endpoint used by the "Accept invitation" page. Returns just enough
 * to render a confident acceptance form without leaking institution-internal
 * data (no auditor list, no sibling invites, etc.). Returns:
 *
 *   - `200` with the lookup DTO when the invite is `pending` and unexpired.
 *   - `404 NOT_FOUND` if the token doesn't match anything.
 *   - `410 GONE` if the invite is `expired` or `revoked`.
 *   - `409 CONFLICT` if the invite is already `accepted`.
 */
export interface Phase0StaffInvitationLookupDto {
  id: string;
  institutionId: string;
  institutionName: string;
  email: string;
  role: Phase0StaffInvitationRole;
  invitedByEmail: string;
  expiresAt: string;
  status: Phase0StaffInvitationStatus;
}

/**
 * POST /api/staff-invitations/lookup/{token}/accept
 *
 * Public endpoint that:
 *   1. Validates the token (must be `pending`, unexpired).
 *   2. Creates a `Phase0Account` with `role: 'staff'` linked to the
 *      institution, using the email frozen on the invitation.
 *   3. Marks the invitation `accepted` and stamps `acceptedByName`.
 *   4. Issues a fresh session and returns it like the normal register
 *      endpoint, so the client can sign the user in immediately.
 */
export interface Phase0AcceptStaffInvitationRequest {
  /** What the invitee wants to be called in the app. */
  displayName: string;
  /** Plaintext password (mock); replace with bcrypt hash in production. */
  password: string;
  /** Optional WhatsApp / SMS number for the new account. */
  phone?: string | null;
}

export type Phase0AcceptStaffInvitationResponse = Phase0AuthResponse;
