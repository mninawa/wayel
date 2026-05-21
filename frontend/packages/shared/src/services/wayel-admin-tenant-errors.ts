import type { WayelAdminTenantsHttpError } from './wayel-admin-tenants.service';

/**
 * Editable surface of an Institution tab — used to scope a
 * generic-sounding error code to the tab the user is on, so e.g.
 * `tenant.archived` reads "This tenant has been archived and can
 * no longer be edited" on every tab while a `tenant.branding.*`
 * code only ever shows on Branding.
 */
export type TenantFormScope =
  | 'profile'
  | 'record'
  | 'admin'
  | 'branding'
  | 'settings';

/**
 * Localised, friendly inline message for an error returned by the
 * Wayel.Api admin tenant PATCH endpoints. Returns `null` when the
 * input doesn't look like one of those errors, so callers can fall
 * back to the existing `platformHttpErrorMessage` helper.
 *
 * Two layers of mapping:
 *
 *  1. Recognise the well-known domain codes (`tenant.profile.*`,
 *     `tenant.branding.*`, `tenant.settings.*`, plus the lifecycle
 *     `tenant.archived` / `tenant.not_found` / `tenant.id_mismatch`)
 *     and rewrite them as a one-line user-facing string.
 *  2. For `validation.failed` (the FluentValidation aggregate code),
 *     surface the API's `detail` text verbatim — it already lists
 *     `Property: message` joined with semicolons, which is the most
 *     useful inline message we can generate without re-mapping
 *     every property name.
 *
 * Anything else returns `null` so the caller can decide whether to
 * show a generic banner, a toast, or rethrow.
 */
export function tenantHttpErrorMessage(
  err: unknown,
  scope: TenantFormScope,
): string | null {
  if (!isTenantHttpError(err)) return null;

  switch (err.code) {
    case 'tenant.not_found':
      return 'This tenant no longer exists. Reload the catalogue to refresh the list.';
    case 'tenant.archived':
      return 'This tenant has been archived and can no longer be edited.';
    case 'tenant.id_mismatch':
      return 'The tenant identifier on the request did not match the URL. Refresh and try again.';

    case 'tenant.name_required':
      return scope === 'profile'
        ? 'Display name is required.'
        : 'Tenant name is required.';

    case 'tenant.profile.age_range_invalid':
      return 'Age range must be non-negative, and the minimum cannot exceed the maximum.';

    case 'tenant.branding.color_invalid':
      return 'Brand colours must be hex literals like #5BA8E0 or #5BA8E0FF.';

    case 'tenant.settings.negative_value':
      return 'Capacity and retention values cannot be negative.';
    case 'tenant.settings.extension_invalid':
      return 'Allowed file extensions must be lower-case, non-empty, and supplied without a leading dot (e.g. "jpg", not ".JPG").';

    case 'validation.failed':
      // The API already joins `Property: message` pairs into a
      // sensible single line — surfacing that verbatim lets the
      // user see exactly which field tripped the validator without
      // us hard-coding every rule on the SPA side.
      return err.message?.trim() || `Some fields are invalid.`;

    default:
      // Unknown code → fall through. Use the API's `detail` if it
      // looks human-readable; otherwise return null so the caller
      // surfaces a generic message.
      if (err.message && err.message.length < 240 && !err.message.startsWith('Request failed')) {
        return err.message;
      }
      return null;
  }
}

/**
 * Narrow guard for `WayelAdminTenantsHttpError`-shaped objects. We
 * keep this loose (duck-typed) so the helper still works when the
 * error rides through other layers (RxJS pipes, Promise rejections)
 * that may have lost the prototype chain.
 */
function isTenantHttpError(err: unknown): err is WayelAdminTenantsHttpError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  );
}
