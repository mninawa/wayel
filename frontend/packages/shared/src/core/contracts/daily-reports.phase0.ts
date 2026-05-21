/**
 * Phase 0 API sketch for institution-side daily reports.
 *
 * Domain reminder:
 *   - A **daily report** is a per-child, per-day journal entry posted by an
 *     institution's staff. It belongs to the *child's lifetime archive*, not
 *     to the institution — when a subscription period ends, the reports posted
 *     during that period stay with the child (and the parent) forever.
 *   - A report has two states: `draft` (visible to staff only) and `published`
 *     (visible to the parent). Once published, a report can be edited but stays
 *     visible — there is no "unpublish" in v1; correction is the path forward,
 *     not retraction. Stronger guarantees can layer on later.
 *   - Authorship is the staff member's account email. Only the original author
 *     can edit / publish / delete a report in v1; multi-author co-edit is a
 *     later concern.
 *
 * Suggested base path: `/api/daily-reports`.
 */

/**
 * Four-state mood scale aligned with the parent app's emoji picker.
 *   - `'happy'`  → 😊  (default positive)
 *   - `'okay'`   → 🙂  (steady; replaces the legacy `'neutral'`)
 *   - `'sad'`    → 😞  (off day)
 *   - `'mad'`    → 😡  (escalation; flag for the parent)
 *
 * The legacy `'neutral'` value is retained as a wire alias so older clients
 * continue to round-trip until they pick up the new label.
 */
export type Phase0DailyReportMood = 'happy' | 'okay' | 'sad' | 'mad' | 'neutral';

export type Phase0DailyReportStatus = 'draft' | 'published';

/**
 * What kind of institution this is — drives which daily-report shape its
 * staff post and which sections the parent sees on the report card.
 *
 *   - `'daycare'`: full-day care — preschool, crèche, aftercare. Reports
 *     include meals / sleep / drinks / hygiene.
 *   - `'session'`: short class — swim, music, sport, robotics, art, dance.
 *     Reports skip meal/sleep/hygiene entirely and capture attendance,
 *     focus, effort and skills practiced instead.
 */
export type Phase0InstitutionKind = 'daycare' | 'session';

/**
 * The shape of a single daily report. Mirrors the institution's `kind`,
 * but is carried on the report itself so the parent UI can render the
 * correct card without re-fetching the institution.
 */
export type Phase0DailyReportKind = Phase0InstitutionKind;

/** How much of a meal the child consumed. */
export type Phase0MealPortion = 'all' | 'some' | 'none';

export interface Phase0DailyReportMeals {
  breakfast: Phase0MealPortion | null;
  snack: Phase0MealPortion | null;
  lunch: Phase0MealPortion | null;
}

export interface Phase0DailyReportDrinks {
  /** True when staff confirms the child drank water during the day. */
  water: boolean;
  /** Number of bottles taken (formula / breastmilk / juice — staff's choice). */
  bottlesCount: number;
  /**
   * Optional v1 paper "To drink I had:" parity. Backend defaults
   * these to `false` for legacy documents. Optional on the contract
   * so older mock fixtures (and any third-party constructors) keep
   * compiling without a forced rewrite.
   */
  milk?: boolean;
  tea?: boolean;
}

/**
 * Sleep block. Times are HH:MM in 24-hour clock for the local day. Both ends
 * may be null while drafts are in progress; `noSleep === true` overrides both.
 */
export interface Phase0DailyReportSleep {
  noSleep: boolean;
  napStart: string | null;
  napEnd: string | null;
  /** Optional qualitative note: 'well' (slept through), 'restless' (interrupted). */
  napQuality: 'well' | 'restless' | null;
}

export interface Phase0DailyReportHygiene {
  /** Currently being potty-trained — surfaces a status pill on the parent feed. */
  pottyTraining: boolean;
  /** Number of diaper changes during the day. Null when not applicable. */
  diaperChanges: number | null;
  /** Free-text caregiver note (e.g. "rash on left thigh, applied cream"). */
  notes: string | null;
  /**
   * Optional v1 paper "Nappies" parity (Soiled / Wet / Dry).
   * Optional on the contract so legacy mock fixtures keep
   * compiling; the wire DTO and the staff editor always populate
   * them with explicit booleans.
   */
  soiled?: boolean;
  wet?: boolean;
  dry?: boolean;
}

/**
 * One media attachment on a daily report. Phase 0 stores either a remote URL
 * or a base64 data URL — the parent feed renders both transparently. The
 * `caption` is optional staff context.
 */
export interface Phase0DailyReportMedia {
  id: string;          // m_*
  kind: 'photo' | 'video';
  url: string;
  caption: string | null;
}

/* -------------------------------------------------------------------------- */
/* Session reports (swim / music / sport / robotics / art …)                  */
/* -------------------------------------------------------------------------- */

/**
 * Did the child make the session? Drives the small badge in the report
 * header. `'left_early'` covers "had to leave halfway", which the parent
 * usually wants to know about even when the child was technically present.
 */
export type Phase0SessionAttendance = 'present' | 'late' | 'absent' | 'left_early';

/**
 * Coach's effort/engagement read for the day. Three buckets keeps the
 * staff form quick (one tap) while still giving parents a useful signal.
 */
export type Phase0SessionEffort = 'needs_push' | 'on_track' | 'great_effort';

/**
 * Body of a `'session'`-kind daily report. Only the fields that make sense
 * for a 30–60 min activity class — there is no meal / sleep / hygiene
 * tracking here. Strings are trimmed and may be null when omitted.
 */
