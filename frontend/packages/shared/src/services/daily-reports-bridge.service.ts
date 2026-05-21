import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '@app/environment';
import type {
  Phase0CreateDailyReportRequest,
  Phase0DailyReport,
  Phase0DailyReportListResult,
  Phase0DailyReportMood,
  Phase0DailyReportStatus,
  Phase0ListDailyReportsQuery,
  Phase0UpdateDailyReportRequest,
} from '../core/contracts/daily-reports.phase0';
import {
  EMPTY_DRINKS,
  EMPTY_HYGIENE,
  EMPTY_MEALS,
  EMPTY_SLEEP,
  MOCK_DAILY_REPORTS,
  appendReport,
  findReportById,
  patchReport,
  sortReportsNewestFirst,
  type MockDailyReport,
} from '../core/mock/mock-daily-reports';
import { MOCK_PARENTS, type MockParent, type MockParentChild } from '../core/mock/mock-parents';
import { MOCK_PROGRAMS } from '../core/mock/mock-data';
import { institutionById, institutionKindOf } from '../core/mock/mock-institutions';
import type {
  Phase0SessionAttendance,
  Phase0SessionDetails,
  Phase0SessionEffort,
} from '../core/contracts/daily-reports.phase0';
import { AccountSessionService } from './account-session.service';
import { DailyReportsApiService } from './daily-reports-api.service';
import { StaffApiService } from './staff-api.service';

/**
 * Bridge between mock and live for daily reports.
 *
 * Mock-mode role context comes from `AccountSessionService` if available
 * (customer-portal) or falls back to a synthesized "simulator staff" identity
 * (client-portal, which has no real auth). Live mode delegates to the API
 * service and lets the server enforce role scoping.
 *
 * The current institution for client-portal's simulator is hard-coded to
 * `tenant_little_stars` to mirror the rest of the mock data.
 */
const SIMULATOR_INSTITUTION = {
  id: 'tenant_little_stars',
  name: 'Little Stars Preschool',
} as const;

const SIMULATOR_STAFF = {
  email: 'jane@littlestars.test',
  name: 'Jane Naidoo',
} as const;

// `'neutral'` is accepted as a wire alias for the new `'okay'` label so older
// clients can still PUT/PATCH without breaking. Bridge normalises on read.
const VALID_MOODS: ReadonlyArray<Phase0DailyReportMood> = [
  'happy',
  'okay',
  'sad',
  'mad',
  'neutral',
];

function normaliseMood(m: Phase0DailyReportMood | null | undefined): Phase0DailyReportMood | null {
  if (m == null) return null;
  return m === 'neutral' ? 'okay' : m;
}

function normaliseMeals(input: unknown): MockDailyReport['meals'] {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const pick = (k: 'breakfast' | 'snack' | 'lunch'): 'all' | 'some' | 'none' | null => {
    const v = src[k];
    return v === 'all' || v === 'some' || v === 'none' ? v : null;
  };
  return { breakfast: pick('breakfast'), snack: pick('snack'), lunch: pick('lunch') };
}

function normaliseDrinks(input: unknown): MockDailyReport['drinks'] {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const n = Number(src['bottlesCount']);
  return {
    water: src['water'] === true,
    bottlesCount: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0,
  };
}

function normaliseSleep(input: unknown): MockDailyReport['sleep'] {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const time = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null;
  const q = src['napQuality'];
  return {
    noSleep: src['noSleep'] === true,
    napStart: time(src['napStart']),
    napEnd: time(src['napEnd']),
    napQuality: q === 'well' || q === 'restless' ? q : null,
  };
}

function normaliseHygiene(input: unknown): MockDailyReport['hygiene'] {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const n = Number(src['diaperChanges']);
  const notes = typeof src['notes'] === 'string' ? (src['notes'] as string).trim() : '';
  return {
    pottyTraining: src['pottyTraining'] === true,
    diaperChanges: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null,
    notes: notes || null,
  };
}

const VALID_ATTENDANCE: ReadonlyArray<Phase0SessionAttendance> = [
  'present', 'late', 'absent', 'left_early',
];
const VALID_EFFORT: ReadonlyArray<Phase0SessionEffort> = [
  'needs_push', 'on_track', 'great_effort',
];

