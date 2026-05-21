import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { environment } from '@app/environment';
import { ConfirmDialogService } from '@wayel/shared/services/confirm-dialog.service';
import { ToastService } from '@wayel/shared/services/toast.service';
import type { MockDailyReport } from '@wayel/shared/core/mock/mock-daily-reports';
import type { MockPlatformTenant } from '@wayel/shared/core/mock/mock-data';
import type {
  Phase0DailyReportKind,
  Phase0DailyReportMedia,
  Phase0DailyReportMood,
  Phase0DailyReportStatus,
  Phase0InstitutionKind,
  Phase0MealPortion,
  Phase0SessionAttendance,
  Phase0SessionEffort,
} from '@wayel/shared/core/contracts/daily-reports.phase0';
import { WayelAdminChildrenService } from '@wayel/shared/services/wayel-admin-children.service';
import type { WayelChildDetail } from '@wayel/shared/services/wayel-admin-children.service';
import {
  WayelAdminSubscriptionsService,
  type WayelSubscriptionEndReason,
} from '@wayel/shared/services/wayel-admin-subscriptions.service';
import {
  WayelAdminDailyReportsService,
  type WayelCreateDailyReportBody,
  type WayelDailyReportDrinks,
  type WayelDailyReportHygiene,
  type WayelDailyReportKind,
  type WayelDailyReportMeals,
  type WayelDailyReportMediaKind,
  type WayelDailyReportMood,
  type WayelDailyReportSleep,
  type WayelDailyReportStatus,
  type WayelDailyReportSummary,
  type WayelMealPortion,
  type WayelNapQuality,
  type WayelSessionAttendance,
  type WayelSessionEffort,
  type WayelUpdateDailyReportBody,
} from '@wayel/shared/services/wayel-admin-daily-reports.service';
import { WayelAdminProgramsService } from '@wayel/shared/services/wayel-admin-programs.service';
import { WayelAdminMediaService } from '@wayel/shared/services/wayel-admin-media.service';
import {
  MEDIA_SCOPE_MAX_RAW_BYTES,
} from '@wayel/shared/util/media-upload-prepare';
import {
  addSkillForChild,
  ageInYears,
  ageLabel,
  attendanceLabel,
  createReportForChild,
  deleteReport,
  extractGalleryFromReports,
  findChildContext,
  listReportsForChild,
  listSkillsForChild,
  moodEmoji,
  moodLabel,
  removeSkill,
  toggleReportPublishStatus,
  updateReportFields,
  updateSkillForChild,
  weeklyTrendsForChild,
  type DailyReportDraft,
  type GalleryItem,
  type SkillDraft,
  type WeeklyTrendBucket,
  type WorkspaceChildContext,
  type WorkspaceChildSkill,
  type WorkspaceSkillLevel,
} from '@wayel/shared/services/workspace-child';
import type {
  MockParent,
  MockParentChild,
  MockParentChildSubscription,
} from '@wayel/shared/core/mock/mock-parents';
import { WorkspaceDevelopmentSectionComponent } from './workspace-development-section.component';
import {
  MediaStickyNoteViewerComponent,
  type StickyMediaItem,
} from './media-sticky-note-viewer.component';
import { ChildDocumentsPanelComponent } from './child-documents-panel.component';

type ChildDetailTab =
  | 'reports'
  | 'trends'
  | 'gallery'
  | 'documents'
  | 'skills'
  | 'development'
  | 'parent';

interface ChildTabDef {
  id: ChildDetailTab;
  label: string;
  icon: string;
}

/**
 * Per-child detail page rendered inside the workspace's Children tab.
 *
 * Drilled into from `<app-platform-tenant-workspace>` when the operator
 * clicks a child card. Shows a slim header card matching the rest of the
 * workspace and a tab strip with: Daily reports (CRUD), Weekly trends,
 * Gallery, Skills (CRUD), Parent (read-only).
 *
 * Operates directly against the in-memory mock stores (see workspace-child.ts)
 * so the admin can drill into any institution without being scoped by the
 * staff/parent bridge auth context.
 */
