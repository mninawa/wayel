import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
  type SimpleChanges,
} from '@angular/core';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import {
  WayelChildDocumentsService,
  type WayelChildDocument,
} from '../services/wayel-child-documents.service';
import { LookupsService, type LookupOption } from '../services/lookups.service';
import { ToastService } from '../services/toast.service';
import { ConfirmDialogService } from '../services/confirm-dialog.service';

/**
 * Surface the panel is rendering for. Drives:
 * - which API route the service hits ("parent" → `/me/parent/...`,
 *   "staff" → `/children/...?tenantId=...`),
 * - the uploader chip wording (Parent surface says **You · Parent**
 *   for own uploads, **{InstitutionName} · Staff** for institution
 *   uploads; Staff surface says **Your team · Staff** for own-tenant
 *   uploads, **{ParentDisplayName} · Parent** for parent uploads),
 * - which trash icons are enabled (parent: any row; staff: only
 *   own-tenant uploads).
 */
export type ChildDocumentsPanelMode = 'parent' | 'staff';

/**
 * Synthetic filter token surfaced by the chip strip when the user
 * wants to see every uncategorised row in one place. Documents
 * uploaded before the category dropdown shipped (or anyone who
 * leaves the dropdown blank on upload) collapse onto this bucket.
 */
const UNCATEGORISED = '__uncategorised__';

/** 25 MB — mirrors `MediaStorageOptions.Scopes["documents"].MaxBytes`. */
const DOCUMENTS_MAX_BYTES = 25 * 1024 * 1024;

/** Chips beyond this index collapse behind a "+N" affordance per row. */
const TAG_PILLS_PER_ROW = 4;

/** Per the aggregate's `ChildDocument.MaxTags` constant. */
const MAX_TAGS_PER_DOC = 16;

/** Per the aggregate's `ChildDocument.MaxTagLength` constant. */
const MAX_TAG_LENGTH = 32;

/**
 * Two-way document vault for one child. Used by both the parent SPA
 * (`parent-child-detail.component.ts`) and the staff workspace
 * (`workspace-child-detail.component.ts`) so the row UI, upload
 * affordance and delete confirmation behave identically on either
 * side.
 *
 * <para>
 * The panel keeps its own loading / error / list signals — callers
 * only have to wire the inputs and forward `(loaded)` if they need
 * the row count for a tab badge.
 * </para>
 */