function normaliseSession(input: unknown): Phase0SessionDetails {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const attendanceRaw = src['attendance'];
  const attendance: Phase0SessionAttendance = VALID_ATTENDANCE.includes(
    attendanceRaw as Phase0SessionAttendance,
  )
    ? (attendanceRaw as Phase0SessionAttendance)
    : 'present';
  const effortRaw = src['effort'];
  const effort: Phase0SessionEffort | null = VALID_EFFORT.includes(
    effortRaw as Phase0SessionEffort,
  )
    ? (effortRaw as Phase0SessionEffort)
    : null;
  const focus = typeof src['focus'] === 'string' ? (src['focus'] as string).trim() : '';
  const nextFocus = typeof src['nextFocus'] === 'string' ? (src['nextFocus'] as string).trim() : '';
  const skillsPracticed = Array.isArray(src['skillsPracticed'])
    ? (src['skillsPracticed'] as unknown[])
        .filter((s): s is string => typeof s === 'string' && !!s.trim())
        .map((s) => s.trim())
    : [];
  return {
    attendance,
    focus: focus || null,
    effort,
    skillsPracticed,
    nextFocus: nextFocus || null,
  };
}

function normaliseMedia(input: unknown): MockDailyReport['media'] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m): m is { url: string; kind?: string; caption?: string; id?: string } =>
      !!m && typeof m === 'object' && typeof (m as { url?: unknown }).url === 'string',
    )
    .map((m) => ({
      id: typeof m.id === 'string' && m.id ? m.id : `m_${Math.random().toString(36).slice(2, 10)}`,
      kind: m.kind === 'video' ? 'video' : 'photo',
      url: String(m.url),
      caption: typeof m.caption === 'string' && m.caption.trim() ? m.caption.trim() : null,
    }));
}

@Injectable({ providedIn: 'root' })
export class DailyReportsBridgeService {
  private readonly api = inject(DailyReportsApiService);
  private readonly session = inject(AccountSessionService);
  private readonly staff = inject(StaffApiService);

  list(query: Phase0ListDailyReportsQuery = {}): Observable<Phase0DailyReportListResult> {
    if (environment.useMock) {
      const ctx = this.resolveContext();
      let rows: MockDailyReport[] = [...MOCK_DAILY_REPORTS];
      if (ctx.role === 'parent') {
        rows = rows.filter(
          (r) => r.parentId === ctx.parentId && r.status === 'published',
        );
      } else if (ctx.role === 'staff') {
        rows = rows.filter((r) => r.institutionId === ctx.institutionId);
      } // 'simulator' sees the simulator institution's reports
      else {
        rows = rows.filter((r) => r.institutionId === ctx.institutionId);
      }
      if (query.parentChildId)
        rows = rows.filter((r) => r.parentChildId === query.parentChildId);
      if (query.programId) rows = rows.filter((r) => r.programId === query.programId);
      if (query.institutionId && ctx.role === 'parent')
        rows = rows.filter((r) => r.institutionId === query.institutionId);
      if (query.status) rows = rows.filter((r) => r.status === query.status);
      if (query.date) rows = rows.filter((r) => r.reportDate === query.date);
      if (query.fromDate) rows = rows.filter((r) => r.reportDate >= query.fromDate!);

      rows = sortReportsNewestFirst(rows);
      const totalCount = rows.length;
      const page = Math.max(1, query.page || 1);
      const pageSize = Math.min(200, Math.max(1, query.pageSize || 50));
      const items = rows
        .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
        .map((r) => toDto(r));
      return of({ items, totalCount, page, pageSize });
    }
    return this.api.list(query);
  }

  get(id: string): Observable<Phase0DailyReport> {
    if (environment.useMock) {
      const ctx = this.resolveContext();
      const r = findReportById(id);
      if (!r) return throwError(() => new Error('Report not found.'));
      if (ctx.role === 'parent') {
        if (r.parentId !== ctx.parentId || r.status !== 'published') {
          return throwError(() => new Error('Report not found.'));
        }
      } else if (r.institutionId !== ctx.institutionId) {
        return throwError(() => new Error('Report not found.'));
      }
      return of(toDto(r));
    }
    return this.api.get(id);
  }

