import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0CreateDailyReportRequest,
  Phase0DailyReport,
  Phase0DailyReportListResult,
  Phase0DailyReportMood,
  Phase0DailyReportStatus,
  Phase0ListDailyReportsQuery,
  Phase0SessionAttendance,
  Phase0SessionEffort,
  Phase0UpdateDailyReportRequest,
} from '../core/contracts/daily-reports.phase0';

/**
 * HTTP client for the institution-side daily-reports surface, mounted under
 * /api/v1/daily-reports on the API host. Bearer tokens are stamped by
 * `accountAuthInterceptor` (customer-portal) so this service stays purely
 * declarative.
 *
 * The C# API enforces tenant scoping server-side from the bearer's claims,
 * so the Phase 0 `institutionId` query param is informational only — the
 * server still returns just the rows the caller is allowed to see.
 *
 * Wire shape ↔ Phase 0 shape mapping happens here so the bridge / SPA
 * stay on the original mock-shaped contract.
 */
@Injectable({ providedIn: 'root' })
export class DailyReportsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  list(query: Phase0ListDailyReportsQuery = {}): Observable<Phase0DailyReportListResult> {
    let params = new HttpParams();
    if (query.programId) params = params.set('programId', query.programId);
    if (query.parentChildId) params = params.set('childId', query.parentChildId);
    if (query.status) params = params.set('status', query.status);
    if (query.date) params = params.set('from', query.date).set('to', query.date);
    if (query.fromDate) params = params.set('from', query.fromDate);
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.pageSize != null) params = params.set('pageSize', String(query.pageSize));
    return this.http
      .get<WireDailyReportListResponse>(`${this.base()}/api/v1/daily-reports`, { params })
      .pipe(map(fromWireList));
  }

  get(id: string): Observable<Phase0DailyReport> {
    return this.http
      .get<WireDailyReport>(`${this.base()}/api/v1/daily-reports/${encodeURIComponent(id)}`)
      .pipe(map(fromWireReport));
  }

  create(body: Phase0CreateDailyReportRequest): Observable<Phase0DailyReport> {
    return this.http
      .post<WireDailyReport>(`${this.base()}/api/v1/daily-reports`, toWireCreate(body))
      .pipe(map(fromWireReport));
  }

  update(id: string, patch: Phase0UpdateDailyReportRequest): Observable<Phase0DailyReport> {
    return this.http
      .patch<WireDailyReport>(
        `${this.base()}/api/v1/daily-reports/${encodeURIComponent(id)}`,
        toWireUpdate(patch),
      )
      .pipe(map(fromWireReport));
  }

  publish(id: string): Observable<Phase0DailyReport> {
    return this.http
      .post<WireDailyReport>(
        `${this.base()}/api/v1/daily-reports/${encodeURIComponent(id)}/publish`,
        {},
      )
      .pipe(map(fromWireReport));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base()}/api/v1/daily-reports/${encodeURIComponent(id)}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */
//
// The C# API returns DailyReportSummary which uses tenantId / childId
// (institution-side ids) and PascalCase enum strings ("Daycare", "Happy").
// Phase 0 contracts use parentChildId / institutionId and snake_case enums.
// We reconcile here at the seam so the SPA stays unchanged.

interface WireDailyReportMeals {
  breakfast: string | null;
  snack: string | null;
  lunch: string | null;
}
interface WireDailyReportDrinks {
  water: boolean;
  bottlesCount: number;
}
interface WireDailyReportSleep {
  noSleep: boolean;
  napStart: string | null;
  napEnd: string | null;
  quality: string | null;
}
interface WireDailyReportHygiene {
  pottyTraining: boolean;
  diaperChanges: number | null;
  notes: string | null;
}
interface WireSessionDetails {
  attendance: string;
  focus: string | null;
  effort: string | null;
  skillsPracticed: string[] | null;
  nextFocus: string | null;
}
interface WireDailyReportMedia {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
}

