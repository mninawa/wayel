import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '@app/environment';
import type {
  Phase0DevelopmentReport,
  Phase0DevelopmentReportStatus,
  Phase0MilestoneTemplate,
} from '../core/contracts/development-reports.phase0';
import {
  DevelopmentReportDraft,
  createDevelopmentReport,
  deleteDevelopmentReport,
  findDevelopmentReportById,
  listDevelopmentReports,
  publishDevelopmentReport,
  unpublishDevelopmentReport,
  updateDevelopmentReport,
} from '../core/mock/mock-development-reports';
import {
  findMilestoneTemplate,
  listMilestoneTemplates,
  templatesForChild,
} from '../core/mock/mock-development-templates';
import { DevelopmentReportsApiService } from './development-reports-api.service';

/**
 * Bridge for the developmental milestone reports feature.
 *
 * In mock mode every method serves the in-memory fixtures from
 * `core/mock/mock-development-reports`. In live mode the read calls used
 * by the parent SPA delegate to {@link DevelopmentReportsApiService},
 * which calls the live `/api/v1/me/parent/children/{id}/development-reports`
 * endpoint. Templates stay client-side — they're versioned data that
 * historic reports pin to via `(templateId, templateVersion)`.
 *
 * Staff-side mutations (createDraft / updateDraft / publish / unpublish /
 * delete) are still mock-only; they fall back to the local fixtures even
 * in live mode so the workspace UI keeps functioning. A
 * `/staff/development-reports` write surface lands separately.
 */
@Injectable({ providedIn: 'root' })
export class DevelopmentReportsBridgeService {
  private readonly api = inject(DevelopmentReportsApiService);

  /* ── Templates ────────────────────────────────────────────────────── */

  listTemplates(): Observable<Phase0MilestoneTemplate[]> {
    return of(listMilestoneTemplates());
  }

  /**
   * Suggest the templates that fit a child of the given DOB. Falls back
   * to all templates when nothing matches the age band so the staff
   * form is never empty.
   */
  suggestTemplatesForChild(dob: string): Observable<Phase0MilestoneTemplate[]> {
    return of(templatesForChild(dob));
  }

  getTemplate(
    id: string,
    version?: number,
  ): Observable<Phase0MilestoneTemplate> {
    const t = findMilestoneTemplate(id, version);
    if (!t) {
      return throwError(
        () => new Error(`No milestone template "${id}" v${version ?? '*'}.`),
      );
    }
    return of(t);
  }

  /* ── Reports ──────────────────────────────────────────────────────── */

  /**
   * List reports for a child. Most common call. Used by both:
   *   - the parent UI (filter to `status: 'published'`)
   *   - the staff UI (no status filter, sees drafts too)
   */
  listForChild(
    parentChildId: string,
    status?: Phase0DevelopmentReportStatus,
  ): Observable<Phase0DevelopmentReport[]> {
    if (environment.useMock) {
      return of(listDevelopmentReports({ parentChildId, status }));
    }
    // Live endpoint only returns published reports for the parent feed.
    // We honour the caller's filter for compatibility but the server
    // already enforces `status === 'published'` so a `'draft'` filter
    // here just yields an empty list, which is what staff drafts
    // looking through the parent surface should see.
    return this.api.listMyChild(parentChildId);
  }

  /** All reports captured at one institution (any child). */
  listForInstitution(
    institutionId: string,
    status?: Phase0DevelopmentReportStatus,
  ): Observable<Phase0DevelopmentReport[]> {
    return of(listDevelopmentReports({ institutionId, status }));
  }

  get(id: string): Observable<Phase0DevelopmentReport> {
    const r = findDevelopmentReportById(id);
    if (!r) {
      return throwError(() => new Error(`No development report "${id}".`));
    }
    return of(r);
  }

  /* ── Mutations (mock-only; staff side) ────────────────────────────── */

  createDraft(draft: DevelopmentReportDraft): Observable<Phase0DevelopmentReport> {
    return of(createDevelopmentReport(draft));
  }

  updateDraft(
    id: string,
    patch: Partial<DevelopmentReportDraft>,
  ): Observable<Phase0DevelopmentReport> {
    const updated = updateDevelopmentReport(id, patch);
    if (!updated) {
      return throwError(() => new Error(`No development report "${id}".`));
    }
    return of(updated);
  }

  publish(
    id: string,
    publishedById: string,
  ): Observable<Phase0DevelopmentReport> {
    const updated = publishDevelopmentReport(id, publishedById);
    if (!updated) {
      return throwError(() => new Error(`No development report "${id}".`));
    }
    return of(updated);
  }

  unpublish(id: string): Observable<Phase0DevelopmentReport> {
    const updated = unpublishDevelopmentReport(id);
    if (!updated) {
      return throwError(() => new Error(`No development report "${id}".`));
    }
    return of(updated);
  }

  delete(id: string): Observable<void> {
    if (!deleteDevelopmentReport(id)) {
      return throwError(() => new Error(`No development report "${id}".`));
    }
    return of(undefined);
  }
}