  create(body: Phase0CreateDailyReportRequest): Observable<Phase0DailyReport> {
    if (environment.useMock) {
      const ctx = this.resolveContext();
      if (ctx.role === 'parent') {
        return throwError(() => new Error('Only staff can post daily reports.'));
      }
      const validation = validateCreate(body, ctx.institutionId);
      if (validation) return throwError(() => new Error(validation));

      const pc = findParentChild(body.parentChildId);
      if (!pc) return throwError(() => new Error(`No child with id "${body.parentChildId}".`));

      const now = new Date().toISOString();
      const reportDate = (body.reportDate || todayDate()).trim();
      // The institution decides the report shape — staff cannot post a
      // session report under a daycare or vice versa.
      const reportKind = institutionKindOf(body.institutionId);
      const isSession = reportKind === 'session';
      const record: MockDailyReport = {
        id: `dr_${randomId()}`,
        parentChildId: body.parentChildId,
        parentId: pc.parent.id,
        institutionId: body.institutionId,
        programId: body.programId ?? null,
        reportKind,
        reportDate,
        status: body.publish ? 'published' : 'draft',
        postedAt: now,
        publishedAt: body.publish ? now : null,
        authorEmail: ctx.authorEmail,
        authorName: ctx.authorName,
        mood: normaliseMood(body.mood ?? null),
        meals: isSession ? null : normaliseMeals(body.meals ?? EMPTY_MEALS),
        drinks: isSession ? null : normaliseDrinks(body.drinks ?? EMPTY_DRINKS),
        sleep: isSession ? null : normaliseSleep(body.sleep ?? EMPTY_SLEEP),
        hygiene: isSession ? null : normaliseHygiene(body.hygiene ?? EMPTY_HYGIENE),
        session: isSession ? normaliseSession(body.session ?? {}) : null,
        summary: body.summary.trim(),
        highlights: body.highlights?.trim() || null,
        concerns: body.concerns?.trim() || null,
        media: normaliseMedia(body.media),
      };
      appendReport(record);
      return of(toDto(record));
    }
    return this.api.create(body);
  }

  update(
    id: string,
    patch: Phase0UpdateDailyReportRequest,
  ): Observable<Phase0DailyReport> {
    if (environment.useMock) {
      const ctx = this.resolveContext();
      const r = findReportById(id);
      if (!r) return throwError(() => new Error('Report not found.'));
      if (ctx.role === 'parent') {
        return throwError(() => new Error('Only staff can edit daily reports.'));
      }
      if (r.authorEmail !== ctx.authorEmail) {
        return throwError(
          () => new Error('Only the original author can edit this report.'),
        );
      }
      if (patch.summary !== undefined && !patch.summary.trim()) {
        return throwError(() => new Error('Summary cannot be empty.'));
      }
      if (patch.mood !== undefined && patch.mood !== null && !VALID_MOODS.includes(patch.mood)) {
        return throwError(() => new Error('Invalid mood.'));
      }
      if (patch.programId !== undefined && patch.programId !== null) {
        if (!MOCK_PROGRAMS.find((p) => p.id === patch.programId)) {
          return throwError(() => new Error(`No program with id "${patch.programId}".`));
        }
      }
      const isSession = r.reportKind === 'session';
      const next: Partial<MockDailyReport> = {};
      if (patch.reportDate !== undefined) next.reportDate = patch.reportDate;
      if (patch.programId !== undefined) next.programId = patch.programId ?? null;
      if (patch.mood !== undefined) next.mood = normaliseMood(patch.mood ?? null);
      // Daycare-only patches are silently dropped on session reports
      // (and vice versa) so a confused client can't corrupt the record.
      if (!isSession) {
        if (patch.meals !== undefined) next.meals = normaliseMeals(patch.meals);
        if (patch.drinks !== undefined) next.drinks = normaliseDrinks(patch.drinks);
        if (patch.sleep !== undefined) next.sleep = normaliseSleep(patch.sleep);
        if (patch.hygiene !== undefined) next.hygiene = normaliseHygiene(patch.hygiene);
      }
      if (isSession && patch.session !== undefined) {
        next.session = normaliseSession(patch.session ?? {});
      }
      if (patch.media !== undefined) next.media = normaliseMedia(patch.media);
      if (patch.summary !== undefined) next.summary = patch.summary.trim();
      if (patch.highlights !== undefined)
        next.highlights = patch.highlights?.trim() || null;
      if (patch.concerns !== undefined)
        next.concerns = patch.concerns?.trim() || null;
      const updated = patchReport(id, next)!;
      return of(toDto(updated));
    }
    return this.api.update(id, patch);
  }

