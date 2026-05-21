import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import type {
  Phase0DevelopmentReport,
  Phase0MilestoneItemState,
  Phase0MilestoneTemplate,
  Phase0SectionResponse,
} from '@wayel/shared/core/contracts/development-reports.phase0';
import { ConfirmDialogService } from '@wayel/shared/services/confirm-dialog.service';
import { DevelopmentReportsBridgeService } from '@wayel/shared/services/development-reports-bridge.service';
import { normalizeDevelopmentInstitutionId } from '@wayel/shared/core/mock/mock-development-reports';
import { ToastService } from '@wayel/shared/services/toast.service';

interface DevelopmentDraft {
  templateId: string;
  templateVersion: number;
  termLabel: string;
  termSequence: number;
  termYear: number;
  programLabel: string;
  teacherName: string;
  principalName: string;
  vitals: Record<string, string>;
  responses: Record<string, Phase0SectionResponse>;
  closingComment: string;
}

const TERM_OPTIONS: ReadonlyArray<{ sequence: number; label: string }> = [
  { sequence: 1, label: 'Term 1' },
  { sequence: 2, label: 'Term 2' },
  { sequence: 3, label: 'Term 3' },
  { sequence: 4, label: 'Term 4' },
];

/**
 * Staff-facing development reports section embedded in the workspace
 * child detail view. Lists reports for one child and lets the operator
 * create / edit / publish / unpublish / delete them.
 *
 * The form is **template-driven** — choosing a template auto-populates
 * the section/group/item structure. Item responses use the tri-state
 * scale (`achieved` / `working_on` / `not_yet`) regardless of whether
 * the template declares `'binary'` or `'tri_state'`; binary templates
 * simply hide the middle option.
 */
