/**
 * Front-end mirror of the C# `Wayel.Domain.Subscriptions.SubscriptionWindow`
 * + platform-default fallback. Single source of truth for the
 * "is the institution open today?" calculation so the SPA / mobile
 * banners can pre-empt a server-side
 * `subscription.outside_school_year` rejection with a clearer,
 * calmer message.
 *
 * Each tenant carries an optional custom window
 * (`{openMonth, openDay, closeMonth, closeDay}`); when null the
 * tenant inherits the platform default 8 Jan – 10 Dec. The helpers
 * below take an optional override so callers can compute against a
 * specific institution's window or the platform default.
 *
 * Reference date is injected so tests / Storybook / mock mode can
 * pin a deterministic clock; production passes nothing and the
 * helper uses `new Date()`.
 */

/** Shape of a subscription window — month/day pairs (1-based). */
export interface SubscriptionWindow {
  openMonth: number;
  openDay: number;
  closeMonth: number;
  closeDay: number;
}

/**
 * Platform default — 8 January – 10 December inclusive. Mirrors
 * `SubscriptionWindow.PlatformDefault` on the backend.
 */
export const PLATFORM_DEFAULT_WINDOW: SubscriptionWindow = {
  openMonth: 1,
  openDay: 8,
  closeMonth: 12,
  closeDay: 10,
};

/**
 * Resolves the effective window for a tenant: the custom override
 * when set, otherwise the platform default. Centralised so every
 * surface (banners, button-disable, drawer footer copy) uses the
 * same fallback rule.
 */
export function resolveEffectiveWindow(custom?: SubscriptionWindow | null): SubscriptionWindow {
  return custom ?? PLATFORM_DEFAULT_WINDOW;
}

/**
 * True when `referenceDate` sits inside `window` (inclusive). Handles
 * both straight (open ≤ close) and wrapped (open > close, e.g. a
 * Nov – Mar summer-school) cases. Year value is ignored — windows
 * recur annually.
 */
export function isInsideWindow(
  window: SubscriptionWindow,
  referenceDate: Date = new Date(),
): boolean {
  const m = referenceDate.getMonth() + 1;
  const d = referenceDate.getDate();
  const open = compareMonthDay(window.openMonth, window.openDay);
  const close = compareMonthDay(window.closeMonth, window.closeDay);
  const probe = compareMonthDay(m, d);

  if (open <= close) {
    return probe >= open && probe <= close;
  }
  return probe >= open || probe <= close;
}

/**
 * Convenience shorthand for the most common SPA call site:
 * `isInsideEffectiveWindow(institution?.subscriptionWindow)`. Inlines
 * the platform-default fallback so component code stays readable.
 */
export function isInsideEffectiveWindow(
  custom?: SubscriptionWindow | null,
  referenceDate: Date = new Date(),
): boolean {
  return isInsideWindow(resolveEffectiveWindow(custom), referenceDate);
}

/**
 * Returns the next "open" day on or after `referenceDate` for banner
 * copy ("we reopen on …"). When already inside the window, hands
 * back a deterministic "next" date one envelope away rather than
 * today — callers should check `isInsideWindow` first.
 */
export function nextWindowOpen(
  window: SubscriptionWindow,
  referenceDate: Date = new Date(),
): Date {
  const year = referenceDate.getFullYear();
  const thisYearOpen = safeDate(year, window.openMonth, window.openDay);
  if (referenceDate < thisYearOpen) {
    return thisYearOpen;
  }
  return safeDate(year + 1, window.openMonth, window.openDay);
}

/**
 * Human-readable formatter for banner copy: "8 January 2027". Locale
 * is fixed to en-ZA so the banner reads consistently regardless of
 * the user's browser locale.
 */
export function formatWindowDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Human-readable open-close pair like "8 January – 10 December".
 * Used in the institution-settings card so admins can sanity-check
 * the dates they just set.
 */
export function formatWindowRange(window: SubscriptionWindow): string {
  const openDate = safeDate(2024, window.openMonth, window.openDay);
  const closeDate = safeDate(2024, window.closeMonth, window.closeDay);
  return `${openDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })} – ${closeDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}`;
}

// ----- Back-compat helpers (legacy call sites) -----------------------

/** @deprecated Use {@link isInsideEffectiveWindow} instead. */
export function isInsideSchoolYear(referenceDate: Date = new Date()): boolean {
  return isInsideEffectiveWindow(null, referenceDate);
}

/** @deprecated Use {@link nextWindowOpen} instead. */
export function nextSchoolYearOpen(referenceDate: Date = new Date()): Date {
  return nextWindowOpen(PLATFORM_DEFAULT_WINDOW, referenceDate);
}

/** @deprecated Use {@link formatWindowDate} instead. */
export function formatSchoolYearOpen(date: Date): string {
  return formatWindowDate(date);
}

// ----- internals ------------------------------------------------------

function compareMonthDay(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * Build a `Date` for `(year, month, day)`, falling back to the 28th
 * for 29 Feb on non-leap years so banner copy never NaN-renders.
 */
function safeDate(year: number, month: number, day: number): Date {
  const candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() === month - 1) {
    return candidate;
  }
  return new Date(year, month - 1, 28);
}