@Component({
  selector: 'app-workspace-child-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    WorkspaceDevelopmentSectionComponent,
    MediaStickyNoteViewerComponent,
    ChildDocumentsPanelComponent,
  ],
  template: `
    @let ctx = context();
    @if (liveMode && (liveLoading() || liveError())) {
      <div class="live-banner" [attr.data-state]="liveError() ? 'error' : 'loading'" role="status" aria-live="polite">
        @if (liveError()) {
          <span class="material-icons-outlined" aria-hidden="true">error_outline</span>
          <span>{{ liveError() }}</span>
          <button type="button" class="live-banner-retry" (click)="loadLive()">Retry</button>
        } @else {
          <span class="material-icons-outlined spin" aria-hidden="true">progress_activity</span>
          <span>Loading the live profile…</span>
        }
      </div>
    }
    @if (!ctx) {
      <div class="empty-card">
        <span class="material-icons-outlined" aria-hidden="true">person_off</span>
        <p>This child no longer has an active subscription at this institution.</p>
        <button type="button" class="link-back" (click)="back.emit()">← Back to Children</button>
      </div>
    } @else {
      <button type="button" class="link-back inline-back" (click)="back.emit()">
        ← Children
      </button>

      <!-- ─── Child header card ─── -->
      <header class="child-header">
        @if (ctx.child.photoUrl) {
          <button
            type="button"
            class="child-avatar child-avatar--clickable with-img"
            (click)="openChildPortraitViewer()"
            [attr.aria-label]="'View profile photo — ' + ctx.child.displayName"
          >
            <img [src]="ctx.child.photoUrl" [alt]="ctx.child.displayName" />
          </button>
        } @else {
          <div class="child-avatar">
            {{ initials(ctx.child.displayName) }}
          </div>
        }
        <div class="child-id">
          <h2 class="child-name">{{ ctx.child.displayName }}</h2>
          <div class="child-sub">
            {{ ageLabel(ctx.child.dateOfBirth) }} · DOB
            {{ ctx.child.dateOfBirth | date: 'd MMM yyyy' }}
          </div>
          <div class="child-pills">
            <span class="pill state" [attr.data-state]="ctx.subscription.state">
              {{ ctx.subscription.state }}
            </span>
            @if (ctx.subscription.classroom) {
              <span class="pill room">{{ ctx.subscription.classroom }}</span>
            }
            <span class="pill plan">
              {{ tenant?.branding?.displayName || tenant?.name }}
            </span>
            @if (childDocsPill(); as docPill) {
              <span
                class="pill docs"
                [attr.data-state]="docPill.state"
                [attr.title]="docPill.tooltip"
              >
                <span class="material-icons-outlined" aria-hidden="true">{{ docPill.icon }}</span>
                {{ docPill.label }}
              </span>
            }
          </div>
        </div>
        <div class="child-meta">
          <div class="meta-row">
            Parent: <strong>{{ ctx.parent.displayName }}</strong>
          </div>
          @if (ctx.subscription.enrolledAt) {
            <div class="meta-row">
              Enrolled
              <strong>{{ ctx.subscription.enrolledAt | date: 'd MMM yyyy' }}</strong>
            </div>
          }
          <div class="meta-row">
            Reports posted: <strong>{{ reports().length }}</strong>
          </div>
          @if (canOfferEndSubscription()) {
            <div class="meta-row">
              <button type="button" class="btn-end-sub" (click)="openEndSubscriptionPanel()">
                End subscription…
              </button>
            </div>
          }
        </div>
      </header>

      @if (liveMode && endSubscriptionPanelOpen()) {
        <section class="end-sub-panel" aria-labelledby="end-sub-heading">
          <h3 id="end-sub-heading">End subscription</h3>
          <p class="end-sub-hint">
            Ends immediately unless you pick a future date — then the period stays active until that day
            (renewal ticker applies the scheduled end).
          </p>
          <div class="form-grid">
            <label class="form-field">
              <span class="form-label">Reason</span>
              <select [(ngModel)]="endSubscriptionReason" name="endReason">
                <option value="InstitutionTerminated">Institution terminated</option>
                <option value="ChildGraduated">Child graduated / aged out</option>
                <option value="ChildWithdrawn">Family withdrew</option>
                <option value="RenewalLapsed">Renewal lapsed</option>
                <option value="Unspecified">Unspecified</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">Schedule end (optional)</span>
              <input type="date" [(ngModel)]="endSubscriptionScheduledOn" name="schedEnd" />
            </label>
            <label class="form-field span-2">
              <span class="form-label">Note (optional)</span>
              <textarea
                [(ngModel)]="endSubscriptionNote"
                name="endNote"
                rows="2"
                placeholder="Short note for the audit trail"
              ></textarea>
            </label>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="closeEndSubscriptionPanel()">Cancel</button>
            <button
              type="button"
              class="btn-danger"
              [disabled]="endSubscriptionSubmitting()"
              (click)="submitEndSubscription()"
            >
              @if (endSubscriptionSubmitting()) {
                <span>Working…</span>
              } @else {
                <span>Confirm</span>
              }
            </button>
          </div>
        </section>
      }

      <!-- ─── Tab strip ─── -->
      <nav class="tabs" aria-label="Child sections">
        @for (tab of visibleTabs(); track tab.id) {
          <button
            type="button"
            class="tab"
            [class.active]="activeTab() === tab.id"
            (click)="setTab(tab.id)"
          >
            <span class="material-icons-outlined" aria-hidden="true">{{ tab.icon }}</span>
            {{ tab.label }}
          </button>
        }
      </nav>

      @switch (activeTab()) {
        @case ('reports') {
          <section class="card">
            <header class="card-head">
              <span class="material-icons-outlined" aria-hidden="true">assignment</span>
              <h3 class="card-title">Daily reports</h3>
              <span class="head-count">{{ reports().length }} total</span>
              <button type="button" class="btn-primary" (click)="openReportEditor(null)">
                <span class="material-icons-outlined" aria-hidden="true">add</span>
                New report
              </button>
            </header>

            @if (reportEditorOpen()) {
              <form
                class="report-editor"
                (submit)="$event.preventDefault(); saveReport()"
              >
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">Report date</span>
                    <input type="date" name="d" [(ngModel)]="reportDraft.reportDate" required />
                  </label>
                  <label class="form-field">
                    <span class="form-label">Status</span>
                    <select name="s" [(ngModel)]="reportDraft.status">
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </label>

                  <!--
                    Today I was — v1 paper "mood today" row. Labels
                    match the paper (Happy / Sad / Tired / Mad);
                    selecting the active mood again clears it.
                  -->
                  <div class="form-field span-2">
                    <span class="form-label">Today I was</span>
                    <div class="mood-row">
                      @for (m of moodChoices; track m.value) {
                        <button
                          type="button"
                          class="mood-btn"
                          [class.active]="reportDraft.mood === m.value"
                          (click)="setReportMood(m.value)"
                          [attr.aria-label]="m.label"
                          [attr.aria-pressed]="reportDraft.mood === m.value"
                        >
                          <span class="mood-emoji">{{ m.emoji }}</span>
                          <span class="mood-label">{{ m.label }}</span>
                          @if (reportDraft.mood === m.value) {
                            <span class="mood-tick" aria-hidden="true">
                              <span class="material-icons-outlined">check</span>
                            </span>
                          }
                        </button>
                      }
                    </div>
                  </div>

                  @if (isDaycareKind()) {
                    <!--
                      Daycare-only blocks. Restored from the original
                      v1 "Teacher Daily Report" design — these all
                      already exist on the wire DTO + domain
                      aggregate, but the editor had stopped surfacing
                      them, so every staff write was silently
                      dropping portion / drink / sleep / hygiene
                      observations. The data path is now: editor →
                      reportDraft daycare blocks → meals/drinks/
                      sleep/hygiene-DraftToWire helpers → Mongo.
                    -->

                    <!-- Breakfast / Snack / Lunch portion segmented controls. -->
                    @for (meal of mealRows; track meal.id) {
                      <div class="form-field meal-field">
                        <span class="form-label">{{ meal.label }}</span>
                        <div class="seg-row" role="radiogroup" [attr.aria-label]="meal.label">
                          @for (p of portionChoices; track p.value) {
                            <button
                              type="button"
                              role="radio"
                              class="seg-btn"
                              [class.active]="reportDraft.meals[meal.id] === p.value"
                              [attr.aria-checked]="reportDraft.meals[meal.id] === p.value"
                              (click)="setMealPortion(meal.id, p.value)"
                            >
                              <span class="seg-dot" aria-hidden="true">
                                <span class="material-icons-outlined">
                                  {{
                                    reportDraft.meals[meal.id] === p.value
                                      ? 'check_circle'
                                      : 'radio_button_unchecked'
                                  }}
                                </span>
                              </span>
                              {{ p.label }}
                            </button>
                          }
                        </div>
                      </div>
                    }

                    <!--
                      To drink I had — v1 paper four-checkbox row
                      (Bottles / Water / Milk / Tea). Each chip is an
                      independent toggle; the staff can tick any
                      combination. The "Bottles" chip maps to the
                      existing bottlesCount (0 or 1 for the boolean
                      view — the count is preserved on read-back).
                    -->
                    <div class="form-field span-2">
                      <span class="form-label">To drink I had</span>
                      <div class="drinks-row">
                        <button
                          type="button"
                          class="chip-toggle"
                          [class.active]="reportDraft.drinks.bottlesCount > 0"
                          [attr.aria-pressed]="reportDraft.drinks.bottlesCount > 0"
                          (click)="toggleBottlesDrunk()"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.drinks.bottlesCount > 0 ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Bottles
                        </button>
                        <button
                          type="button"
                          class="chip-toggle"
                          [class.active]="reportDraft.drinks.water"
                          [attr.aria-pressed]="reportDraft.drinks.water"
                          (click)="toggleWaterDrunk()"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.drinks.water ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Water
                        </button>
                        <button
                          type="button"
                          class="chip-toggle"
                          [class.active]="reportDraft.drinks.milk"
                          [attr.aria-pressed]="reportDraft.drinks.milk"
                          (click)="toggleMilkDrunk()"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.drinks.milk ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Milk
                        </button>
                        <button
                          type="button"
                          class="chip-toggle"
                          [class.active]="reportDraft.drinks.tea"
                          [attr.aria-pressed]="reportDraft.drinks.tea"
                          (click)="toggleTeaDrunk()"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.drinks.tea ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Tea
                        </button>
                      </div>
                    </div>

                    <!--
                      Sleep time — v1 paper labels exactly: time
                      range inputs followed by the 3 quality
                      checkboxes (Slept well / Restless / Did not
                      sleep). napStart / napEnd already exist on the
                      domain, so they round-trip straight to the
                      backend.
                    -->
                    <div class="form-field span-2">
                      <span class="form-label">Sleep time</span>
                      <div class="sleep-time-row">
                        <label class="time-input">
                          <span class="time-label">From</span>
                          <input
                            type="time"
                            name="napStart"
                            [(ngModel)]="reportDraft.sleep.napStart"
                            [disabled]="reportDraft.sleep.noSleep"
                          />
                        </label>
                        <span class="time-sep" aria-hidden="true">–</span>
                        <label class="time-input">
                          <span class="time-label">To</span>
                          <input
                            type="time"
                            name="napEnd"
                            [(ngModel)]="reportDraft.sleep.napEnd"
                            [disabled]="reportDraft.sleep.noSleep"
                          />
                        </label>
                      </div>
                      <div class="seg-row sleep-quality-row" role="radiogroup" aria-label="Sleep">
                        @for (s of sleepChoices; track s.value) {
                          <button
                            type="button"
                            role="radio"
                            class="seg-btn"
                            [class.active]="currentSleepChoice() === s.value"
                            [attr.aria-checked]="currentSleepChoice() === s.value"
                            (click)="setSleepChoice(s.value)"
                          >
                            <span class="material-icons-outlined" aria-hidden="true">
                              {{ s.icon }}
                            </span>
                            {{ s.label }}
                          </button>
                        }
                      </div>
                    </div>

                    <!--
                      Nappies — v1 paper three-checkbox row (Soiled /
                      Wet / Dry). Multi-select since a child can have
                      multiple changes of different states across the
                      day.
                    -->
                    <div class="form-field span-2">
                      <span class="form-label">Nappies</span>
                      <div class="hygiene-row">
                        <button
                          type="button"
                          class="chip-toggle"
                          [class.active]="reportDraft.hygiene.soiled"
                          [attr.aria-pressed]="reportDraft.hygiene.soiled"
                          (click)="toggleNappyFlag('soiled')"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.hygiene.soiled ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Soiled
                        </button>
                        <button
                          type="button"
                          class="chip-toggle"
                          [class.active]="reportDraft.hygiene.wet"
                          [attr.aria-pressed]="reportDraft.hygiene.wet"
                          (click)="toggleNappyFlag('wet')"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.hygiene.wet ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Wet
                        </button>
                        <button
                          type="button"
                          class="chip-toggle"
                          [class.active]="reportDraft.hygiene.dry"
                          [attr.aria-pressed]="reportDraft.hygiene.dry"
                          (click)="toggleNappyFlag('dry')"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.hygiene.dry ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Dry
                        </button>
                      </div>
                    </div>

                    <!--
                      Potty training — v1 paper "Yes / No" pair. The
                      domain stores it as a single boolean; the two
                      buttons are mutually exclusive.
                    -->
                    <div class="form-field span-2">
                      <span class="form-label">Potty training</span>
                      <div class="hygiene-row" role="radiogroup" aria-label="Potty training">
                        <button
                          type="button"
                          role="radio"
                          class="chip-toggle"
                          [class.active]="reportDraft.hygiene.pottyTraining === true"
                          [attr.aria-checked]="reportDraft.hygiene.pottyTraining === true"
                          (click)="setPottyTraining(true)"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ reportDraft.hygiene.pottyTraining ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          Yes
                        </button>
                        <button
                          type="button"
                          role="radio"
                          class="chip-toggle"
                          [class.active]="reportDraft.hygiene.pottyTraining === false"
                          [attr.aria-checked]="reportDraft.hygiene.pottyTraining === false"
                          (click)="setPottyTraining(false)"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ !reportDraft.hygiene.pottyTraining ? 'check_box' : 'check_box_outline_blank' }}
                          </span>
                          No
                        </button>
                      </div>
                    </div>
                  }

                  <!--
                    Notes — what the parent sees as the report body.
                    Originally labelled "Summary"; the v1 design + the
                    parent feed both call it "Notes", so we surface
                    the friendlier wording here too.
                  -->
                  <label class="form-field span-2">
                    <span class="form-label">Notes</span>
                    <textarea
                      name="sum"
                      rows="3"
                      [(ngModel)]="reportDraft.summary"
                      placeholder="What happened today?"
                      required
                    ></textarea>
                  </label>
                  <label class="form-field">
                    <span class="form-label">Highlights</span>
                    <input
                      type="text"
                      name="hi"
                      [(ngModel)]="reportDraft.highlights"
                      placeholder="Optional"
                    />
                  </label>
                  <label class="form-field">
                    <span class="form-label">Concerns</span>
                    <input
                      type="text"
                      name="co"
                      [(ngModel)]="reportDraft.concerns"
                      placeholder="Optional"
                    />
                  </label>

                  <div class="form-field span-2 media-field">
                    <span class="form-label">
                      Photos & videos
                      @if (reportDraft.media.length > 0) {
                        <span class="form-label-count">
                          {{ reportDraft.media.length }}
                          {{ reportDraft.media.length === 1 ? 'attachment' : 'attachments' }}
                        </span>
                      }
                    </span>

                    <div class="media-uploader">
                      <label class="media-drop">
                        <input
                          #mediaInput
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          hidden
                          (change)="onMediaSelected($any($event.target))"
                        />
                        <span class="material-icons-outlined" aria-hidden="true">
                          cloud_upload
                        </span>
                        <span class="media-drop-title">Click to upload</span>
                        <span class="media-drop-sub">
                          Raster photos are optimised automatically; HD video up to 100&nbsp;MB
                        </span>
                      </label>

                      @if (mediaUploading()) {
                        <p class="media-status" role="status">
                          Uploading media&hellip;
                        </p>
                      }
                      @if (mediaError()) {
                        <p class="media-error" role="alert">{{ mediaError() }}</p>
                      }

                      @if (reportDraft.media.length > 0) {
                        <ul class="media-thumbs" role="list">
                          @for (
                            m of reportDraft.media;
                            track m.id;
                            let i = $index
                          ) {
                            <li class="media-thumb">
                              <div class="media-thumb-preview">
                                @if (workspaceMediaHasUrl(m)) {
                                  <button
                                    type="button"
                                    class="media-thumb-zoom-btn"
                                    (click)="openReportMediaViewer(m)"
                                    [attr.aria-label]="
                                      (m.kind === 'video'
                                        ? 'Preview video — '
                                        : 'View larger — ') +
                                      (m.caption ||
                                        (m.kind === 'video'
                                          ? 'Video clip'
                                          : 'Attachment'))
                                    "
                                  >
                                    @if (m.kind === 'photo') {
                                      <img
                                        [src]="m.url"
                                        [alt]="m.caption || 'Attachment'"
                                        referrerpolicy="no-referrer-when-downgrade"
                                      />
                                    } @else {
                                      <video [src]="m.url" muted playsinline preload="metadata"></video>
                                      <span
                                        class="material-icons-outlined media-video-flag-draft"
                                        aria-hidden="true"
                                      >videocam</span>
                                    }
                                  </button>
                                } @else {
                                  @if (m.kind === 'photo') {
                                    <img
                                      [src]="m.url"
                                      [alt]="m.caption || 'Attachment'"
                                    />
                                  } @else {
                                    <video [src]="m.url" muted></video>
                                    <span
                                      class="material-icons-outlined media-video-flag"
                                      aria-hidden="true"
                                    >videocam</span>
                                  }
                                }
                                <button
                                  type="button"
                                  class="media-remove"
                                  title="Remove attachment"
                                  (click)="removeReportMedia(i); $event.stopPropagation()"
                                >
                                  <span
                                    class="material-icons-outlined"
                                    aria-hidden="true"
                                  >close</span>
                                </button>
                              </div>
                              <input
                                type="text"
                                class="media-caption"
                                placeholder="Add caption (optional)"
                                [value]="m.caption || ''"
                                (input)="
                                  setReportMediaCaption(
                                    i,
                                    $any($event.target).value
                                  )
                                "
                              />
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  </div>
                </div>
                <div class="form-actions">
                  <button type="button" class="btn-secondary" (click)="cancelReportEditor()">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="btn-primary"
                    [disabled]="!reportDraft.summary.trim() || !reportDraft.reportDate"
                  >
                    {{ editingReportId() ? 'Save changes' : 'Add report' }}
                  </button>
                </div>
              </form>
            }

            @if (reports().length === 0) {
              <p class="muted-center">
                No daily reports yet — click <strong>New report</strong> to add one.
              </p>
            } @else {
              <ul class="report-list" role="list">
                @for (r of reports(); track r.id) {
                  <li class="report-row">
                    <div class="report-row-head">
                      <span class="report-date">
                        {{ r.reportDate | date: 'EEE d MMM yyyy' }}
                      </span>
                      <span
                        class="report-status"
                        [attr.data-status]="r.status"
                      >{{ r.status }}</span>
                      <span class="report-mood" [title]="moodLabel(r.mood)">
                        {{ moodEmoji(r.mood) }}
                      </span>
                      @if (r.media.length > 0) {
                        <span class="report-media-flag">
                          <span class="material-icons-outlined" aria-hidden="true">image</span>
                          {{ r.media.length }}
                        </span>
                      }
                      <span class="report-author">by {{ r.authorName }}</span>
                      <div class="report-actions">
                        <button
                          type="button"
                          class="row-btn"
                          (click)="togglePublish(r.id)"
                          [title]="r.status === 'published' ? 'Move to draft' : 'Publish'"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">
                            {{ r.status === 'published' ? 'visibility_off' : 'publish' }}
                          </span>
                        </button>
                        <button
                          type="button"
                          class="row-btn"
                          (click)="openReportEditor(r)"
                          title="Edit"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">edit</span>
                        </button>
                        <button
                          type="button"
                          class="row-btn danger"
                          (click)="confirmDeleteReport(r.id)"
                          title="Delete"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">delete</span>
                        </button>
                      </div>
                    </div>
                    <p class="report-summary">{{ r.summary }}</p>
                    @if (r.media.length > 0) {
                      <ul class="report-media-strip" role="list">
                        @for (m of r.media; track m.id) {
                          <li class="report-media-item">
                            @if (workspaceMediaHasUrl(m)) {
                              <button
                                type="button"
                                class="report-media-zoom"
                                (click)="openReportMediaViewer(m)"
                                [attr.aria-label]="
                                  (m.kind === 'video'
                                    ? 'Play video — '
                                    : 'View larger — ') +
                                  (m.caption ||
                                    (m.kind === 'video' ? 'Video clip' : 'Attachment'))
                                "
                              >
                                @if (m.kind === 'photo') {
                                  <img
                                    [src]="m.url"
                                    [alt]="m.caption || 'Attachment'"
                                    loading="lazy"
                                    referrerpolicy="no-referrer-when-downgrade"
                                  />
                                } @else {
                                  <video
                                    [src]="m.url"
                                    muted
                                    playsinline
                                    preload="metadata"
                                    class="strip-video-thumb"
                                  ></video>
                                  <span
                                    class="material-icons-outlined report-strip-play"
                                    aria-hidden="true"
                                  >play_circle</span>
                                }
                                @if (m.caption) {
                                  <span class="report-media-caption">{{ m.caption }}</span>
                                }
                              </button>
                            } @else {
                              @if (m.kind === 'photo') {
                                <img [src]="m.url" [alt]="m.caption || 'Attachment'" />
                              } @else {
                                <video [src]="m.url" muted></video>
                                <span
                                  class="material-icons-outlined media-video-flag"
                                  aria-hidden="true"
                                >videocam</span>
                              }
                              @if (m.caption) {
                                <span class="report-media-caption">{{ m.caption }}</span>
                              }
                            }
                          </li>
                        }
                      </ul>
                    }
                    @if (r.highlights || r.concerns) {
                      <div class="report-callouts">
                        @if (r.highlights) {
                          <span class="callout pos">
                            <span class="material-icons-outlined" aria-hidden="true">star</span>
                            {{ r.highlights }}
                          </span>
                        }
                        @if (r.concerns) {
                          <span class="callout warn">
                            <span class="material-icons-outlined" aria-hidden="true">flag</span>
                            {{ r.concerns }}
                          </span>
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          </section>
        }

        @case ('trends') {
          <section class="card">
            <header class="card-head">
              <span class="material-icons-outlined" aria-hidden="true">insights</span>
              <h3 class="card-title">Weekly trends</h3>
              <span class="head-count">Last {{ trends().length }} weeks</span>
            </header>
            @if (reports().length === 0) {
              <p class="muted-center">
                No data yet — add a few daily reports to populate the trend view.
              </p>
            } @else {
              <div class="trends-grid">
                @for (w of trends(); track w.weekStart) {
                  <article class="trend-card" [class.empty]="w.reportCount === 0">
                    <header class="trend-card-head">
                      <span class="trend-week">
                        {{ w.weekStart | date: 'd MMM' }} —
                        {{ w.weekEnd | date: 'd MMM' }}
                      </span>
                      <span class="trend-count">{{ w.reportCount }}
                        {{ w.reportCount === 1 ? 'report' : 'reports' }}</span>
                    </header>
                    @if (w.reportCount === 0) {
                      <p class="trend-empty">No reports this week</p>
                    } @else {
                      <div class="trend-section">
                        <span class="trend-label">Mood</span>
                        <div class="trend-bar-row">
                          @for (m of moodTrendChoices; track m.value) {
                            <div
                              class="mood-stat"
                              [title]="m.label + ': ' + moodCount(w, m.value)"
                            >
                              <span class="mood-emoji">{{ m.emoji }}</span>
                              <span class="mood-num">{{ moodCount(w, m.value) }}</span>
                            </div>
                          }
                        </div>
                      </div>
                      @if (hasMealData(w)) {
                        <div class="trend-section">
                          <span class="trend-label">Meals (entries)</span>
                          <div class="meal-row">
                            <span class="meal-pill all">All {{ w.meals.all }}</span>
                            <span class="meal-pill some">Some {{ w.meals.some }}</span>
                            <span class="meal-pill none">None {{ w.meals.none }}</span>
                          </div>
                        </div>
                      }
                      @if (w.avgNapMinutes != null) {
                        <div class="trend-section">
                          <span class="trend-label">Avg nap</span>
                          <div class="trend-value">{{ napLabel(w.avgNapMinutes) }}</div>
                        </div>
                      }
                      @if (hasAttendanceData(w)) {
                        <div class="trend-section">
                          <span class="trend-label">Attendance</span>
                          <div class="att-row">
                            @if (w.attendance.present > 0) {
                              <span class="att-pill present">
                                Present {{ w.attendance.present }}
                              </span>
                            }
                            @if (w.attendance.late > 0) {
                              <span class="att-pill late">
                                Late {{ w.attendance.late }}
                              </span>
                            }
                            @if (w.attendance.absent > 0) {
                              <span class="att-pill absent">
                                Absent {{ w.attendance.absent }}
                              </span>
                            }
                            @if (w.attendance.left_early > 0) {
                              <span class="att-pill left">
                                Left early {{ w.attendance.left_early }}
                              </span>
                            }
                          </div>
                        </div>
                      }
                      @if (w.mediaCount > 0) {
                        <div class="trend-footer">
                          <span class="material-icons-outlined" aria-hidden="true">image</span>
                          {{ w.mediaCount }} media item{{ w.mediaCount === 1 ? '' : 's' }}
                        </div>
                      }
                    }
                  </article>
                }
              </div>
            }
          </section>
        }

        @case ('gallery') {
          <section class="card">
            <header class="card-head">
              <span class="material-icons-outlined" aria-hidden="true">photo_library</span>
              <h3 class="card-title">Gallery</h3>
              <span class="head-count">
                {{ galleryView().total }} item{{ galleryView().total === 1 ? '' : 's' }}
              </span>
            </header>

            @let g = galleryView();
            @if (g.total === 0) {
              <div class="gal-empty">
                <span class="material-icons-outlined" aria-hidden="true">collections</span>
                <p>No photos or videos attached to any report yet.</p>
                <small>
                  Media uploaded with daily reports will show up here, grouped by month.
                </small>
              </div>
            } @else {
              <div class="gal-pane">
                @for (month of g.months; track month.key) {
                  <section class="gal-month">
                    <header class="gal-month-h">
                      <h4>{{ month.label }}</h4>
                      <small>
                        {{ month.items.length }} item{{ month.items.length === 1 ? '' : 's' }}
                      </small>
                    </header>
                    <div class="gal-grid">
                      @for (item of month.items; track item.id) {
                        <button
                          type="button"
                          class="gal-tile"
                          (click)="openGalleryLightbox(item)"
                          [attr.aria-label]="
                            (item.kind === 'video' ? 'Play video — ' : '') +
                            (item.caption || 'Daily report media')
                          "
                        >
                          @if (item.kind === 'video') {
                            <video
                              class="gal-tile-media"
                              [src]="item.url"
                              muted
                              playsinline
                              preload="metadata"
                            ></video>
                            <span class="gal-tile-play" aria-hidden="true">
                              <span class="material-icons-outlined">play_circle</span>
                            </span>
                          } @else {
                            <img
                              class="gal-tile-media"
                              [src]="item.url"
                              [alt]="item.caption || 'Daily report photo'"
                              loading="lazy"
                              referrerpolicy="no-referrer-when-downgrade"
                            />
                          }
                          <span class="gal-tile-meta">
                            <span class="gal-tile-cap">
                              {{ item.caption || 'Untitled' }}
                            </span>
                            <small>{{ item.reportDate | date: 'd MMM' }}</small>
                          </span>
                        </button>
                      }
                    </div>
                  </section>
                }
              </div>

              @if (galleryLightboxItem()) {
                <nk-sticky-media-viewer
                  [items]="galleryStickyItems()"
                  [startIndex]="galleryStartIndex()"
                  [autoplay]="true"
                  paperColor="#fff8c4"
                  (closed)="closeGalleryLightbox()"
                />
              }
            }
          </section>
        }

        @case ('documents') {
          <section class="card">
            <header class="card-head">
              <span class="material-icons-outlined" aria-hidden="true">description</span>
              <h3 class="card-title">Documents</h3>
              <span class="head-count">{{ documentsCount() }} on file</span>
            </header>
            @let docOwnerId = ctx.subscription.institutionChildId ?? '';
            @if (docOwnerId) {
              <nk-child-documents-panel
                mode="staff"
                [ownerId]="docOwnerId"
                [tenantId]="institutionId"
                [parentDisplayName]="ctx.parent.displayName || null"
                (loaded)="documentsCount.set($event)"
                (requiredDocsLoaded)="onRequiredDocsLoaded($event)"
              />
            } @else {
              <p class="muted-center">
                This child has no institution-side roster id yet — documents
                cannot be shared until the parent links the child to this
                institution via a subscription.
              </p>
            }
          </section>
        }

        @case ('skills') {
          <section class="card">
            <header class="card-head">
              <span class="material-icons-outlined" aria-hidden="true">military_tech</span>
              <h3 class="card-title">Skills</h3>
              <span class="head-count">{{ skills().length }} tracked</span>
              <button type="button" class="btn-primary" (click)="openSkillEditor(null)">
                <span class="material-icons-outlined" aria-hidden="true">add</span>
                Add skill
              </button>
            </header>

            @if (skillEditorOpen()) {
              <form
                class="skill-editor"
                (submit)="$event.preventDefault(); saveSkill()"
              >
                <div class="form-grid">
                  <label class="form-field span-2">
                    <span class="form-label">Skill name</span>
                    <input
                      type="text"
                      name="n"
                      [(ngModel)]="skillDraft.name"
                      placeholder="e.g. Floats unaided for 10 seconds"
                      required
                    />
                  </label>
                  <label class="form-field">
                    <span class="form-label">Level</span>
                    <select name="l" [(ngModel)]="skillDraft.level">
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </label>
                  <label class="form-field">
                    <span class="form-label">Category</span>
                    <input
                      type="text"
                      name="cat"
                      [(ngModel)]="skillDraft.category"
                      placeholder="e.g. Motor skills"
                    />
                  </label>
                  <label class="form-field">
                    <span class="form-label">Achieved on</span>
                    <input type="date" name="a" [(ngModel)]="skillDraft.achievedAt" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">Instructor</span>
                    <input
                      type="text"
                      name="i"
                      [(ngModel)]="skillDraft.instructor"
                      placeholder="Staff member"
                    />
                  </label>
                  <label class="form-field span-2">
                    <span class="form-label">Notes</span>
                    <textarea
                      name="nt"
                      rows="2"
                      [(ngModel)]="skillDraft.notes"
                      placeholder="Optional"
                    ></textarea>
                  </label>
                </div>
                <div class="form-actions">
                  <button type="button" class="btn-secondary" (click)="cancelSkillEditor()">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="btn-primary"
                    [disabled]="!skillDraft.name.trim()"
                  >
                    {{ editingSkillId() ? 'Save changes' : 'Add skill' }}
                  </button>
                </div>
              </form>
            }

            @if (skills().length === 0) {
              <p class="muted-center">
                No skills logged yet. Add the first one to start tracking progress.
              </p>
            } @else {
              <ul class="skill-list" role="list">
                @for (s of skills(); track s.id) {
                  <li class="skill-row">
                    <div class="skill-row-head">
                      <strong class="skill-name">{{ s.name }}</strong>
                      <span class="skill-level" [attr.data-level]="s.level">{{ s.level }}</span>
                      @if (s.category) {
                        <span class="skill-cat">{{ s.category }}</span>
                      }
                      <div class="skill-actions">
                        <button
                          type="button"
                          class="row-btn"
                          (click)="openSkillEditor(s)"
                          title="Edit"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">edit</span>
                        </button>
                        <button
                          type="button"
                          class="row-btn danger"
                          (click)="confirmDeleteSkill(s.id)"
                          title="Delete"
                        >
                          <span class="material-icons-outlined" aria-hidden="true">delete</span>
                        </button>
                      </div>
                    </div>
                    <div class="skill-meta">
                      @if (s.achievedAt) {
                        <span>Achieved {{ s.achievedAt | date: 'd MMM yyyy' }}</span>
                      } @else {
                        <span class="muted">In progress</span>
                      }
                      @if (s.instructor) {
                        <span>· {{ s.instructor }}</span>
                      }
                    </div>
                    @if (s.notes) {
                      <p class="skill-notes">{{ s.notes }}</p>
                    }
                  </li>
                }
              </ul>
            }
          </section>
        }

        @case ('development') {
          <app-workspace-development-section
            [institutionId]="institutionId"
            [parentChildId]="ctx.child.id"
            [childDisplayName]="ctx.child.displayName"
            [childDateOfBirth]="ctx.child.dateOfBirth"
            [institutionName]="tenant?.branding?.displayName || tenant?.name || ''"
          />
        }

        @case ('parent') {
          <section class="card">
            <header class="card-head">
              <span class="material-icons-outlined" aria-hidden="true">family_restroom</span>
              <h3 class="card-title">Parent</h3>
              <span class="head-count read-only">read-only</span>
            </header>

            @if (parentLinked()) {
              <!--
                Parent panel renders the parent-aggregate's actual
                contact fields when the institution row links back to a
                parent account (or the API resolved one by guardian-name
                match). Empty values fall back to neutral placeholders
                instead of broken mailto links so SuperAdmins reading a
                roster can tell at a glance which fields are unfilled.
              -->
              <div class="parent-grid">
                <div class="parent-avatar">
                  {{ initials(ctx.parent.displayName) || '?' }}
                </div>
                <div class="parent-fields">
                  <div class="field-line">
                    <span class="field-label">Display name</span>
                    <span class="field-value">
                      @if (ctx.parent.displayName) {
                        {{ ctx.parent.displayName }}
                      } @else {
                        <em class="muted">Not on file</em>
                      }
                    </span>
                  </div>
                  <div class="field-line">
                    <span class="field-label">Email</span>
                    <span class="field-value">
                      @if (ctx.parent.email) {
                        <a [href]="'mailto:' + ctx.parent.email">{{ ctx.parent.email }}</a>
                      } @else {
                        <em class="muted">Not on file</em>
                      }
                    </span>
                  </div>
                  <div class="field-line">
                    <span class="field-label">Phone</span>
                    <span class="field-value">
                      @if (ctx.parent.phone) {
                        <a [href]="'tel:' + ctx.parent.phone">{{ ctx.parent.phone }}</a>
                      } @else {
                        <em class="muted">Not provided</em>
                      }
                    </span>
                  </div>
                  @if (parentJoinedAt(); as joined) {
                    <div class="field-line">
                      <span class="field-label">Joined</span>
                      <span class="field-value">
                        {{ joined | date: 'd MMM yyyy' }}
                      </span>
                    </div>
                  }
                  <div class="field-line">
                    <span class="field-label">Children on file</span>
                    <span class="field-value">
                      @for (kid of ctx.parent.children; track kid.id; let last = $last) {
                        <span class="kid-chip" [class.current]="kid.id === ctx.child.id">
                          {{ kid.displayName }}
                        </span>
                        @if (!last) {
                          <span class="kid-sep">·</span>
                        }
                      }
                    </span>
                  </div>
                </div>
              </div>
              <p class="parent-note">
                Parent identity is owned by the parent's account — edit it from
                the parent's portal, not here.
              </p>
            } @else {
              <!--
                No parent aggregate is linked to this institution-side
                roster entry (typically a staff-created walk-in). We
                surface the guardian list the institution captured at
                enrolment so staff still have a contact path, and
                explain why the parent panel is empty.
              -->
              <div class="parent-empty">
                <span class="material-icons-outlined" aria-hidden="true">person_search</span>
                <p class="parent-empty-title">No parent account linked</p>
                <p class="parent-empty-sub">
                  This child was added to the institution roster directly by
                  staff. Once the parent signs up and claims the child, this
                  panel will show their account details.
                </p>

                @if (guardiansForDisplay().length > 0) {
                  <ul class="guardian-list" role="list">
                    @for (g of guardiansForDisplay(); track g.id) {
                      <li class="guardian-row">
                        <div class="guardian-avatar">{{ initials(g.displayName) }}</div>
                        <div class="guardian-fields">
                          <strong class="guardian-name">{{ g.displayName }}</strong>
                          <span class="guardian-rel">{{ g.relationship }}</span>
                          @if (g.email) {
                            <a class="guardian-link" [href]="'mailto:' + g.email">{{ g.email }}</a>
                          }
                          @if (g.phone) {
                            <a class="guardian-link" [href]="'tel:' + g.phone">{{ g.phone }}</a>
                          }
                        </div>
                      </li>
                    }
                  </ul>
                }
              </div>
            }
          </section>
        }
      }

      <nk-sticky-media-viewer
        [item]="focusedPortraitStickyItem()"
        paperColor="#fde68a"
        (closed)="closeChildPortraitViewer()"
      />

      <nk-sticky-media-viewer
        [item]="focusedReportStickyItem()"
        [autoplay]="true"
        (closed)="closeReportMediaViewer()"
      />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .empty-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 36px 18px;
      color: #6b7280;
      text-align: center;
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 14px;
    }
    .empty-card .material-icons-outlined { font-size: 32px; color: #9ca3af; }
    .empty-card p { margin: 0; max-width: 360px; font-size: 13.5px; }

    /* ─────────── Live mode banner ─────────── */
    .live-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 12.5px;
    }
    .live-banner[data-state='loading'] {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .live-banner[data-state='error'] {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .live-banner .material-icons-outlined { font-size: 18px; }
    .live-banner .spin { animation: ws-cd-spin 1.1s linear infinite; }
    @keyframes ws-cd-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .live-banner-retry {
      margin-left: auto;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #b91c1c;
      background: #fff;
      border: 1px solid #fecaca;
      border-radius: 6px;
      cursor: pointer;
    }
    .live-banner-retry:hover { background: #fee2e2; }

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

    /* ─── Header ─── */
    .child-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.1rem;
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 14px;
    }
    .child-avatar {
      flex-shrink: 0;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: var(--nk-sky-soft, #e0f2fe);
      color: var(--nk-sky-deep, #0369a1);
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 1.05rem; letter-spacing: 0.04em;
      overflow: hidden;
    }
    .child-avatar.with-img { background: #f3f4f6; }
    .child-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .child-avatar--clickable {
      border: none;
      padding: 0;
      cursor: zoom-in;
      font: inherit;
    }
    .child-avatar--clickable:focus-visible {
      outline: 2px solid var(--sd-color-primary, #4f46e5);
      outline-offset: 3px;
    }
    .child-id { flex: 1; min-width: 0; }
    .child-name {
      margin: 0; font-size: 1.15rem; font-weight: 700;
      color: var(--sd-color-text);
    }
    .child-sub { font-size: 0.82rem; color: #6b7280; margin-top: 2px; }
    .child-pills { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: capitalize;
    }
    .pill.state { background: #f3f4f6; color: #4b5563; }
    .pill.state[data-state='active'] {
      background: rgba(34, 197, 94, 0.16);
      color: #15803d;
    }
    .pill.room {
      background: rgba(99, 102, 241, 0.12);
      color: #4f46e5;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
    .pill.plan {
      background: var(--nk-sky-soft, #e0f2fe);
      color: var(--nk-sky-deep, #0369a1);
    }
    .pill.docs {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 9px 2px 6px;
      font-size: 10.5px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .pill.docs .material-icons-outlined {
      font-size: 13px;
    }
    .pill.docs[data-state='complete'] {
      background: rgba(34, 197, 94, 0.16);
      color: #166534;
      border: 1px solid rgba(34, 197, 94, 0.35);
    }
    .pill.docs[data-state='missing'] {
      background: rgba(220, 38, 38, 0.12);
      color: #991b1b;
      border: 1px solid rgba(220, 38, 38, 0.45);
    }
    .child-meta {
      flex-shrink: 0;
      text-align: right;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .meta-row { font-size: 0.85rem; color: #6b7280; }
    .meta-row strong { color: var(--sd-color-text); font-weight: 600; margin-left: 4px; }
    @media (max-width: 600px) {
      .child-header { flex-wrap: wrap; }
      .child-meta { text-align: left; }
    }

    /* ─── Tabs ─── */
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 6px;
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border: 0;
      background: transparent;
      border-radius: 9px;
      cursor: pointer;
      color: #4b5563;
      font: inherit;
      font-size: 13.5px;
      font-weight: 600;
    }
    .tab .material-icons-outlined { font-size: 17px; }
    .tab:hover { background: #f3f6fa; color: var(--sd-color-text); }
    .tab.active {
      background: var(--sd-color-primary, #4f46e5);
      color: #fff;
    }

    /* ─── Cards ─── */
    .card {
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 14px;
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .card-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-head .material-icons-outlined {
      font-size: 20px;
      color: var(--sd-color-primary, #4f46e5);
    }
    .card-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: var(--sd-color-text);
    }
    .head-count {
      margin-left: 6px;
      color: #9ca3af;
      font-size: 12px;
      font-weight: 600;
    }
    .head-count.read-only { font-style: italic; }
    .btn-primary, .btn-secondary {
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid transparent;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-primary {
      background: var(--sd-color-primary, #4f46e5);
      color: #fff;
      margin-left: auto;
    }
    .btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
    .btn-primary:disabled { background: #c7d2fe; cursor: not-allowed; }
    .btn-secondary {
      background: #fff;
      color: #374151;
      border-color: var(--surface-border, #e5e7eb);
    }
    .btn-secondary:hover { background: #f3f6fa; }
    .btn-primary .material-icons-outlined,
    .btn-secondary .material-icons-outlined { font-size: 16px; }

    .muted-center {
      margin: 0;
      text-align: center;
      color: #9ca3af;
      font-size: 13.5px;
      padding: 28px 0;
    }
    .muted { color: #9ca3af; }

    /* ─── Forms ─── */
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 16px;
    }
    @media (max-width: 640px) {
      .form-grid { grid-template-columns: 1fr; }
    }
    .form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .form-field.span-2 { grid-column: 1 / -1; }
    .form-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .form-field input,
    .form-field select,
    .form-field textarea {
      padding: 9px 11px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 8px;
      background: #fff;
      color: var(--sd-color-text);
      font: inherit;
      font-size: 13.5px;
      resize: vertical;
    }
    .form-field input:focus,
    .form-field select:focus,
    .form-field textarea:focus {
      outline: 0;
      border-color: var(--sd-color-primary, #4f46e5);
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--surface-border, #e5e7eb);
    }

    .end-sub-panel {
      margin: 0 0 16px;
      padding: 16px 18px;
      border-radius: 12px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fafafa;
    }
    .end-sub-panel h3 {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 700;
      color: var(--sd-color-text);
    }
    .end-sub-hint {
      margin: 0 0 14px;
      font-size: 12.5px;
      line-height: 1.45;
      color: #6b7280;
    }
    .btn-end-sub {
      padding: 0;
      border: none;
      background: none;
      color: #b91c1c;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .btn-end-sub:hover {
      color: #991b1b;
    }
    .btn-ghost {
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      color: var(--sd-color-text);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-ghost:hover {
      background: #f9fafb;
    }
    .btn-danger {
      padding: 8px 14px;
      border-radius: 8px;
      border: none;
      background: #b91c1c;
      color: #fff;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-danger:hover:not(:disabled) {
      filter: brightness(1.06);
    }
    .btn-danger:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    /*
     * Mood picker — emoji-led row that mirrors the v1 "Mood Today"
     * design. Buttons stack a big emoji over a label, with a small
     * heart tick that appears under the active one. The container
     * lays them out so each button gets equal width on the form
     * grid; on narrow viewports they wrap to two rows of two.
     */
    .mood-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .mood-btn {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 10px 8px 14px;
      border-radius: 12px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      cursor: pointer;
      font: inherit;
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .mood-btn:hover { border-color: rgba(99, 102, 241, 0.4); }
    .mood-btn .mood-emoji { font-size: 26px; line-height: 1; }
    .mood-btn .mood-label {
      color: #4b5563;
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.01em;
    }
    .mood-btn.active {
      border-color: var(--sd-color-primary, #4f46e5);
      background: rgba(99, 102, 241, 0.08);
    }
    .mood-btn.active .mood-label { color: var(--sd-color-primary, #4f46e5); }
    .mood-tick {
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ecfdf5;
      border: 1px solid #34d399;
    }
    .mood-tick .material-icons-outlined {
      font-size: 12px;
      color: #047857;
    }
    @media (max-width: 520px) {
      .mood-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    /*
     * Segmented control — used by Breakfast / Snack / Lunch /
     * Sleep. Three buttons sit edge-to-edge in a rounded pill,
     * each with a leading icon (radio dot for portions, status
     * icon for sleep). Active state lifts the button to the
     * primary brand colour.
     */
    .seg-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      padding: 4px;
      background: #f3f4f6;
      border-radius: 10px;
    }
    .seg-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      color: #4b5563;
      transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
    }
    .seg-btn:hover { background: rgba(99, 102, 241, 0.08); }
    .seg-btn .material-icons-outlined {
      font-size: 16px;
      line-height: 1;
    }
    .seg-btn .seg-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .seg-btn.active {
      background: #fff;
      border-color: var(--sd-color-primary, #4f46e5);
      color: var(--sd-color-primary, #4f46e5);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
    .seg-btn.active .seg-dot .material-icons-outlined { color: #10b981; }

    .meal-field { min-width: 0; }
    @media (max-width: 520px) {
      .seg-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
      .seg-btn { padding: 6px 4px; font-size: 11.5px; }
      .seg-btn .material-icons-outlined { font-size: 14px; }
    }

    /*
     * Drinks / Hygiene rows — pair a chip-toggle with a number
     * stepper. Layout collapses to a single column on narrow
     * viewports so the stepper isn't squeezed.
     */
    .drinks-row,
    .hygiene-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .chip-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      color: #4b5563;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .chip-toggle:hover { border-color: rgba(99, 102, 241, 0.4); }
    .chip-toggle .material-icons-outlined { font-size: 16px; }
    .chip-toggle.active {
      background: #ecfdf5;
      border-color: #34d399;
      color: #065f46;
    }
    .chip-toggle.active .material-icons-outlined { color: #047857; }

    .stepper {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 999px;
      background: #fff;
    }
    .stepper-label {
      font-size: 11.5px;
      font-weight: 600;
      color: #6b7280;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .stepper-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border-radius: 50%;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #f9fafb;
      cursor: pointer;
      color: #374151;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .stepper-btn:hover:not(:disabled) {
      background: #eef2ff;
      border-color: rgba(99, 102, 241, 0.4);
    }
    .stepper-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .stepper-btn .material-icons-outlined { font-size: 16px; }
    .stepper-value {
      min-width: 18px;
      text-align: center;
      font-weight: 700;
      font-size: 14px;
      color: #111827;
    }

    /*
     * Sleep time — paired time inputs that mirror the v1 paper
     * "12:00 - 13:00" handwritten range. The dash separator is
     * decorative; the inputs themselves are independent.
     */
    .sleep-time-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 8px;
      margin-bottom: 8px;
    }
    .time-input {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .time-input .time-label {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .time-input input[type='time'] {
      padding: 6px 8px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      color: #111827;
      background: #fff;
      min-width: 100px;
    }
    .time-input input[type='time']:disabled {
      background: #f3f4f6;
      color: #9ca3af;
      cursor: not-allowed;
    }
    .time-sep {
      align-self: center;
      font-size: 16px;
      color: #6b7280;
      padding: 0 2px;
    }
    .sleep-quality-row { margin-top: 4px; }

    /* ─────────── Photo / video uploader ─────────── */
    .form-label-count {
      margin-left: 6px;
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
    }
    .media-uploader {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .media-drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 18px;
      border: 1.5px dashed rgba(99, 102, 241, 0.4);
      border-radius: 10px;
      background: rgba(99, 102, 241, 0.04);
      color: var(--sd-color-text, #111827);
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .media-drop:hover {
      background: rgba(99, 102, 241, 0.08);
      border-color: rgba(99, 102, 241, 0.6);
    }
    .media-drop .material-icons-outlined {
      font-size: 26px;
      color: var(--sd-color-primary, #4f46e5);
    }
    .media-drop-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--sd-color-primary, #4f46e5);
    }
    .media-drop-sub {
      font-size: 11.5px;
      color: #6b7280;
    }
    .media-error {
      margin: 0;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(248, 113, 113, 0.12);
      color: #b91c1c;
      font-size: 12.5px;
    }
    .media-thumbs {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 10px;
    }
    .media-thumb {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .media-thumb-preview {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #0b1020;
    }
    .media-thumb-zoom-btn {
      position: absolute;
      inset: 0;
      padding: 0;
      margin: 0;
      border: none;
      background: transparent;
      cursor: zoom-in;
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 0;
      -webkit-tap-highlight-color: transparent;
    }
    .media-thumb-zoom-btn:focus-visible {
      outline: 2px solid var(--sd-color-primary, #4f46e5);
      outline-offset: -2px;
    }
    .media-thumb-preview img,
    .media-thumb-preview video,
    .media-thumb-zoom-btn img,
    .media-thumb-zoom-btn video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .media-video-flag {
      position: absolute;
      top: 6px;
      left: 6px;
      font-size: 16px !important;
      color: #fff;
      background: rgba(17, 24, 39, 0.7);
      border-radius: 999px;
      padding: 2px;
    }
    .media-video-flag-draft {
      position: absolute;
      bottom: 8px;
      left: 8px;
      font-size: 16px !important;
      color: #fff;
      background: rgba(17, 24, 39, 0.7);
      border-radius: 999px;
      padding: 2px;
      pointer-events: none;
      z-index: 1;
    }
    .media-remove {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 0;
      background: rgba(17, 24, 39, 0.78);
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 120ms ease;
      z-index: 2;
    }
    .media-remove:hover { background: #b91c1c; }
    .media-remove .material-icons-outlined {
      font-size: 16px !important;
      color: #fff;
    }
    .media-caption {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 6px;
      font: inherit;
      font-size: 12px;
      color: var(--sd-color-text, #111827);
      background: #fff;
    }
    .media-caption:focus {
      outline: 2px solid rgba(99, 102, 241, 0.4);
      outline-offset: 1px;
    }

    .report-media-strip {
      list-style: none;
      margin: 6px 0 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .report-media-item {
      position: relative;
      width: 88px;
      height: 88px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #0b1020;
    }
    .report-media-zoom {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      padding: 0;
      margin: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      cursor: pointer;
      font: inherit;
      text-align: left;
      -webkit-tap-highlight-color: transparent;
    }
    .report-media-zoom:focus-visible {
      outline: 2px solid var(--sd-color-primary, #4f46e5);
      outline-offset: -2px;
      z-index: 1;
    }
    .report-media-zoom img,
    .report-media-zoom video.strip-video-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }
    .report-strip-play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.37);
      pointer-events: none;
    }
    .report-strip-play .material-icons-outlined {
      font-size: 34px !important;
      color: rgba(255, 255, 255, 0.95);
      filter: drop-shadow(0 1px 6px rgba(0, 0, 0, 0.45));
    }
    .report-media-item img,
    .report-media-item video:not(.strip-video-thumb) {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .report-media-item .report-media-caption {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 3px 6px;
      background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
      color: #fff;
      font-size: 10.5px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .report-editor, .skill-editor {
      padding: 14px;
      border: 1px dashed rgba(99, 102, 241, 0.4);
      border-radius: 10px;
      background: rgba(99, 102, 241, 0.03);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ─── Reports list ─── */
    .report-list, .skill-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .report-row, .skill-row {
      padding: 12px 14px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
      background: #fff;
    }
    .report-row-head, .skill-row-head {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .report-date { font-weight: 700; font-size: 13.5px; color: var(--sd-color-text); }
    .report-status {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .report-status[data-status='draft'] {
      background: #fef3c7;
      color: #b45309;
    }
    .report-status[data-status='published'] {
      background: rgba(34, 197, 94, 0.16);
      color: #15803d;
    }
    .report-mood { font-size: 18px; line-height: 1; }
    .report-media-flag {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: 11.5px;
      color: #6b7280;
    }
    .report-media-flag .material-icons-outlined { font-size: 14px; }
    .report-author { font-size: 11.5px; color: #9ca3af; }
    .report-actions, .skill-actions { margin-left: auto; display: inline-flex; gap: 4px; }
    .row-btn {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #4b5563;
    }
    .row-btn:hover {
      background: #f3f6fa;
      color: var(--sd-color-text);
    }
    .row-btn.danger:hover {
      background: #fef2f2;
      color: #b91c1c;
      border-color: #fecaca;
    }
    .row-btn .material-icons-outlined { font-size: 16px; }

    .report-summary {
      margin: 8px 0 0;
      font-size: 13.5px;
      color: var(--sd-color-text);
      line-height: 1.5;
    }
    .report-callouts {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .callout {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
    .callout .material-icons-outlined { font-size: 14px; }
    .callout.pos {
      background: rgba(34, 197, 94, 0.12);
      color: #15803d;
    }
    .callout.warn {
      background: rgba(251, 191, 36, 0.18);
      color: #b45309;
    }

    /* ─── Trends ─── */
    .trends-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }
    .trend-card {
      padding: 12px 14px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
      background: #fff;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .trend-card.empty { opacity: 0.55; }
    .trend-card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .trend-week { font-size: 13px; font-weight: 700; color: var(--sd-color-text); }
    .trend-count { font-size: 11.5px; color: #9ca3af; font-weight: 600; }
    .trend-empty {
      margin: 0;
      font-size: 12px;
      color: #9ca3af;
      font-style: italic;
    }
    .trend-section { display: flex; flex-direction: column; gap: 4px; }
    .trend-label {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6b7280;
    }
    .trend-value { font-size: 14px; font-weight: 700; color: var(--sd-color-text); }
    .trend-bar-row { display: flex; gap: 8px; }
    .mood-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #4b5563;
    }
    .mood-stat .mood-emoji { font-size: 15px; line-height: 1; }
    .mood-num { font-weight: 600; }
    .meal-row, .att-row { display: flex; flex-wrap: wrap; gap: 4px; }
    .meal-pill, .att-pill {
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
    }
    .meal-pill.all, .att-pill.present {
      background: rgba(34, 197, 94, 0.15);
      color: #15803d;
    }
    .meal-pill.some, .att-pill.late {
      background: rgba(251, 191, 36, 0.18);
      color: #b45309;
    }
    .meal-pill.none, .att-pill.absent {
      background: rgba(248, 113, 113, 0.15);
      color: #b91c1c;
    }
    .att-pill.left {
      background: #f3f4f6;
      color: #4b5563;
    }
    .trend-footer {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11.5px;
      color: #6b7280;
      margin-top: 4px;
    }
    .trend-footer .material-icons-outlined { font-size: 14px; }

    /* ─── Gallery ───
       Visual language ported from the parent SPA's gallery so staff and
       parents see media the same way: month-grouped, hover-lift tiles,
       responsive 2/3/4-column grid, in-page sticky-note lightbox.
       Album chips and "memory" badges aren't ported — staff are scoped
       to a single institution, and "family uploads" is a parent concept. */
    .gal-pane {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 4px 0 6px;
    }
    .gal-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 24px 12px;
      text-align: center;
    }
    .gal-empty .material-icons-outlined {
      font-size: 38px;
      color: #9ca3af;
    }
    .gal-empty p {
      margin: 4px 0 0;
      font-size: 14px;
      color: var(--sd-color-text);
      font-weight: 600;
    }
    .gal-empty small {
      color: #6b7280;
      font-size: 12px;
      max-width: 320px;
    }

    .gal-month {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .gal-month-h {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0 4px;
    }
    .gal-month-h h4 {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .gal-month-h small {
      font-size: 11px;
      color: #6b7280;
      font-variant-numeric: tabular-nums;
    }

    .gal-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    @media (min-width: 720px) {
      .gal-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 1100px) {
      .gal-grid { grid-template-columns: repeat(4, 1fr); }
    }

    .gal-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      padding: 0;
      font: inherit;
      text-align: left;
      transition: transform 180ms ease, box-shadow 180ms ease;
    }
    .gal-tile:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
    }
    .gal-tile:focus-visible {
      outline: 2px solid var(--nk-sky-deep, #5d81f6);
      outline-offset: 2px;
    }
    .gal-tile-media,
    .gal-tile img,
    .gal-tile video {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      background: #f3f4f6;
    }
    .gal-tile-play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
      pointer-events: none;
    }
    .gal-tile-play .material-icons-outlined {
      font-size: 56px;
      opacity: 0.92;
    }
    .gal-tile-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px 10px;
      background: #fff;
    }
    .gal-tile-cap {
      font-size: 12px;
      font-weight: 600;
      color: var(--sd-color-text);
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .gal-tile-meta small {
      color: #6b7280;
      font-size: 11px;
    }

    /* ─── Skills ─── */
    .skill-name { font-size: 14px; font-weight: 700; color: var(--sd-color-text); }
    .skill-level {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: capitalize;
    }
    .skill-level[data-level='beginner'] { background: #f3f4f6; color: #4b5563; }
    .skill-level[data-level='intermediate'] {
      background: rgba(99, 102, 241, 0.12);
      color: #4f46e5;
    }
    .skill-level[data-level='advanced'] {
      background: rgba(34, 197, 94, 0.16);
      color: #15803d;
    }
    .skill-cat {
      padding: 2px 8px;
      border-radius: 6px;
      background: #f9fafb;
      color: #6b7280;
      font-size: 11.5px;
      font-weight: 600;
    }
    .skill-meta {
      margin-top: 6px;
      font-size: 12px;
      color: #6b7280;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .skill-notes {
      margin: 8px 0 0;
      font-size: 13px;
      color: var(--sd-color-text);
      line-height: 1.5;
    }

    /* ─── Parent ─── */
    .parent-grid {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .parent-avatar {
      flex-shrink: 0;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: var(--nk-sky-soft, #e0f2fe);
      color: var(--nk-sky-deep, #0369a1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .parent-fields {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }
    .field-line {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .field-label {
      flex: 0 0 140px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .field-value {
      font-size: 13.5px;
      color: var(--sd-color-text);
      font-weight: 500;
    }
    .field-value a { color: var(--sd-color-primary, #4f46e5); text-decoration: none; }
    .field-value a:hover { text-decoration: underline; }
    .kid-chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      background: #f3f4f6;
      color: #4b5563;
      font-size: 12px;
      font-weight: 600;
      margin-right: 4px;
    }
    .kid-chip.current {
      background: rgba(99, 102, 241, 0.12);
      color: #4f46e5;
    }
    .kid-sep { color: #d1d5db; margin-right: 4px; }
    .parent-note {
      margin: 8px 0 0;
      font-size: 12px;
      color: #9ca3af;
      font-style: italic;
    }

    /* "No parent linked" empty state for staff-created walk-ins. */
    .parent-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 24px 18px 18px;
      text-align: center;
    }
    .parent-empty .material-icons-outlined {
      font-size: 36px;
      color: #9ca3af;
    }
    .parent-empty-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--sd-color-text, #111827);
    }
    .parent-empty-sub {
      margin: 0;
      max-width: 460px;
      font-size: 12.5px;
      line-height: 1.5;
      color: #6b7280;
    }
    .guardian-list {
      list-style: none;
      margin: 12px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      max-width: 520px;
      text-align: left;
    }
    .guardian-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: #f9fafb;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
    }
    .guardian-avatar {
      flex-shrink: 0;
      width: 36px; height: 36px;
      border-radius: 50%;
      background: var(--nk-sky-soft, #e0ebf6);
      color: var(--nk-sky-deep, #1f4e79);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 12.5px;
      letter-spacing: 0.04em;
    }
    .guardian-fields {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 10px;
    }
    .guardian-name {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--sd-color-text, #111827);
    }
    .guardian-rel {
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #9ca3af;
      font-weight: 700;
    }
    .guardian-link {
      font-size: 12.5px;
      color: var(--sd-color-primary, #4f46e5);
      text-decoration: none;
    }
    .guardian-link:hover { text-decoration: underline; }
  `,
})
export class WorkspaceChildDetailComponent implements OnInit {
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly childrenApi = inject(WayelAdminChildrenService);
  private readonly dailyReportsApi = inject(WayelAdminDailyReportsService);
  private readonly programsApi = inject(WayelAdminProgramsService);
  private readonly mediaApi = inject(WayelAdminMediaService);
  private readonly subscriptionsApi = inject(WayelAdminSubscriptionsService);