@Component({
  selector: 'app-workspace-development-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule],
  template: `
    @if (editingReportId() != null || creating()) {
      <button type="button" class="link-back inline-back" (click)="cancelEditor()">
        ← Development reports
      </button>

      <section class="card">
        <header class="card-head">
          <span class="material-icons-outlined" aria-hidden="true">school</span>
          <h3 class="card-title">
            {{ editingReportId() ? 'Edit term report' : 'New term report' }}
          </h3>
          @if (editingStatus(); as status) {
            <span class="pill status" [attr.data-status]="status">{{ status }}</span>
          }
        </header>

        <form
          class="dev-form"
          (submit)="$event.preventDefault(); saveDraft()"
        >
          <div class="form-grid">
            <label class="form-field">
              <span class="form-label">Template</span>
              <select
                name="template"
                [ngModel]="draft.templateId"
                (ngModelChange)="onTemplateChange($event)"
                [disabled]="!!editingReportId()"
              >
                @for (t of templates(); track t.id) {
                  <option [value]="t.id">
                    {{ t.authority }} · {{ t.ageBand.label }}
                  </option>
                }
              </select>
              @if (currentTemplate(); as tpl) {
                <small class="form-hint">
                  v{{ tpl.version }} · effective {{ tpl.effectiveFrom | date: 'd MMM yyyy' }}
                </small>
              }
            </label>

            <label class="form-field">
              <span class="form-label">Term</span>
              <select name="termSequence" [(ngModel)]="draft.termSequence" (ngModelChange)="syncTermLabel()">
                @for (opt of TERM_OPTIONS; track opt.sequence) {
                  <option [value]="opt.sequence">{{ opt.label }}</option>
                }
              </select>
            </label>

            <label class="form-field">
              <span class="form-label">Year</span>
              <input
                type="number"
                name="termYear"
                min="2000"
                max="2100"
                [(ngModel)]="draft.termYear"
                (ngModelChange)="syncTermLabel()"
                required
              />
            </label>

            <label class="form-field">
              <span class="form-label">Programme</span>
              <input
                type="text"
                name="programLabel"
                placeholder="Preschool / Aftercare …"
                [(ngModel)]="draft.programLabel"
              />
            </label>

            <label class="form-field">
              <span class="form-label">Teacher</span>
              <input
                type="text"
                name="teacherName"
                [(ngModel)]="draft.teacherName"
                required
              />
            </label>

            <label class="form-field">
              <span class="form-label">Principal</span>
              <input
                type="text"
                name="principalName"
                [(ngModel)]="draft.principalName"
              />
            </label>
          </div>

          @if (currentTemplate(); as tpl) {
            @if (tpl.vitals.length > 0) {
              <fieldset class="vitals">
                <legend>Vitals</legend>
                <div class="form-grid vitals-grid">
                  @for (v of tpl.vitals; track v.id) {
                    <label class="form-field">
                      <span class="form-label">{{ v.label }} ({{ v.unit }})</span>
                      <input
                        type="text"
                        [inputMode]="v.inputMode"
                        [name]="'vital_' + v.id"
                        [ngModel]="draft.vitals[v.id] || ''"
                        (ngModelChange)="setVital(v.id, $event)"
                      />
                    </label>
                  }
                </div>
              </fieldset>
            }

            @for (section of tpl.sections; track section.id) {
              <fieldset class="dev-section-fs">
                <legend>
                  <span class="material-icons-outlined" aria-hidden="true">
                    {{ section.icon || 'flag' }}
                  </span>
                  {{ section.label }}
                </legend>

                @if (section.intro) {
                  <p class="form-hint">{{ section.intro }}</p>
                }

                @for (group of section.groups; track group.id) {
                  <div class="dev-group">
                    <h6 class="dev-group-h">{{ group.label }}</h6>
                    <ul class="dev-items" role="list">
                      @for (item of group.items; track item.id) {
                        <li class="dev-item">
                          <div class="dev-item-body">
                            <div class="dev-item-label">{{ item.label }}</div>
                            @if (item.hint) {
                              <small class="dev-item-hint">{{ item.hint }}</small>
                            }
                          </div>
                          <div class="dev-item-states" role="radiogroup" [attr.aria-label]="item.label">
                            @for (s of stateOptions(tpl.responseType); track s) {
                              <button
                                type="button"
                                class="state-btn"
                                [attr.data-state]="s"
                                [class.is-active]="itemState(section.id, item.id) === s"
                                (click)="setItemState(section.id, item.id, s)"
                              >
                                <span class="material-icons-outlined" aria-hidden="true">
                                  {{ stateIcon(s) }}
                                </span>
                                {{ stateLabel(s) }}
                              </button>
                            }
                          </div>
                        </li>
                      }
                    </ul>
                  </div>
                }

                @if (section.comment.enabled) {
                  <label class="form-field">
                    <span class="form-label">{{ section.comment.label }}</span>
                    <textarea
                      rows="3"
                      [name]="'comment_' + section.id"
                      [ngModel]="sectionComment(section.id)"
                      (ngModelChange)="setSectionComment(section.id, $event)"
                    ></textarea>
                  </label>
                }
              </fieldset>
            }

            @if (tpl.closingComment.enabled) {
              <label class="form-field">
                <span class="form-label">{{ tpl.closingComment.label }}</span>
                <textarea
                  rows="3"
                  name="closingComment"
                  [(ngModel)]="draft.closingComment"
                ></textarea>
              </label>
            }
          }

          <footer class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancelEditor()">
              Cancel
            </button>
            <button type="submit" class="btn-secondary">
              <span class="material-icons-outlined" aria-hidden="true">save</span>
              Save draft
            </button>
            @if (editingReportId() && editingStatus() === 'draft') {
              <button type="button" class="btn-primary" (click)="saveAndPublish()">
                <span class="material-icons-outlined" aria-hidden="true">publish</span>
                Save & publish
              </button>
            } @else if (editingReportId() && editingStatus() === 'published') {
              <button type="button" class="btn-warn" (click)="unpublishCurrent()">
                <span class="material-icons-outlined" aria-hidden="true">unpublished</span>
                Unpublish
              </button>
            } @else {
              <button type="button" class="btn-primary" (click)="saveAndPublish()">
                <span class="material-icons-outlined" aria-hidden="true">publish</span>
                Save & publish
              </button>
            }
          </footer>
        </form>
      </section>
    } @else {
      <section class="card">
        <header class="card-head">
          <span class="material-icons-outlined" aria-hidden="true">school</span>
          <h3 class="card-title">Development reports</h3>
          <span class="head-count">{{ reports().length }} total</span>
          <button type="button" class="btn-primary" (click)="startNew()">
            <span class="material-icons-outlined" aria-hidden="true">add</span>
            New report
          </button>
        </header>

        @if (reports().length === 0) {
          <div class="empty-block">
            <span class="material-icons-outlined" aria-hidden="true">school</span>
            <p>No term reports yet.</p>
            <small>
              Create one to capture this term's developmental milestones.
            </small>
          </div>
        } @else {
          <ul class="report-list" role="list">
            @for (r of reports(); track r.id) {
              <li class="report-row">
                <div class="report-id">
                  <strong>{{ r.termLabel }}</strong>
                  <small>
                    @if (r.programLabel) { {{ r.programLabel }} · }
                    Teacher {{ r.teacherName }}
                  </small>
                </div>
                <div class="report-meta">
                  <span class="pill status" [attr.data-status]="r.status">
                    {{ r.status }}
                  </span>
                  <small class="report-updated">
                    Updated {{ r.updatedAt | date: 'd MMM yyyy' }}
                  </small>
                </div>
                <div class="report-actions">
                  <button
                    type="button"
                    class="btn-secondary"
                    (click)="edit(r)"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">edit</span>
                    Edit
                  </button>
                  @if (r.status === 'draft') {
                    <button
                      type="button"
                      class="btn-primary"
                      (click)="publish(r)"
                    >
                      <span class="material-icons-outlined" aria-hidden="true">publish</span>
                      Publish
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="btn-warn"
                      (click)="unpublish(r)"
                    >
                      <span class="material-icons-outlined" aria-hidden="true">unpublished</span>
                      Unpublish
                    </button>
                  }
                  <button
                    type="button"
                    class="btn-danger"
                    (click)="confirmDelete(r)"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">delete</span>
                    Delete
                  </button>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .link-back {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--sd-color-primary, #4f46e5) !important;
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
      align-self: flex-start;
    }
    .link-back:hover { text-decoration: underline !important; }

    .card {
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 14px;
      padding: 1rem 1.1rem;
    }
    .card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .card-title {
      margin: 0;
      flex: 1;
      font-size: 1rem;
      color: var(--sd-color-text);
    }
    .head-count {
      font-size: 12px;
      color: #6b7280;
      font-weight: 600;
    }

    .empty-block {
      text-align: center;
      padding: 24px 16px;
      color: #6b7280;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
    }
    .empty-block .material-icons-outlined { font-size: 28px; color: #9ca3af; }
    .empty-block p { margin: 0; font-weight: 600; }
    .empty-block small { font-size: 12px; }

    /* ── List ── */
    .report-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .report-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 12px;
      align-items: center;
      padding: 10px 12px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
      background: #fff;
    }
    .report-id strong { display: block; color: var(--sd-color-text); font-size: 14px; }
    .report-id small { display: block; margin-top: 2px; color: #6b7280; font-size: 12px; }
    .report-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .report-updated { color: #9ca3af; font-size: 11px; }
    .report-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

    .pill {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: capitalize;
    }
    .pill.status[data-status='draft'] { background: #fef3c7; color: #92400e; }
    .pill.status[data-status='published'] { background: #dcfce7; color: #166534; }

    /* ── Buttons (match the surrounding workspace) ── */
    .btn-primary, .btn-secondary, .btn-ghost, .btn-warn, .btn-danger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-primary {
      background: var(--sd-color-primary, #4f46e5);
      color: #fff;
    }
    .btn-primary:hover { background: #4338ca; }
    .btn-secondary {
      background: #fff;
      border-color: var(--surface-border, #e5e7eb);
      color: var(--sd-color-text);
    }
    .btn-secondary:hover { background: #f9fafb; }
    .btn-ghost {
      background: transparent;
      color: #6b7280;
      border-color: transparent;
    }
    .btn-ghost:hover { color: var(--sd-color-text); background: #f3f4f6; }
    .btn-warn {
      background: #fffbeb;
      color: #92400e;
      border-color: #fde68a;
    }
    .btn-warn:hover { background: #fef3c7; }
    .btn-danger {
      background: #fff;
      color: #b91c1c;
      border-color: #fecaca;
    }
    .btn-danger:hover { background: #fee2e2; }
    .btn-primary .material-icons-outlined,
    .btn-secondary .material-icons-outlined,
    .btn-warn .material-icons-outlined,
    .btn-danger .material-icons-outlined { font-size: 16px; }

    /* ── Form ── */
    .dev-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .vitals-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .form-label {
      font-size: 11.5px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .form-field input,
    .form-field select,
    .form-field textarea {
      width: 100%;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--surface-border, #d1d5db);
      background: #fff;
      font-size: 13.5px;
      color: var(--sd-color-text);
      font-family: inherit;
    }
    .form-field input:focus,
    .form-field select:focus,
    .form-field textarea:focus {
      outline: 2px solid var(--sd-color-primary, #4f46e5);
      outline-offset: -1px;
      border-color: transparent;
    }
    .form-hint {
      font-size: 11px;
      color: #6b7280;
      margin: 0;
    }

    .vitals, .dev-section-fs {
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #fafafa;
    }
    .vitals legend, .dev-section-fs legend {
      padding: 0 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--sd-color-text);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dev-section-fs legend .material-icons-outlined { font-size: 16px; color: #4f46e5; }

    .dev-group { display: flex; flex-direction: column; gap: 6px; }
    .dev-group-h {
      margin: 4px 0 0;
      font-size: 11.5px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .dev-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .dev-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 10px;
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 8px;
    }
    @media (min-width: 720px) {
      .dev-item {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
      }
    }
    .dev-item-body { min-width: 0; flex: 1; }
    .dev-item-label { font-size: 13px; color: var(--sd-color-text); line-height: 1.3; }
    .dev-item-hint { display: block; margin-top: 2px; font-size: 11px; color: #6b7280; font-style: italic; }
    .dev-item-states {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .state-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      color: #6b7280;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .state-btn .material-icons-outlined { font-size: 14px; }
    .state-btn:hover { background: #f3f4f6; }
    .state-btn[data-state='achieved'].is-active {
      background: #dcfce7; color: #166534; border-color: #86efac;
    }
    .state-btn[data-state='working_on'].is-active {
      background: #fef3c7; color: #92400e; border-color: #fcd34d;
    }
    .state-btn[data-state='not_yet'].is-active {
      background: #f3f4f6; color: #374151; border-color: #d1d5db;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
      padding-top: 8px;
      border-top: 1px solid var(--surface-border, #e5e7eb);
    }
  `,
})
export class WorkspaceDevelopmentSectionComponent {
  private readonly bridge = inject(DevelopmentReportsBridgeService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  /** Current institution. */
  @Input({ required: true }) institutionId!: string;

  /** Current parent-child id. */
  @Input({ required: true }) parentChildId!: string;

  /** The display name + DOB used to seed the child snapshot on create. */
  @Input({ required: true }) childDisplayName!: string;
  @Input({ required: true }) childDateOfBirth!: string;

  /** Display name for the institution (snapshot stored on each report). */
  @Input({ required: true }) institutionName!: string;

  /** Emit when a mutation should bubble up (e.g. to refresh counters). */
  @Output() readonly changed = new EventEmitter<void>();

  protected readonly TERM_OPTIONS = TERM_OPTIONS;

  /** Bump after every mutation so signals re-pull from the bridge. */
  private readonly version = signal(0);

  protected readonly templates = signal<Phase0MilestoneTemplate[]>([]);

  protected readonly reports = computed<Phase0DevelopmentReport[]>(() => {
    this.version();
    return this.cachedReports();
  });

  /** Local snapshot of the bridge result — set in `loadReports`. */
  private readonly cachedReports = signal<Phase0DevelopmentReport[]>([]);

  protected readonly editingReportId = signal<string | null>(null);
  protected readonly editingStatus = signal<'draft' | 'published' | null>(null);
  protected readonly creating = signal(false);

  protected readonly currentTemplate = computed<Phase0MilestoneTemplate | null>(() => {
    const id = this.draft.templateId;
    if (!id) return null;
    const all = this.templates();
    const matches = all.filter((t) => t.id === id);
    if (matches.length === 0) return null;
    if (this.draft.templateVersion) {
      return matches.find((t) => t.version === this.draft.templateVersion) ?? matches[0];
    }
    return matches.sort((a, b) => b.version - a.version)[0];
  });

  protected draft: DevelopmentDraft = blankDraft();

  ngOnInit(): void {
    this.bridge.listTemplates().subscribe({
      next: (rows) => this.templates.set(rows),
    });
    this.loadReports();
  }

  ngOnChanges(): void {
    this.cancelEditor();
    this.loadReports();
  }

  private loadReports(): void {
    if (!this.parentChildId) return;
    this.bridge.listForChild(this.parentChildId).subscribe({
      next: (rows) => {
        const wantInst = normalizeDevelopmentInstitutionId(this.institutionId);
        this.cachedReports.set(
          rows.filter(
            (r) => normalizeDevelopmentInstitutionId(r.institutionId) === wantInst,
          ),
        );
        this.version.update((n) => n + 1);
      },
    });
  }

  /* ── Editor lifecycle ─────────────────────────────────────────────── */

  protected startNew(): void {
    const today = new Date();
    const year = today.getUTCFullYear();
    const sequence = pickTermSequence(today.getUTCMonth() + 1);
    this.bridge.suggestTemplatesForChild(this.childDateOfBirth).subscribe({
      next: (suggested) => {
        const tpl = suggested[0] ?? this.templates()[0];
        if (!tpl) return;
        this.draft = {
          templateId: tpl.id,
          templateVersion: tpl.version,
          termLabel: `${TERM_OPTIONS[sequence - 1].label} ${year}`,
          termSequence: sequence,
          termYear: year,
          programLabel: '',
          teacherName: '',
          principalName: '',
          vitals: {},
          responses: blankResponses(tpl),
          closingComment: '',
        };
        this.editingReportId.set(null);
        this.editingStatus.set(null);
        this.creating.set(true);
      },
    });
  }

  protected edit(report: Phase0DevelopmentReport): void {
    this.draft = {
      templateId: report.templateId,
      templateVersion: report.templateVersion,
      termLabel: report.termLabel,
      termSequence: report.termSequence,
      termYear: report.termYear,
      programLabel: report.programLabel ?? '',
      teacherName: report.teacherName,
      principalName: report.principalName ?? '',
      vitals: { ...report.vitals },
      responses: cloneResponses(report.responses),
      closingComment: report.closingComment,
    };
    this.editingReportId.set(report.id);
    this.editingStatus.set(report.status);
    this.creating.set(false);
  }

  protected cancelEditor(): void {
    this.editingReportId.set(null);
    this.editingStatus.set(null);
    this.creating.set(false);
    this.draft = blankDraft();
  }

  protected onTemplateChange(templateId: string): void {
    const tpl = this.templates().find((t) => t.id === templateId);
    if (!tpl) return;
    this.draft = {
      ...this.draft,
      templateId: tpl.id,
      templateVersion: tpl.version,
      vitals: {},
      responses: blankResponses(tpl),
    };
  }

  protected syncTermLabel(): void {
    const opt = TERM_OPTIONS.find((o) => o.sequence === Number(this.draft.termSequence));
    if (!opt) return;
    this.draft.termLabel = `${opt.label} ${this.draft.termYear}`;
  }

  /* ── Item state helpers ───────────────────────────────────────────── */

  protected stateOptions(
    response: Phase0MilestoneTemplate['responseType'],
  ): Phase0MilestoneItemState[] {
    return response === 'binary'
      ? ['achieved', 'not_yet']
      : ['achieved', 'working_on', 'not_yet'];
  }

  protected itemState(sectionId: string, itemId: string): Phase0MilestoneItemState {
    return this.draft.responses[sectionId]?.items[itemId]?.state ?? 'not_yet';
  }

  protected setItemState(
    sectionId: string,
    itemId: string,
    state: Phase0MilestoneItemState,
  ): void {
    const section = this.draft.responses[sectionId] ?? {
      items: {},
      comment: '',
    };
    section.items = {
      ...section.items,
      [itemId]: { state, note: section.items[itemId]?.note ?? null },
    };
    this.draft.responses = { ...this.draft.responses, [sectionId]: section };
  }

  protected sectionComment(sectionId: string): string {
    return this.draft.responses[sectionId]?.comment ?? '';
  }

  protected setSectionComment(sectionId: string, value: string): void {
    const section = this.draft.responses[sectionId] ?? {
      items: {},
      comment: '',
    };
    section.comment = value;
    this.draft.responses = { ...this.draft.responses, [sectionId]: section };
  }

  protected setVital(id: string, value: string): void {
    this.draft.vitals = { ...this.draft.vitals, [id]: value };
  }

  protected stateIcon(state: Phase0MilestoneItemState): string {
    switch (state) {
      case 'achieved':
        return 'check_circle';
      case 'working_on':
        return 'pending';
      case 'not_yet':
      default:
        return 'radio_button_unchecked';
    }
  }

  protected stateLabel(state: Phase0MilestoneItemState): string {
    switch (state) {
      case 'achieved':
        return 'Achieved';
      case 'working_on':
        return 'Working on';
      case 'not_yet':
      default:
        return 'Not yet';
    }
  }

  /* ── Save / publish / unpublish / delete ──────────────────────────── */

  protected saveDraft(publish = false): void {
    const id = this.editingReportId();
    if (id) {
      this.bridge
        .updateDraft(id, {
          termLabel: this.draft.termLabel,
          termSequence: this.draft.termSequence,
          termYear: this.draft.termYear,
          programLabel: this.draft.programLabel.trim() || null,
          teacherName: this.draft.teacherName.trim(),
          principalName: this.draft.principalName.trim() || null,
          vitals: { ...this.draft.vitals },
          responses: this.draft.responses,
          closingComment: this.draft.closingComment.trim(),
        })
        .subscribe({
          next: () => {
            if (publish) {
              this.bridge.publish(id, 'admin@platform.local').subscribe({
                next: () => this.afterMutation(),
              });
            } else {
              this.afterMutation();
            }
          },
        });
      return;
    }
    this.bridge
      .createDraft({
        parentChildId: this.parentChildId,
        institutionId: this.institutionId,
        institutionName: this.institutionName,
        programLabel: this.draft.programLabel.trim() || null,
        templateId: this.draft.templateId,
        templateVersion: this.draft.templateVersion,
        termLabel: this.draft.termLabel,
        termSequence: this.draft.termSequence,
        termYear: this.draft.termYear,
        childSnapshot: {
          displayName: this.childDisplayName,
          dateOfBirth: this.childDateOfBirth,
        },
        vitals: { ...this.draft.vitals },
        teacherName: this.draft.teacherName.trim(),
        principalName: this.draft.principalName.trim() || null,
        responses: this.draft.responses,
        closingComment: this.draft.closingComment.trim(),
      })
      .subscribe({
        next: (created) => {
          if (publish) {
            this.bridge.publish(created.id, 'admin@platform.local').subscribe({
              next: () => this.afterMutation(),
            });
          } else {
            this.afterMutation();
          }
        },
      });
  }

  protected saveAndPublish(): void {
    this.saveDraft(true);
  }

  protected unpublishCurrent(): void {
    const id = this.editingReportId();
    if (!id) return;
    this.bridge.unpublish(id).subscribe({
      next: () => this.afterMutation(),
    });
  }

  protected publish(report: Phase0DevelopmentReport): void {
    this.bridge.publish(report.id, 'admin@platform.local').subscribe({
      next: () => this.refresh(),
    });
  }

  protected unpublish(report: Phase0DevelopmentReport): void {
    this.bridge.unpublish(report.id).subscribe({
      next: () => this.refresh(),
    });
  }

  protected confirmDelete(report: Phase0DevelopmentReport): void {
    this.confirm
      .ask({
        title: `Delete the ${report.termLabel} development report?`,
        message: 'This cannot be undone — the report and any responses will be removed.',
        confirmLabel: 'Delete report',
        cancelLabel: 'Keep it',
        kind: 'danger',
      })
      .subscribe((res) => {
        if (!res.confirmed) return;
        this.bridge.delete(report.id).subscribe({
          next: () => {
            this.refresh();
            this.toasts.success(`${report.termLabel} report deleted.`);
          },
        });
      });
  }

  private afterMutation(): void {
    this.cancelEditor();
    this.refresh();
  }

  private refresh(): void {
    this.loadReports();
    this.changed.emit();
  }
}

function blankDraft(): DevelopmentDraft {
  return {
    templateId: '',
    templateVersion: 0,
    termLabel: '',
    termSequence: 1,
    termYear: new Date().getUTCFullYear(),
    programLabel: '',
    teacherName: '',
    principalName: '',
    vitals: {},
    responses: {},
    closingComment: '',
  };
}

function blankResponses(
  template: Phase0MilestoneTemplate,
): Record<string, Phase0SectionResponse> {
  const out: Record<string, Phase0SectionResponse> = {};
  for (const section of template.sections) {
    const items: Phase0SectionResponse['items'] = {};
    for (const group of section.groups) {
      for (const item of group.items) {
        items[item.id] = { state: 'not_yet', note: null };
      }
    }
    out[section.id] = { items, comment: '' };
  }
  return out;
}

function cloneResponses(
  responses: Record<string, Phase0SectionResponse>,
): Record<string, Phase0SectionResponse> {
  const out: Record<string, Phase0SectionResponse> = {};
  for (const [k, v] of Object.entries(responses)) {
    out[k] = {
      comment: v.comment,
      items: Object.fromEntries(
        Object.entries(v.items).map(([id, resp]) => [
          id,
          { state: resp.state, note: resp.note ?? null },
        ]),
      ),
    };
  }
  return out;
}

/** Best-guess term sequence (1–4) for a calendar month. */
function pickTermSequence(month: number): number {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}
