import { DatePipe } from '@angular/common';
import { PulseLoaderComponent } from './pulse-loader.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  MediaStickyNoteViewerComponent,
  type StickyMediaItem,
} from '@wayel/shared/components/media-sticky-note-viewer.component';
import { environment } from '@app/environment';
import {
  listDailyReportsForTenant,
  summarizeDailyReports,
  type DailyReportRow,
  type DailyReportSummary,
} from '@wayel/shared/services/workspace-daily-report';
import {
  moodEmoji,
  moodLabel,
} from '@wayel/shared/services/workspace-child';
import {
  WayelAdminChildrenService,
  type WayelChildSummary,
} from '@wayel/shared/services/wayel-admin-children.service';
import {
  WayelAdminDailyReportsService,
  type WayelDailyReportKind,
  type WayelDailyReportMediaKind,
  type WayelDailyReportMood,
  type WayelDailyReportStatus,
  type WayelDailyReportSummary as WayelDailyReportWire,
  type WayelMealPortion,
  type WayelNapQuality,
  type WayelSessionAttendance,
  type WayelSessionEffort,
} from '@wayel/shared/services/wayel-admin-daily-reports.service';
import type { MockDailyReport } from '@wayel/shared/core/mock/mock-daily-reports';
import type {
  Phase0DailyReportKind,
  Phase0DailyReportMood,
  Phase0DailyReportStatus,
  Phase0DailyReportMedia,
  Phase0MealPortion,
  Phase0SessionAttendance,
  Phase0SessionEffort,
} from '@wayel/shared/core/contracts/daily-reports.phase0';
import type { MockParent, MockParentChild } from '@wayel/shared/core/mock/mock-parents';

type ReportFilter = 'all' | 'drafts' | 'published' | 'today' | 'week';

interface FilterChip {
  id: ReportFilter;
  label: string;
  count: number;
}

/**
 * Daily reports section for the institution workspace.
 *
 * Read-only cross-child feed: KPI tiles, status / freshness filter
 * chips, search, and one card per report. Clicking a card emits
 * `(openChild)` so the workspace shell can route the user to the
 * existing per-child detail page where they can edit / publish /
 * delete the row.
 */