  /**
   * Live mode flips on when `environment.useMock === false`. In that
   * mode the page reads the child profile from `/api/v1/children/{id}`
   * and the report rows from `/api/v1/daily-reports?childId=...`,
   * scoped to the workspace tenant via `?tenantId=`. Mutations
   * (`saveReport`, `togglePublish`, `confirmDeleteReport`) call the
   * matching write endpoints with the same `?tenantId=` override and
   * refresh the row set in place.
   */
  protected readonly liveMode = !environment.useMock;

  /** Institution this view is scoped to. */
  @Input({ required: true })
  set institutionId(v: string) {
    this._institutionId = v;
    if (this.liveMode && this._parentChildId()) {
      void this.loadLive();
    }
  }
  get institutionId(): string {
    return this._institutionId;
  }
  private _institutionId = '';

  /** The child to render. */
  @Input({ required: true })
  set parentChildId(v: string) {
    this._parentChildId.set(v);
    // Reset transient editor / tab state when switching child.
    this.activeTab.set('reports');
    this.cancelReportEditor();
    this.cancelSkillEditor();
    this.closeReportMediaViewer();
    this.closeEndSubscriptionPanel();
    this.tick();
    if (this.liveMode && this._institutionId && v) {
      void this.loadLive();
    }
  }
  get parentChildId(): string {
    return this._parentChildId();
  }

