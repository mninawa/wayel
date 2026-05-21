import { Injectable, inject } from '@angular/core';
import { wayelAdminFetch } from './wayel-admin-http';

/**
 * HTTP client for the daily reports surface
 * (`/api/v1/daily-reports/...`), called from the REMOVED tenant
 * workspace.
 *
 * SuperAdmins use the `?tenantId=` override to read another tenant's
 * reports — the API enforces the elevation server-side via
 * `EffectiveTenant`. Mutations (create / update / publish / delete) are
 * exposed for the per-child detail page.
 *
 * All wire enums use the backend's PascalCase form. Mapping between the
 * frontend's snake_case mock vocabulary and the wire form lives in the
 * caller (see `workspace-daily-report-section.component.ts`).
 */
export type WayelDailyReportStatus = 'Draft' | 'Published';
export type WayelDailyReportKind = 'Daycare' | 'Session';
export type WayelDailyReportMood = 'Happy' | 'Okay' | 'Sad' | 'Mad';
export type WayelMealPortion = 'None' | 'Some' | 'All';
export type WayelNapQuality = 'Well' | 'Restless';
export type WayelSessionAttendance = 'Present' | 'Late' | 'Absent' | 'LeftEarly';
export type WayelSessionEffort = 'NeedsPush' | 'OnTrack' | 'GreatEffort';
export type WayelDailyReportMediaKind = 'Photo' | 'Video';

export interface WayelDailyReportMeals {
  breakfast: WayelMealPortion | null;
  snack: WayelMealPortion | null;
  lunch: WayelMealPortion | null;
}

export interface WayelDailyReportDrinks {
  water: boolean;
  bottlesCount: number;
  /**
   * v1 paper "To drink I had:" parity. The backend defaults these
   * to `false` for legacy reports written before the schema was
   * extended, so the field is always present on read.
   */
  milk: boolean;
  tea: boolean;
}

export interface WayelDailyReportSleep {
  noSleep: boolean;
  napStart: string | null;
  napEnd: string | null;
  quality: WayelNapQuality | null;
}

export interface WayelDailyReportHygiene {
  pottyTraining: boolean;
  diaperChanges: number | null;
  /**
   * v1 paper "Nappies" parity. Each flag is independent — a
   * caregiver can record both Soiled and Wet on the same day.
   * Defaults to `false` on legacy reports.
   */
  soiled: boolean;
  wet: boolean;
  dry: boolean;
  notes: string | null;
}

export interface WayelSessionDetails {
  attendance: WayelSessionAttendance;
  focus: string | null;
  effort: WayelSessionEffort | null;
  skillsPracticed: readonly string[];
  nextFocus: string | null;
}

export interface WayelDailyReportMedia {
  id: string;
  kind: WayelDailyReportMediaKind;
  url: string;
  caption: string | null;
}

/**
 * Wire DTO returned by `GET /api/v1/daily-reports[/{id}]`. Mirrors the
 * backend's `DailyReportSummary` record verbatim.
 */
export interface WayelDailyReportSummary {
  id: string;
  tenantId: string;
  programId: string;
  childId: string;
  kind: WayelDailyReportKind;
  reportDate: string; // yyyy-MM-dd
  childDisplayName: string;
  programName: string;
  status: WayelDailyReportStatus;
  mood: WayelDailyReportMood;
  summary: string;
  highlights: string;
  concerns: string;
  meals: WayelDailyReportMeals;
  drinks: WayelDailyReportDrinks;
  sleep: WayelDailyReportSleep;
  hygiene: WayelDailyReportHygiene;
  session: WayelSessionDetails;
  activities: readonly string[];
  media: readonly WayelDailyReportMedia[];
  authorUserId: string | null;
  authorDisplayName: string | null;
  authorEmail: string | null;
  createdOnUtc: string;
  updatedOnUtc: string;
  publishedOnUtc: string | null;
}