@Component({
  selector: 'app-workspace-daily-report-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MediaStickyNoteViewerComponent, PulseLoaderComponent],
  template: `
    <header class="ws-main-head">
      <div>
        <h2 class="ws-title">Daily reports</h2>
        <p class="ws-sub">
          {{ summary().total }}
          {{ summary().total === 1 ? 'report' : 'reports' }} on file at
          {{ institutionLabel || 'this institution' }} — across
          {{ summary().childrenWithReports }}
          {{ summary().childrenWithReports === 1 ? 'child' : 'children' }}.
        </p>
      </div>
    </header>

    @if (liveMode && (liveLoading() || liveError())) {
      <div
        class="live-banner"
        [attr.data-state]="liveError() ? 'error' : 'loading'"
        role="status"
        aria-live="polite"
      >
        @if (liveError()) {
          <span class="material-icons-outlined" aria-hidden="true">error_outline</span>
          <span>{{ liveError() }}</span>
          <button type="button" class="live-banner-retry" (click)="reloadLive()">
            Retry
          </button>
        } @else {
          <nk-pulse-loader size="sm" [block]="false" label="Loading daily reports…" />
        }
      </div>
    }

    <div class="kpi-grid">
      <article class="kpi">
        <span class="kpi-label">Today</span>
        <span class="kpi-value">{{ summary().today }}</span>
        <span class="kpi-sub">posted on {{ todayIso() | date: 'EEE d MMM' }}</span>
      </article>
      <article class="kpi">
        <span class="kpi-label">This week</span>
        <span class="kpi-value">{{ summary().thisWeek }}</span>
        <span class="kpi-sub">{{ summary().thisMonth }} this month</span>
      </article>
      <article class="kpi">
        <span class="kpi-label">Published</span>
        <span class="kpi-value">{{ summary().publishedRate }}%</span>
        <span class="kpi-sub">
          {{ summary().published }} live · {{ summary().drafts }} draft{{
            summary().drafts === 1 ? '' : 's'
          }}
        </span>
      </article>
      <article class="kpi">
        <span class="kpi-label">Children covered</span>
        <span class="kpi-value">{{ summary().childrenWithReports }}</span>
        <span class="kpi-sub">have at least one report</span>
      </article>
    </div>

    <div class="filter-row">
      <div class="chip-row" role="tablist" aria-label="Filter reports">
        @for (chip of chips(); track chip.id) {
          <button
            type="button"
            class="chip"
            role="tab"
            [class.active]="filter() === chip.id"
            [attr.aria-selected]="filter() === chip.id"
            (click)="setFilter(chip.id)"
          >
            {{ chip.label }}
            <span class="chip-count">{{ chip.count }}</span>
          </button>
        }
      </div>

      <div class="ws-search compact">
        <span class="material-icons-outlined" aria-hidden="true">search</span>
        <input
          type="search"
          placeholder="Search by child, parent, author, or text…"
          [value]="search()"
          (input)="setSearch($any($event.target).value)"
          aria-label="Search daily reports"
        />
        @if (search()) {
          <button
            type="button"
            class="ws-search-clear"
            (click)="setSearch('')"
            aria-label="Clear search"
          >
            <span class="material-icons-outlined">close</span>
          </button>
        }
      </div>
    </div>

    @if (filteredRows().length === 0) {
      <div class="ws-empty">
        <span class="material-icons-outlined" aria-hidden="true">assignment</span>
        <p>
          @if (allRows().length === 0) {
            No daily reports posted at this institution yet. Reports will
            appear here as staff publish them from each child's page.
          } @else {
            No reports match the current filters.
          }
        </p>
      </div>
    } @else {
      <ul class="report-list" role="list">
        @for (row of filteredRows(); track row.report.id) {
          <li
            class="report-card"
            role="listitem"
            [attr.tabindex]="row.child ? 0 : -1"
            [class.clickable]="!!row.child"
            (click)="onCardClick(row)"
            (keyup.enter)="onCardClick(row)"
          >
            <div class="report-head">
              <div class="report-avatar" [class.with-img]="row.child?.photoUrl">
                @if (row.child?.photoUrl) {
                  <img [src]="row.child!.photoUrl!" [alt]="row.childName" />
                } @else {
                  {{ initials(row.childName) }}
                }
              </div>
              <div class="report-id">
                <strong class="report-child">{{ row.childName }}</strong>
                <span class="report-meta-line">
                  {{ row.report.reportDate | date: 'EEE d MMM yyyy' }}
                  · by {{ row.report.authorName }}
                  @if (row.classroom) {
                    · {{ row.classroom }}
                  }
                </span>
              </div>
              <div class="report-pills">
                @if (row.report.mood) {
                  <span
                    class="report-mood"
                    [title]="moodLabel(row.report.mood)"
                  >{{ moodEmoji(row.report.mood) }}</span>
                }
                <span
                  class="pill status"
                  [attr.data-status]="row.report.status"
                >{{ row.report.status }}</span>
                @if (row.mediaCount > 0) {
                  <span class="pill media">
                    <span
                      class="material-icons-outlined"
                      aria-hidden="true"
                    >image</span>
                    {{ row.mediaCount }}
                  </span>
                }
                @if (row.report.reportKind === 'session' && row.report.session?.attendance) {
                  <span class="pill att" [attr.data-att]="row.report.session!.attendance">
                    {{ attendanceLabel(row.report.session!.attendance) }}
                  </span>
                }
              </div>
            </div>

            <p class="report-summary">{{ row.report.summary }}</p>

            @if (row.report.highlights || row.report.concerns) {
              <div class="report-callouts">
                @if (row.report.highlights) {
                  <span class="callout pos">
                    <span class="material-icons-outlined" aria-hidden="true">star</span>
                    {{ row.report.highlights }}
                  </span>
                }
                @if (row.report.concerns) {
                  <span class="callout warn">
                    <span class="material-icons-outlined" aria-hidden="true">flag</span>
                    {{ row.report.concerns }}
                  </span>
                }
              </div>
            }

            @if (row.mediaCount > 0) {
              <ul
                class="media-strip"
                role="list"
                (click)="$event.stopPropagation()"
              >
                @for (m of row.report.media.slice(0, 6); track m.id) {
                  <li class="media-item">
                    @if (mediaHasUrl(m)) {
                      <button
                        type="button"
                        class="media-zoom"
                        (click)="openMediaViewer(m, $event)"
                        [attr.aria-label]="
                          (m.kind === 'video'
                            ? 'Play video — '
                            : 'View larger — ') +
                          (m.caption ||
                            (m.kind === 'video' ? 'Video clip' : 'Photo'))
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
                            class="strip-video-thumb"
                            [src]="m.url"
                            muted
                            playsinline
                            preload="metadata"
                          ></video>
                          <span
                            class="material-icons-outlined media-strip-play"
                            aria-hidden="true"
                          >play_circle</span>
                        }
                      </button>
                    } @else {
                      <div class="media-item-fallback" aria-hidden="true">
                        <span class="material-icons-outlined" aria-hidden="true">
                          {{ m.kind === 'video' ? 'videocam_off' : 'hide_image' }}
                        </span>
                      </div>
                    }
                  </li>
                }
                @if (row.report.media.length > 6) {
                  <li class="media-more">+{{ row.report.media.length - 6 }}</li>
                }
              </ul>
            }

            @if (row.child) {
              <div class="report-foot">
                <span class="open-cta">
                  Open in {{ row.childName }}'s reports
                  <span
                    class="material-icons-outlined"
                    aria-hidden="true"
                  >arrow_forward</span>
                </span>
              </div>
            }
          </li>
        }
      </ul>
    }

    <nk-sticky-media-viewer
      [item]="focusedStickyItem()"
      [autoplay]="true"
      (closed)="closeMediaViewer()"
    />
  `,
  styles: `
    :host { display: block; }

    .ws-main-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }
    .ws-title {
      margin: 0 0 2px;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--sd-color-text, #111827);
      letter-spacing: -0.01em;
    }
    .ws-sub { margin: 0; color: #6b7280; font-size: 13px; }

    /* ─────────── Live mode banner ─────────── */
    .live-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 12.5px;
      font-weight: 600;
    }
    .live-banner[data-state='loading'] {
      background: rgba(99, 102, 241, 0.10);
      color: #4338ca;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
    .live-banner[data-state='error'] {
      background: rgba(248, 113, 113, 0.12);
      color: #b91c1c;
      border: 1px solid rgba(248, 113, 113, 0.32);
    }
    .live-banner .material-icons-outlined { font-size: 16px; }
    .live-banner .spin {
      animation: ws-dr-spin 0.9s linear infinite;
      transform-origin: 50% 50%;
    }
    @keyframes ws-dr-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .live-banner-retry {
      margin-left: auto;
      background: transparent;
      border: 1px solid currentColor;
      color: inherit;
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 999px;
      cursor: pointer;
    }
    .live-banner-retry:hover { opacity: 0.85; }

    /* ─────────── KPI tiles ─────────── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .kpi {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 16px;
      background: linear-gradient(180deg, #fff, #f9fafb);
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px;
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .kpi-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--sd-color-text, #111827);
      letter-spacing: -0.02em;
    }
    .kpi-sub { font-size: 12px; color: #6b7280; }

    /* ─────────── Filter row ─────────── */
    .filter-row {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: space-between;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      color: #4b5563;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .chip:hover { background: #f3f4f6; }
    .chip.active {
      background: #111827;
      color: #fff;
      border-color: #111827;
    }
    .chip-count {
      padding: 1px 7px;
      border-radius: 999px;
      background: rgba(17, 24, 39, 0.08);
      color: #4b5563;
      font-size: 11px;
      font-weight: 700;
    }
    .chip.active .chip-count {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
    }

    .ws-search.compact {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: #f9fafb;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
      min-width: 280px;
      flex: 1;
      max-width: 360px;
    }
    .ws-search.compact .material-icons-outlined {
      color: #9ca3af;
      font-size: 17px;
    }
    .ws-search.compact input {
      flex: 1;
      border: 0;
      outline: 0;
      background: transparent;
      font: inherit;
      font-size: 13px;
      color: var(--sd-color-text, #111827);
    }
    .ws-search-clear {
      background: transparent;
      border: 0;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      display: inline-flex;
    }
    .ws-search-clear:hover { color: var(--sd-color-text, #111827); }

    /* ─────────── Empty state ─────────── */
    .ws-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 36px 18px;
      color: #6b7280;
      text-align: center;
    }
    .ws-empty .material-icons-outlined {
      font-size: 32px;
      color: #9ca3af;
    }
    .ws-empty p { margin: 0; max-width: 380px; font-size: 13.5px; line-height: 1.5; }

    /* ─────────── List ─────────── */
    .report-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .report-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px;
      background: #fff;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .report-card.clickable { cursor: pointer; }
    .report-card.clickable:hover {
      border-color: var(--sd-color-primary, #4f46e5);
      box-shadow: 0 1px 3px rgba(99, 102, 241, 0.18);
    }
    .report-card.clickable:focus-visible {
      outline: 2px solid var(--sd-color-primary, #4f46e5);
      outline-offset: 2px;
    }

    .report-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .report-avatar {
      flex-shrink: 0;
      width: 40px; height: 40px;
      border-radius: 50%;
      background: var(--nk-sky-soft, #e0ebf6);
      color: var(--nk-sky-deep, #1f4e79);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 13px;
      letter-spacing: 0.04em;
    }
    .report-avatar.with-img { overflow: hidden; background: #f3f4f6; }
    .report-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .report-id {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .report-child {
      font-size: 14px;
      font-weight: 700;
      color: var(--sd-color-text, #111827);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .report-meta-line {
      font-size: 12.5px;
      color: #6b7280;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .report-pills {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .report-mood {
      font-size: 18px;
      line-height: 1;
    }
    .pill {
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: capitalize;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .pill.status[data-status='published'] {
      background: rgba(34, 197, 94, 0.16);
      color: #15803d;
    }
    .pill.status[data-status='draft'] {
      background: rgba(251, 191, 36, 0.22);
      color: #b45309;
    }
    .pill.media {
      background: rgba(99, 102, 241, 0.14);
      color: #4f46e5;
    }
    .pill.media .material-icons-outlined { font-size: 13px; }
    .pill.att {
      background: #f3f4f6;
      color: #4b5563;
    }
    .pill.att[data-att='present'] { background: rgba(34,197,94,0.16); color:#15803d; }
    .pill.att[data-att='late']    { background: rgba(251,191,36,0.22); color:#b45309; }
    .pill.att[data-att='absent']  { background: rgba(248,113,113,0.18); color:#b91c1c; }
    .pill.att[data-att='left_early'] {
      background: rgba(99, 102, 241, 0.14); color: #4f46e5;
    }

    .report-summary {
      margin: 0;
      padding-left: 52px;
      font-size: 13.5px;
      line-height: 1.5;
      color: var(--sd-color-text, #111827);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .report-callouts {
      padding-left: 52px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .callout {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .callout .material-icons-outlined { font-size: 14px; }
    .callout.pos {
      background: rgba(34, 197, 94, 0.14);
      color: #15803d;
    }
    .callout.warn {
      background: rgba(248, 113, 113, 0.14);
      color: #b91c1c;
    }

    .media-strip {
      list-style: none;
      margin: 0;
      padding: 0 0 0 52px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .media-item {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #0b1020;
    }
    .media-zoom {
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
      -webkit-tap-highlight-color: transparent;
    }
    .media-zoom:focus-visible {
      outline: 2px solid var(--sd-color-primary, #4f46e5);
      outline-offset: -2px;
      z-index: 1;
    }
    .media-zoom img,
    .media-zoom video.strip-video-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }
    .media-strip-play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.37);
      pointer-events: none;
      font-size: 34px !important;
      color: rgba(255, 255, 255, 0.95);
      filter: drop-shadow(0 1px 6px rgba(0, 0, 0, 0.45));
    }
    .media-item-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1f2937;
      color: #9ca3af;
    }
    .media-item-fallback .material-icons-outlined { font-size: 22px; }
    .media-more {
      width: 64px;
      height: 64px;
      border-radius: 8px;
      border: 1px dashed var(--surface-border, #e5e7eb);
      background: #f9fafb;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
    }

    .report-foot {
      padding-left: 52px;
      display: flex;
      justify-content: flex-end;
    }
    .open-cta {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--sd-color-primary, #4f46e5);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .open-cta .material-icons-outlined { font-size: 14px; }

    @media (max-width: 540px) {
      .report-summary,
      .report-callouts,
      .media-strip,
      .report-foot { padding-left: 0; }
    }
  `,
})
export class WorkspaceDailyReportSectionComponent implements OnInit, OnChanges {
  @Input({ required: true })
  set institutionId(value: string) {
    this._institutionId.set(value);
  }
  get institutionId(): string {
    return this._institutionId();
  }

