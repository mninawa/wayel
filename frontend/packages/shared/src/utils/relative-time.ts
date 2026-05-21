/**
 * Compact "time-ago" formatter for inbox rows, audit timelines and other
 * dense lists where a full timestamp ("2026-05-02 14:31:09 UTC") is more
 * noise than signal.
 *
 * Rules (chosen to fit in ~6 chars so they sit nicely beside a title):
 *   - Future / 0..59 s   → "Just now"
 *   -      60 s..59 min  → "{n}m ago"
 *   -        1..23 hr    → "{n}h ago"
 *   -        1..6 days   → "{n}d ago"
 *   -        7..29 days  → "{n}w ago"
 *   -      30..364 days  → "{n}mo ago"
 *   -      365+ days     → "{n}y ago"
 *
 * The reference date is injected so callers can pin a deterministic value
 * in tests; production code passes nothing and lets the helper read
 * `Date.now()` itself.
 */
export function formatRelativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (value == null) return '';
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return '';

  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'Just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`;

  return `${Math.floor(diffDay / 365)}y ago`;
}
