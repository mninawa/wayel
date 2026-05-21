/**
 * Workspace daily reports helper.
 *
 * Backs the **Daily reports** tab on the institution workspace
 * (`/tenants/:tenantId/workspace`). Walks `MOCK_DAILY_REPORTS` filtered
 * by tenant, joins each report with the parent + child it belongs to,
 * and exposes a small KPI roll-up for the header tiles.
 *
 * Read-only on purpose — actual CRUD lives in
 * `workspace-child.ts` / `WorkspaceChildDetailComponent` so per-child
 * reports stay the single source of truth.
 */
import {
  MOCK_DAILY_REPORTS,
  type MockDailyReport,
} from '../core/mock/mock-daily-reports';
import {
  MOCK_PARENTS,
  type MockParent,
  type MockParentChild,
} from '../core/mock/mock-parents';

export interface DailyReportRow {
  report: MockDailyReport;
  parent: MockParent | null;
  child: MockParentChild | null;
  childName: string;
  parentName: string;
  classroom: string | null;
  /** Count of attached photos / videos. */
  mediaCount: number;
}

export interface DailyReportSummary {
  total: number;
  published: number;
  drafts: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  /** Distinct child count touched in the visible reports. */
  childrenWithReports: number;
  /** 0–100; share of `total` that are `published`. */
  publishedRate: number;
}

export interface ListDailyReportsOptions {
  /** Cap the number of returned rows (newest first). 0 / undefined = no cap. */
  limit?: number;
}

/**
 * All reports at the given institution, decorated with parent + child
 * lookups. Newest first (by `reportDate`, then `postedAt`).
 */
export function listDailyReportsForTenant(
  institutionId: string,
  options: ListDailyReportsOptions = {},
): DailyReportRow[] {
  const childIndex = buildChildIndex();

  const rows: DailyReportRow[] = [];
  for (const r of MOCK_DAILY_REPORTS) {
    if (r.institutionId !== institutionId) continue;
    const link = childIndex.get(r.parentChildId);
    const sub = link?.child.subscriptions.find(
      (s) => s.institutionId === institutionId,
    );
    rows.push({
      report: r,
      parent: link?.parent ?? null,
      child: link?.child ?? null,
      childName: link?.child.displayName ?? 'Unknown child',
      parentName: link?.parent.displayName ?? '—',
      classroom: sub?.classroom ?? null,
      mediaCount: r.media.length,
    });
  }

  rows.sort((a, b) => {
    if (a.report.reportDate !== b.report.reportDate) {
      return a.report.reportDate < b.report.reportDate ? 1 : -1;
    }
    return a.report.postedAt < b.report.postedAt ? 1 : -1;
  });

  if (options.limit && options.limit > 0 && rows.length > options.limit) {
    return rows.slice(0, options.limit);
  }
  return rows;
}

export function summarizeDailyReports(
  rows: DailyReportRow[],
  reference: Date = new Date(),
): DailyReportSummary {
  const todayIso = isoDate(reference);
  const weekStartIso = isoDate(startOfWeek(reference));
  const monthStartIso = isoDate(startOfMonth(reference));

  let published = 0;
  let drafts = 0;
  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;
  const children = new Set<string>();

  for (const row of rows) {
    if (row.report.status === 'published') published += 1;
    else drafts += 1;
    if (row.report.reportDate === todayIso) today += 1;
    if (row.report.reportDate >= weekStartIso) thisWeek += 1;
    if (row.report.reportDate >= monthStartIso) thisMonth += 1;
    children.add(row.report.parentChildId);
  }

  const total = rows.length;
  return {
    total,
    published,
    drafts,
    today,
    thisWeek,
    thisMonth,
    childrenWithReports: children.size,
    publishedRate: total === 0 ? 0 : Math.round((published / total) * 100),
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Internal helpers                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

interface ChildLink {
  parent: MockParent;
  child: MockParentChild;
}

function buildChildIndex(): Map<string, ChildLink> {
  const index = new Map<string, ChildLink>();
  for (const parent of MOCK_PARENTS) {
    for (const child of parent.children) {
      index.set(child.id, { parent, child });
    }
  }
  return index;
}

function isoDate(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay(); // 0 = Sun
  const offset = day === 0 ? -6 : 1 - day; // Monday-anchored
  out.setDate(out.getDate() + offset);
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
