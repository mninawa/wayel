/**
 * Build the URL the invitation recipient should open.
 *
 * The shared `WayelAcceptInvitationComponent` is mounted at
 * `/invitations/accept?token=<opaque>` in every portal that ships a
 * BFF (admin, client, external), so the only choice for the inviter
 * is the *origin* the recipient should land on. We pick that here:
 *
 *  1. Caller-supplied `originOverride` wins (the SuperAdmin "preview
 *     as another tenant" path passes one explicitly so the link still
 *     points at the institution's branded host even though the admin
 *     is sitting on `app.wayel.example`).
 *  2. Otherwise we use the SPA's current origin — which is whatever
 *     URL the inviter typed into the address bar (so a SuperAdmin on
 *     `app.wayel.example` sends an `app.wayel.example/...` link, and
 *     a TenantAdmin on `parents.sun-valley.example` sends a branded
 *     one). That matches what the recipient already trusts because
 *     the inviter just told them "click this link from us".
 *  3. Last-resort fallback (SSR / no `window`) is an empty string,
 *     which keeps the helper pure and testable.
 *
 * The token is URL-encoded so a stray `+` or `/` from the base64-url
 * alphabet (we don't use those characters today, but a future token
 * format change shouldn't silently break this) doesn't get parsed
 * as a query separator on the receiving side.
 */
export function buildInvitationAcceptUrl(
  token: string,
  originOverride?: string,
): string {
  const trimmedToken = (token ?? '').trim();
  if (!trimmedToken) return '';

  const origin = resolveOrigin(originOverride);
  // Always emit the path even when origin is empty so a paste of the
  // result still resolves correctly when prefixed with an explicit
  // host later (e.g. the inviter forwarding via a chat client that
  // strips the host).
  return `${origin}/invitations/accept?token=${encodeURIComponent(trimmedToken)}`;
}

/**
 * Server-first variant: when the API returned a fully-qualified accept
 * URL (composed by `IInvitationAcceptUrlBuilder` from
 * `NotificationOptions.AcceptUrlBase*`), trust *that* as the canonical
 * link — it's the same string the recipient just received in their
 * email/SMS, so the SuperAdmin's "Copy URL" matches their inbox.
 *
 * Falls back to <see cref="buildInvitationAcceptUrl"/> when the server
 * didn't supply one (no NotificationOptions configured), preserving
 * today's pure-client behaviour.
 */
export function preferServerAcceptUrl(
  serverAcceptUrl: string | null | undefined,
  token: string,
  originOverride?: string,
): string {
  const trimmed = (serverAcceptUrl ?? '').trim();
  if (trimmed.length > 0) return trimmed;
  return buildInvitationAcceptUrl(token, originOverride);
}

function resolveOrigin(override?: string): string {
  if (override && override.trim().length > 0) {
    return stripTrailingSlash(override.trim());
  }
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return stripTrailingSlash(window.location.origin);
  }
  return '';
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
