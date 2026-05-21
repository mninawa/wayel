/**
 * Tiny duration formatter for "time enrolled"-style stat tiles.
 *
 * The number we're formatting is a *cumulative* day-count summed across
 * one or more subscription periods, so it can easily run into the
 * thousands (e.g. 5 concurrent subscriptions × 1 year ≈ 1825 days). The
 * raw number is meaningless to a parent; this helper turns it into a
 * compact, human-friendly label.
 *
 * Output rules:
 *   - 0          → "0 days"
 *   - < 14 days  → "{n} days"
 *   - < 60 days  → "{w} weeks" (rounded)
 *   - < 365 days → "{m} mo" or "{m} mo {d} d" if there's a remainder
 *   - >= 365 d   → "{y} yr" or "{y} yr {m} mo" if there's a remainder
 *
 * All months are calendar-approximated as 30.44 days, years as 365.25.
 */
export function formatDays(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d === 0) return '0 days';
  if (d < 14) return `${d} ${d === 1 ? 'day' : 'days'}`;
  if (d < 60) {
    const w = Math.round(d / 7);
    return `${w} ${w === 1 ? 'week' : 'weeks'}`;
  }
  const monthDays = 30.44;
  const yearDays = 365.25;
  if (d < 365) {
    const months = Math.floor(d / monthDays);
    const remDays = Math.round(d - months * monthDays);
    if (remDays > 0 && months < 11) {
      return `${months} mo ${remDays} d`;
    }
    return `${months} mo`;
  }
  const years = Math.floor(d / yearDays);
  const remMonths = Math.round((d - years * yearDays) / monthDays);
  if (remMonths === 0) {
    return `${years} ${years === 1 ? 'yr' : 'yrs'}`;
  }
  if (remMonths >= 12) {
    return `${years + 1} ${years + 1 === 1 ? 'yr' : 'yrs'}`;
  }
  return `${years} ${years === 1 ? 'yr' : 'yrs'} ${remMonths} mo`;
}

/** Tooltip text — preserves the exact day count for power users. */
export function formatDaysTooltip(days: number): string {
  const d = Math.max(0, Math.round(days));
  return `${d.toLocaleString('en-ZA')} ${d === 1 ? 'day' : 'days'} across all subscriptions`;
}