export interface Phase0SessionDetails {
  attendance: Phase0SessionAttendance;
  /** What the class worked on today, e.g. "Backstroke kick", "Twinkle Twinkle". */
  focus: string | null;
  /** Coach's effort read. */
  effort: Phase0SessionEffort | null;
  /** Skill chips practiced (not necessarily earned), e.g. ["floating", "kick board"]. */
  skillsPracticed: string[];
  /** Optional teaser of what's planned next time. */
  nextFocus: string | null;
}

export interface Phase0DailyReport {
  id: string; // dr_*

  /** The canonical child identity (parent's roster). Stable across institutions. */
  parentChildId: string;
  /** Cached for display so list views don't have to fan out to /parents. */
  parentChildName: string;
  /** Owning parent identity. Required so the parent surface can scope queries. */
  parentId: string;

  institutionId: string;
  institutionName: string;
  /** Optional program scoping (`prog_*`). Null when the report isn't tied to a specific class. */
  programId: string | null;
  programName: string | null;

  /**
   * Shape of this report: `'daycare'` (meals / sleep / hygiene populated)
   * or `'session'` (those are null, `session` is populated). Server-derived
   * from the institution's `kind` so clients cannot post the wrong shape.
   */
  reportKind: Phase0DailyReportKind;

  /** ISO 8601 date (YYYY-MM-DD) — the day the report describes. */
  reportDate: string;
  status: Phase0DailyReportStatus;
  /** ISO 8601 timestamp of the most recent save (draft or published). */
  postedAt: string;
  /** ISO 8601 timestamp of the first publish, or null while still a draft. */
  publishedAt: string | null;

  authorEmail: string;
  authorName: string;

  /* ── Structured day-of fields ─────────────────────────────────────────── */
  /** Mood is universal — both daycare and session reports collect it. */
  mood: Phase0DailyReportMood | null;
  /** Daycare only. Null on `'session'` reports. */
  meals: Phase0DailyReportMeals | null;
  /** Daycare only. Null on `'session'` reports. */
  drinks: Phase0DailyReportDrinks | null;
  /** Daycare only. Null on `'session'` reports. */
  sleep: Phase0DailyReportSleep | null;
  /** Daycare only. Null on `'session'` reports. */
  hygiene: Phase0DailyReportHygiene | null;
  /** Session only. Null on `'daycare'` reports. */
  session: Phase0SessionDetails | null;

  /* ── Free-text narrative ─────────────────────────────────────────────── */
  /** Free-text narrative — the body of the report. Required at publish time. */
  summary: string;
  /** Optional callouts: "ate her whole lunch", "first time on the swings". */
  highlights: string | null;
  /** Optional flags for the parent: "coughed twice during nap, monitor at home". */
  concerns: string | null;

  /* ── Media ───────────────────────────────────────────────────────────── */
  /** Photos / videos staff attached to the report. Empty array when none. */
  media: Phase0DailyReportMedia[];
}

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

export interface Phase0CreateDailyReportRequest {
  parentChildId: string;
  /**
   * The institution this report is being posted under. The server validates
   * the bearer-token's staff account is associated with this institution.
   */
  institutionId: string;
  programId?: string | null;
  /** YYYY-MM-DD. Defaults to today on the server when omitted. */
  reportDate?: string;
  mood?: Phase0DailyReportMood | null;
  /** Daycare-only. Server ignores when the institution is `'session'`. */
  meals?: Partial<Phase0DailyReportMeals> | null;
  /** Daycare-only. Server ignores when the institution is `'session'`. */
  drinks?: Partial<Phase0DailyReportDrinks> | null;
  /** Daycare-only. Server ignores when the institution is `'session'`. */
  sleep?: Partial<Phase0DailyReportSleep> | null;
  /** Daycare-only. Server ignores when the institution is `'session'`. */
  hygiene?: Partial<Phase0DailyReportHygiene> | null;
  /** Session-only. Server ignores when the institution is `'daycare'`. */
  session?: Partial<Phase0SessionDetails> | null;
  summary: string;
  highlights?: string | null;
  concerns?: string | null;
  /** Inline media attachments (data URLs accepted in Phase 0). */
  media?: Array<Omit<Phase0DailyReportMedia, 'id'>>;
  /** When true, save and immediately publish. Defaults to false (draft). */
  publish?: boolean;
}

/** PATCH — every field is optional; omit to leave unchanged. */
export interface Phase0UpdateDailyReportRequest {
  reportDate?: string;
  programId?: string | null;
  mood?: Phase0DailyReportMood | null;
  meals?: Partial<Phase0DailyReportMeals> | null;
  drinks?: Partial<Phase0DailyReportDrinks> | null;
  sleep?: Partial<Phase0DailyReportSleep> | null;
  hygiene?: Partial<Phase0DailyReportHygiene> | null;
  session?: Partial<Phase0SessionDetails> | null;
  summary?: string;
  highlights?: string | null;
  concerns?: string | null;
  media?: Array<Omit<Phase0DailyReportMedia, 'id'>>;
}

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export interface Phase0ListDailyReportsQuery {
  /** Scope to a specific parent. Server forces this to the bearer's parentId for parent accounts. */
  parentId?: string;
  /** Scope to a specific child. Required for the parent feed view. */
  parentChildId?: string;
  /** Scope to a specific institution. Server forces this for staff accounts. */
  institutionId?: string;
  /** Scope to a specific program. */
  programId?: string;
  /** Single-day filter (YYYY-MM-DD). */
  date?: string;
  /** Inclusive lower bound (YYYY-MM-DD). */
  fromDate?: string;
  status?: Phase0DailyReportStatus;
  page?: number;
  pageSize?: number;
}

export interface Phase0DailyReportListResult {
  items: Phase0DailyReport[];
  totalCount: number;
  page: number;
  pageSize: number;
}