  ngOnInit(): void {
    if (this.liveMode && this._institutionId && this._parentChildId()) {
      void this.loadLive();
    }
  }

  /**
   * Optional tenant — used for the header pill / display name **and**
   * to gate the tab strip (`kind === 'session'` institutions hide
   * "Development", which only makes sense for full-day daycares /
   * preschools that run termly milestone reviews).
   *
   * Backed by a signal so `visibleTabs()` re-derives whenever the
   * parent rebinds the tenant (e.g. after a tenant switch in the
   * platform shell).
   */
  @Input()
  set tenant(value: MockPlatformTenant | undefined | null) {
    this._tenant.set(value ?? null);
  }
  get tenant(): MockPlatformTenant | undefined | null {
    return this._tenant();
  }
  private readonly _tenant = signal<MockPlatformTenant | null>(null);

  /** Emitted when the user hits the back link. */
  @Output() readonly back = new EventEmitter<void>();

  /**
   * Master tab list, in display order. The `gatedFor` set lists
   * institution kinds for which the tab should *not* render. Today
   * only "Development" is session-aware (term-end milestone reviews
   * are a daycare-only concept); add new gates here rather than
   * branching in the template.
   */
  private readonly tabs: readonly (ChildTabDef & {
    gatedFor?: ReadonlySet<Phase0InstitutionKind>;
  })[] = [
    { id: 'reports', label: 'Daily reports', icon: 'assignment' },
    { id: 'trends', label: 'Weekly trends', icon: 'insights' },
    { id: 'gallery', label: 'Gallery', icon: 'photo_library' },
    { id: 'documents', label: 'Documents', icon: 'description' },
    { id: 'skills', label: 'Skills', icon: 'military_tech' },
    {
      id: 'development',
      label: 'Development',
      icon: 'school',
      gatedFor: new Set<Phase0InstitutionKind>(['session']),
    },
    { id: 'parent', label: 'Parent', icon: 'family_restroom' },
  ];

