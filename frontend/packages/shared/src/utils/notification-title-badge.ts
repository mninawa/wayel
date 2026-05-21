/**
 * Maintain a "(N) " badge on `document.title` reflecting the user's
 * unread-notification count, so a backgrounded tab still nudges the
 * user when something new lands.
 *
 * Idempotent on repeat calls — strips any leading `(\d+) ` prefix
 * before deciding whether to add a fresh one. The last-applied
 * prefix is also remembered as a module-scoped string so we can
 * skip pointless writes when the count hasn't changed (avoids
 * fighting with the router's own title-strategy churn).
 *
 * SSR / unit-test safe: the helper is a no-op when `document` isn't
 * available (e.g. the rare server-render path or vitest jsdom not
 * wired). Cap is 99 so we never render absurd "(412) " labels.
 */

const PREFIX_PATTERN = /^\(\d+\)\s+/;
let lastAppliedPrefix: string | null = null;

export function setNotificationTitleBadge(unread: number): void {
  if (typeof document === 'undefined') return;

  const safe = Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0;
  const prefix = safe > 0 ? `(${Math.min(safe, 99)}) ` : '';

  const currentTitle = document.title ?? '';
  const baseTitle = currentTitle.replace(PREFIX_PATTERN, '');
  const nextTitle = `${prefix}${baseTitle}`;

  if (lastAppliedPrefix === prefix && currentTitle === nextTitle) {
    return;
  }

  lastAppliedPrefix = prefix;
  document.title = nextTitle;
}

/**
 * Test hook — clears the memoised prefix so a fresh test scenario
 * starts from a known state. Not intended for production callers.
 */
export function resetNotificationTitleBadgeForTesting(): void {
  lastAppliedPrefix = null;
}
