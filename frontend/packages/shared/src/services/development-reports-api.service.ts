import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase0DevelopmentReport,
  Phase0ItemResponse,
  Phase0MilestoneItemState,
  Phase0MilestoneTemplate,
  Phase0SectionResponse,
} from '../core/contracts/development-reports.phase0';
import { findMilestoneTemplate } from '../core/mock/mock-development-templates';

/**
 * HTTP client for the parent-side developmental reports endpoint.
 *
 * The wire shape is intentionally **sparse**: the server records only the
 * per-item overrides that diverge from the report's `defaultItemState`,
 * because the dense map is large and entirely derivable from the bundled
 * milestone template. We expand the response back to the dense shape the
 * SPA renderers already expect (see {@link expandWireToDense}).
 *
 * Routes are mounted under /api/v1 by the API host; the BFFs forward the
 * path verbatim.
 */
@Injectable({ providedIn: 'root' })
export class DevelopmentReportsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  /**
   * List published development reports for one of the caller's children.
   * Drafts are staff-scoped and are not returned through this endpoint.
   */
  listMyChild(parentChildId: string): Observable<Phase0DevelopmentReport[]> {
    return this.http
      .get<WireListResponse>(
        `${this.base()}/api/v1/me/parent/children/${encodeURIComponent(parentChildId)}/development-reports`,
      )
      .pipe(map((r) => (r?.items ?? []).map(expandWireToDense)));
  }
}

/* ─────────────────── wire shapes ─────────────────── */

interface WireItemResponse {
  itemId: string;
  state: string;
  note: string | null;
}

interface WireSectionResponse {
  sectionId: string;
  comment: string;
  items: WireItemResponse[];
}

interface WireChildSnapshot {
  displayName: string;
  dateOfBirth: string;
}

interface WireDevelopmentReport {
  id: string;
  parentChildId: string;
  institutionId: string;
  institutionName: string;
  programLabel: string | null;
  templateId: string;
  templateVersion: number;
  termLabel: string;
  termSequence: number;
  termYear: number;
  childSnapshot: WireChildSnapshot;
  vitals: Record<string, string>;
  teacherName: string;
  principalName: string | null;
  sections: WireSectionResponse[];
  closingComment: string;
  defaultItemState: string;
  status: string;
  createdOnUtc: string;
  updatedOnUtc: string;
  publishedOnUtc: string | null;
  publishedById: string | null;
}

interface WireListResponse {
  items: WireDevelopmentReport[];
}

/* ─────────────────── sparse → dense ─────────────────── */

function parseState(value: string): Phase0MilestoneItemState {
  switch (value) {
    case 'working_on':
      return 'working_on';
    case 'not_yet':
      return 'not_yet';
    default:
      return 'achieved';
  }
}

/**
 * Expand the wire (sparse) report into the dense shape the SPA renderers
 * expect. We hydrate a {@link Phase0SectionResponse} for every section in
 * the bundled template, default each item to the report's
 * `defaultItemState`, and then layer the server-supplied overrides on top.
 *
 * If we don't have the referenced template bundled (mismatched version,
 * older deploy, …) we still surface whatever the server gave us — the
 * renderer will simply not draw the missing items rather than crashing.
 */
function expandWireToDense(w: WireDevelopmentReport): Phase0DevelopmentReport {
  const template = findMilestoneTemplate(w.templateId, w.templateVersion);
  const defaultState = parseState(w.defaultItemState);
  const overridesBySectionId = new Map<string, WireSectionResponse>();
  for (const s of w.sections ?? []) {
    overridesBySectionId.set(s.sectionId, s);
  }

  const responses: Record<string, Phase0SectionResponse> = {};

  if (template) {
    for (const section of template.sections) {
      responses[section.id] = buildDenseSection(
        section,
        overridesBySectionId.get(section.id),
        defaultState,
      );
    }
  } else {
    for (const s of w.sections ?? []) {
      const items: Record<string, Phase0ItemResponse> = {};
      for (const it of s.items ?? []) {
        items[it.itemId] = { state: parseState(it.state), note: it.note ?? null };
      }
      responses[s.sectionId] = { items, comment: s.comment ?? '' };
    }
  }

  return {
    id: w.id,
    parentChildId: w.parentChildId,
    institutionId: w.institutionId,
    institutionName: w.institutionName,
    programLabel: w.programLabel,
    templateId: w.templateId,
    templateVersion: w.templateVersion,
    termLabel: w.termLabel,
    termSequence: w.termSequence,
    termYear: w.termYear,
    childSnapshot: {
      displayName: w.childSnapshot.displayName,
      dateOfBirth: w.childSnapshot.dateOfBirth,
    },
    vitals: { ...(w.vitals ?? {}) },
    teacherName: w.teacherName,
    principalName: w.principalName,
    responses,
    closingComment: w.closingComment ?? '',
    status: w.status === 'published' ? 'published' : 'draft',
    createdAt: w.createdOnUtc,
    updatedAt: w.updatedOnUtc,
    publishedAt: w.publishedOnUtc,
    publishedById: w.publishedById,
  };
}

function buildDenseSection(
  section: Phase0MilestoneTemplate['sections'][number],
  override: WireSectionResponse | undefined,
  defaultState: Phase0MilestoneItemState,
): Phase0SectionResponse {
  const items: Record<string, Phase0ItemResponse> = {};
  const overrideItems = new Map<string, WireItemResponse>();
  for (const it of override?.items ?? []) {
    overrideItems.set(it.itemId, it);
  }

  for (const group of section.groups) {
    for (const tmplItem of group.items) {
      const o = overrideItems.get(tmplItem.id);
      items[tmplItem.id] = o
        ? { state: parseState(o.state), note: o.note ?? null }
        : { state: defaultState, note: null };
    }
  }

  return {
    items,
    comment: override?.comment ?? '',
  };
}