@Component({
  selector: 'nk-child-documents-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="docs-panel">
      <p class="docs-blurb">
        Documents are shared with every institution your child is currently
        enrolled at. Staff at those institutions can also upload documents
        here.
      </p>

      <header class="docs-head">
        <div class="docs-meta">
          <strong>{{ documents().length }}</strong>
          document{{ documents().length === 1 ? '' : 's' }}
          @if (loading()) {
            <span class="muted"> · loading…</span>
          }
        </div>

        <div class="upload-row">
          <button
            type="button"
            class="btn-primary"
            (click)="openDrawer()"
            [disabled]="!hasOwner()"
          >
            <span class="material-icons-outlined" aria-hidden="true">add</span>
            Upload document
          </button>
        </div>
      </header>

      @if (loadError(); as err) {
        <div class="inline-error" role="alert">
          <span class="material-icons-outlined" aria-hidden="true">error_outline</span>
          <span>{{ err }}</span>
          <button type="button" class="dismiss" (click)="refresh()">
            Retry
          </button>
        </div>
      }

      @if (filterChips().length > 0 || activeTagFilter()) {
        <nav class="filter-strip" aria-label="Filter documents by category">
          @for (chip of filterChips(); track chip.value) {
            <button
              type="button"
              class="filter-chip"
              [attr.data-category]="chip.value === ALL ? null : chip.value"
              [class.is-active]="activeFilter() === chip.value"
              (click)="setFilter(chip.value)"
            >
              {{ chip.label }}
              <span class="filter-chip-count">{{ chip.count }}</span>
            </button>
          }
          @if (activeTagFilter()) {
            <button
              type="button"
              class="filter-chip is-active tag-filter"
              (click)="clearTagFilter()"
              title="Clear tag filter"
            >
              <span class="material-icons-outlined" aria-hidden="true">tag</span>
              {{ activeTagFilter() }}
              <span class="material-icons-outlined" aria-hidden="true">close</span>
            </button>
          }
        </nav>
      }

      @if (visibleDocuments().length === 0 && !loading() && !loadError()) {
        @if (documents().length === 0) {
          <div class="empty-card">
            <span class="material-icons-outlined" aria-hidden="true">description</span>
            <p>No documents yet.</p>
            <small>
              Upload PDFs, scanned images and Office files — clinic letters,
              signed permission slips, immunisation records, ID copies. The file
              is shared with the parent and every active institution.
            </small>
            <small class="empty-tip">
              Tip: pick a category and a few tags when you upload to keep things tidy.
            </small>
          </div>
        } @else {
          <div class="empty-card">
            <span class="material-icons-outlined" aria-hidden="true">filter_list_off</span>
            <p>No documents match the current filters.</p>
            <small>Pick a different chip or clear the tag to widen the view.</small>
          </div>
        }
      } @else {
        <ul class="doc-list" role="list">
          @for (d of visibleDocuments(); track d.id) {
            <li class="doc-row" [attr.data-uploader]="d.uploaderRole">
              <div class="doc-icon" aria-hidden="true">
                <span class="material-icons-outlined">{{ iconFor(d) }}</span>
              </div>
              <div class="doc-body">
                <div class="doc-title-line">
                  <a class="doc-name" [href]="d.mediaUrl" target="_blank" rel="noopener">
                    {{ d.title || d.fileName }}
                  </a>
                  @if (d.categoryCode) {
                    <span class="cat-chip" [attr.data-category]="d.categoryCode">
                      <span class="material-icons-outlined cat-icon" aria-hidden="true">label</span>
                      <strong>{{ d.categoryCode }}</strong>
                      @if (d.categoryName) {
                        <span class="cat-sep">·</span>
                        <span class="cat-name">{{ d.categoryName }}</span>
                      }
                    </span>
                  }
                  @if (d.isConfidential) {
                    <span
                      class="confidential-chip"
                      title="Marked confidential"
                      aria-label="Confidential document"
                    >
                      <span class="material-icons-outlined" aria-hidden="true">lock</span>
                      Confidential
                    </span>
                  }
                </div>
                @if (d.description) {
                  <p class="doc-description" [title]="d.description">{{ d.description }}</p>
                }
                <div class="doc-meta">
                  <span class="uploader-chip" [attr.data-role]="chipRole(d)">
                    <span class="material-icons-outlined chip-icon" aria-hidden="true">
                      {{ chipRole(d) === 'parent' ? 'person' : 'apartment' }}
                    </span>
                    {{ uploaderLabel(d) }}
                  </span>
                  <span class="dot">·</span>
                  <span class="meta-stamp">
                    {{ d.uploadedOnUtc | date: 'd MMM yyyy, HH:mm' }}
                  </span>
                  @if (d.sizeBytes) {
                    <span class="dot">·</span>
                    <span class="meta-size">{{ formatSize(d.sizeBytes) }}</span>
                  }
                </div>
                @if (d.tags && d.tags.length > 0) {
                  <div class="tag-row">
                    @for (t of visibleTags(d); track t) {
                      <button
                        type="button"
                        class="tag-pill"
                        [class.is-active]="activeTagFilter() === t"
                        (click)="setTagFilter(t)"
                        [title]="'Filter by tag: ' + t"
                      >
                        #{{ t }}
                      </button>
                    }
                    @if (d.tags.length > TAG_PILLS_PER_ROW) {
                      <span class="tag-more" [title]="d.tags.slice(TAG_PILLS_PER_ROW).join(', ')">
                        +{{ d.tags.length - TAG_PILLS_PER_ROW }} more
                      </span>
                    }
                  </div>
                }
                @if (d.notes) {
                  <p class="doc-notes">{{ d.notes }}</p>
                }
              </div>
              <div class="doc-actions">
                <a
                  class="row-btn"
                  [href]="d.mediaUrl"
                  target="_blank"
                  rel="noopener"
                  title="Download"
                >
                  <span class="material-icons-outlined" aria-hidden="true">download</span>
                </a>
                <button
                  type="button"
                  class="row-btn danger"
                  [disabled]="!canDelete(d) || deletingId() === d.id"
                  [title]="canDelete(d) ? 'Delete document' : 'Only the uploader can delete this document'"
                  (click)="confirmDelete(d)"
                >
                  <span class="material-icons-outlined" aria-hidden="true">
                    {{ deletingId() === d.id ? 'hourglass_top' : 'delete' }}
                  </span>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </div>

    @if (drawerOpen()) {
      <div
        class="modal-backdrop"
        role="presentation"
        (click)="onBackdropClick()"
      ></div>
      <aside
        class="modal-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Upload a new document"
        (click)="$event.stopPropagation()"
      >
        <header class="drawer-head">
          <div>
            <p class="drawer-eyebrow">Upload</p>
            <h2>New document</h2>
            <p class="drawer-sub">
              Drop a PDF, scan or photo — it'll be shared with everyone who can see this child's vault.
            </p>
          </div>
          <button
            type="button"
            class="drawer-close"
            (click)="closeDrawer()"
            [disabled]="uploading()"
            aria-label="Close upload drawer"
          >
            <span class="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <form
          class="drawer-body"
          (submit)="$event.preventDefault(); submitUpload()"
          autocomplete="off"
        >
          @if (uploadError(); as err) {
            <div class="drawer-error" role="alert">
              <span class="material-icons-outlined" aria-hidden="true">error_outline</span>
              <span>{{ err }}</span>
            </div>
          }

          <fieldset class="field">
            <span class="lbl">Document Title <em aria-hidden="true">*</em></span>
            <input
              type="text"
              [value]="formTitle()"
              (input)="onTitleInput($event)"
              placeholder="e.g. Vaccination card"
              maxlength="200"
              required
              [disabled]="uploading()"
            />
          </fieldset>

          <fieldset class="field">
            <span class="lbl">Upload File <em aria-hidden="true">*</em></span>
            @if (formFile(); as file) {
              <div class="file-card">
                <div class="file-card-icon" aria-hidden="true">
                  <span class="material-icons-outlined">{{ iconForFile(file) }}</span>
                </div>
                <div class="file-card-body">
                  <div class="file-name">{{ file.name }}</div>
                  <div class="file-size">{{ formatSize(file.size) }}</div>
                </div>
                <button
                  type="button"
                  class="file-remove"
                  title="Remove file"
                  (click)="clearFile()"
                  [disabled]="uploading()"
                  aria-label="Remove selected file"
                >
                  <span class="material-icons-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            } @else {
              <label
                class="file-drop"
                [class.is-dragging]="isDragging()"
                (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)"
                (drop)="onDrop($event)"
              >
                <input
                  #filePicker
                  type="file"
                  hidden
                  [accept]="acceptHint"
                  (change)="onFilePicked($event)"
                />
                <span class="material-icons-outlined" aria-hidden="true">cloud_upload</span>
                <span class="file-drop-primary">
                  Drag &amp; drop a file here, or
                  <span class="file-drop-link">click to browse</span>
                </span>
                <span class="file-drop-hint">
                  PDF, images, Office docs · up to 25 MB
                </span>
              </label>
            }
          </fieldset>

          <fieldset class="field">
            <span class="lbl">Category <em aria-hidden="true">*</em></span>
            <select
              [value]="formCategory() ?? ''"
              (change)="onCategoryChange($event)"
              [disabled]="uploading() || categoriesLoading()"
              required
            >
              <option value="">Choose a category…</option>
              @for (opt of categoryOptions(); track opt.code) {
                <option [value]="opt.code">{{ opt.code }} · {{ opt.name }}</option>
              }
            </select>
            @if (showValidation() && !formCategory()) {
              <span class="field-error">Pick a category to continue.</span>
            }
          </fieldset>

          <fieldset class="field tags-field">
            <span class="lbl">Tags</span>
            @if (formTags().length > 0) {
              <div class="tag-pills-row">
                @for (t of formTags(); track t) {
                  <span class="tag-pill-selected">
                    #{{ t }}
                    <button
                      type="button"
                      class="tag-pill-remove"
                      (click)="removeTag(t)"
                      [disabled]="uploading()"
                      [attr.aria-label]="'Remove tag ' + t"
                    >
                      <span class="material-icons-outlined" aria-hidden="true">close</span>
                    </button>
                  </span>
                }
              </div>
            }
            <div
              class="tag-input-wrap"
              [class.is-open]="tagDropdownOpen()"
            >
              <input
                #tagInput
                type="text"
                class="tag-input"
                [value]="tagQuery()"
                (input)="onTagQueryInput($event)"
                (focus)="tagDropdownOpen.set(true)"
                (blur)="onTagInputBlur()"
                (keydown)="onTagKeydown($event)"
                placeholder="Type to filter or create…"
                [disabled]="uploading() || formTags().length >= MAX_TAGS_PER_DOC"
                [attr.maxlength]="MAX_TAG_LENGTH"
                autocomplete="off"
              />
              @if (tagDropdownOpen() && (tagSuggestions().length > 0 || canCreateTag())) {
                <ul class="tag-dropdown" role="listbox">
                  @for (s of tagSuggestions(); track s) {
                    <li>
                      <button
                        type="button"
                        class="tag-option"
                        (mousedown)="addTag(s); $event.preventDefault()"
                      >
                        <span class="material-icons-outlined" aria-hidden="true">tag</span>
                        {{ s }}
                      </button>
                    </li>
                  }
                  @if (canCreateTag()) {
                    <li>
                      <button
                        type="button"
                        class="tag-option tag-option-create"
                        (mousedown)="addTag(tagQuery()); $event.preventDefault()"
                      >
                        <span class="material-icons-outlined" aria-hidden="true">add</span>
                        Create new tag: "{{ tagQueryPreview() }}"
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>
            <small class="field-hint">
              Lower-cased, deduped automatically. Up to {{ MAX_TAGS_PER_DOC }} tags · {{ MAX_TAG_LENGTH }} chars each.
            </small>
          </fieldset>

          <fieldset class="field">
            <span class="lbl">Description</span>
            <textarea
              rows="4"
              [value]="formDescription()"
              (input)="onDescriptionInput($event)"
              placeholder="Add a description (optional)"
              maxlength="2000"
              [disabled]="uploading()"
            ></textarea>
          </fieldset>

          <fieldset class="field switch-field">
            <label class="switch">
              <input
                type="checkbox"
                [checked]="formConfidential()"
                (change)="onConfidentialChange($event)"
                [disabled]="uploading()"
              />
              <span class="switch-track" aria-hidden="true">
                <span class="switch-thumb"></span>
              </span>
              <span class="switch-label">
                <strong>Mark as Confidential</strong>
                <small>Adds a lock icon on the row. Useful for IDs, medical records and legal scans.</small>
              </span>
            </label>
          </fieldset>
        </form>

        <footer class="drawer-foot">
          <button
            type="button"
            class="btn-ghost"
            (click)="closeDrawer()"
            [disabled]="uploading()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary"
            (click)="submitUpload()"
            [disabled]="!canSubmit() || uploading()"
          >
            @if (uploading()) {
              <span class="material-icons-outlined" aria-hidden="true">hourglass_top</span>
              Uploading…
            } @else {
              <span class="material-icons-outlined" aria-hidden="true">upload_file</span>
              Upload Document
            }
          </button>
        </footer>
      </aside>
    }
  `,
  styles: `
    :host { display: block; }

    .docs-panel { display: flex; flex-direction: column; gap: 14px; }

    .docs-blurb {
      margin: 0;
      padding: 12px 14px;
      font-size: 13px;
      color: #475569;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }

    .docs-head {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .docs-meta { font-size: 13.5px; color: #1f2937; }
    .docs-meta strong { font-size: 16px; }
    .docs-meta .muted { color: #94a3b8; }

    .upload-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      flex-wrap: wrap;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      font-size: 13.5px;
      font-weight: 600;
      color: #fff;
      background: #2563eb;
      border: 1px solid #1d4ed8;
      border-radius: 8px;
      cursor: pointer;
    }
    .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-primary .material-icons-outlined { font-size: 18px; }

    .btn-ghost {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      font-size: 13.5px;
      font-weight: 600;
      color: #111827;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
    }
    .btn-ghost:hover:not(:disabled) { background: #f9fafb; }
    .btn-ghost:disabled { opacity: 0.55; cursor: not-allowed; }

    .inline-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      border-radius: 8px;
      font-size: 13px;
    }
    .inline-error .material-icons-outlined { font-size: 18px; }
    .inline-error .dismiss {
      margin-left: auto;
      padding: 2px 8px;
      font-size: 12px;
      background: transparent;
      border: 1px solid #fecaca;
      color: #b91c1c;
      border-radius: 6px;
      cursor: pointer;
    }
    .inline-error .dismiss:hover { background: #fee2e2; }

    .filter-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 4px 0;
    }
    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: #fff;
      border: 1px solid #d1d5db;
      color: #374151;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease;
    }
    .filter-chip:hover { background: #f3f4f6; }
    .filter-chip.is-active {
      background: #1d4ed8;
      border-color: #1d4ed8;
      color: #fff;
    }
    .filter-chip-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 18px;
      padding: 0 6px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(0, 0, 0, 0.06);
      color: inherit;
      border-radius: 999px;
    }
    .filter-chip.is-active .filter-chip-count {
      background: rgba(255, 255, 255, 0.22);
      color: #fff;
    }
    .filter-chip.tag-filter {
      background: #0f766e;
      border-color: #0f766e;
      color: #fff;
    }
    .filter-chip.tag-filter .material-icons-outlined { font-size: 14px; }

    .empty-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 30px 18px;
      color: #6b7280;
      text-align: center;
      background: #fff;
      border: 1px dashed #cbd5e1;
      border-radius: 14px;
    }
    .empty-card .material-icons-outlined { font-size: 32px; color: #94a3b8; }
    .empty-card p { margin: 0; font-weight: 600; color: #1f2937; }
    .empty-card small { max-width: 380px; font-size: 12.5px; line-height: 1.5; }
    .empty-card .empty-tip { color: #2563eb; font-weight: 600; }

    .doc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }

    .doc-row {
      display: grid;
      grid-template-columns: 36px 1fr auto;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 14px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
    }
    .doc-row[data-uploader='Staff'] { border-left: 3px solid #f59e0b; }
    .doc-row[data-uploader='SuperAdmin'] { border-left: 3px solid #7c3aed; }
    .doc-row[data-uploader='Parent'] { border-left: 3px solid #2563eb; }

    .doc-icon {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      background: #f1f5f9;
      border-radius: 8px;
      color: #475569;
    }
    .doc-icon .material-icons-outlined { font-size: 22px; }

    .doc-title-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .doc-name {
      font-weight: 600;
      color: #111827;
      text-decoration: none;
      font-size: 14px;
      word-break: break-word;
    }
    .doc-name:hover { color: #2563eb; text-decoration: underline; }

    .doc-description {
      margin: 4px 0 0;
      font-size: 12.5px;
      color: #64748b;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .doc-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 12px;
      color: #6b7280;
    }
    .doc-meta .dot { color: #cbd5e1; }
    .meta-stamp, .meta-size { font-variant-numeric: tabular-nums; }

    .uploader-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px 2px 6px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
    }
    .uploader-chip[data-role='parent'] {
      color: #1d4ed8;
      background: #dbeafe;
      border: 1px solid #bfdbfe;
    }
    .uploader-chip[data-role='staff'] {
      color: #92400e;
      background: #fef3c7;
      border: 1px solid #fde68a;
    }
    .chip-icon { font-size: 13px; }

    .cat-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px 2px 6px;
      border-radius: 999px;
      font-size: 11.5px;
      color: #1f2937;
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
    }
    .cat-chip strong { letter-spacing: 0.02em; font-weight: 700; }
    .cat-chip .cat-sep { color: rgba(15, 23, 42, 0.45); }
    .cat-chip .cat-name { font-weight: 500; }
    .cat-chip .cat-icon { font-size: 13px; opacity: 0.7; }

    .confidential-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px 2px 6px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      color: #991b1b;
      background: #fee2e2;
      border: 1px solid #fecaca;
    }
    .confidential-chip .material-icons-outlined { font-size: 13px; }

    /* Curated palette for the most-likely categories — every other
       code falls back to the neutral slate above so even unknown
       categories render legibly. */
    .cat-chip[data-category='IDENTITY']      { color:#3730a3; background:#e0e7ff; border-color:#c7d2fe; }
    .cat-chip[data-category='MEDICAL']       { color:#0f766e; background:#ccfbf1; border-color:#99f6e4; }
    .cat-chip[data-category='EDUCATION']     { color:#6d28d9; background:#ede9fe; border-color:#ddd6fe; }
    .cat-chip[data-category='FINANCIAL']     { color:#047857; background:#d1fae5; border-color:#a7f3d0; }
    .cat-chip[data-category='LEGAL']         { color:#334155; background:#e2e8f0; border-color:#cbd5e1; }
    .cat-chip[data-category='TAX']           { color:#9a3412; background:#ffedd5; border-color:#fed7aa; }
    .cat-chip[data-category='INSURANCE']     { color:#0e7490; background:#cffafe; border-color:#a5f3fc; }
    .cat-chip[data-category='EMPLOYMENT']    { color:#a16207; background:#fef9c3; border-color:#fef08a; }
    .cat-chip[data-category='PROPERTY']      { color:#7c2d12; background:#ffedd5; border-color:#fed7aa; }
    .cat-chip[data-category='VEHICLE']       { color:#1e40af; background:#dbeafe; border-color:#bfdbfe; }
    .cat-chip[data-category='BUSINESS']      { color:#5b21b6; background:#ede9fe; border-color:#ddd6fe; }
    .cat-chip[data-category='COMPLIANCE']    { color:#9d174d; background:#fce7f3; border-color:#fbcfe8; }
    .cat-chip[data-category='CERTIFICATE']   { color:#15803d; background:#dcfce7; border-color:#bbf7d0; }
    .cat-chip[data-category='CONTRACT']      { color:#7c3aed; background:#ede9fe; border-color:#ddd6fe; }
    .cat-chip[data-category='INVOICE']       { color:#b45309; background:#fef3c7; border-color:#fde68a; }
    .cat-chip[data-category='RECEIPT']       { color:#166534; background:#dcfce7; border-color:#bbf7d0; }
    .cat-chip[data-category='STATEMENT']     { color:#475569; background:#f1f5f9; border-color:#e2e8f0; }
    .cat-chip[data-category='REPORT']        { color:#6b21a8; background:#f3e8ff; border-color:#e9d5ff; }
    .cat-chip[data-category='POLICY']        { color:#1e293b; background:#e2e8f0; border-color:#cbd5e1; }
    .cat-chip[data-category='CORRESPONDENCE']{ color:#0c4a6e; background:#e0f2fe; border-color:#bae6fd; }
    .cat-chip[data-category='APPLICATION']   { color:#a21caf; background:#fae8ff; border-color:#f5d0fe; }
    .cat-chip[data-category='PROPOSAL']      { color:#9f1239; background:#ffe4e6; border-color:#fecdd3; }
    .cat-chip[data-category='PRESENTATION']  { color:#0369a1; background:#e0f2fe; border-color:#bae6fd; }
    .cat-chip[data-category='IMAGE']         { color:#4338ca; background:#e0e7ff; border-color:#c7d2fe; }
    .cat-chip[data-category='PERSONAL']      { color:#7e22ce; background:#f3e8ff; border-color:#e9d5ff; }
    .cat-chip[data-category='OTHER']         { color:#475569; background:#f1f5f9; border-color:#e2e8f0; }

    .filter-chip[data-category='IDENTITY'].is-active     { background:#3730a3; border-color:#3730a3; }
    .filter-chip[data-category='MEDICAL'].is-active      { background:#0f766e; border-color:#0f766e; }
    .filter-chip[data-category='EDUCATION'].is-active    { background:#6d28d9; border-color:#6d28d9; }
    .filter-chip[data-category='FINANCIAL'].is-active    { background:#047857; border-color:#047857; }
    .filter-chip[data-category='LEGAL'].is-active        { background:#334155; border-color:#334155; }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 6px;
      align-items: center;
      margin-top: 6px;
    }
    .tag-pill {
      appearance: none;
      display: inline-flex;
      align-items: center;
      padding: 1px 8px;
      font-size: 11px;
      font-weight: 500;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      cursor: pointer;
      font-family: inherit;
    }
    .tag-pill:hover { background: #e0e7ff; color: #1e3a8a; border-color: #c7d2fe; }
    .tag-pill.is-active { background: #0f766e; color: #fff; border-color: #0f766e; }
    .tag-more {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
    }

    .doc-notes {
      margin: 6px 0 0;
      font-size: 12.5px;
      color: #475569;
      line-height: 1.45;
    }

    .doc-actions { display: flex; gap: 4px; }

    .row-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      background: transparent;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      color: #475569;
      cursor: pointer;
      text-decoration: none;
    }
    .row-btn:hover { background: #f8fafc; color: #111827; }
    .row-btn.danger { color: #b91c1c; }
    .row-btn.danger:hover { background: #fef2f2; border-color: #fecaca; }
    .row-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .row-btn .material-icons-outlined { font-size: 18px; }

    /* ── Side drawer ─────────────────────────────────────────────── */

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      z-index: 999;
      animation: docDrawerFade 0.18s ease-out;
    }
    .modal-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(540px, 100vw);
      background: #fff;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      box-shadow: -16px 0 40px rgba(15, 23, 42, 0.18);
      animation: docDrawerSlide 0.22s ease-out;
    }
    @keyframes docDrawerFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes docDrawerSlide {
      from { transform: translateX(100%); }
      to   { transform: translateX(0); }
    }
    @media (max-width: 640px) {
      .modal-drawer { width: 100vw; }
    }

    .drawer-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 22px 14px;
      border-bottom: 1px solid #e5e7eb;
    }
    .drawer-head h2 { margin: 4px 0 2px; font-size: 18px; color: #111827; }
    .drawer-eyebrow {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #2563eb;
    }
    .drawer-sub { margin: 0; font-size: 13px; color: #6b7280; }
    .drawer-close {
      appearance: none;
      background: transparent;
      border: 0;
      color: #6b7280;
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
    }
    .drawer-close:hover:not(:disabled) { background: #f3f4f6; }
    .drawer-close:disabled { opacity: 0.5; cursor: not-allowed; }

    .drawer-body {
      padding: 18px 22px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .drawer-error {
      display: flex;
      gap: 8px;
      align-items: center;
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
    }
    .drawer-error .material-icons-outlined { font-size: 18px; }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: #6b7280;
      border: 0;
      padding: 0;
      margin: 0;
    }
    .field .lbl {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
    }
    .field .lbl em {
      color: #ef4444;
      font-style: normal;
      margin-left: 2px;
    }
    .field input, .field select, .field textarea {
      padding: 9px 11px;
      border: 1px solid #e5e7eb;
      border-radius: 9px;
      font: inherit;
      color: #111827;
      background: #fff;
    }
    .field textarea { resize: vertical; min-height: 88px; }
    .field input:focus, .field select:focus, .field textarea:focus {
      outline: 2px solid rgba(37, 99, 235, 0.3);
      border-color: #2563eb;
    }
    .field-error {
      font-size: 12px;
      color: #b91c1c;
      font-weight: 500;
    }
    .field-hint {
      font-size: 11.5px;
      color: #94a3b8;
    }

    .file-drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 24px 16px;
      border: 1.5px dashed #cbd5e1;
      border-radius: 12px;
      background: #f9fafb;
      cursor: pointer;
      text-align: center;
      transition: border-color 0.12s ease, background 0.12s ease;
    }
    .file-drop:hover, .file-drop.is-dragging {
      border-color: #2563eb;
      background: #eff6ff;
    }
    .file-drop .material-icons-outlined { font-size: 28px; color: #2563eb; }
    .file-drop-primary { font-size: 13.5px; color: #1f2937; }
    .file-drop-link { color: #2563eb; font-weight: 600; text-decoration: underline; }
    .file-drop-hint { font-size: 11.5px; color: #6b7280; }

    .file-card {
      display: grid;
      grid-template-columns: 32px 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      background: #fff;
    }
    .file-card-icon {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      background: #f1f5f9;
      border-radius: 8px;
      color: #475569;
    }
    .file-card-icon .material-icons-outlined { font-size: 20px; }
    .file-name { font-weight: 600; color: #111827; font-size: 13.5px; word-break: break-word; }
    .file-size { font-size: 12px; color: #6b7280; }
    .file-remove {
      appearance: none;
      background: transparent;
      border: 0;
      color: #6b7280;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
    }
    .file-remove:hover:not(:disabled) { background: #f3f4f6; color: #111827; }

    .tags-field { gap: 8px; }
    .tag-pills-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag-pill-selected {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 4px 3px 10px;
      background: #ecfeff;
      color: #155e75;
      border: 1px solid #a5f3fc;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .tag-pill-remove {
      appearance: none;
      background: transparent;
      border: 0;
      color: inherit;
      cursor: pointer;
      padding: 0;
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }
    .tag-pill-remove:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
    .tag-pill-remove .material-icons-outlined { font-size: 14px; }

    .tag-input-wrap {
      position: relative;
    }
    .tag-input {
      width: 100%;
      padding: 9px 11px;
      border: 1px solid #e5e7eb;
      border-radius: 9px;
      font: inherit;
      color: #111827;
      background: #fff;
    }
    .tag-input:focus {
      outline: 2px solid rgba(37, 99, 235, 0.3);
      border-color: #2563eb;
    }
    .tag-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      list-style: none;
      margin: 0;
      padding: 4px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      z-index: 1100;
      max-height: 220px;
      overflow-y: auto;
    }
    .tag-option {
      width: 100%;
      appearance: none;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      background: transparent;
      border: 0;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
      color: #1f2937;
      font: inherit;
      font-size: 13px;
    }
    .tag-option:hover { background: #f3f4f6; }
    .tag-option .material-icons-outlined { font-size: 16px; color: #6b7280; }
    .tag-option-create { color: #2563eb; font-weight: 600; }
    .tag-option-create .material-icons-outlined { color: #2563eb; }

    .switch-field { padding: 4px 0 0; }
    .switch {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: pointer;
    }
    .switch input[type='checkbox'] {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .switch-track {
      flex: 0 0 auto;
      width: 38px;
      height: 22px;
      border-radius: 999px;
      background: #d1d5db;
      position: relative;
      transition: background 0.15s ease;
      margin-top: 2px;
    }
    .switch-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
      transition: transform 0.15s ease;
    }
    .switch input:checked + .switch-track { background: #2563eb; }
    .switch input:checked + .switch-track .switch-thumb { transform: translateX(16px); }
    .switch-label {
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: #1f2937;
      font-size: 13.5px;
    }
    .switch-label strong { font-weight: 600; }
    .switch-label small { color: #6b7280; font-size: 12px; }

    .drawer-foot {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 22px;
      border-top: 1px solid #e5e7eb;
      background: #fff;
    }
  `,
})
export class ChildDocumentsPanelComponent implements OnChanges, OnInit, OnDestroy {
  private readonly service = inject(WayelChildDocumentsService);
  private readonly lookups = inject(LookupsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  /** Sentinel filter token meaning "show every document". */
  protected readonly ALL = '__all__';
  protected readonly TAG_PILLS_PER_ROW = TAG_PILLS_PER_ROW;
  protected readonly MAX_TAGS_PER_DOC = MAX_TAGS_PER_DOC;
  protected readonly MAX_TAG_LENGTH = MAX_TAG_LENGTH;

  private readonly destroyed = new Subject<void>();

  /**
   * Which surface this panel is rendering on. Drives the API route +
   * delete permission checks. Required.
   */
  @Input({ required: true }) mode!: ChildDocumentsPanelMode;

  /**
   * The parent's `ParentChildId` (mode === 'parent') or the
   * institution's `InstitutionChildId` (mode === 'staff'). Required —
   * the panel re-fetches whenever this input changes.
   */
  @Input({ required: true }) ownerId = '';

  /**
   * Tenant id for the staff route. Ignored in parent mode. Optional;
   * the API uses the caller's own tenant when omitted, and rejects
   * non-SuperAdmin overrides.
   */
  @Input() tenantId: string | null = null;

  /**
   * Display name for the parent who owns this child — used to render
   * the **{ParentDisplayName} · Parent** chip on staff uploads' rows.
   * Defaults to "Parent" when not provided.
   */
  @Input() parentDisplayName: string | null = null;

  /**
   * Caller's own user id. The trash icon is enabled when the row's
   * uploader user id matches (or, on the parent surface, always). On
   * the staff surface this is also where own-tenant attribution comes
   * from when the row's `uploadedFromTenantId` matches the tenant
   * input.
   */
  @Input() currentUserId: string | null = null;

  /** Emitted whenever the document list reloads (count for tab badges). */
  @Output() loaded = new EventEmitter<number>();

  /**
   * Emits the platform-required-documents status (clinic card +
   * birth certificate presence) every time the document list
   * reloads. Used by the staff workspace child-detail header to
   * show a "Docs ✓ / Docs missing" pill without a second
   * round-trip. Mirrors the backend's
   * <c>RequiredChildDocumentsStatusDto</c>.
   */
  @Output() requiredDocsLoaded = new EventEmitter<{
    hasClinicCard: boolean;
    hasBirthCertificate: boolean;
  }>();

  /** Allow PDFs, raster images, common Office docs, HEIC. */
  protected readonly acceptHint =
    '.pdf,.png,.jpg,.jpeg,.heic,.heif,.doc,.docx,.xls,.xlsx,application/pdf,image/*';

  protected readonly documents = signal<WayelChildDocument[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly categoryOptions = signal<LookupOption[]>([]);
  protected readonly categoriesLoading = signal(false);
  protected readonly activeFilter = signal<string>(this.ALL);
  protected readonly activeTagFilter = signal<string | null>(null);

  // ── Drawer state ────────────────────────────────────────────────
  protected readonly drawerOpen = signal(false);
  protected readonly formTitle = signal('');
  /**
   * Tracks whether the user has typed in the title field — once they
   * touch it we stop auto-syncing it from the file name so we don't
   * stomp their edits.
   */
  private titleTouched = false;
  protected readonly formFile = signal<File | null>(null);
  protected readonly formCategory = signal<string | null>(null);
  protected readonly formTags = signal<string[]>([]);
  protected readonly formDescription = signal('');
  protected readonly formConfidential = signal(false);
  protected readonly showValidation = signal(false);
  protected readonly isDragging = signal(false);

  protected readonly availableTags = signal<string[]>([]);
  protected readonly tagQuery = signal('');
  protected readonly tagDropdownOpen = signal(false);

  @ViewChild('tagInput') private tagInputEl?: ElementRef<HTMLInputElement>;

  protected readonly hasOwner = computed(() => this.ownerId.length > 0);

  /**
   * The chips above the list — only shows non-empty buckets so the
   * rail stays tidy. Includes a synthetic "Uncategorised" bucket
   * when at least one document on the list lacks a `categoryCode`.
   */
  protected readonly filterChips = computed(() => {
    const docs = this.documents();
    if (docs.length === 0) return [];

    const counts = new Map<string, number>();
    let uncategorised = 0;
    for (const d of docs) {
      if (d.categoryCode) {
        counts.set(d.categoryCode, (counts.get(d.categoryCode) ?? 0) + 1);
      } else {
        uncategorised += 1;
      }
    }

    const chips: { value: string; label: string; count: number }[] = [
      { value: this.ALL, label: 'All', count: docs.length },
    ];

    const orderIndex = new Map<string, number>();
    this.categoryOptions().forEach((opt, idx) => orderIndex.set(opt.code, idx));
    const codeNames = new Map<string, string>();
    this.categoryOptions().forEach((opt) => codeNames.set(opt.code, opt.name));
    for (const d of docs) {
      if (d.categoryCode && d.categoryName && !codeNames.has(d.categoryCode)) {
        codeNames.set(d.categoryCode, d.categoryName);
      }
    }

    const sortedCodes = [...counts.keys()].sort((a, b) => {
      const ai = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

    for (const code of sortedCodes) {
      const fallbackName = codeNames.get(code);
      chips.push({
        value: code,
        label: fallbackName ? `${code} · ${fallbackName}` : code,
        count: counts.get(code)!,
      });
    }

    if (uncategorised > 0) {
      chips.push({ value: UNCATEGORISED, label: 'Uncategorised', count: uncategorised });
    }

    return chips;
  });

  /**
   * Filtered view of {@link documents} the template iterates. Pure
   * client-side — no extra API hop when the user toggles a chip or
   * a tag pill.
   */
  protected readonly visibleDocuments = computed(() => {
    const filter = this.activeFilter();
    const tag = this.activeTagFilter();
    let docs = this.documents();
    if (filter !== this.ALL) {
      if (filter === UNCATEGORISED) {
        docs = docs.filter((d) => !d.categoryCode);
      } else {
        docs = docs.filter((d) => d.categoryCode === filter);
      }
    }
    if (tag) {
      docs = docs.filter((d) => Array.isArray(d.tags) && d.tags.includes(tag));
    }
    return docs;
  });

  protected readonly tagSuggestions = computed(() => {
    const q = this.tagQuery().trim().toLowerCase();
    const selected = new Set(this.formTags());
    const all = this.availableTags().filter((t) => !selected.has(t));
    if (!q) return all.slice(0, 8);
    const filtered = all.filter((t) => t.includes(q));
    return filtered.slice(0, 8);
  });

  protected readonly canCreateTag = computed(() => {
    const raw = this.tagQuery().trim().toLowerCase();
    if (!raw) return false;
    if (raw.length > MAX_TAG_LENGTH) return false;
    if (this.formTags().includes(raw)) return false;
    if (this.formTags().length >= MAX_TAGS_PER_DOC) return false;
    if (this.availableTags().includes(raw) && this.tagSuggestions().includes(raw)) {
      return false;
    }
    return true;
  });

  protected readonly tagQueryPreview = computed(() =>
    this.tagQuery().trim().toLowerCase(),
  );

  protected readonly canSubmit = computed(() => {
    if (!this.formFile()) return false;
    if (this.formTitle().trim().length === 0) return false;
    if (!this.formCategory()) return false;
    return true;
  });

  ngOnInit(): void {
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ownerId'] || changes['mode'] || changes['tenantId']) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (!this.hasOwner()) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const items =
        this.mode === 'parent'
          ? await this.service.listForParent(this.ownerId)
          : await this.service.listForStaff(this.ownerId, { tenantId: this.tenantId });
      this.documents.set(items);
      this.loaded.emit(items.length);
      this.emitRequiredDocsStatus(items);
      const filter = this.activeFilter();
      if (filter !== this.ALL) {
        const hasMatches = filter === UNCATEGORISED
          ? items.some((d) => !d.categoryCode)
          : items.some((d) => d.categoryCode === filter);
        if (!hasMatches) {
          this.activeFilter.set(this.ALL);
        }
      }
      const activeTag = this.activeTagFilter();
      if (activeTag && !items.some((d) => Array.isArray(d.tags) && d.tags.includes(activeTag))) {
        this.activeTagFilter.set(null);
      }
    } catch (err) {
      this.loadError.set(extractMessage(err, 'Could not load documents.'));
    } finally {
      this.loading.set(false);
    }
  }

  // ── Drawer interactions ─────────────────────────────────────────

  openDrawer(): void {
    if (!this.hasOwner()) return;
    this.resetDrawerForm();
    this.drawerOpen.set(true);
    void this.loadAvailableTags();
  }

  closeDrawer(): void {
    if (this.uploading()) return;
    if (this.hasUnsavedDrawerData()) {
      const ok = typeof window !== 'undefined'
        ? window.confirm('Discard the in-progress upload?')
        : true;
      if (!ok) return;
    }
    this.drawerOpen.set(false);
    this.resetDrawerForm();
  }

  onBackdropClick(): void {
    this.closeDrawer();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.drawerOpen() && !this.uploading()) {
      this.closeDrawer();
    }
  }

  protected onTitleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.titleTouched = true;
    this.formTitle.set(value);
  }

  protected onCategoryChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.formCategory.set(value || null);
  }

  protected onDescriptionInput(event: Event): void {
    this.formDescription.set((event.target as HTMLTextAreaElement).value);
  }

  protected onConfidentialChange(event: Event): void {
    this.formConfidential.set((event.target as HTMLInputElement).checked);
  }

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.acceptFile(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.acceptFile(file);
  }

  private acceptFile(file: File): void {
    if (file.size > DOCUMENTS_MAX_BYTES) {
      this.uploadError.set(
        `Files must be 25 MB or smaller — picked file is ${this.formatSize(file.size)}.`,
      );
      return;
    }
    this.uploadError.set(null);
    this.formFile.set(file);
    if (!this.titleTouched || this.formTitle().trim().length === 0) {
      const stripped = file.name.replace(/\.[^.]+$/, '') || file.name;
      this.formTitle.set(stripped);
      // Title remains "untouched" so subsequent file swaps keep
      // re-syncing it. Manual edits flip the flag in onTitleInput.
      this.titleTouched = false;
    }
  }

  protected clearFile(): void {
    this.formFile.set(null);
    this.uploadError.set(null);
  }

  // ── Tag input ───────────────────────────────────────────────────

  protected onTagQueryInput(event: Event): void {
    this.tagQuery.set((event.target as HTMLInputElement).value);
    this.tagDropdownOpen.set(true);
  }

  protected onTagInputBlur(): void {
    // Defer so click handlers on dropdown options run before close.
    setTimeout(() => this.tagDropdownOpen.set(false), 120);
  }

  protected onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const raw = this.tagQuery().trim().toLowerCase();
      if (!raw) return;
      const suggestion = this.tagSuggestions()[0];
      if (suggestion && suggestion === raw) {
        this.addTag(suggestion);
      } else if (this.canCreateTag()) {
        this.addTag(raw);
      } else if (this.availableTags().includes(raw)) {
        this.addTag(raw);
      }
    } else if (event.key === 'Backspace' && this.tagQuery().length === 0) {
      const tags = this.formTags();
      if (tags.length > 0) {
        this.formTags.set(tags.slice(0, -1));
      }
    } else if (event.key === 'Escape') {
      this.tagDropdownOpen.set(false);
    }
  }

  protected addTag(raw: string): void {
    if (this.uploading()) return;
    const value = (raw ?? '').trim().toLowerCase();
    if (!value) return;
    if (value.length > MAX_TAG_LENGTH) return;
    const current = this.formTags();
    if (current.includes(value)) {
      this.tagQuery.set('');
      return;
    }
    if (current.length >= MAX_TAGS_PER_DOC) return;
    this.formTags.set([...current, value]);
    this.tagQuery.set('');
    this.tagInputEl?.nativeElement?.focus();
  }

  protected removeTag(value: string): void {
    if (this.uploading()) return;
    this.formTags.set(this.formTags().filter((t) => t !== value));
  }

  // ── Submit ──────────────────────────────────────────────────────

  async submitUpload(): Promise<void> {
    if (this.uploading()) return;
    if (!this.canSubmit()) {
      this.showValidation.set(true);
      return;
    }
    const file = this.formFile()!;
    const title = this.formTitle().trim();
    const category = this.formCategory();
    const tags = this.formTags();
    const description = this.formDescription().trim() || null;
    const confidential = this.formConfidential();

    this.uploading.set(true);
    this.uploadError.set(null);
    try {
      const created =
        this.mode === 'parent'
          ? await this.service.uploadAsParent(this.ownerId, file, {
              title,
              categoryCode: category,
              tags,
              description,
              isConfidential: confidential,
            })
          : await this.service.uploadAsStaff(this.ownerId, file, {
              tenantId: this.tenantId,
              title,
              categoryCode: category,
              tags,
              description,
              isConfidential: confidential,
            });
      this.documents.update((rows) => [created, ...rows]);
      this.loaded.emit(this.documents().length);
      this.emitRequiredDocsStatus(this.documents());
      this.toast.success(`Uploaded "${created.title || created.fileName}".`);
      // Refresh the available-tag set so any newly-created tag is
      // immediately offered on the next upload without forcing the
      // user to retype it.
      void this.loadAvailableTags();
      this.drawerOpen.set(false);
      this.resetDrawerForm();
    } catch (err) {
      this.uploadError.set(extractMessage(err, 'Upload failed.'));
    } finally {
      this.uploading.set(false);
    }
  }

  /**
   * Walks the loaded document list and emits a flag-pair reflecting
   * whether the platform's mandatory documents (clinic card + birth
   * certificate, mirroring `RequiredChildDocuments` on the C# side)
   * are present. Empty / deleted lists fall back to all-false. Codes
   * are upper-cased before comparison so a lower-cased seed row
   * matches.
   */
  private emitRequiredDocsStatus(items: ReadonlyArray<WayelChildDocument>): void {
    let hasClinic = false;
    let hasBirth = false;
    for (const d of items) {
      const code = (d.categoryCode ?? '').trim().toUpperCase();
      if (!code) continue;
      if (!hasClinic && code === 'CLINIC_CARD') hasClinic = true;
      else if (!hasBirth && code === 'BIRTH_CERTIFICATE') hasBirth = true;
      if (hasClinic && hasBirth) break;
    }
    this.requiredDocsLoaded.emit({
      hasClinicCard: hasClinic,
      hasBirthCertificate: hasBirth,
    });
  }

  private hasUnsavedDrawerData(): boolean {
    return (
      this.formFile() !== null
      || this.formTitle().trim().length > 0
      || this.formTags().length > 0
      || this.formDescription().trim().length > 0
      || this.formConfidential()
      || this.formCategory() !== null
    );
  }

  private resetDrawerForm(): void {
    this.formTitle.set('');
    this.titleTouched = false;
    this.formFile.set(null);
    this.formCategory.set(null);
    this.formTags.set([]);
    this.formDescription.set('');
    this.formConfidential.set(false);
    this.tagQuery.set('');
    this.tagDropdownOpen.set(false);
    this.uploadError.set(null);
    this.showValidation.set(false);
    this.isDragging.set(false);
  }

  private async loadAvailableTags(): Promise<void> {
    if (!this.hasOwner()) {
      this.availableTags.set([]);
      return;
    }
    try {
      const tags =
        this.mode === 'parent'
          ? await this.service.listTagsForParent(this.ownerId)
          : await this.service.listTagsForStaff(this.ownerId, {
              tenantId: this.tenantId,
            });
      this.availableTags.set(tags);
    } catch {
      // Autocomplete is non-essential — degrade quietly.
      this.availableTags.set([]);
    }
  }

  async confirmDelete(doc: WayelChildDocument): Promise<void> {
    if (!this.canDelete(doc)) return;

    const result = await firstValueFrom(
      this.confirm.ask({
        title: 'Delete document?',
        message: `"${doc.title || doc.fileName}" will be removed for the parent and every institution that can see it.`,
        confirmLabel: 'Delete',
        kind: 'danger',
      }),
    );
    if (!result.confirmed) return;

    this.deletingId.set(doc.id);
    try {
      if (this.mode === 'parent') {
        await this.service.deleteAsParent(this.ownerId, doc.id);
      } else {
        await this.service.deleteAsStaff(this.ownerId, doc.id, {
          tenantId: this.tenantId,
        });
      }
      this.documents.update((rows) => rows.filter((r) => r.id !== doc.id));
      this.loaded.emit(this.documents().length);
      this.emitRequiredDocsStatus(this.documents());
      this.toast.success('Document deleted.');
    } catch (err) {
      this.toast.error(extractMessage(err, 'Could not delete document.'));
    } finally {
      this.deletingId.set(null);
    }
  }

  /**
   * On the parent surface the parent owns the child's vault and may
   * remove anything sitting on it (their own uploads + every staff
   * upload). On the staff surface a row is removable only when the
   * caller's tenant uploaded it (visibility rule already excludes
   * other tenants' rows).
   */
  protected canDelete(doc: WayelChildDocument): boolean {
    if (this.mode === 'parent') return true;
    return (
      doc.uploaderRole !== 'Parent'
      && doc.uploadedFromTenantId !== null
      && (this.tenantId == null
        || doc.uploadedFromTenantId === this.tenantId)
    );
  }

  protected uploaderLabel(doc: WayelChildDocument): string {
    if (this.mode === 'parent') {
      if (doc.uploaderRole === 'Parent') {
        return doc.uploadedByUserId && doc.uploadedByUserId === this.currentUserId
          ? 'You · Parent'
          : `${doc.uploadedByDisplayName} · Parent`;
      }
      const tenantName = doc.uploadedFromTenantName ?? 'Institution';
      return `${tenantName} · Staff`;
    }

    if (doc.uploaderRole === 'Parent') {
      return `${this.parentDisplayName ?? doc.uploadedByDisplayName} · Parent`;
    }
    return 'Your team · Staff';
  }

  protected chipRole(doc: WayelChildDocument): 'parent' | 'staff' {
    return doc.uploaderRole === 'Parent' ? 'parent' : 'staff';
  }

  protected iconFor(doc: WayelChildDocument): string {
    return iconForContentType(doc.contentType, doc.fileName);
  }

  protected iconForFile(file: File): string {
    return iconForContentType(file.type, file.name);
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected setFilter(value: string): void {
    this.activeFilter.set(value);
  }

  protected setTagFilter(tag: string): void {
    this.activeTagFilter.set(this.activeTagFilter() === tag ? null : tag);
  }

  protected clearTagFilter(): void {
    this.activeTagFilter.set(null);
  }

  protected visibleTags(doc: WayelChildDocument): string[] {
    if (!Array.isArray(doc.tags)) return [];
    return doc.tags.slice(0, TAG_PILLS_PER_ROW);
  }

  /**
   * Pull the `DOCUMENT_CATEGORY` lookup intent once on init —
   * cached at the {@link LookupsService} layer so navigating
   * between children doesn't refetch.
   */
  private loadCategories(): void {
    this.categoriesLoading.set(true);
    this.lookups
      .listByIntent('DOCUMENT_CATEGORY')
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (options) => {
          this.categoryOptions.set(options);
          this.categoriesLoading.set(false);
        },
        error: () => {
          this.categoryOptions.set([]);
          this.categoriesLoading.set(false);
        },
      });
  }
}

function iconForContentType(contentType: string, fileName: string): string {
  const ct = (contentType || '').toLowerCase();
  if (ct === 'application/pdf') return 'picture_as_pdf';
  if (ct.startsWith('image/')) return 'image';
  if (ct.includes('word')) return 'description';
  if (ct.includes('sheet') || ct.includes('excel')) return 'grid_on';
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (ext === 'pdf') return 'picture_as_pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'heic', 'heif', 'webp'].includes(ext)) return 'image';
  if (['doc', 'docx'].includes(ext)) return 'description';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid_on';
  return 'insert_drive_file';
}

function extractMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}