  @Input() institutionLabel: string | null = null;

  /**
   * Emitted when the operator clicks a report card. The shell is
   * expected to navigate to the child detail page on the reports tab.
   */
  @Output() readonly openChild = new EventEmitter<{
    parentChildId: string;
    reportId: string;
  }>();

  private readonly dailyReportsApi = inject(WayelAdminDailyReportsService);
  private readonly childrenApi = inject(WayelAdminChildrenService);

  /**
   * In live mode the section reads the daily-report feed + KPI rollup
   * from the backend (`/api/v1/daily-reports[?tenantId=]&summary`) and
   * joins the rows with the institution children list so cards still
   * render parent name, classroom, and clickable navigation. Mock mode
   * keeps the in-memory bridge for offline dev / Storybook-style demos.
   */
  protected readonly liveMode = !environment.useMock;

  private readonly _institutionId = signal<string>('');
  protected readonly filter = signal<ReportFilter>('all');
  protected readonly search = signal('');
  protected readonly focusedMedia = signal<Phase0DailyReportMedia | null>(null);

  /**
   * Adapter that hands the active media row to the shared sticky-note
   * viewer. Joins the focused row to its parent {@link DailyReportRow}
   * for the meta strip ("Posted by … · Institution · Classroom").
   */
  protected readonly focusedStickyItem = computed<StickyMediaItem | null>(() => {
    const m = this.focusedMedia();
    if (!m) return null;
    const owner = this.allRows().find((r) =>
      r.report.media.some((rm) => rm.id === m.id),
    );
    const meta = owner
      ? [
          `Posted by ${owner.report.authorName}`,
          owner.classroom,
          owner.childName,
        ]
          .filter((part): part is string => !!part && part.length > 0)
          .join(' · ')
      : null;
    return {
      id: m.id,
      url: m.url,
      kind: m.kind === 'video' ? 'video' : 'image',
      caption: m.caption ?? null,
      fileName: null,
      meta,
      downloadUrl: m.url,
    };
  });