  /**
   * Children currently active at `institutionId`. Used by the staff compose
   * form to populate the child picker.
   *
   * Live mode: in Phase 0 the staff API exposes rosters per *program* (the
   * concept of "all children at the institution" doesn't exist yet because
   * children are not yet linked to programs). We pick the first program the
   * staff user is on at this institution and return its roster as the best
   * available approximation.
   */
  listInstitutionRoster(
    institutionId: string,
  ): Observable<Array<{ parentChildId: string; displayName: string }>> {
    if (environment.useMock) {
      const seen = new Map<string, string>();
      for (const parent of MOCK_PARENTS) {
        for (const child of parent.children) {
          const active = child.subscriptions.some(
            (s) => s.institutionId === institutionId && s.state === 'active',
          );
          if (active) seen.set(child.id, child.displayName);
        }
      }
      return of(
        [...seen.entries()]
          .map(([parentChildId, displayName]) => ({ parentChildId, displayName }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      );
    }

    return new Observable((subscriber) => {
      const sub = this.staff.listMyPrograms().subscribe({
        next: (programs) => {
          const program = programs.find((p) => p.institutionId === institutionId) ?? programs[0];
          if (!program) {
            subscriber.next([]);
            subscriber.complete();
            return;
          }
          const inner = this.staff.getProgramRoster(program.id).subscribe({
            next: (roster) => {
              subscriber.next(
                roster.roster
                  .map((e) => ({
                    parentChildId: e.parentChildId ?? e.childId,
                    displayName: e.displayName,
                  }))
                  .sort((a, b) => a.displayName.localeCompare(b.displayName)),
              );
              subscriber.complete();
            },
            error: () => {
              subscriber.next([]);
              subscriber.complete();
            },
          });
          subscriber.add(inner);
        },
        error: () => {
          subscriber.next([]);
          subscriber.complete();
        },
      });
      subscriber.add(sub);
    });
  }

  remove(id: string): Observable<void> {
    if (environment.useMock) {
      const ctx = this.resolveContext();
      const r = findReportById(id);
      if (!r) return throwError(() => new Error('Report not found.'));
      if (ctx.role === 'parent') {
        return throwError(() => new Error('Only staff can delete daily reports.'));
      }
      if (r.authorEmail !== ctx.authorEmail) {
        return throwError(
          () => new Error('Only the original author can delete this report.'),
        );
      }
      const idx = MOCK_DAILY_REPORTS.findIndex((row) => row.id === id);
      if (idx >= 0) MOCK_DAILY_REPORTS.splice(idx, 1);
      return of(void 0);
    }
    return this.api.remove(id);
  }

  publish(id: string): Observable<Phase0DailyReport> {
    if (environment.useMock) {
      const ctx = this.resolveContext();
      const r = findReportById(id);
      if (!r) return throwError(() => new Error('Report not found.'));
      if (ctx.role === 'parent') {
        return throwError(() => new Error('Only staff can publish daily reports.'));
      }
      if (r.authorEmail !== ctx.authorEmail) {
        return throwError(
          () => new Error('Only the original author can publish this report.'),
        );
      }
      if (!r.summary?.trim()) {
        return throwError(
          () => new Error('Cannot publish a report with an empty summary.'),
        );
      }
      if (r.status === 'draft') {
        const now = new Date().toISOString();
        r.status = 'published';
        r.publishedAt = now;
        r.postedAt = now;
      }
      return of(toDto(r));
    }
    return this.api.publish(id);
  }

  /* -------------------------------------------------------------------- */
  /* Internal helpers                                                      */
  /* -------------------------------------------------------------------- */

  /**
   * Pull current "who am I and which institution am I acting on behalf of"
   * out of the session, falling back to the simulator identity used by
   * client-portal (which has no real auth).
   */
  private resolveContext(): MockContext {
    const account = this.session.currentAccount();
    if (account?.role === 'parent') {
      return {
        role: 'parent',
        parentId: account.parentId || '',
        institutionId: '',
        authorEmail: account.email,
        authorName: account.displayName,
      };
    }
    if (account?.role === 'staff' && account.staff) {
      return {
        role: 'staff',
        parentId: '',
        institutionId: account.staff.institutionId,
        authorEmail: account.email,
        authorName: account.displayName,
      };
    }
    // No real auth in scope — assume the simulator (client-portal).
    return {
      role: 'simulator',
      parentId: '',
      institutionId: SIMULATOR_INSTITUTION.id,
      authorEmail: SIMULATOR_STAFF.email,
      authorName: SIMULATOR_STAFF.name,
    };
  }
}

interface MockContext {
  role: 'parent' | 'staff' | 'simulator';
  parentId: string;
  institutionId: string;
  authorEmail: string;
  authorName: string;
}

function findParentChild(
  parentChildId: string,
): { parent: MockParent; child: MockParentChild } | null {
  for (const p of MOCK_PARENTS) {
    const c = p.children.find((x) => x.id === parentChildId);
    if (c) return { parent: p, child: c };
  }
  return null;
}

function toDto(r: MockDailyReport): Phase0DailyReport {
  const pc = findParentChild(r.parentChildId);
  const program = r.programId
    ? MOCK_PROGRAMS.find((p) => p.id === r.programId) || null
    : null;
  const inst = institutionById(r.institutionId);
  return {
    id: r.id,
    parentChildId: r.parentChildId,
    parentChildName: pc?.child.displayName || r.parentChildId,
    parentId: r.parentId,
    institutionId: r.institutionId,
    institutionName: inst.name,
    programId: r.programId,
    programName: program?.name || null,
    reportKind: r.reportKind,
    reportDate: r.reportDate,
    status: r.status as Phase0DailyReportStatus,
    postedAt: r.postedAt,
    publishedAt: r.publishedAt,
    authorEmail: r.authorEmail,
    authorName: r.authorName,
    mood: normaliseMood(r.mood),
    // Keep cross-kind blocks as null on the wire so the parent UI can
    // render the right card without guessing from "is this all empty?".
    meals: r.meals,
    drinks: r.drinks,
    sleep: r.sleep,
    hygiene: r.hygiene,
    session: r.session,
    summary: r.summary,
    highlights: r.highlights,
    concerns: r.concerns,
    media: r.media ?? [],
  };
}

function validateCreate(
  body: Phase0CreateDailyReportRequest,
  institutionIdInScope: string,
): string | null {
  if (!body.parentChildId?.trim()) return 'A child must be selected.';
  if (!body.institutionId?.trim()) return 'An institution must be specified.';
  if (institutionIdInScope && body.institutionId !== institutionIdInScope) {
    return 'You can only post reports under your own institution.';
  }
  if (!body.summary?.trim()) return 'Summary is required.';
  if (body.mood !== undefined && body.mood !== null && !VALID_MOODS.includes(body.mood)) {
    return 'Invalid mood.';
  }
  if (body.reportDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.reportDate)) {
    return 'Report date must be YYYY-MM-DD.';
  }
  if (body.programId && !MOCK_PROGRAMS.find((p) => p.id === body.programId)) {
    return `No program with id "${body.programId}".`;
  }
  return null;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/* -------------------------------------------------------------------------- */
/* Public display helpers — shared by staff compose form + parent feed.        */
/* -------------------------------------------------------------------------- */

export interface MoodOption {
  value: Phase0DailyReportMood;
  emoji: string;
  label: string;
}

/** Canonical 4-state mood scale, ordered as drawn in the design picker. */
export const MOOD_OPTIONS: ReadonlyArray<MoodOption> = [
  { value: 'happy', emoji: '😊', label: 'Happy' },
  { value: 'okay', emoji: '🙂', label: 'Okay' },
  { value: 'sad', emoji: '😞', label: 'Sad' },
  { value: 'mad', emoji: '😡', label: 'Mad' },
];

export function moodLabel(m: Phase0DailyReportMood | null | undefined): string {
  if (!m) return 'Not set';
  const norm = m === 'neutral' ? 'okay' : m;
  return MOOD_OPTIONS.find((o) => o.value === norm)?.label ?? 'Not set';
}

export function moodEmoji(m: Phase0DailyReportMood | null | undefined): string {
  if (!m) return '·';
  const norm = m === 'neutral' ? 'okay' : m;
  return MOOD_OPTIONS.find((o) => o.value === norm)?.emoji ?? '·';
}

export interface PortionOption {
  value: 'all' | 'some' | 'none';
  label: string;
}

export const PORTION_OPTIONS: ReadonlyArray<PortionOption> = [
  { value: 'all', label: 'All' },
  { value: 'some', label: 'Some' },
  { value: 'none', label: 'None' },
];

export function portionLabel(p: 'all' | 'some' | 'none' | null | undefined): string {
  if (!p) return '—';
  return PORTION_OPTIONS.find((o) => o.value === p)?.label ?? '—';
}
