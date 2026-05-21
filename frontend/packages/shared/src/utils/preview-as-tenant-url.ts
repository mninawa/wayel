/**
 * Compose the URL the SuperAdmin's "Preview as tenant" button opens.
 *
 * Pinned shape: a single <c>?previewHost=&lt;encoded-host&gt;</c> query
 * parameter on the SPA root, no path segments. Both pieces matter:
 *
 *  - Path stays at "/" so the BFF/SPA bootstrap runs through its
 *    full unauth-then-auth painting sequence rather than a deep
 *    link that might bypass the pre-login chrome.
 *  - The host is URL-encoded so a punycoded IDN ("xn--…") or a
 *    leading "https://" the operator pasted in by mistake doesn't
 *    break the query parser; the BFF still trims and lower-cases
 *    on the receiving side, so case differences are tolerated.
 *
 * Stripping any leading scheme keeps the override behaving as a
 * Host header (which is what the BFF compares against the unique
 * <c>branding.customDomain</c> index).
 *
 * Lives in `@wayel/shared/utils` (rather than next to the admin tenant
 * detail component) so the workspace's pure-vitest harness can pin the
 * URL shape, and so any future portal that grows a similar "preview"
 * affordance can reuse it without re-deriving the rules.
 */
export function buildPreviewAsTenantUrl(
  origin: string,
  rawHost: string,
): string {
  const baseOrigin = (origin ?? '').replace(/\/+$/, '');
  const host = stripScheme((rawHost ?? '').trim().toLowerCase());
  return `${baseOrigin}/?previewHost=${encodeURIComponent(host)}`;
}

function stripScheme(host: string): string {
  // Tolerate "https://parents.foo.example/" → "parents.foo.example".
  // The BFF only ever wants the host portion; a stray scheme would
  // round-trip into the SPA query and confuse downstream comparison.
  const noScheme = host.replace(/^https?:\/\//, '');
  return noScheme.replace(/\/+$/, '');
}