interface WireDailyReport {
  id: string;
  tenantId: string;
  programId: string;
  childId: string;
  kind: string;
  reportDate: string;
  childDisplayName: string;
  programName: string;
  status: string;
  mood: string;
  summary: string;
  meals: WireDailyReportMeals | null;
  drinks: WireDailyReportDrinks | null;
  sleep: WireDailyReportSleep | null;
  hygiene: WireDailyReportHygiene | null;
  session: WireSessionDetails | null;
  activities: string[] | null;
  media: WireDailyReportMedia[] | null;
  authorUserId: string | null;
  authorDisplayName: string | null;
  /** Snapshotted at write — distinct from headline display name. */
  authorEmail: string | null;
  createdOnUtc: string;
  updatedOnUtc: string;
  publishedOnUtc: string | null;
}

interface WireDailyReportListResponse {
  items: WireDailyReport[];
  total: number;
  page: number;
  pageSize: number;
}

function lc(v: string | null | undefined): string | null {
  return v == null ? null : String(v).toLowerCase();
}

function fromWireMood(v: string | null | undefined): Phase0DailyReportMood | null {
  const s = lc(v);
  if (s === 'happy' || s === 'okay' || s === 'sad' || s === 'mad') return s;
  return null;
}

function fromWireStatus(v: string): Phase0DailyReportStatus {
  return lc(v) === 'published' ? 'published' : 'draft';
}

function fromWireKind(v: string): 'daycare' | 'session' {
  return lc(v) === 'session' ? 'session' : 'daycare';
}

function fromWirePortion(v: string | null | undefined): 'all' | 'some' | 'none' | null {
  const s = lc(v);
  return s === 'all' || s === 'some' || s === 'none' ? s : null;
}

function fromWireAttendance(v: string | null | undefined): Phase0SessionAttendance {
  const s = lc(v);
  if (s === 'late' || s === 'absent') return s as Phase0SessionAttendance;
  // PascalCase "LeftEarly" → snake_case "left_early"
  if (s === 'leftearly' || s === 'left_early') return 'left_early';
  return 'present';
}

function fromWireEffort(v: string | null | undefined): Phase0SessionEffort | null {
  const s = lc(v);
  if (s === 'ontrack' || s === 'on_track') return 'on_track';
  if (s === 'needspush' || s === 'needs_push') return 'needs_push';
  if (s === 'greateffort' || s === 'great_effort') return 'great_effort';
  return null;
}

/**
 * Parent-visible author line: prefer account display names. Never surface a
 * raw email where the UX expects someone’s name (legacy rows mistakenly
 * stored email in AuthorDisplayName).
 */
function authorDisplayNameFromWire(
  authorDisplayName: string | null | undefined,
  authorEmail: string | null | undefined,
): string {
  const emailTrim = (authorEmail ?? '').trim();
  const emailLower = emailTrim.toLowerCase();
  const display = (authorDisplayName ?? '').trim();
  if (display && !display.includes('@')) return display;
  if (display && emailLower && display.toLowerCase() === emailLower)
    return 'Staff member';
  if (display.includes('@')) return 'Staff member';
  return display.length > 0 ? display : 'Staff member';
}