export interface WayelListDailyReportsResponse {
  items: readonly WayelDailyReportSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WayelListDailyReportsQuery {
  status?: WayelDailyReportStatus | null;
  programId?: string | null;
  childId?: string | null;
  /** Inclusive lower bound, `yyyy-MM-dd`. */
  fromDate?: string | null;
  /** Inclusive upper bound, `yyyy-MM-dd`. */
  toDate?: string | null;
  page?: number | null;
  pageSize?: number | null;
}

/** Rollup returned by `GET /api/v1/daily-reports/summary`. */
export interface WayelDailyReportsKpiSummary {
  todayPublished: number;
  todayTotal: number;
  weekPublished: number;
  weekTotal: number;
  monthPublished: number;
  monthTotal: number;
  childrenCoveredLast30Days: number;
  publishedRatePercent: number;
}

/**
 * Body for `POST /api/v1/daily-reports`. The optional `tenantId` is sent
 * as the `?tenantId=` query string for the SuperAdmin override (the API
 * does not read it from the body), so the `tenantId` field on this DTO
 * exists only as a typing hint for callers and is stripped before the
 * body is serialised. See `WayelAdminDailyReportsService.create`.
 */
export interface WayelCreateDailyReportBody {
  tenantId?: string | null;
  programId: string;
  childId: string;
  kind: WayelDailyReportKind;
  reportDate: string; // yyyy-MM-dd
  childDisplayName: string;
  programName: string;
  mood: WayelDailyReportMood;
  summary: string;
  highlights?: string | null;
  concerns?: string | null;
  meals?: WayelDailyReportMeals | null;
  drinks?: WayelDailyReportDrinks | null;
  sleep?: WayelDailyReportSleep | null;
  hygiene?: WayelDailyReportHygiene | null;
  session?: WayelSessionDetails | null;
  activities?: readonly string[];
  media?: readonly WayelDailyReportMedia[];
  publish?: boolean;
}

/** Body for `PATCH /api/v1/daily-reports/{id}`. Any null field = "no change". */
export interface WayelUpdateDailyReportBody {
  /** SuperAdmin override — see `WayelAdminDailyReportsService.update`. */
  tenantId?: string | null;
  programId?: string | null;
  childId?: string | null;
  kind?: WayelDailyReportKind | null;
  reportDate?: string | null;
  mood?: WayelDailyReportMood | null;
  summary?: string | null;
  highlights?: string | null;
  concerns?: string | null;
  meals?: WayelDailyReportMeals | null;
  drinks?: WayelDailyReportDrinks | null;
  sleep?: WayelDailyReportSleep | null;
  hygiene?: WayelDailyReportHygiene | null;
  session?: WayelSessionDetails | null;
  activities?: readonly string[] | null;
  media?: readonly WayelDailyReportMedia[] | null;
}

const base = '/api/v1/daily-reports';

@Injectable({ providedIn: 'root' })
export class WayelAdminDailyReportsService {
  list(
    tenantId: string,
    query: WayelListDailyReportsQuery = {},
  ): Promise<WayelListDailyReportsResponse> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    if (query.status) params.set('status', query.status);
    if (query.programId) params.set('programId', query.programId);
    if (query.childId) params.set('childId', query.childId);
    // Backend names: `from` / `to` (DateOnly).
    if (query.fromDate) params.set('from', query.fromDate);
    if (query.toDate) params.set('to', query.toDate);
    if (query.page != null) params.set('page', String(query.page));
    if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
    return wayelAdminFetch<WayelListDailyReportsResponse>(
      `${base}?${params.toString()}`,
      { method: 'GET' },
    );
  }

  get(tenantId: string, reportId: string): Promise<WayelDailyReportSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelDailyReportSummary>(
      `${base}/${encodeURIComponent(reportId)}?${params.toString()}`,
      { method: 'GET' },
    );
  }

  summary(tenantId: string): Promise<WayelDailyReportsKpiSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelDailyReportsKpiSummary>(
      `${base}/summary?${params.toString()}`,
      { method: 'GET' },
    );
  }

  create(body: WayelCreateDailyReportBody): Promise<WayelDailyReportSummary> {
    const { tenantId, ...rest } = body;
    return wayelAdminFetch<WayelDailyReportSummary>(
      `${base}${queryWithTenant(tenantId)}`,
      {
        method: 'POST',
        body: JSON.stringify(rest),
      },
    );
  }

  update(
    reportId: string,
    body: WayelUpdateDailyReportBody,
  ): Promise<WayelDailyReportSummary> {
    const { tenantId, ...rest } = body;
    return wayelAdminFetch<WayelDailyReportSummary>(
      `${base}/${encodeURIComponent(reportId)}${queryWithTenant(tenantId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(rest),
      },
    );
  }

  publish(
    reportId: string,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelDailyReportSummary> {
    return wayelAdminFetch<WayelDailyReportSummary>(
      `${base}/${encodeURIComponent(reportId)}/publish${queryWithTenant(options.tenantId)}`,
      { method: 'POST' },
    );
  }

  remove(
    reportId: string,
    options: { tenantId?: string | null } = {},
  ): Promise<void> {
    return wayelAdminFetch<void>(
      `${base}/${encodeURIComponent(reportId)}${queryWithTenant(options.tenantId)}`,
      { method: 'DELETE' },
    );
  }
}

function queryWithTenant(tenantId?: string | null): string {
  if (!tenantId) return '';
  const params = new URLSearchParams();
  params.set('tenantId', tenantId);
  return `?${params.toString()}`;
}

export const useWayelAdminDailyReports = (): WayelAdminDailyReportsService =>
  inject(WayelAdminDailyReportsService);