  /**
   * Tabs the current tenant should actually see. Drops anything whose
   * `gatedFor` set contains the tenant's `kind`. Defaults to "show
   * everything" when `tenant.kind` is missing — better to over-show in
   * the unknown case than silently hide a feature behind a stale mock.
   */
  protected readonly visibleTabs = computed<ChildTabDef[]>(() => {
    const kind = this._tenant()?.kind;
    if (!kind) return [...this.tabs];
    return this.tabs.filter((t) => !t.gatedFor?.has(kind));
  });

  protected readonly activeTab = signal<ChildDetailTab>('reports');

  constructor() {
    // If the parent rebinds `tenant` to a session-based institution
    // *while* the user is sitting on a now-hidden tab (today: only
    // "Development"), snap them back to the first visible tab. Without
    // this the body would render an empty switch arm and the tab strip
    // would lose its highlight cue.
    effect(
      () => {
        const visible = this.visibleTabs();
        const current = this.activeTab();
        if (!visible.some((t) => t.id === current) && visible.length > 0) {
          this.activeTab.set(visible[0].id);
        }
      },
      { allowSignalWrites: true },
    );
  }

  /**
   * Live count of documents currently shown in the Documents tab. Lifted
   * here so the tab strip can show a small badge (and so other tabs can
   * cheaply read the count without re-fetching).
   */
  protected readonly documentsCount = signal<number>(0);

  /**
   * Latest required-documents status emitted by the documents panel.
   * `null` until the first reload, then a `{ hasClinicCard,
   * hasBirthCertificate }` snapshot. Drives the green / red "Docs"
   * pill on the child header so reviewers can see at a glance
   * whether the parent has filed the two mandatory documents.
   */
  protected readonly requiredDocsStatus = signal<{
    hasClinicCard: boolean;
    hasBirthCertificate: boolean;
  } | null>(null);

  protected onRequiredDocsLoaded(status: {
    hasClinicCard: boolean;
    hasBirthCertificate: boolean;
  }): void {
    this.requiredDocsStatus.set(status);
  }

  /**
   * Pill descriptor for the staff child-header. `null` when we
   * haven't loaded documents yet (so the header doesn't flash an
   * unfounded "missing" pill on first render).
   */
  protected childDocsPill(): {
    state: 'complete' | 'missing';
    label: string;
    icon: string;
    tooltip: string;
  } | null {
    const s = this.requiredDocsStatus();
    if (!s) return null;
    if (s.hasClinicCard && s.hasBirthCertificate) {
      return {
        state: 'complete',
        label: 'Docs ✓',
        icon: 'verified',
        tooltip:
          'Clinic card and birth certificate are both on file in this child\'s vault.',
      };
    }
    const missing: string[] = [];
    if (!s.hasClinicCard) missing.push('clinic card');
    if (!s.hasBirthCertificate) missing.push('birth certificate');
    return {
      state: 'missing',
      label: 'Docs missing',
      icon: 'priority_high',
      tooltip: `Parent has not uploaded ${missing.join(' and ')} for this child yet.`,
    };
  }

  /**
   * "Bump" counter — incremented after every mock-mutation so the
   * computed signals re-pull from the underlying mutable mock store.
   */
  protected readonly version = signal(0);

  private readonly _parentChildId = signal<string>('');

  protected readonly context = computed<WorkspaceChildContext | null>(() => {
    this.version();
    const id = this._parentChildId();
    if (!id || !this.institutionId) return null;
    if (this.liveMode) {
      return this.liveContext();
    }
    return findChildContext(this.institutionId, id);
  });

  protected readonly reports = computed<MockDailyReport[]>(() => {
    this.version();
    const id = this._parentChildId();
    if (!id || !this.institutionId) return [];
    if (this.liveMode) {
      return this.liveReports();
    }
    return listReportsForChild(this.institutionId, id);
  });

  // ── Live mode state ───────────────────────────────────────────────────
  /** Banner state — driven by `loadLive` and the writers' refresh tail. */
  protected readonly liveLoading = signal(false);
  protected readonly liveError = signal<string | null>(null);
  /** Synthesised `WorkspaceChildContext` from `WayelChildDetail`. */
  private readonly liveContext = signal<WorkspaceChildContext | null>(null);
  /**
   * Raw {@link WayelChildDetail} kept alongside the synthesised context
   * so the parent panel's "no parent linked" empty state can list the
   * institution-side guardians (which the
   * {@link WorkspaceChildContext} shape doesn't carry).
   */
  protected readonly liveDetail = signal<WayelChildDetail | null>(null);
  /** Reports list mapped from the wire DTOs. */
  private readonly liveReports = signal<MockDailyReport[]>([]);
  /**
   * First active program at the tenant — used as the implicit `programId`
   * when the SuperAdmin authors a brand-new report from this surface.
   * We don't yet expose a per-row picker; admins compose the canonical
   * version from the staff portal when the child sits in a non-default
   * program.
   */
  private readonly liveDefaultProgramId = signal<string | null>(null);
  private readonly liveDefaultProgramName = signal<string | null>(null);

  /** Staff-only live flow: end subscription period via `/subscription-periods/{id}/end`. */
  protected readonly endSubscriptionPanelOpen = signal(false);
  protected readonly endSubscriptionSubmitting = signal(false);
  protected endSubscriptionReason: WayelSubscriptionEndReason = 'InstitutionTerminated';
  protected endSubscriptionNote = '';
  protected endSubscriptionScheduledOn = '';

  protected readonly canOfferEndSubscription = computed(() => {
    this.version();
    if (!this.liveMode) return false;
    const ctx = this.liveContext();
    const sid = ctx?.subscription.subscriptionPeriodId;
    if (!sid) return false;
    return ctx.subscription.state !== 'ended';
  });

  protected readonly gallery = computed<GalleryItem[]>(() => {
    return extractGalleryFromReports(this.reports());
  });

