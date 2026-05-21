/**
 * Workspace child helper.
 *
 * Backs the per-child detail page reachable from the workspace's Children
 * tab (`/tenants/:tenantId/workspace`). Operates *directly* against the
 * shared mock stores (`MOCK_PARENTS`, `MOCK_DAILY_REPORTS`) instead of going
 * through the parent / staff bridges, because REMOVED isn't tied to a
 * single institution session — the operator can drill into any tenant and
 * we need the data scoped to that tenant + child without role-based
 * filtering kicking in.
 */
import {
  MOCK_DAILY_REPORTS,
  appendReport,
  patchReport,
  type MockDailyReport,
} from '@wayel/shared/core/mock/mock-daily-reports';
import {
  MOCK_PARENTS,
  type MockParent,
  type MockParentChild,
  type MockParentChildSubscription,
} from '@wayel/shared/core/mock/mock-parents';
import { institutionKindOf } from '@wayel/shared/core/mock/mock-institutions';
import type {
  Phase0DailyReportDrinks,
  Phase0DailyReportHygiene,
  Phase0DailyReportKind,
  Phase0DailyReportMeals,
  Phase0DailyReportMedia,
  Phase0DailyReportMood,
  Phase0DailyReportSleep,
  Phase0DailyReportStatus,
  Phase0SessionAttendance,
} from '@wayel/shared/core/contracts/daily-reports.phase0';

export type { Phase0DailyReportMedia } from '@wayel/shared/core/contracts/daily-reports.phase0';

/* ────────────────────────────────────────────────────────────────────────── */
/* Resolved context                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

export interface WorkspaceChildContext {
  parent: MockParent;
  child: MockParentChild;
  /** Currently-active subscription period at the institution being viewed. */
  subscription: MockParentChildSubscription;
}

/**
 * Resolve a parent / child / active subscription tuple for the given
 * institution + child id. Returns null when the child has no active period
 * at this institution (e.g. ended or pending).
 */