  /**
   * Snapshot of daily reports for the current tenant in live mode.
   * Mapped to the existing `DailyReportRow` shape so all downstream
   * KPI/filter/template helpers continue to work without branches.
   */
  protected readonly liveRows = signal<DailyReportRow[]>([]);
  protected readonly liveSummary = signal<DailyReportSummary | null>(null);
  protected readonly liveLoading = signal(false);
  protected readonly liveError = signal<string | null>(null);

  protected readonly allRows = computed<DailyReportRow[]>(() => {
    const id = this._institutionId();
    if (!id) return [];
    if (this.liveMode) return this.liveRows();
    return listDailyReportsForTenant(id);
  });

  protected readonly summary = computed<DailyReportSummary>(() => {
    if (this.liveMode) {
      return this.liveSummary() ?? summarizeDailyReports(this.allRows());
    }
    return summarizeDailyReports(this.allRows());
  });

  protected readonly chips = computed<FilterChip[]>(() => {
    const rows = this.allRows();
    const todayIso = this.todayIso();
    const weekStartIso = this.weekStartIso();
    let drafts = 0;
    let published = 0;
    let today = 0;
    let week = 0;
    for (const r of rows) {
      if (r.report.status === 'draft') drafts += 1;
      else published += 1;
      if (r.report.reportDate === todayIso) today += 1;
      if (r.report.reportDate >= weekStartIso) week += 1;
    }
    return [
      { id: 'all', label: 'All', count: rows.length },
      { id: 'today', label: 'Today', count: today },
      { id: 'week', label: 'This week', count: week },
      { id: 'published', label: 'Published', count: published },
      { id: 'drafts', label: 'Drafts', count: drafts },
    ];
  });