  /**
   * Month-grouped gallery view. Mirrors the parent SPA's gallery
   * layout (newest-month-first, "October 2026" headers, item count
   * per month) so staff and parents see the same media organised the
   * same way. Album chips are deliberately omitted — staff are
   * already scoped to one institution; "filter by institution" only
   * makes sense for parents whose child rides multiple subscriptions.
   */
  protected readonly galleryView = computed<{
    total: number;
    months: Array<{ key: string; label: string; items: GalleryItem[] }>;
  }>(() => {
    const all = this.gallery();
    if (all.length === 0) return { total: 0, months: [] };

    const monthMap = new Map<string, GalleryItem[]>();
    for (const item of all) {
      const key = item.reportDate.slice(0, 7); // YYYY-MM
      const bucket = monthMap.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        monthMap.set(key, [item]);
      }
    }
    const months = [...monthMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => {
        const [yyyy, mm] = key.split('-');
        const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, 1));
        return {
          key,
          label: date.toLocaleString('en', { month: 'long', year: 'numeric' }),
          items,
        };
      });

    return { total: all.length, months };
  });

  /** When non-null, the gallery lightbox is open on that media item. */
  protected readonly galleryLightboxItem = signal<GalleryItem | null>(null);

  /**
   * Carousel feed for the sticky-note viewer. Flat list in the same
   * order as the months render so left/right chevrons walk the entire
   * gallery instead of bouncing within one month.
   */
  protected readonly galleryStickyItems = computed<StickyMediaItem[] | null>(() => {
    const lb = this.galleryLightboxItem();
    if (!lb) return null;
    const flat: GalleryItem[] = [];
    for (const month of this.galleryView().months) {
      for (const item of month.items) flat.push(item);
    }
    return flat.map(
      (item): StickyMediaItem => ({
        id: item.id,
        url: item.url,
        kind: item.kind === 'video' ? 'video' : 'image',
        caption: item.caption ?? null,
        meta: this.formatGalleryDateMeta(item.reportDate),
        downloadUrl: item.url,
      }),
    );
  });

  /** Index of {@link galleryLightboxItem} inside {@link galleryStickyItems}. */
  protected readonly galleryStartIndex = computed<number>(() => {
    const lb = this.galleryLightboxItem();
    const list = this.galleryStickyItems();
    if (!lb || !list) return 0;
    const i = list.findIndex((entry) => entry.id === lb.id);
    return i < 0 ? 0 : i;
  });

  protected openGalleryLightbox(item: GalleryItem): void {
    this.galleryLightboxItem.set(item);
  }

  protected closeGalleryLightbox(): void {
    this.galleryLightboxItem.set(null);
  }

  /**
   * "14 Oct 2026 · Daily report" subtitle for the lightbox caption
   * strip. Matches the parent SPA's tone but states explicitly that
   * the source is the daily report — staff workspaces don't have the
   * "family memory" axis the parent gallery has.
   */
  private formatGalleryDateMeta(reportDate: string): string {
    const d = new Date(reportDate);
    if (Number.isNaN(d.getTime())) return 'Daily report';
    const formatted = d.toLocaleDateString('en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${formatted} · Daily report`;
  }

  protected readonly trends = computed<WeeklyTrendBucket[]>(() => {
    return weeklyTrendsForChild(this.reports(), 8);
  });

  protected readonly skills = computed<WorkspaceChildSkill[]>(() => {
    this.version();
    const id = this._parentChildId();
    if (!id || !this.institutionId) return [];
    return listSkillsForChild(this.institutionId, id);
  });

  // ── Daily reports editor state ───────────────────────────────────────
  protected readonly reportEditorOpen = signal(false);
  protected readonly editingReportId = signal<string | null>(null);
  protected reportDraft: DailyReportDraft = blankReportDraft();
  /** Inline error shown under the uploader (e.g. file too large). */
  protected readonly mediaError = signal<string | null>(null);
  /**
   * Set while one or more files are mid-flight through the S3-style
   * upload pipeline so the editor can disable Save / show a spinner
   * and prevent users from posting a report that references a URL the
   * blob store hasn't received bytes for yet.
   */
  protected readonly mediaUploading = signal<boolean>(false);
  /** Presigned uploads allow ~100&nbsp;MB (HD video); images are shrunk client-side (~10&nbsp;MB). */
  private static readonly MAX_UPLOAD_BYTES_RAW = MEDIA_SCOPE_MAX_RAW_BYTES;

  /** Full-screen portrait preview (staff tap header photo). */
  protected readonly focusedChildPortraitUrl = signal<string | null>(null);

  /** Full-screen preview for report media thumbnails (read & edit flows). */
  protected readonly focusedReportMedia = signal<Phase0DailyReportMedia | null>(null);

  /**
   * Adapters that hand the active media row / portrait URL to the
   * shared sticky-note viewer. Returns `null` when nothing is open so
   * the viewer's @if collapses without painting.
   */
  protected readonly focusedReportStickyItem = computed<StickyMediaItem | null>(() => {
    const m = this.focusedReportMedia();
    if (!m) return null;
    const ctx = this.context();
    const meta = ctx
      ? [ctx.child.displayName, ctx.parent?.displayName ?? null]
          .filter((p): p is string => !!p && p.length > 0)
          .join(' · ')
      : null;
    return {
      id: m.id,
      url: m.url,
      kind: m.kind === 'video' ? 'video' : 'image',
      caption: m.caption ?? null,
      fileName: null,
      meta: meta || null,
      downloadUrl: m.url,
    };
  });

  protected readonly focusedPortraitStickyItem = computed<StickyMediaItem | null>(() => {
    const url = this.focusedChildPortraitUrl();
    if (!url) return null;
    const ctx = this.context();
    return {
      id: 'portrait',
      url,
      kind: 'image',
      caption: ctx?.child.displayName ?? 'Profile photo',
      meta: 'Profile photo',
      downloadUrl: url,
    };
  });

  protected workspaceMediaHasUrl(m: Phase0DailyReportMedia): boolean {
    const u = m.url?.trim();
    return !!u && (u.startsWith('http') || u.startsWith('blob:') || u.startsWith('data:'));
  }

  protected openReportMediaViewer(m: Phase0DailyReportMedia): void {
    if (!this.workspaceMediaHasUrl(m)) return;
    this.focusedReportMedia.set(m);
  }

  protected closeReportMediaViewer(): void {
    this.focusedReportMedia.set(null);
  }

  protected openChildPortraitViewer(): void {
    const url = this.context()?.child.photoUrl?.trim();
    if (url) {
      this.focusedChildPortraitUrl.set(url);
    }
  }

  protected closeChildPortraitViewer(): void {
    this.focusedChildPortraitUrl.set(null);
  }

  // ── Skills editor state ──────────────────────────────────────────────
  protected readonly skillEditorOpen = signal(false);
  protected readonly editingSkillId = signal<string | null>(null);
  protected skillDraft: SkillDraft = blankSkillDraft();

  /**
   * Mood picker — relabelled to mirror the v1 paper "Today I was:"
   * row (Happy / Sad / Tired / Mad). The wire enum keeps the
   * existing `Happy | Okay | Sad | Mad | Neutral` set, so the
   * `'okay'` value is reused as the "Tired" slot here.
   *
   * <p><strong>Editor-only.</strong> Other surfaces (parent feed,
   * weekly-trends panel) still surface "Okay" 🙂 via
   * <see cref="moodTrendChoices"/> and the shared `moodLabel()`
   * helper — that's a deliberate split locked in
   * `wayel-stable-contracts.mdc`. Don't iterate `moodChoices` from
   * non-editor surfaces.</p>
   */
  protected readonly moodChoices = [
    { value: 'happy' as const, emoji: '😊', label: 'Happy' },
    { value: 'sad' as const, emoji: '😢', label: 'Sad' },
    { value: 'okay' as const, emoji: '😴', label: 'Tired' },
    { value: 'mad' as const, emoji: '😡', label: 'Mad' },
  ];

  /**
   * Mood-bucket order + canonical labels for the **weekly-trends**
   * panel. Same enum values as `moodChoices` but the legacy "Okay"
   * 🙂 wording stays so trends and the parent-feed report card
   * agree. Order matches the historical legend (happy → okay →
   * sad → mad) so existing screenshots and docs stay valid.
   */
  protected readonly moodTrendChoices = [
    { value: 'happy' as const, emoji: '😊', label: 'Happy' },
    { value: 'okay' as const, emoji: '🙂', label: 'Okay' },
    { value: 'sad' as const, emoji: '😞', label: 'Sad' },
    { value: 'mad' as const, emoji: '😡', label: 'Mad' },
  ];

  /**
   * Portion options for Breakfast / Snack / Lunch. The order
   * (`all → some → none`) matches the v1 paper left-to-right and
   * the parent SPA's report card legend so meaning stays consistent
   * across surfaces.
   */
  protected readonly portionChoices = [
    { value: 'all' as const, label: 'All' },
    { value: 'some' as const, label: 'Some' },
    { value: 'none' as const, label: 'None' },
  ];

  /**
   * Display list driving the Breakfast / Snack / Lunch row in the
   * editor template. Pinned as a literal-typed `readonly` so Angular
   * template strictness can index `reportDraft.meals[id]` safely.
   * Labels intentionally use the v1 paper voice ("For breakfast I
   * ate:") so the editor reads the way the form was originally
   * authored.
   */
  protected readonly mealRows = [
    { id: 'breakfast' as const, label: 'For breakfast I ate' },
    { id: 'snack' as const, label: 'For snack I ate' },
    { id: 'lunch' as const, label: 'For lunch I ate' },
  ];

  /**
   * Sleep choices for the "Sleep time" row. Labels match the v1
   * paper checkboxes verbatim. `null` means "no quality recorded"
   * — distinct from `noSleep: true`, which is "child did not sleep"
   * (and is what parents see flagged on the report card).
   */
  protected readonly sleepChoices = [
    { value: 'well' as const, label: 'Slept well', icon: 'check_circle' },
    { value: 'restless' as const, label: 'Restless', icon: 'change_history' },
    { value: 'none' as const, label: 'Did not sleep', icon: 'do_not_disturb_on' },
  ] as const;

  /**
   * `true` when the workspace's institution is a daycare-kind tenant
   * — that's where the rich daycare blocks (meals / drinks / sleep /
   * hygiene) are valid. Defaults to `true` when the kind is unknown
   * so a stale or missing tenant shape doesn't silently hide the
   * extended form on real daycare workspaces. Session institutions
   * keep the simpler "Notes + media" layout.
   */
  protected readonly isDaycareKind = computed<boolean>(() => {
    const kind = this._tenant()?.kind;
    return kind !== 'session';
  });

  /**
   * Helper for the sleep segmented control. The button toggles
   * between the three states; "No sleep" maps onto
   * `sleep.noSleep = true` plus `napQuality = null`, while
   * `'well' | 'restless'` clear `noSleep` and stamp the quality.
   */
  protected setSleepChoice(value: 'well' | 'restless' | 'none'): void {
    const current = this.currentSleepChoice();
    // Tap-to-clear: re-clicking the active choice resets the row.
    const next = current === value ? null : value;
    if (next === 'none') {
      this.reportDraft.sleep = {
        ...this.reportDraft.sleep,
        noSleep: true,
        napQuality: null,
      };
      return;
    }
    this.reportDraft.sleep = {
      ...this.reportDraft.sleep,
      noSleep: false,
      napQuality: next,
    };
  }

  /** Inverse of {@link setSleepChoice} — drives `[class.active]`. */
  protected currentSleepChoice(): 'well' | 'restless' | 'none' | null {
    const s = this.reportDraft.sleep;
    if (s.noSleep) return 'none';
    if (s.napQuality === 'well' || s.napQuality === 'restless') {
      return s.napQuality;
    }
    return null;
  }

  /** Tap-to-toggle for the meal portion segmented control. */
  protected setMealPortion(
    meal: 'breakfast' | 'snack' | 'lunch',
    portion: Phase0MealPortion,
  ): void {
    const current = this.reportDraft.meals[meal];
    this.reportDraft.meals = {
      ...this.reportDraft.meals,
      [meal]: current === portion ? null : portion,
    };
  }

  /** "+ / –" stepper for the bottle counter on the Drinks row. */
  protected adjustBottleCount(delta: number): void {
    const next = Math.max(0, (this.reportDraft.drinks.bottlesCount ?? 0) + delta);
    this.reportDraft.drinks = {
      ...this.reportDraft.drinks,
      bottlesCount: next,
    };
  }

  protected toggleWaterDrunk(): void {
    this.reportDraft.drinks = {
      ...this.reportDraft.drinks,
      water: !this.reportDraft.drinks.water,
    };
  }

  /** Toggles the "Bottles" v1 paper checkbox by flipping bottlesCount 0 ↔ 1. */
  protected toggleBottlesDrunk(): void {
    const next = (this.reportDraft.drinks.bottlesCount ?? 0) > 0 ? 0 : 1;
    this.reportDraft.drinks = {
      ...this.reportDraft.drinks,
      bottlesCount: next,
    };
  }

  protected toggleMilkDrunk(): void {
    this.reportDraft.drinks = {
      ...this.reportDraft.drinks,
      milk: !this.reportDraft.drinks.milk,
    };
  }

  protected toggleTeaDrunk(): void {
    this.reportDraft.drinks = {
      ...this.reportDraft.drinks,
      tea: !this.reportDraft.drinks.tea,
    };
  }

  /** Multi-select toggles for the v1 paper "Nappies" row. */
  protected toggleNappyFlag(flag: 'soiled' | 'wet' | 'dry'): void {
    this.reportDraft.hygiene = {
      ...this.reportDraft.hygiene,
      [flag]: !this.reportDraft.hygiene[flag],
    };
  }

  /**
   * Two-button "Yes / No" picker for potty training. Tapping the
   * inactive choice flips the boolean; tapping the active choice is
   * a no-op (a yes/no field has no third "cleared" state).
   */
  protected setPottyTraining(value: boolean): void {
    if (this.reportDraft.hygiene.pottyTraining === value) return;
    this.reportDraft.hygiene = {
      ...this.reportDraft.hygiene,
      pottyTraining: value,
    };
  }

  /** "+ / –" stepper for the diaper-changes count. */
  protected adjustDiaperCount(delta: number): void {
    const current = this.reportDraft.hygiene.diaperChanges ?? 0;
    const next = Math.max(0, current + delta);
    this.reportDraft.hygiene = {
      ...this.reportDraft.hygiene,
      diaperChanges: next === 0 && delta < 0 ? null : next,
    };
  }

  protected togglePottyTraining(): void {
    this.reportDraft.hygiene = {
      ...this.reportDraft.hygiene,
      pottyTraining: !this.reportDraft.hygiene.pottyTraining,
    };
  }

  // ── Tabs / helpers ───────────────────────────────────────────────────

  protected setTab(tab: ChildDetailTab): void {
    this.closeReportMediaViewer();
    this.activeTab.set(tab);
    if (tab !== 'reports') this.cancelReportEditor();
    if (tab !== 'skills') this.cancelSkillEditor();
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase() || '??';
  }

  /**
   * Whether the workspace can render the rich parent panel. We require
   * either a real display name or a real email — anything weaker (just
   * a phone number, or only a child-row link) is treated as "no parent
   * account" and falls back to the guardian list.
   *
   * In mock mode the synthesised parent always has both fields, so this
   * is effectively always true. In live mode it gates the empty state
   * for staff-created walk-ins.
   */
  protected readonly parentLinked = computed<boolean>(() => {
    const ctx = this.context();
    if (!ctx) return false;
    const hasName = (ctx.parent.displayName ?? '').trim().length > 0;
    const hasEmail = (ctx.parent.email ?? '').trim().length > 0;
    return hasName || hasEmail;
  });

  /**
   * ISO timestamp of when the parent first signed up. We prefer the
   * value carried by the live wire DTO so the panel anchors on the
   * actual parent-aggregate creation date rather than the synth's
   * fallback (which is the child row's enrolment timestamp).
   */
  protected readonly parentJoinedAt = computed<string | null>(() => {
    const detail = this.liveDetail();
    if (detail?.parentJoinedOnUtc) return detail.parentJoinedOnUtc;
    const ctx = this.context();
    return ctx?.parent.createdAt ?? null;
  });

  /**
   * Institution-side guardian roster used by the "no parent linked"
   * empty state. Mock mode returns an empty list (the mock store
   * doesn't carry a parallel guardian shape) so the empty state stays
   * compact.
   */
  protected readonly guardiansForDisplay = computed(() => {
    const detail = this.liveDetail();
    if (!detail?.guardians) return [];
    return detail.guardians.filter((g) => g.displayName.trim().length > 0);
  });

  protected ageLabel(dob: string): string {
    return ageLabel(ageInYears(dob));
  }

  protected moodEmoji = moodEmoji;
  protected moodLabel = moodLabel;
  protected attendanceLabel = attendanceLabel;

  protected napLabel(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  protected moodCount(
    w: WeeklyTrendBucket,
    mood: 'happy' | 'okay' | 'sad' | 'mad',
  ): number {
    return w.moods[mood] || 0;
  }

  protected hasMealData(w: WeeklyTrendBucket): boolean {
    return w.meals.all > 0 || w.meals.some > 0 || w.meals.none > 0;
  }

  protected hasAttendanceData(w: WeeklyTrendBucket): boolean {
    const a = w.attendance;
    return a.present > 0 || a.late > 0 || a.absent > 0 || a.left_early > 0;
  }

  // ── Daily reports CRUD ───────────────────────────────────────────────

  protected openReportEditor(existing: MockDailyReport | null): void {
    if (existing) {
      this.editingReportId.set(existing.id);
      // Daycare blocks are absent on session reports, so fall back to
      // the blank shape for those — the form will hide them anyway,
      // but we still need a valid struct so [(ngModel)] doesn't choke
      // on undefined paths.
      const blank = blankReportDraft();
      this.reportDraft = {
        reportDate: existing.reportDate,
        status: existing.status,
        mood: existing.mood,
        summary: existing.summary,
        highlights: existing.highlights,
        concerns: existing.concerns,
        media: existing.media.map((m) => ({ ...m })),
        meals: existing.meals
          ? { ...existing.meals }
          : blank.meals,
        // Drinks / Hygiene legacy reports may be missing the new
        // v1 paper-form fields; coerce to required booleans so the
        // template never sees `undefined`.
        drinks: existing.drinks
          ? {
              water: existing.drinks.water,
              bottlesCount: existing.drinks.bottlesCount,
              milk: !!existing.drinks.milk,
              tea: !!existing.drinks.tea,
            }
          : blank.drinks,
        sleep: existing.sleep
          ? { ...existing.sleep }
          : blank.sleep,
        hygiene: existing.hygiene
          ? {
              pottyTraining: existing.hygiene.pottyTraining,
              diaperChanges: existing.hygiene.diaperChanges,
              notes: existing.hygiene.notes,
              soiled: !!existing.hygiene.soiled,
              wet: !!existing.hygiene.wet,
              dry: !!existing.hygiene.dry,
            }
          : blank.hygiene,
      };
    } else {
      this.editingReportId.set(null);
      this.reportDraft = blankReportDraft();
    }
    this.mediaError.set(null);
    this.reportEditorOpen.set(true);
  }

  protected cancelReportEditor(): void {
    this.reportEditorOpen.set(false);
    this.editingReportId.set(null);
    this.reportDraft = blankReportDraft();
    this.mediaError.set(null);
    this.closeReportMediaViewer();
  }

  protected setReportMood(mood: 'happy' | 'okay' | 'sad' | 'mad'): void {
    this.reportDraft.mood = this.reportDraft.mood === mood ? null : mood;
  }

  /**
   * Append each picked file to the draft as a `Phase0DailyReportMedia`
   * entry. Files over the raw upload ceiling are skipped with an inline
   * error so users still see the rest go through.
   *
   * In mock mode each file is read as a `data:` URL and stored inline
   * in the draft. In live mode the bytes are pushed straight through
   * the S3-style presigned-URL pipeline — the backend mints a ticket,
   * the SPA `PUT`s the file at the dev/in-memory store (or S3 in
   * production), and the persisted `mediaUrl` is what we keep on the
   * draft. The preview thumbnail uses that same URL since the dev
   * endpoint serves the bytes back, and a CDN does the same job in
   * production.
   */
  protected onMediaSelected(input: HTMLInputElement | null): void {
    const files = input?.files ? Array.from(input.files) : [];
    if (files.length === 0) return;
    this.mediaError.set(null);

    const tooLarge: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      if (f.size > WorkspaceChildDetailComponent.MAX_UPLOAD_BYTES_RAW) {
        tooLarge.push(f.name);
      } else {
        accepted.push(f);
      }
    }

    if (tooLarge.length > 0) {
      const list = tooLarge.join(', ');
      this.mediaError.set(
        `Skipped ${tooLarge.length} file${tooLarge.length === 1 ? '' : 's'} over 100 MB: ${list}`,
      );
    }

    if (this.liveMode) {
      const tenantId = this._institutionId;
      if (!tenantId) {
        this.mediaError.set('Pick an institution first to attach media.');
        if (input) input.value = '';
        return;
      }
      // Fan out the uploads in parallel so a single big file doesn't
      // block the rest. Each result is pushed into the draft as it
      // resolves so users see thumbs appear progressively.
      //
      // We pass `owner = Child(parentChildId)` whenever we have it so
      // the S3 key gets the per-owner prefix
      // (`{tenant}/daily-reports/Child/{childId}/...`). When the
      // editor is opened without a child context (rare — usually
      // means a misconfigured embed), we fall back to the legacy flat
      // key shape so the upload still goes through.
      const childId = this._parentChildId();
      const owner = childId
        ? ({ ownerType: 'Child', ownerId: childId } as const)
        : null;
      this.mediaUploading.set(true);
      Promise.allSettled(
        accepted.map((f) =>
          this.mediaApi
            .uploadFile(f, { tenantId, scope: 'daily-reports', owner })
            .then((res) => ({
              file: f,
              mediaUrl: res.mediaUrl,
              mediaId: res.mediaId,
            })),
        ),
      ).then((results) => {
        const additions: Phase0DailyReportMedia[] = [];
        const failed: string[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const { file, mediaUrl, mediaId } = r.value;
            additions.push({
              id: mediaId,
              kind: file.type.startsWith('video/') ? 'video' : 'photo',
              url: mediaUrl,
              caption: null,
            });
          } else {
            failed.push(r.reason instanceof Error ? r.reason.message : 'Upload failed.');
          }
        }
        if (additions.length > 0) {
          this.reportDraft = {
            ...this.reportDraft,
            media: [...this.reportDraft.media, ...additions],
          };
        }
        if (failed.length > 0) {
          const existing = this.mediaError();
          const message = `Could not upload ${failed.length} file${failed.length === 1 ? '' : 's'}: ${failed[0]}`;
          this.mediaError.set(existing ? `${existing}\n${message}` : message);
        }
        this.mediaUploading.set(false);
        if (input) input.value = '';
      });
      return;
    }

    Promise.all(accepted.map((f) => readFileAsDataUrl(f))).then((rows) => {
      const additions: Phase0DailyReportMedia[] = rows
        .filter((r): r is { file: File; url: string } => r != null)
        .map(({ file, url }) => ({
          id: `m_local_${Math.random().toString(36).slice(2, 10)}`,
          kind: file.type.startsWith('video/') ? 'video' : 'photo',
          url,
          caption: null,
        }));
      this.reportDraft = {
        ...this.reportDraft,
        media: [...this.reportDraft.media, ...additions],
      };
      if (input) input.value = '';
    });
  }

  protected removeReportMedia(index: number): void {
    if (index < 0 || index >= this.reportDraft.media.length) return;
    const next = [...this.reportDraft.media];
    next.splice(index, 1);
    this.reportDraft = { ...this.reportDraft, media: next };
  }

  protected setReportMediaCaption(index: number, caption: string): void {
    if (index < 0 || index >= this.reportDraft.media.length) return;
    const next = [...this.reportDraft.media];
    next[index] = { ...next[index], caption: caption.trim() || null };
    this.reportDraft = { ...this.reportDraft, media: next };
  }

  protected saveReport(): void {
    if (this.liveMode) {
      void this.saveReportLive();
      return;
    }
    const ctx = this.context();
    if (!ctx) return;
    const id = this.editingReportId();
    if (id) {
      updateReportFields(id, this.reportDraft);
    } else {
      createReportForChild(
        ctx,
        this.institutionId,
        this.reportDraft,
        'admin@platform.local',
        'Platform Operator',
      );
    }
    this.cancelReportEditor();
    this.tick();
  }

  protected togglePublish(id: string): void {
    if (this.liveMode) {
      void this.togglePublishLive(id);
      return;
    }
    toggleReportPublishStatus(id);
    this.tick();
  }

  protected confirmDeleteReport(id: string): void {
    if (this.liveMode) {
      this.confirmDeleteReportLive(id);
      return;
    }
    this.confirm
      .ask({
        title: 'Delete this daily report?',
        message: 'This cannot be undone — the report and any media will be removed.',
        confirmLabel: 'Delete report',
        cancelLabel: 'Keep it',
        kind: 'danger',
      })
      .subscribe((res) => {
        if (!res.confirmed) return;
        deleteReport(id);
        this.tick();
        this.toasts.success('Daily report deleted.');
      });
  }

  // ── Skills CRUD ──────────────────────────────────────────────────────

  protected openSkillEditor(existing: WorkspaceChildSkill | null): void {
    if (existing) {
      this.editingSkillId.set(existing.id);
      this.skillDraft = {
        name: existing.name,
        level: existing.level,
        category: existing.category,
        achievedAt: existing.achievedAt,
        instructor: existing.instructor,
        notes: existing.notes,
      };
    } else {
      this.editingSkillId.set(null);
      this.skillDraft = blankSkillDraft();
    }
    this.skillEditorOpen.set(true);
  }

  protected cancelSkillEditor(): void {
    this.skillEditorOpen.set(false);
    this.editingSkillId.set(null);
    this.skillDraft = blankSkillDraft();
  }

  protected saveSkill(): void {
    const ctx = this.context();
    if (!ctx) return;
    const id = this.editingSkillId();
    if (id) {
      updateSkillForChild(id, this.skillDraft);
    } else {
      // IMPORTANT: write under the same key the {@link skills}
      // computed reads (`_parentChildId()` — the route param /
      // institution-side child id). In live mode `ctx.child.id` is
      // synthesised as `detail.parentChildId ?? detail.id`, which for
      // parent-linked children is the **parent-side** id and diverges
      // from the route param. Writing with `ctx.child.id` would store
      // the row under a key the list filter never reads, so the new
      // skill silently disappears after Save. See `synthContextFromDetail`.
      addSkillForChild(this.institutionId, this._parentChildId(), this.skillDraft);
    }
    this.cancelSkillEditor();
    this.tick();
  }

  protected confirmDeleteSkill(id: string): void {
    this.confirm
      .ask({
        title: 'Remove this skill?',
        message: 'It will be cleared from the child record.',
        confirmLabel: 'Remove skill',
        cancelLabel: 'Keep it',
        kind: 'danger',
      })
      .subscribe((res) => {
        if (!res.confirmed) return;
        removeSkill(id);
        this.tick();
        this.toasts.success('Skill removed.');
      });
  }

  /** Trigger a re-pull of the computed signals after a mock mutation. */
  private tick(): void {
    this.version.update((n) => n + 1);
  }

  // ── Live mode plumbing ───────────────────────────────────────────────

  /**
   * Pull the child profile + report rows for the current
   * `(institutionId, parentChildId)` pair from the API in parallel and
   * synthesise the mock-shaped objects the rest of the template
   * already consumes. Also resolves a default `programId` for the
   * "Add report" path. Errors collapse the section into the live
   * banner — the template falls back to the empty state otherwise.
   */
  protected openEndSubscriptionPanel(): void {
    this.endSubscriptionReason = 'InstitutionTerminated';
    this.endSubscriptionNote = '';
    this.endSubscriptionScheduledOn = '';
    this.endSubscriptionPanelOpen.set(true);
  }

  protected closeEndSubscriptionPanel(): void {
    this.endSubscriptionPanelOpen.set(false);
  }

  protected async submitEndSubscription(): Promise<void> {
    const tenantId = this._institutionId;
    const ctx = this.liveContext();
    const sid = ctx?.subscription.subscriptionPeriodId;
    if (!tenantId || !sid) return;

    const scheduledRaw = this.endSubscriptionScheduledOn?.trim() ?? '';
    const todayIso = new Date().toISOString().slice(0, 10);
    let scheduledEndsOn: string | null = null;
    if (scheduledRaw && scheduledRaw > todayIso) {
      scheduledEndsOn = scheduledRaw;
    }

    this.endSubscriptionSubmitting.set(true);
    try {
      await this.subscriptionsApi.endPeriod(tenantId, sid, {
        endReason: this.endSubscriptionReason,
        note: this.endSubscriptionNote.trim() || null,
        scheduledEndsOn,
      });
      this.toasts.success(
        scheduledEndsOn
          ? `Subscription scheduled to end on ${scheduledEndsOn}.`
          : 'Subscription ended.',
      );
      this.closeEndSubscriptionPanel();
      await this.loadLive();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not end subscription.';
      this.toasts.error(message);
    } finally {
      this.endSubscriptionSubmitting.set(false);
    }
  }

  protected async loadLive(): Promise<void> {
    const tenantId = this._institutionId;
    const childId = this._parentChildId();
    if (!this.liveMode || !tenantId || !childId) return;

    this.liveLoading.set(true);
    this.liveError.set(null);
    try {
      const [detail, reports, programs] = await Promise.all([
        this.childrenApi.get(tenantId, childId),
        this.dailyReportsApi.list(tenantId, { childId, pageSize: 200 }),
        this.programsApi
          .list(tenantId, { activeOnly: true })
          .catch(() => ({ items: [] })),
      ]);

      this.liveContext.set(synthContextFromDetail(tenantId, detail));
      this.liveDetail.set(detail);
      this.liveReports.set(
        reports.items.map((r) => synthMockReportFromWire(r, detail)),
      );
      const firstProgram = programs.items.find((p) => p.isActive) ?? programs.items[0] ?? null;
      this.liveDefaultProgramId.set(firstProgram?.programId ?? null);
      this.liveDefaultProgramName.set(firstProgram?.name ?? null);
      this.tick();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load this child.';
      this.liveError.set(message);
      this.liveContext.set(null);
      this.liveDetail.set(null);
      this.liveReports.set([]);
      this.tick();
    } finally {
      this.liveLoading.set(false);
    }
  }

  private async saveReportLive(): Promise<void> {
    const ctx = this.context();
    const tenantId = this._institutionId;
    const childId = this._parentChildId();
    if (!ctx || !tenantId || !childId) return;

    const draft = this.reportDraft;
    const editingId = this.editingReportId();
    const programId = this.liveDefaultProgramId();
    if (!editingId && !programId) {
      this.toasts.error(
        'No active program found at this institution — add one first to author daily reports here.',
      );
      return;
    }
    if (this.mediaUploading()) {
      this.toasts.info(
        'Some media is still uploading. Wait for the spinner to clear before saving.',
      );
      return;
    }
    if (draft.media.some((m) => m.url.startsWith('data:'))) {
      this.toasts.error(
        'Inline data URLs are no longer accepted in live mode. Re-pick the affected files so they upload through the media pipeline.',
      );
      return;
    }

    // Map the draft media to the wire shape. Captions are kept verbatim;
    // the URL is the persisted `mediaUrl` returned by the upload step.
    const wireMedia = draft.media.map((m) => ({
      id: m.id,
      kind: (m.kind === 'video' ? 'Video' : 'Photo') as WayelDailyReportMediaKind,
      url: m.url,
      caption: m.caption,
    }));

    // Daycare blocks ride along on every live save. The backend
    // validates them per-kind (`'Daycare'` vs `'Session'`); we
    // currently only author daycare reports here, so the daycare
    // block is always populated. If/when the live editor learns
    // session-kind reports, gate these on `kind` accordingly.
    const wireMeals = mealsDraftToWire(draft.meals);
    const wireDrinks = drinksDraftToWire(draft.drinks);
    const wireSleep = sleepDraftToWire(draft.sleep);
    const wireHygiene = hygieneDraftToWire(draft.hygiene);

    try {
      if (editingId) {
        const body: WayelUpdateDailyReportBody = {
          tenantId,
          mood: draft.mood ? moodToWire(draft.mood) : null,
          summary: draft.summary,
          highlights: draft.highlights ?? '',
          concerns: draft.concerns ?? '',
          reportDate: draft.reportDate,
          media: wireMedia,
          meals: wireMeals,
          drinks: wireDrinks,
          sleep: wireSleep,
          hygiene: wireHygiene,
        };
        const wire = await this.dailyReportsApi.update(editingId, body);
        if (draft.status === 'published') {
          await this.dailyReportsApi.publish(editingId, { tenantId });
        }
        this.applyLiveUpsert(wire);
      } else {
        const body: WayelCreateDailyReportBody = {
          tenantId,
          programId: programId!,
          childId,
          kind: 'Daycare',
          reportDate: draft.reportDate,
          childDisplayName: ctx.child.displayName,
          programName: this.liveDefaultProgramName() ?? 'Program',
          mood: moodToWire(draft.mood),
          summary: draft.summary,
          highlights: draft.highlights ?? '',
          concerns: draft.concerns ?? '',
          media: wireMedia,
          meals: wireMeals,
          drinks: wireDrinks,
          sleep: wireSleep,
          hygiene: wireHygiene,
          publish: draft.status === 'published',
        };
        const wire = await this.dailyReportsApi.create(body);
        this.applyLiveUpsert(wire);
      }
      this.cancelReportEditor();
      this.toasts.success('Daily report saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the report.';
      this.toasts.error(message);
    }
  }

  private async togglePublishLive(reportId: string): Promise<void> {
    const tenantId = this._institutionId;
    if (!tenantId) return;
    const existing = this.liveReports().find((r) => r.id === reportId);
    if (existing && existing.status === 'published') {
      this.toasts.info(
        'Live reports cannot be unpublished from this surface yet — open the staff portal to revert to draft.',
      );
      return;
    }
    try {
      const wire = await this.dailyReportsApi.publish(reportId, { tenantId });
      this.applyLiveUpsert(wire);
      this.toasts.success('Daily report published.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not publish.';
      this.toasts.error(message);
    }
  }

  private confirmDeleteReportLive(reportId: string): void {
    const tenantId = this._institutionId;
    if (!tenantId) return;
    this.confirm
      .ask({
        title: 'Delete this daily report?',
        message: 'This permanently removes the report and any attached media from the live database.',
        confirmLabel: 'Delete report',
        cancelLabel: 'Keep it',
        kind: 'danger',
      })
      .subscribe(async (res) => {
        if (!res.confirmed) return;
        try {
          await this.dailyReportsApi.remove(reportId, { tenantId });
          this.liveReports.update((rows) => rows.filter((r) => r.id !== reportId));
          this.tick();
          this.toasts.success('Daily report deleted.');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not delete.';
          this.toasts.error(message);
        }
      });
  }

  private applyLiveUpsert(wire: WayelDailyReportSummary): void {
    const detail = this.liveContext();
    const childDetail = detail
      ? {
          id: this._parentChildId(),
          displayName: detail.child.displayName,
          parentDisplayName: detail.parent.displayName,
          parentEmail: detail.parent.email,
          parentPhone: detail.parent.phone,
        }
      : null;
    const next = synthMockReportFromWire(wire, childDetail);
    this.liveReports.update((rows) => {
      const idx = rows.findIndex((r) => r.id === next.id);
      if (idx >= 0) {
        const copy = [...rows];
        copy[idx] = next;
        return copy.sort(sortReportsDesc);
      }
      return [next, ...rows].sort(sortReportsDesc);
    });
    this.tick();
  }
}

function blankReportDraft(): DailyReportDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    reportDate: today,
    status: 'draft',
    mood: null,
    summary: '',
    highlights: '',
    concerns: '',
    media: [],
    // Empty daycare blocks. Session-kind editors hide every section
    // that touches these and the save path nulls them on the wire.
    meals: { breakfast: null, snack: null, lunch: null },
    drinks: { water: false, bottlesCount: 0, milk: false, tea: false },
    sleep: { noSleep: false, napStart: null, napEnd: null, napQuality: null },
    hygiene: {
      pottyTraining: false,
      diaperChanges: null,
      notes: null,
      soiled: false,
      wet: false,
      dry: false,
    },
  };
}