export function findChildContext(
  institutionId: string,
  parentChildId: string,
): WorkspaceChildContext | null {
  for (const parent of MOCK_PARENTS) {
    for (const child of parent.children) {
      if (child.id !== parentChildId) continue;
      const subscription = child.subscriptions.find(
        (s) => s.institutionId === institutionId && s.state === 'active',
      );
      if (!subscription) return null;
      return { parent, child, subscription };
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Daily reports — direct CRUD                                                */
/* ────────────────────────────────────────────────────────────────────────── */

/** All daily reports posted at this institution for this child, newest first. */
export function listReportsForChild(
  institutionId: string,
  parentChildId: string,
): MockDailyReport[] {
  const rows = MOCK_DAILY_REPORTS.filter(
    (r) => r.institutionId === institutionId && r.parentChildId === parentChildId,
  );
  return rows.sort((a, b) => {
    if (a.reportDate !== b.reportDate) return a.reportDate < b.reportDate ? 1 : -1;
    return a.postedAt < b.postedAt ? 1 : -1;
  });
}

/**
 * Editor-local view of <see cref="Phase0DailyReportDrinks"/> with
 * `milk` / `tea` promoted from optional to required. The Phase0
 * contract leaves them optional for legacy mock fixtures; the staff
 * draft always carries explicit booleans so the template can
 * `[(ngModel)]` into them without dealing with `undefined`.
 */
export interface DailyReportDraftDrinks {
  water: boolean;
  bottlesCount: number;
  milk: boolean;
  tea: boolean;
}

/**
 * Editor-local view of <see cref="Phase0DailyReportHygiene"/> with the
 * v1 paper "Nappies" flags (Soiled / Wet / Dry) promoted to required.
 */
export interface DailyReportDraftHygiene {
  pottyTraining: boolean;
  diaperChanges: number | null;
  notes: string | null;
  soiled: boolean;
  wet: boolean;
  dry: boolean;
}

export interface DailyReportDraft {
  reportDate: string;
  status: Phase0DailyReportStatus;
  mood: Phase0DailyReportMood | null;
  /**
   * Free-text "Notes" surface (labelled "Notes" / "What happened today?"
   * in the staff editor — this is the field that gets shown to parents
   * as the report body). Required at save-time.
   */
  summary: string;
  highlights: string | null;
  concerns: string | null;
  /**
   * Photos / videos attached to this report. Each entry is a fully-formed
   * `Phase0DailyReportMedia` (id + url) — for mock uploads the `url` is a
   * `data:` URI generated client-side.
   */
  media: Phase0DailyReportMedia[];

  /**
   * Daycare-only blocks. Always present on the draft so the form can
   * `[(ngModel)]` into them without null-checking; the save path
   * substitutes nulls for `'session'`-kind institutions where the
   * backend rejects these payloads.
   *
   * <p>Originally surfaced in the v1 staff "Teacher Daily Report"
   * design (Mood / Breakfast / Snack / Lunch / Drinks / Sleep /
   * Hygiene / Notes). The fields exist on the wire DTOs and the
   * domain aggregate; only the editor UI had been collapsed to a
   * generic Summary/Highlights/Concerns form, which dropped portion
   * tracking, drink counts and sleep / hygiene observations on every
   * staff write. This restores capture parity.</p>
   */
  meals: Phase0DailyReportMeals;
  drinks: DailyReportDraftDrinks;
  sleep: Phase0DailyReportSleep;
  hygiene: DailyReportDraftHygiene;
}

/** Create a new report and append it to the in-memory store. */
export function createReportForChild(
  ctx: WorkspaceChildContext,
  institutionId: string,
  draft: DailyReportDraft,
  authorEmail: string,
  authorName: string,
): MockDailyReport {
  const now = new Date().toISOString();
  const reportKind: Phase0DailyReportKind = institutionKindOf(institutionId);
  const isSession = reportKind === 'session';
  const record: MockDailyReport = {
    id: `dr_ws_${Math.random().toString(36).slice(2, 10)}`,
    parentChildId: ctx.child.id,
    parentId: ctx.parent.id,
    institutionId,
    programId: null,
    reportKind,
    reportDate: draft.reportDate,
    status: draft.status,
    postedAt: now,
    publishedAt: draft.status === 'published' ? now : null,
    authorEmail,
    authorName,
    mood: draft.mood,
    // Daycare blocks come from the draft so the v1 "Teacher Daily
    // Report" form (mood, portions, drinks Bottles/Water/Milk/Tea,
    // sleep, hygiene Soiled/Wet/Dry) actually persists what staff
    // entered. Session-kind reports null these out — the backend
    // rejects them and the parent feed reads `null` as "not
    // applicable".
    meals: isSession ? null : { ...draft.meals },
    drinks: isSession ? null : { ...draft.drinks },
    sleep: isSession ? null : { ...draft.sleep },
    hygiene: isSession ? null : { ...draft.hygiene },
    session: isSession
      ? { attendance: 'present', focus: null, effort: null, skillsPracticed: [], nextFocus: null }
      : null,
    summary: draft.summary.trim(),
    highlights: draft.highlights?.trim() || null,
    concerns: draft.concerns?.trim() || null,
    media: draft.media.map((m) => ({ ...m })),
  };
  appendReport(record);
  return record;
}

export function updateReportFields(
  id: string,
  draft: DailyReportDraft,
): MockDailyReport | undefined {
  // Look up the existing report to check its kind — daycare and
  // session reports carry different payloads, and we mustn't overwrite
  // a session report's `session` block with daycare blocks (or vice
  // versa). The kind is stamped at create-time and never changes, so
  // it's a safe pivot.
  const existing = MOCK_DAILY_REPORTS.find((r) => r.id === id);
  const isSession = existing?.reportKind === 'session';
  return patchReport(id, {
    reportDate: draft.reportDate,
    status: draft.status,
    mood: draft.mood,
    summary: draft.summary.trim(),
    highlights: draft.highlights?.trim() || null,
    concerns: draft.concerns?.trim() || null,
    publishedAt:
      draft.status === 'published' ? new Date().toISOString() : null,
    media: draft.media.map((m) => ({ ...m })),
    ...(isSession
      ? {}
      : {
          meals: { ...draft.meals },
          drinks: { ...draft.drinks },
          sleep: { ...draft.sleep },
          hygiene: { ...draft.hygiene },
        }),
  });
}

export function toggleReportPublishStatus(id: string): MockDailyReport | undefined {
  const existing = MOCK_DAILY_REPORTS.find((r) => r.id === id);
  if (!existing) return undefined;
  const nextStatus: Phase0DailyReportStatus =
    existing.status === 'published' ? 'draft' : 'published';
  return patchReport(id, {
    status: nextStatus,
    publishedAt: nextStatus === 'published' ? new Date().toISOString() : null,
  });
}

export function deleteReport(id: string): boolean {
  const idx = MOCK_DAILY_REPORTS.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  MOCK_DAILY_REPORTS.splice(idx, 1);
  return true;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Gallery — flatten media from reports                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export interface GalleryItem {
  id: string;
  reportId: string;
  reportDate: string;
  kind: Phase0DailyReportMedia['kind'];
  url: string;
  caption: string | null;
}

export function extractGalleryFromReports(reports: MockDailyReport[]): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const r of reports) {
    for (const m of r.media) {
      items.push({
        id: m.id,
        reportId: r.id,
        reportDate: r.reportDate,
        kind: m.kind,
        url: m.url,
        caption: m.caption,
      });
    }
  }
  // Newest first.
  return items.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Weekly trends — aggregate over the last N weeks                            */
/* ────────────────────────────────────────────────────────────────────────── */

export interface WeeklyTrendBucket {
  /** ISO date — Monday of this week. */
  weekStart: string;
  /** ISO date — Sunday of this week. */
  weekEnd: string;
  reportCount: number;
  publishedCount: number;
  draftCount: number;
  moods: Record<'happy' | 'okay' | 'sad' | 'mad', number>;
  meals: Record<'all' | 'some' | 'none', number>;
  /** Mean nap minutes across reports with a nap recorded. */
  avgNapMinutes: number | null;
  attendance: Record<Phase0SessionAttendance, number>;
  mediaCount: number;
}

const ZERO_MOODS = { happy: 0, okay: 0, sad: 0, mad: 0 } as const;
const ZERO_MEALS = { all: 0, some: 0, none: 0 } as const;
const ZERO_ATTENDANCE: Record<Phase0SessionAttendance, number> = {
  present: 0,
  late: 0,
  absent: 0,
  left_early: 0,
};

/**
 * Bucket reports into the last `weekCount` calendar weeks (Mon→Sun).
 * Returns newest week first. Empty weeks are still rendered so trend
 * cards have a stable shape.
 */
export function weeklyTrendsForChild(
  reports: MockDailyReport[],
  weekCount = 8,
  reference: Date = new Date(),
): WeeklyTrendBucket[] {
  const weeks: WeeklyTrendBucket[] = [];
  const refMonday = mondayOf(reference);

  for (let i = 0; i < weekCount; i++) {
    const start = new Date(refMonday);
    start.setUTCDate(refMonday.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    weeks.push({
      weekStart: toIsoDate(start),
      weekEnd: toIsoDate(end),
      reportCount: 0,
      publishedCount: 0,
      draftCount: 0,
      moods: { ...ZERO_MOODS },
      meals: { ...ZERO_MEALS },
      avgNapMinutes: null,
      attendance: { ...ZERO_ATTENDANCE },
      mediaCount: 0,
    });
  }

  const napTotals = new Map<string, { sum: number; n: number }>();

  for (const r of reports) {
    const bucket = weeks.find((w) => r.reportDate >= w.weekStart && r.reportDate <= w.weekEnd);
    if (!bucket) continue;
    bucket.reportCount += 1;
    if (r.status === 'published') bucket.publishedCount += 1;
    else bucket.draftCount += 1;
    bucket.mediaCount += r.media.length;

    if (r.mood && r.mood !== 'neutral' && r.mood in bucket.moods) {
      bucket.moods[r.mood as keyof typeof bucket.moods] += 1;
    } else if (r.mood === 'neutral') {
      bucket.moods.okay += 1;
    }

    if (r.meals) {
      for (const m of [r.meals.breakfast, r.meals.snack, r.meals.lunch]) {
        if (m && m in bucket.meals) bucket.meals[m] += 1;
      }
    }

    if (r.sleep && !r.sleep.noSleep && r.sleep.napStart && r.sleep.napEnd) {
      const minutes = diffMinutes(r.sleep.napStart, r.sleep.napEnd);
      if (minutes != null) {
        const cur = napTotals.get(bucket.weekStart) ?? { sum: 0, n: 0 };
        cur.sum += minutes;
        cur.n += 1;
        napTotals.set(bucket.weekStart, cur);
      }
    }

    if (r.session?.attendance) {
      bucket.attendance[r.session.attendance] += 1;
    }
  }

  for (const w of weeks) {
    const t = napTotals.get(w.weekStart);
    w.avgNapMinutes = t && t.n > 0 ? Math.round(t.sum / t.n) : null;
  }

  return weeks;
}

/** Move `d` to the Monday at 00:00 UTC of its calendar week. */
function mondayOf(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay(); // 0 = Sun
  const offset = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + offset);
  return out;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Difference in minutes between two HH:MM strings. Negative diffs return null. */
function diffMinutes(start: string, end: string): number | null {
  const parse = (s: string): number | null => {
    const m = /^(\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = parse(start);
  const b = parse(end);
  if (a == null || b == null) return null;
  const diff = b - a;
  return diff >= 0 ? diff : null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Skills — small in-memory CRUD store                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export type WorkspaceSkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface WorkspaceChildSkill {
  id: string;
  parentChildId: string;
  institutionId: string;
  name: string;
  level: WorkspaceSkillLevel;
  category: string | null;
  achievedAt: string | null;
  instructor: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mock skill store, seeded with a few rows so the tab isn't empty on first open. */
const SKILLS: WorkspaceChildSkill[] = [
  {
    id: 'sk_azi_1',
    parentChildId: 'pchild_azifani',
    institutionId: 'tenant_little_stars',
    name: 'Counts to 20',
    level: 'intermediate',
    category: 'Numeracy',
    achievedAt: '2026-02-14',
    instructor: 'Lindiwe Dube',
    notes: 'Confident counting forward; backward still a work in progress.',
    createdAt: '2026-02-14T09:00:00Z',
    updatedAt: '2026-02-14T09:00:00Z',
  },
  {
    id: 'sk_azi_2',
    parentChildId: 'pchild_azifani',
    institutionId: 'tenant_little_stars',
    name: 'Writes own name',
    level: 'beginner',
    category: 'Literacy',
    achievedAt: null,
    instructor: 'Amahle Khoza',
    notes: 'Recognises the letters; tracing in progress.',
    createdAt: '2026-03-02T09:00:00Z',
    updatedAt: '2026-03-02T09:00:00Z',
  },
  {
    id: 'sk_azi_3',
    parentChildId: 'pchild_azifani',
    institutionId: 'tenant_little_stars',
    name: 'Hops on one foot',
    level: 'advanced',
    category: 'Gross motor',
    achievedAt: '2026-04-01',
    instructor: 'Sipho Ndlovu',
    notes: null,
    createdAt: '2026-04-01T09:00:00Z',
    updatedAt: '2026-04-01T09:00:00Z',
  },
];

export function listSkillsForChild(
  institutionId: string,
  parentChildId: string,
): WorkspaceChildSkill[] {
  return SKILLS.filter(
    (s) => s.institutionId === institutionId && s.parentChildId === parentChildId,
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface SkillDraft {
  name: string;
  level: WorkspaceSkillLevel;
  category: string | null;
  achievedAt: string | null;
  instructor: string | null;
  notes: string | null;
}

export function addSkillForChild(
  institutionId: string,
  parentChildId: string,
  draft: SkillDraft,
): WorkspaceChildSkill {
  const now = new Date().toISOString();
  const skill: WorkspaceChildSkill = {
    id: `sk_${Math.random().toString(36).slice(2, 10)}`,
    parentChildId,
    institutionId,
    name: draft.name.trim(),
    level: draft.level,
    category: draft.category?.trim() || null,
    achievedAt: draft.achievedAt || null,
    instructor: draft.instructor?.trim() || null,
    notes: draft.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  SKILLS.push(skill);
  return skill;
}

export function updateSkillForChild(
  id: string,
  draft: SkillDraft,
): WorkspaceChildSkill | null {
  const idx = SKILLS.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const cur = SKILLS[idx];
  const next: WorkspaceChildSkill = {
    ...cur,
    name: draft.name.trim(),
    level: draft.level,
    category: draft.category?.trim() || null,
    achievedAt: draft.achievedAt || null,
    instructor: draft.instructor?.trim() || null,
    notes: draft.notes?.trim() || null,
    updatedAt: new Date().toISOString(),
  };
  SKILLS[idx] = next;
  return next;
}

export function removeSkill(id: string): boolean {
  const idx = SKILLS.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  SKILLS.splice(idx, 1);
  return true;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Misc helpers                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

export function ageInYears(dob: string): number {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return Math.max(0, age);
}

export function ageLabel(years: number): string {
  if (years <= 0) return 'Under 1';
  if (years === 1) return '1 year old';
  return `${years} years old`;
}

export function moodEmoji(mood: Phase0DailyReportMood | null | undefined): string {
  switch (mood) {
    case 'happy':
      return '😊';
    case 'okay':
    case 'neutral':
      return '🙂';
    case 'sad':
      return '😞';
    case 'mad':
      return '😡';
    default:
      return '—';
  }
}

export function moodLabel(mood: Phase0DailyReportMood | null | undefined): string {
  switch (mood) {
    case 'happy':
      return 'Happy';
    case 'okay':
    case 'neutral':
      return 'Okay';
    case 'sad':
      return 'Sad';
    case 'mad':
      return 'Mad';
    default:
      return '—';
  }
}

export function attendanceLabel(a: Phase0SessionAttendance | null | undefined): string {
  switch (a) {
    case 'present':
      return 'Present';
    case 'late':
      return 'Late';
    case 'absent':
      return 'Absent';
    case 'left_early':
      return 'Left early';
    default:
      return '—';
  }
}