  ngOnInit(): void {
    if (this.liveMode && this.institutionId) {
      void this.loadLive();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['institutionId']) {
      this.filter.set('all');
      this.search.set('');
      this.liveRows.set([]);
      this.liveSummary.set(null);
      this.liveError.set(null);
      if (this.liveMode && this.institutionId) {
        void this.loadLive();
      }
    }
  }

  /** Operator-facing retry hook for the error banner. */
  protected reloadLive(): void {
    if (!this.liveMode || !this.institutionId) return;
    void this.loadLive();
  }

  /**
   * Pulls the daily-report feed + KPI rollup for the current tenant
   * from the live API and rebuilds {@link liveRows}/{@link liveSummary}.
   * The list is joined with the institution children list so cards
   * still render parent/classroom metadata and stay clickable.
   *
   * Failures surface in {@link liveError} so the banner can show a
   * retry button without crashing the whole workspace.
   */
  private async loadLive(): Promise<void> {
    const tenantId = this.institutionId;
    if (!tenantId) return;
    this.liveLoading.set(true);
    this.liveError.set(null);
    try {
      // Pull a generous page so the section can show every report on
      // file without paging — the workspace UI doesn't have a paginator
      // yet and the volume is bounded by the seeder for now.
      const [reports, kpi, children] = await Promise.all([
        this.dailyReportsApi.list(tenantId, { pageSize: 500 }),
        this.dailyReportsApi.summary(tenantId),
        this.childrenApi
          .list(tenantId, { pageSize: 500 })
          .catch(() => ({ items: [] as WayelChildSummary[] })),
      ]);

      const childIndex = new Map<string, WayelChildSummary>();
      for (const c of children.items) {
        childIndex.set(c.id, c);
      }

      const rows: DailyReportRow[] = reports.items.map((r) =>
        wireToDailyReportRow(r, childIndex.get(r.childId) ?? null),
      );

      // Sort newest-first to match the mock-mode ordering.
      rows.sort((a, b) => {
        if (a.report.reportDate !== b.report.reportDate) {
          return a.report.reportDate < b.report.reportDate ? 1 : -1;
        }
        return a.report.postedAt < b.report.postedAt ? 1 : -1;
      });

      this.liveRows.set(rows);
      this.liveSummary.set(buildSummaryFromKpi(kpi, rows));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not load daily reports for this tenant.';
      this.liveError.set(msg);
      this.liveRows.set([]);
      this.liveSummary.set(null);
    } finally {
      this.liveLoading.set(false);
    }
  }