function fromWireReport(w: WireDailyReport): Phase0DailyReport {
  const kind = fromWireKind(w.kind);
  const authorName = authorDisplayNameFromWire(w.authorDisplayName, w.authorEmail);

  return {
    id: w.id,
    parentChildId: w.childId,
    parentChildName: w.childDisplayName ?? '',
    parentId: '',
    institutionId: w.tenantId,
    institutionName: '',
    programId: w.programId || null,
    programName: w.programName || null,
    reportKind: kind,
    reportDate: w.reportDate,
    status: fromWireStatus(w.status),
    postedAt: w.updatedOnUtc,
    publishedAt: w.publishedOnUtc,
    authorEmail: (w.authorEmail ?? '').trim(),
    authorName,
    mood: fromWireMood(w.mood),
    meals:
      kind === 'daycare' && w.meals
        ? {
            breakfast: fromWirePortion(w.meals.breakfast),
            snack: fromWirePortion(w.meals.snack),
            lunch: fromWirePortion(w.meals.lunch),
          }
        : null,
    drinks:
      kind === 'daycare' && w.drinks
        ? { water: !!w.drinks.water, bottlesCount: Number(w.drinks.bottlesCount) || 0 }
        : null,
    sleep:
      kind === 'daycare' && w.sleep
        ? {
            noSleep: !!w.sleep.noSleep,
            napStart: w.sleep.napStart,
            napEnd: w.sleep.napEnd,
            napQuality:
              lc(w.sleep.quality) === 'well'
                ? 'well'
                : lc(w.sleep.quality) === 'restless'
                  ? 'restless'
                  : null,
          }
        : null,
    hygiene:
      kind === 'daycare' && w.hygiene
        ? {
            pottyTraining: !!w.hygiene.pottyTraining,
            diaperChanges: w.hygiene.diaperChanges,
            notes: w.hygiene.notes,
          }
        : null,
    session:
      kind === 'session' && w.session
        ? {
            attendance: fromWireAttendance(w.session.attendance),
            focus: w.session.focus,
            effort: fromWireEffort(w.session.effort),
            skillsPracticed: w.session.skillsPracticed ?? [],
            nextFocus: w.session.nextFocus,
          }
        : null,
    summary: w.summary ?? '',
    highlights: null,
    concerns: null,
    media: (w.media ?? []).map((m) => ({
      id: m.id,
      kind: lc(m.kind) === 'video' ? 'video' : 'photo',
      url: m.url,
      caption: m.caption,
    })),
  };
}

function fromWireList(w: WireDailyReportListResponse): Phase0DailyReportListResult {
  return {
    items: (w.items ?? []).map(fromWireReport),
    totalCount: w.total ?? 0,
    page: w.page ?? 1,
    pageSize: w.pageSize ?? 50,
  };
}

/* -------------------------------------------------------------------------- */
/* Outbound mapping                                                           */
/* -------------------------------------------------------------------------- */

interface WireCreateBody {
  programId: string;
  childId: string;
  kind: 'Daycare' | 'Session';
  reportDate: string;
  mood: string;
  summary: string;
  meals?: WireDailyReportMeals | null;
  drinks?: WireDailyReportDrinks | null;
  sleep?: WireDailyReportSleep | null;
  hygiene?: WireDailyReportHygiene | null;
  session?: WireSessionDetails | null;
  activities?: string[];
  media?: WireDailyReportMedia[];
  publish: boolean;
}

interface WireUpdateBody {
  reportId?: string;
  programId?: string | null;
  childId?: string | null;
  kind?: string | null;
  reportDate?: string | null;
  mood?: string | null;
  summary?: string | null;
  meals?: WireDailyReportMeals | null;
  drinks?: WireDailyReportDrinks | null;
  sleep?: WireDailyReportSleep | null;
  hygiene?: WireDailyReportHygiene | null;
  session?: WireSessionDetails | null;
  activities?: string[] | null;
  media?: WireDailyReportMedia[] | null;
}

