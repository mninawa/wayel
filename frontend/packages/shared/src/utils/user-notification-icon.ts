import type { UserNotificationKind } from '@wayel/shared/services/user-notifications-api.service';

/**
 * Maps an in-app notification kind to a Material Icons (Outlined) glyph.
 *
 * The mapping is intentionally minimal — each glyph is paired by intent:
 *   • `event_available`  → "Daily report published" (a calendar entry the
 *                          parent can attend to today).
 *   • `inbox`            → "Subscription request received" (it just landed
 *                          in the staff queue).
 *   • `check_circle`     → "Subscription approved" (positive confirmation).
 *   • `block`            → "Subscription rejected" (decision was no).
 *
 * Unknown kinds fall back to a neutral `notifications` glyph so the row
 * still renders consistently if a future API version emits a kind that
 * pre-dates the SPA build.
 */
export function userNotificationIcon(kind: UserNotificationKind | string): string {
  switch (kind) {
    case 'dailyReportPublished':
      return 'event_available';
    case 'subscriptionRequestReceived':
      return 'inbox';
    case 'subscriptionRequestApproved':
      return 'check_circle';
    case 'subscriptionRequestRejected':
      return 'block';
    case 'invitationAccepted':
      return 'how_to_reg';
    default:
      return 'notifications';
  }
}