/**
 * Read a `File` from an `<input type="file">` and resolve a `data:` URL
 * for it. Resolves to `null` when the file can't be read so the caller
 * can simply skip it.
 */
function readFileAsDataUrl(
  file: File,
): Promise<{ file: File; url: string } | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.length > 0) {
        resolve({ file, url: result });
      } else {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function blankSkillDraft(): SkillDraft {
  return {
    name: '',
    level: 'beginner',
    category: '',
    achievedAt: '',
    instructor: '',
    notes: '',
  };
}

/** Permitted skill levels — re-exported so the template can use it. */
export type { WorkspaceSkillLevel };

/* ────────────────────────────────────────────────────────────────────────── */
/* Live-mode mappers                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Wire → mock mood. Used for both the writer (mock → wire below) and
 * the read mapper (wire → mock).
 */
const MOOD_FROM_WIRE: Record<WayelDailyReportMood, Phase0DailyReportMood> = {
  Happy: 'happy',
  Okay: 'okay',
  Sad: 'sad',
  Mad: 'mad',
};

function moodToWire(mood: Phase0DailyReportMood | null | undefined): WayelDailyReportMood {
  switch (mood) {
    case 'happy':
      return 'Happy';
    case 'sad':
      return 'Sad';
    case 'mad':
      return 'Mad';
    default:
      return 'Okay';
  }
}

/**
 * Lower-case `'all' | 'some' | 'none'` (domain) → PascalCase
 * `'All' | 'Some' | 'None'` (wire). Null is preserved as null so the
 * server can distinguish "not yet recorded" from an explicit "none".
 */
function mealPortionToWire(
  portion: Phase0MealPortion | null,
): WayelMealPortion | null {
  switch (portion) {
    case 'all':
      return 'All';
    case 'some':
      return 'Some';
    case 'none':
      return 'None';
    default:
      return null;
  }
}

function mealsDraftToWire(meals: {
  breakfast: Phase0MealPortion | null;
  snack: Phase0MealPortion | null;
  lunch: Phase0MealPortion | null;
}): WayelDailyReportMeals {
  return {
    breakfast: mealPortionToWire(meals.breakfast),
    snack: mealPortionToWire(meals.snack),
    lunch: mealPortionToWire(meals.lunch),
  };
}

function drinksDraftToWire(drinks: {
  water: boolean;
  bottlesCount: number;
  milk: boolean;
  tea: boolean;
}): WayelDailyReportDrinks {
  return {
    water: !!drinks.water,
    // Defensively coerce — `[(ngModel)]` on a `<input type="number">`
    // hands us a string in some Angular versions.
    bottlesCount: Math.max(0, Math.floor(Number(drinks.bottlesCount) || 0)),
    milk: !!drinks.milk,
    tea: !!drinks.tea,
  };
}

function napQualityToWire(
  quality: 'well' | 'restless' | null,
): WayelNapQuality | null {
  switch (quality) {
    case 'well':
      return 'Well';
    case 'restless':
      return 'Restless';
    default:
      return null;
  }
}

function sleepDraftToWire(sleep: {
  noSleep: boolean;
  napStart: string | null;
  napEnd: string | null;
  napQuality: 'well' | 'restless' | null;
}): WayelDailyReportSleep {
  // Wire DTO uses `quality`; the domain shape (and the editor draft
  // we own here) calls it `napQuality`. Map at the seam.
  return {
    noSleep: !!sleep.noSleep,
    napStart: sleep.napStart || null,
    napEnd: sleep.napEnd || null,
    quality: napQualityToWire(sleep.napQuality),
  };
}

function hygieneDraftToWire(hygiene: {
  pottyTraining: boolean;
  diaperChanges: number | null;
  notes: string | null;
  soiled: boolean;
  wet: boolean;
  dry: boolean;
}): WayelDailyReportHygiene {
  const raw = hygiene.diaperChanges;
  const count = raw == null || raw === ('' as unknown as number)
    ? null
    : Math.max(0, Math.floor(Number(raw) || 0));
  return {
    pottyTraining: !!hygiene.pottyTraining,
    diaperChanges: count,
    notes: hygiene.notes?.trim() || null,
    soiled: !!hygiene.soiled,
    wet: !!hygiene.wet,
    dry: !!hygiene.dry,
  };
}

const STATUS_FROM_WIRE: Record<WayelDailyReportStatus, Phase0DailyReportStatus> = {
  Draft: 'draft',
  Published: 'published',
};

const KIND_FROM_WIRE: Record<WayelDailyReportKind, Phase0DailyReportKind> = {
  Daycare: 'daycare',
  Session: 'session',
};

const MEAL_FROM_WIRE: Record<WayelMealPortion, Phase0MealPortion> = {
  None: 'none',
  Some: 'some',
  All: 'all',
};

const ATT_FROM_WIRE: Record<WayelSessionAttendance, Phase0SessionAttendance> = {
  Present: 'present',
  Late: 'late',
  Absent: 'absent',
  LeftEarly: 'left_early',
};

const EFFORT_FROM_WIRE: Record<WayelSessionEffort, Phase0SessionEffort> = {
  NeedsPush: 'needs_push',
  OnTrack: 'on_track',
  GreatEffort: 'great_effort',
};

const NAP_FROM_WIRE: Record<WayelNapQuality, 'well' | 'restless'> = {
  Well: 'well',
  Restless: 'restless',
};

const MEDIA_KIND_FROM_WIRE: Record<WayelDailyReportMediaKind, 'photo' | 'video'> = {
  Photo: 'photo',
  Video: 'video',
};

function wireMembershipToMockSubscriptionState(
  wireState: string | undefined,
  fallbackMembership: string,
): MockParentChildSubscription['state'] {
  const key = wireState ?? fallbackMembership;
  switch (key) {
    case 'Active':
      return 'active';
    case 'Pending':
      return 'pending';
    case 'Paused':
      return 'paused';
    case 'Ended':
      return 'ended';
    case 'OnHold':
      return 'paused';
    case 'Withdrawn':
    case 'Removed':
      return 'ended';
    default:
      return 'pending';
  }
}

/**
 * Build a `WorkspaceChildContext` from the live `WayelChildDetail`.
 * The context is read by the template (header card, parent tab) and by
 * the writer (`saveReportLive` reads `ctx.child.displayName`). We
 * synthesise just the fields the template actually touches; the rest
 * stay as sensible empty defaults.
 */
function synthContextFromDetail(
  tenantId: string,
  detail: WayelChildDetail,
): WorkspaceChildContext {
  const cs = detail.currentSubscription;
  const subscription: MockParentChildSubscription = {
    id: `live_pcs_${detail.id}`,
    subscriptionPeriodId: cs?.subscriptionPeriodId ?? null,
    institutionId: tenantId,
    institutionChildId: detail.id,
    state: wireMembershipToMockSubscriptionState(cs?.state, detail.membershipState),
    enrolledAt:
      cs?.enrolledAt
      ?? (detail.enrolledOnUtc ? detail.enrolledOnUtc.slice(0, 10) : null),
    endedAt: detail.withdrawnOnUtc ? detail.withdrawnOnUtc.slice(0, 10) : null,
    endedReason: null,
    archivedAt: null,
    classroom: cs?.classroom ?? detail.classroom ?? null,
    events: [],
  };
  const child: MockParentChild = {
    id: detail.parentChildId ?? detail.id,
    displayName: detail.displayName,
    dateOfBirth: detail.dateOfBirth,
    notes: detail.notes,
    photoUrl: detail.photoUrl ?? null,
    subscriptions: [subscription],
  };
  const parent: MockParent = {
    id: `live_parent_${detail.id}`,
    displayName: detail.parentDisplayName ?? detail.guardianDisplayName ?? '',
    email: detail.parentEmail ?? detail.guardianEmail ?? '',
    phone: detail.parentPhone ?? detail.guardianPhone ?? null,
    // Prefer the parent aggregate's actual join date; fall back to the
    // child-row creation timestamp so we never invent "today" for
    // historical data. Staff-created walk-ins with no parent linkage
    // legitimately have no join date — the panel renders an empty state
    // for those instead of a misleading anchor.
    createdAt:
      detail.parentJoinedOnUtc
      ?? detail.enrolledOnUtc
      ?? new Date().toISOString(),
    children: [child],
  };
  return { parent, child, subscription };
}

/**
 * Lightweight child-side projection used as the second arg to
 * {@link synthMockReportFromWire} when applying a write back into the
 * row set. We don't have the full {@link WayelChildDetail} on the
 * write path, so this thin shape carries just the names the mapper
 * needs.
 */
interface ReportChildHint {
  id: string;
  displayName: string;
  parentDisplayName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
}

/**
 * Map a live {@link WayelDailyReportSummary} to a {@link MockDailyReport}
 * the template, gallery and trends helpers already understand.
 */
function synthMockReportFromWire(
  r: WayelDailyReportSummary,
  child: WayelChildDetail | ReportChildHint | null,
): MockDailyReport {
  const isSession = r.kind === 'Session';
  const sessionWire = r.session;
  return {
    id: r.id,
    parentChildId: child?.id ?? r.childId,
    parentId: child?.id ? `live_parent_${child.id}` : '',
    institutionId: r.tenantId,
    programId: r.programId,
    reportKind: KIND_FROM_WIRE[r.kind],
    reportDate: r.reportDate,
    status: STATUS_FROM_WIRE[r.status],
    postedAt: r.updatedOnUtc,
    publishedAt: r.publishedOnUtc,
    authorEmail: r.authorEmail ?? '',
    authorName: r.authorDisplayName ?? 'Staff',
    mood: MOOD_FROM_WIRE[r.mood],
    meals: isSession
      ? null
      : {
          breakfast: r.meals.breakfast ? MEAL_FROM_WIRE[r.meals.breakfast] : null,
          snack: r.meals.snack ? MEAL_FROM_WIRE[r.meals.snack] : null,
          lunch: r.meals.lunch ? MEAL_FROM_WIRE[r.meals.lunch] : null,
        },
    drinks: isSession
      ? null
      : {
          water: r.drinks.water,
          bottlesCount: r.drinks.bottlesCount,
          // v1 paper "To drink I had:" — backend always echoes
          // these for daycare reports (legacy rows default false),
          // but coerce defensively so a stale wire shape can't blow
          // up the read path.
          milk: !!r.drinks.milk,
          tea: !!r.drinks.tea,
        },
    sleep: isSession
      ? null
      : {
          noSleep: r.sleep.noSleep,
          napStart: r.sleep.napStart,
          napEnd: r.sleep.napEnd,
          napQuality: r.sleep.quality ? NAP_FROM_WIRE[r.sleep.quality] : null,
        },
    hygiene: isSession
      ? null
      : {
          pottyTraining: r.hygiene.pottyTraining,
          diaperChanges: r.hygiene.diaperChanges,
          notes: r.hygiene.notes,
          // v1 paper "Nappies" parity — same defensive coercion as
          // drinks above so legacy reads stay safe.
          soiled: !!r.hygiene.soiled,
          wet: !!r.hygiene.wet,
          dry: !!r.hygiene.dry,
        },
    session: isSession
      ? {
          attendance: ATT_FROM_WIRE[sessionWire.attendance],
          focus: sessionWire.focus,
          effort: sessionWire.effort ? EFFORT_FROM_WIRE[sessionWire.effort] : null,
          skillsPracticed: [...sessionWire.skillsPracticed],
          nextFocus: sessionWire.nextFocus,
        }
      : null,
    summary: r.summary,
    highlights: r.highlights ? r.highlights : null,
    concerns: r.concerns ? r.concerns : null,
    media: r.media.map<Phase0DailyReportMedia>((m) => ({
      id: m.id,
      kind: MEDIA_KIND_FROM_WIRE[m.kind],
      url: m.url,
      caption: m.caption,
    })),
  };
}

/** Newest report first; same date → most recent post wins. */
function sortReportsDesc(a: MockDailyReport, b: MockDailyReport): number {
  if (a.reportDate !== b.reportDate) return a.reportDate < b.reportDate ? 1 : -1;
  return a.postedAt < b.postedAt ? 1 : -1;
}