function toPascalMood(m: Phase0DailyReportMood | null | undefined): string {
  const s = m === 'neutral' || m == null ? 'okay' : m;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toPascalPortion(p: 'all' | 'some' | 'none' | null | undefined): string | null {
  if (!p) return null;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function toPascalAttendance(a: Phase0SessionAttendance | null | undefined): string {
  switch (a) {
    case 'late': return 'Late';
    case 'absent': return 'Absent';
    case 'left_early': return 'LeftEarly';
    default: return 'Present';
  }
}

function toPascalEffort(e: Phase0SessionEffort | null | undefined): string | null {
  switch (e) {
    case 'on_track': return 'OnTrack';
    case 'needs_push': return 'NeedsPush';
    case 'great_effort': return 'GreatEffort';
    default: return null;
  }
}

function toWireMeals(m: Partial<{ breakfast: 'all' | 'some' | 'none' | null; snack: 'all' | 'some' | 'none' | null; lunch: 'all' | 'some' | 'none' | null }> | null | undefined): WireDailyReportMeals | null {
  if (!m) return null;
  return {
    breakfast: toPascalPortion(m.breakfast ?? null),
    snack: toPascalPortion(m.snack ?? null),
    lunch: toPascalPortion(m.lunch ?? null),
  };
}

function toWireDrinks(d: Partial<{ water: boolean; bottlesCount: number }> | null | undefined): WireDailyReportDrinks | null {
  if (!d) return null;
  return { water: !!d.water, bottlesCount: Number(d.bottlesCount) || 0 };
}

function toWireSleep(s: Partial<{ noSleep: boolean; napStart: string | null; napEnd: string | null; napQuality: 'well' | 'restless' | null }> | null | undefined): WireDailyReportSleep | null {
  if (!s) return null;
  const q = s.napQuality;
  return {
    noSleep: !!s.noSleep,
    napStart: s.napStart ?? null,
    napEnd: s.napEnd ?? null,
    quality: q === 'well' ? 'Well' : q === 'restless' ? 'Restless' : null,
  };
}

function toWireHygiene(h: Partial<{ pottyTraining: boolean; diaperChanges: number | null; notes: string | null }> | null | undefined): WireDailyReportHygiene | null {
  if (!h) return null;
  return {
    pottyTraining: !!h.pottyTraining,
    diaperChanges: h.diaperChanges ?? null,
    notes: h.notes ?? null,
  };
}

function toWireSession(s: Partial<{ attendance: Phase0SessionAttendance; focus: string | null; effort: Phase0SessionEffort | null; skillsPracticed: string[]; nextFocus: string | null }> | null | undefined): WireSessionDetails | null {
  if (!s) return null;
  return {
    attendance: toPascalAttendance(s.attendance ?? null),
    focus: s.focus ?? null,
    effort: toPascalEffort(s.effort ?? null),
    skillsPracticed: s.skillsPracticed ?? [],
    nextFocus: s.nextFocus ?? null,
  };
}

function toWireMedia(media: Array<{ kind: 'photo' | 'video'; url: string; caption: string | null }> | null | undefined): WireDailyReportMedia[] {
  if (!media) return [];
  return media.map((m) => ({
    id: '',
    kind: m.kind === 'video' ? 'Video' : 'Photo',
    url: m.url,
    caption: m.caption ?? null,
  }));
}

function toWireCreate(body: Phase0CreateDailyReportRequest): WireCreateBody {
  // Phase 0 doesn't carry an explicit `kind` (the server derives it from the
  // institution). For the live wire we infer: presence of a `session` block
  // means session report, otherwise daycare.
  const inferredKind: 'Daycare' | 'Session' = body.session ? 'Session' : 'Daycare';
  return {
    programId: body.programId ?? '',
    childId: body.parentChildId,
    kind: inferredKind,
    reportDate: body.reportDate ?? new Date().toISOString().slice(0, 10),
    mood: toPascalMood(body.mood ?? null),
    summary: body.summary,
    meals: toWireMeals(body.meals as Phase0CreateDailyReportRequest['meals']),
    drinks: toWireDrinks(body.drinks as Phase0CreateDailyReportRequest['drinks']),
    sleep: toWireSleep(body.sleep as Phase0CreateDailyReportRequest['sleep']),
    hygiene: toWireHygiene(body.hygiene as Phase0CreateDailyReportRequest['hygiene']),
    session: toWireSession(body.session as Phase0CreateDailyReportRequest['session']),
    activities: [],
    media: toWireMedia(body.media ?? null),
    publish: body.publish === true,
  };
}

function toWireUpdate(patch: Phase0UpdateDailyReportRequest): WireUpdateBody {
  const out: WireUpdateBody = {};
  if (patch.reportDate !== undefined) out.reportDate = patch.reportDate;
  if (patch.programId !== undefined) out.programId = patch.programId;
  if (patch.mood !== undefined) out.mood = toPascalMood(patch.mood);
  if (patch.summary !== undefined) out.summary = patch.summary;
  if (patch.meals !== undefined) out.meals = toWireMeals(patch.meals);
  if (patch.drinks !== undefined) out.drinks = toWireDrinks(patch.drinks);
  if (patch.sleep !== undefined) out.sleep = toWireSleep(patch.sleep);
  if (patch.hygiene !== undefined) out.hygiene = toWireHygiene(patch.hygiene);
  if (patch.session !== undefined) out.session = toWireSession(patch.session);
  if (patch.media !== undefined) out.media = toWireMedia(patch.media);
  return out;
}
