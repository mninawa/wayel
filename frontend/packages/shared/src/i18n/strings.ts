/**
 * Tiny, dependency-free i18n surface used across all three apps.
 *
 * The goal of this module is *not* to translate the codebase today — it's to
 * give every user-visible string a stable key and a single place to swap the
 * runtime dictionary when (a) a real i18n library is adopted, or (b) we
 * introduce a second locale.
 *
 * Usage at a call site:
 *
 * ```ts
 * import { t } from '@wayel/shared/i18n/strings';
 * toasts.success(t('staff_invitations.toast.sent'));
 * ```
 *
 * Or with interpolation:
 *
 * ```ts
 * t('staff_invitations.toast.sent_to', { email: 'a@b.c' });
 * ```
 *
 * Migration plan:
 *  1. New strings flow through `t()`.
 *  2. Existing inline strings get migrated opportunistically (e.g. when their
 *     surrounding component is touched).
 *  3. When real translations land, swap `setStrings()` with a loader that
 *     pulls the locale dictionary from disk / API.
 */

/**
 * The default English dictionary. Keys are dot-namespaced by feature, e.g.
 *
 *   staff_invitations.toast.sent
 *   staff_invitations.empty.pending.title
 *
 * `{name}` placeholders are resolved by `t({ name: 'Alice' })`.
 */
export type StringsDict = Readonly<Record<string, string>>;

let activeStrings: StringsDict = {
  // Auth / session
  'auth.signed_out.title': 'Signed out',
  'auth.signed_out.message': 'Your session has ended — please sign in again.',
  'auth.sign_in_required.title': 'Sign in required',
  'auth.sign_in_required.message':
    'Please sign in to continue. We saved the page you were trying to open.',

  // Generic toasts
  'common.copied': 'Copied to clipboard.',
  'common.something_went_wrong': 'Something went wrong. Please try again.',
  'common.network_error.title': 'Network error',
  'common.network_error.message':
    'Could not reach the server. Check your connection and try again.',

  // Staff invitations
  'staff_invitations.toast.sent.title': 'Invitation sent',
  'staff_invitations.toast.sent_to': 'Invitation sent to {recipient} via {channel}.',
  'staff_invitations.toast.failed.title': 'Invitation failed',
  'staff_invitations.toast.resent.title': 'Resent',
  'staff_invitations.toast.resent_to': 'Invitation re-sent to {email} via {channel}.',
  'staff_invitations.toast.resend_failed.title': 'Resend failed',
  'staff_invitations.toast.revoked.title': 'Revoked',
  'staff_invitations.toast.revoked_email': 'Invitation to {email} revoked.',
  'staff_invitations.toast.revoke_failed.title': 'Revoke failed',
  'staff_invitations.toast.copied.title': 'Copied',
  'staff_invitations.toast.copied_message': 'Invite link copied to clipboard.',
  'staff_invitations.toast.welcome.title': "You're in",
  'staff_invitations.toast.welcome_message':
    'Welcome to {institution}! Setting up your workspace…',
  'staff_invitations.toast.welcome_generic':
    'Welcome aboard! Setting up your workspace…',
  'staff_invitations.toast.join_failed.title': 'Could not join',

  'staff_invitations.empty.pending.title': 'No pending invitations.',
  'staff_invitations.empty.accepted.title': 'No accepted invitations yet.',
  'staff_invitations.empty.expired.title': 'No expired invitations.',
  'staff_invitations.empty.revoked.title': 'No revoked invitations.',
  'staff_invitations.empty.search.title': 'No invitations match "{query}".',

  // Staff invitations — page chrome
  'staff_invitations.page.title': 'Staff invitations',
  'staff_invitations.page.lead':
    'Invite teachers, coaches and admins by email or WhatsApp. Each link is unique to the recipient, expires automatically, and is the only way to register on the staff panel.',
  'staff_invitations.action.invite': '+ Invite someone',
  'staff_invitations.action.close': 'Close',

  // Staff invitations — compose form
  'staff_invitations.compose.email.label': 'Email',
  'staff_invitations.compose.email.placeholder': 'teacher@school.edu',
  'staff_invitations.compose.role.label': 'Role',
  'staff_invitations.compose.role.placeholder': 'Teacher',
  'staff_invitations.compose.phone.label': 'Phone',
  'staff_invitations.compose.phone.hint': '(for WhatsApp)',
  'staff_invitations.compose.phone.placeholder': '+27 82 555 0123',
  'staff_invitations.compose.expires.label': 'Expires in (days)',
  'staff_invitations.compose.channel.label': 'Send link via',
  'staff_invitations.compose.channel.hint_email':
    'An email with the unique invite link goes to {recipient}.',
  'staff_invitations.compose.channel.hint_whatsapp':
    'A WhatsApp message with the link goes to {recipient}.',
  'staff_invitations.compose.channel.hint_both':
    'The link is sent to both email and WhatsApp.',
  'staff_invitations.compose.submit': 'Send invitation',
  'staff_invitations.compose.submitting': 'Sending…',
  'staff_invitations.compose.email.fallback_recipient': 'their inbox',
  'staff_invitations.compose.phone.fallback_recipient': '(no number set)',
};

/**
 * Replace the runtime dictionary. New strings *override* the current ones,
 * keys you don't pass keep their previous value (so partial locale loads
 * work). Returns the previous dictionary for testing convenience.
 */
export function setStrings(next: StringsDict): StringsDict {
  const prev = activeStrings;
  activeStrings = { ...activeStrings, ...next };
  return prev;
}

/** Read-only snapshot of the active dictionary. Useful for tests / debugging. */
export function currentStrings(): StringsDict {
  return activeStrings;
}

/**
 * Resolve a string by key. Unknown keys fall back to the key itself, which
 * makes missing translations very visible during development.
 *
 * `params` values are stringified via `String()` and substituted into
 * `{placeholder}` slots. Unmatched placeholders are left in place.
 */
export function t(
  key: string,
  params?: Readonly<Record<string, unknown>>,
): string {
  const template = activeStrings[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? whole : String(v);
  });
}