  protected readonly filteredRows = computed<DailyReportRow[]>(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    const todayIso = this.todayIso();
    const weekStartIso = this.weekStartIso();
    let rows = this.allRows();
    switch (f) {
      case 'drafts':
        rows = rows.filter((r) => r.report.status === 'draft');
        break;
      case 'published':
        rows = rows.filter((r) => r.report.status === 'published');
        break;
      case 'today':
        rows = rows.filter((r) => r.report.reportDate === todayIso);
        break;
      case 'week':
        rows = rows.filter((r) => r.report.reportDate >= weekStartIso);
        break;
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.childName.toLowerCase().includes(q) ||
          r.parentName.toLowerCase().includes(q) ||
          r.report.authorName.toLowerCase().includes(q) ||
          r.report.summary.toLowerCase().includes(q) ||
          (r.report.highlights ?? '').toLowerCase().includes(q) ||
          (r.report.concerns ?? '').toLowerCase().includes(q),
      );
    }
    return rows;
  });

  /** Cached for the current view; recomputed on each change-detection pass. */
  protected todayIso(): string {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      .toISOString()
      .slice(0, 10);
  }

  protected weekStartIso(): string {
    const d = new Date();
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = local.getDay(); // 0 = Sun
    const offset = day === 0 ? -6 : 1 - day;
    local.setDate(local.getDate() + offset);
    return new Date(
      Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()),
    )
      .toISOString()
      .slice(0, 10);
  }

  protected setFilter(id: ReportFilter): void {
    this.filter.set(id);
  }

  protected setSearch(value: string): void {
    this.search.set(value);
  }

  protected onCardClick(row: DailyReportRow): void {
    if (!row.child) return;
    this.openChild.emit({
      parentChildId: row.child.id,
      reportId: row.report.id,
    });
  }

  protected mediaHasUrl(m: Phase0DailyReportMedia): boolean {
    const u = m.url?.trim();
    return !!u && (u.startsWith('http') || u.startsWith('blob:') || u.startsWith('data:'));
  }

  protected openMediaViewer(m: Phase0DailyReportMedia, ev: Event): void {
    ev.stopPropagation();
    if (!this.mediaHasUrl(m)) return;
    this.focusedMedia.set(m);
  }

  protected closeMediaViewer(): void {
    this.focusedMedia.set(null);
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase() || '??';
  }

  protected attendanceLabel(att: string): string {
    switch (att) {
      case 'present':
        return 'Present';
      case 'late':
        return 'Late';
      case 'absent':
        return 'Absent';
      case 'left_early':
        return 'Left early';
      default:
        return att;
    }
  }

  protected moodEmoji = moodEmoji;
  protected moodLabel = moodLabel;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Live mode mappers — wire (PascalCase) ↔ mock (snake_case) shapes.        */
