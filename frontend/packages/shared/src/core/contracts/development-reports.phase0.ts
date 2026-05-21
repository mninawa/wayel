/**
 * Phase 0 API sketch for **developmental milestone reports**.
 *
 * Domain reminder:
 *   - A **developmental milestone report** is a per-child, per-term assessment
 *     captured by a teacher at a daycare-style institution (preschool /
 *     crèche / aftercare). Unlike a daily report it is not free-form: it is
 *     a structured checklist of milestones grouped by developmental category
 *     (Wellbeing, Gross Motor, Fine Motor, Communication, …), with a free-
 *     text comment per section and a closing comment from the teacher.
 *
 *   - The **shape of the report itself is data, not code** — the South
 *     African Department of Basic Education's milestone catalogues are
 *     revised periodically and vary by age band. A `MilestoneTemplate` is
 *     a versioned, authority-tagged document that defines the list of
 *     sections / groups / items for one age band; a `DevelopmentReport`
 *     is one teacher-captured instance against a specific template version.
 *
 *   - Reports follow the same draft / published lifecycle as daily reports:
 *     drafts are visible to staff only, published reports become visible
 *     to the parent. Publishing stamps `publishedAt` + `publishedById` for
 *     an audit trail.
 *
 * Suggested base path: `/api/development-reports`.
 */

/* ────────────────────────────────────────────────────────────────────────── */
/* Templates — the schema-driven shape of a report                            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Three-state milestone response. Most templates only use `'achieved'` /
 * `'not_yet'`, but tri-state lets templates also model "working on it"
 * which is closer to how teachers actually mark these in practice.
 */
export type Phase0MilestoneItemState = 'achieved' | 'working_on' | 'not_yet';

/**
 * What states a template's items accept. Renderers should collapse the
 * tri-state UI to a binary checkbox when the template declares
 * `'binary'`.
 */
export type Phase0MilestoneResponseType = 'binary' | 'tri_state';

/** A single observable milestone (one row on the printed report). */
export interface Phase0MilestoneItem {
  /** Stable id, unique within the template. */
  id: string;
  /** Plain-text label as it appears on the printed report. */
  label: string;
  /** Optional helper text rendered under the label (e.g. asterisks/footnotes). */
  hint?: string | null;
}

/**
 * A named cluster of milestone items inside a section (e.g. "Health and
 * Hygiene" inside "Wellbeing"). Most templates use 2–4 groups per
 * section.
 */
export interface Phase0MilestoneGroup {
  id: string;
  label: string;
  items: Phase0MilestoneItem[];
}

/**
 * A top-level section of the report — one tab/accordion on the rendered
 * page. Each section can opt-in to a free-text teacher comment.
 */
export interface Phase0MilestoneSection {
  id: string;
  label: string;
  /** Optional intro paragraph rendered above the groups. */
  intro?: string | null;
  /** Material icon name used by the renderer; defaults to `flag`. */
  icon?: string | null;
  /** Whether this section captures a teacher comment. */
  comment: { enabled: boolean; label: string };
  groups: Phase0MilestoneGroup[];
}

/** A vital sign captured at the top of the report (height, weight, …). */
export interface Phase0VitalField {
  id: string;
  label: string;
  /** Display unit (e.g. `'cm'`, `'kg'`). */
  unit: string;
  /** HTML `inputmode` hint — `'decimal'` for height/weight. */
  inputMode: 'decimal' | 'numeric' | 'text';
}

/**
 * Versioned template. A template's `(id, version)` tuple is frozen onto
 * each report so that historical reports always render against the
 * schema they were captured against, even after the catalogue is
 * revised.
 */
export interface Phase0MilestoneTemplate {
  id: string;
  version: number;
  /** Human label for the catalogue ("South African DBE"). */
  authority: string;
  /**
   * Age band the template applies to. The renderer auto-suggests a
   * template for a given child by matching `child.dob` against this band.
   */
  ageBand: {
    label: string;
    minMonths: number;
    maxMonths: number;
  };
  /** ISO date the template became official. */
  effectiveFrom: string;
  /** Response type for items in this template. */
  responseType: Phase0MilestoneResponseType;
  vitals: Phase0VitalField[];
  sections: Phase0MilestoneSection[];
  closingComment: { enabled: boolean; label: string };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Reports — one captured instance per child per term                         */
/* ────────────────────────────────────────────────────────────────────────── */

export type Phase0DevelopmentReportStatus = 'draft' | 'published';

export interface Phase0ItemResponse {
  state: Phase0MilestoneItemState;
  /**
   * Optional per-item observation. Schema reserves the field; current
   * UI does not surface it but the backend should round-trip whatever
   * value it has.
   */
  note?: string | null;
}

export interface Phase0SectionResponse {
  /** Map keyed by `Phase0MilestoneItem.id`. Items missing from the map
   *  are treated as `'not_yet'` by the renderer. */
  items: Record<string, Phase0ItemResponse>;
  /** Free-text teacher comment for this section. */
  comment: string;
}

/**
 * Snapshot of the child's identity at the time the report was filed.
 * Stored on the report so historical reports remain readable even if the
 * underlying child record is later edited.
 */
export interface Phase0ChildSnapshot {
  displayName: string;
  dateOfBirth: string;
}

/**
 * One developmental milestone report, captured each term by the
 * teacher.
 */
export interface Phase0DevelopmentReport {
  id: string;
  /** The parent-side child id (the child's lifetime id). */
  parentChildId: string;
  /** The institution where the report was captured. */
  institutionId: string;
  /** Display name for the institution at the time of capture. */
  institutionName: string;
  /** Programme label this report applies to (e.g. "Preschool"). */
  programLabel: string | null;
  /** Frozen template reference. */
  templateId: string;
  templateVersion: number;
  /** Term label as it appears on the printed report (e.g. "Term 4 2025"). */
  termLabel: string;
  /** 1–4 within `termYear`, used to sort. */
  termSequence: number;
  termYear: number;
  childSnapshot: Phase0ChildSnapshot;
  /** Map keyed by `Phase0VitalField.id`; values are stringly-typed so that
   *  decimal/text variants share the same shape. */
  vitals: Record<string, string>;
  teacherName: string;
  principalName: string | null;
  /** Map keyed by `Phase0MilestoneSection.id`. */
  responses: Record<string, Phase0SectionResponse>;
  closingComment: string;
  status: Phase0DevelopmentReportStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  publishedById: string | null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Request / response shapes for `/api/development-reports`                   */
/* ────────────────────────────────────────────────────────────────────────── */

export interface Phase0CreateDevelopmentReportRequest {
  parentChildId: string;
  institutionId: string;
  programLabel: string | null;
  templateId: string;
  templateVersion: number;
  termLabel: string;
  termSequence: number;
  termYear: number;
  vitals: Record<string, string>;
  teacherName: string;
  principalName: string | null;
  responses: Record<string, Phase0SectionResponse>;
  closingComment: string;
}

export interface Phase0UpdateDevelopmentReportRequest {
  programLabel?: string | null;
  termLabel?: string;
  termSequence?: number;
  termYear?: number;
  vitals?: Record<string, string>;
  teacherName?: string;
  principalName?: string | null;
  responses?: Record<string, Phase0SectionResponse>;
  closingComment?: string;
}

export interface Phase0PublishDevelopmentReportRequest {
  publishedById: string;
}

export interface Phase0ListDevelopmentReportsQuery {
  /** Filter to a single child. */
  parentChildId?: string;
  /** Filter to a single institution. */
  institutionId?: string;
  /** Filter by status — defaults to all statuses. */
  status?: Phase0DevelopmentReportStatus;
}