/* ──────────────────────────────────────────────────────────────────────── */

const MOOD_FROM_WIRE: Record<WayelDailyReportMood, Phase0DailyReportMood> = {
  Happy: 'happy',
  Okay: 'okay',
  Sad: 'sad',
  Mad: 'mad',
};

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

/**
 * Synthesizes a {@link MockParentChild}-shaped object from the live
 * {@link WayelChildSummary}. Only the fields the section template
 * actually reads (`id`, `displayName`, `photoUrl`) are populated; the
 * rest are stubbed with sensible defaults so existing helpers don't
 * NPE when they reach for `subscriptions` etc.
 *
 * The returned `id` is the **parent-roster** child id when the
 * institution-side row has been linked to one (so navigation hands
 * the upstream component the same id mock mode would have emitted),
 * falling back to the institution-side id otherwise.
 */
function synthChildFromWire(child: WayelChildSummary): MockParentChild {
  return {
    id: child.parentChildId ?? child.id,
    displayName: child.displayName,
    dateOfBirth: child.dateOfBirth,
    notes: child.notes,
    photoUrl: null,
    subscriptions: [],
  };
}

/**
 * Synthesizes a thin {@link MockParent}-shaped object from a wire
 * child row. The section template only ever reads `displayName` from
 * the parent reference (for the search box and the tooltip), so we
 * only populate the bare minimum and leave the rest as sensible
 * defaults — anything else stays `null`/empty and the workspace
 * helpers handle that gracefully.
 *
 * Returns `null` when the wire row has no guardian on file: the
 * section then shows the row's `parentName` as `'—'`.
 */
function synthParentFromWire(child: WayelChildSummary): MockParent | null {
  const name = child.guardianDisplayName?.trim();
  if (!name) return null;
  // The mock `MockParent` interface has many required fields; the
  // section only ever reads `displayName` from the parent reference,
  // so we cast through `unknown` rather than build out the full mock
  // record. Runtime use is guarded by the section template — no
  // workspace helper touches the parent on the read path.
  return {
    id: `wire-parent-${child.id}`,
    displayName: name,
    email: child.guardianEmail ?? '',
    phone: child.guardianPhone ?? '',
    children: [],
  } as unknown as MockParent;
}

/**
 * Maps a backend {@link WayelDailyReportWire} into the
 * {@link DailyReportRow} shape that the section template, KPI roll-up
 * and filter helpers all consume. The wire DTO's `mood` / `status` /
 * `kind` / `meal portion` / `session attendance` / `effort` /
 * `nap quality` / `media kind` enums are translated from the backend's
 * PascalCase to the mock vocabulary in lockstep with the mappers
 * above so no UI branch is needed downstream.
 *
 * `highlights` and `concerns` are not part of the backend DTO yet —
 * they remain `null` in live mode (the template hides those callouts
 * when both are absent). Same goes for parent / classroom: they come
 * from the institution-children join when available.
 */
function wireToDailyReportRow(
  r: WayelDailyReportWire,
  child: WayelChildSummary | null,
): DailyReportRow {
  const isSession = r.kind === 'Session';
  const sessionWire = r.session;

  const report: MockDailyReport = {
    id: r.id,
    parentChildId: child?.parentChildId ?? r.childId,
    parentId: child?.guardianEmail ? `wire-parent-${r.childId}` : '',
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

  return {
    report,
    parent: child ? synthParentFromWire(child) : null,
    child: child ? synthChildFromWire(child) : null,
    childName: child?.displayName ?? r.childDisplayName ?? 'Unknown child',
    parentName: child?.guardianDisplayName ?? '—',
    classroom: child?.classroom ?? null,
    mediaCount: r.media.length,
  };
}

/**
 * Builds a {@link DailyReportSummary} for the workspace KPI tiles by
 * combining the backend's pre-aggregated counters with the loaded
 * row set. The KPI endpoint is the source of truth for the time-window
 * counts (so it stays consistent with what the badge shows on the
 * workspace shell), while distinct-child / draft / publish counts are
 * derived from the loaded rows so they update instantly after a
 * mutation without a second round-trip.
 */
function buildSummaryFromKpi(
  kpi: {
    todayTotal: number;
    weekTotal: number;
    monthTotal: number;
    childrenCoveredLast30Days: number;
    publishedRatePercent: number;
  },
  rows: DailyReportRow[],
): DailyReportSummary {
  let drafts = 0;
  let published = 0;
  for (const r of rows) {
    if (r.report.status === 'published') published += 1;
    else drafts += 1;
  }
  return {
    total: rows.length,
    published,
    drafts,
    today: kpi.todayTotal,
    thisWeek: kpi.weekTotal,
    thisMonth: kpi.monthTotal,
    childrenWithReports: kpi.childrenCoveredLast30Days,
    publishedRate: kpi.publishedRatePercent,
  };
}
