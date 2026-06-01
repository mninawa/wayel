import { DatePipe } from '@angular/common';
import { PulseLoaderComponent } from './pulse-loader.component';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { catchError, EMPTY, of } from 'rxjs';
import { environment } from '@app/environment';
import type { Phase0SubscriptionRequestDto } from '@wayel/shared/core/contracts/subscription-requests.phase0';
import {
  findMockParentChild,
  type MockGuardianIdType,
  type MockGuardianProfile,
  type MockGuardianTitle,
  type MockParent,
  type MockParentChild,
  type MockParentChildSubscription,
} from '@wayel/shared/core/mock/mock-parents';
import {
  WayelAdminSubscriptionsService,
  type WayelGuardianIdType,
  type WayelGuardianTitle,
  type WayelProgramFeeCadence,
  type WayelProgramKind,
  type WayelProgramSchedule,
  type WayelSubscriptionPeriodSummary,
  type WayelSubscriptionsSummary,
} from '@wayel/shared/services/wayel-admin-subscriptions.service';
import {
  WayelAdminTenantsService,
  type WayelAdminTenantRequiredDocumentDto,
} from '@wayel/shared/services/wayel-admin-tenants.service';
import { SubscriptionRequestsBridgeService } from '@wayel/shared/services/subscription-requests-bridge.service';
import { ToastService } from '@wayel/shared/services/toast.service';
import { ParentProfileDrawerComponent } from './parent-profile-drawer.component';
import {
  formatWindowDate,
  isInsideEffectiveWindow,
  nextWindowOpen,
  resolveEffectiveWindow,
  type SubscriptionWindow,
} from '@wayel/shared/utils/sa-school-year';
import {
  InstitutionPayoutsApiService,
  type InstitutionSubscriptionWindow,
} from '@wayel/shared/services/institution-payouts-api.service';
import {
  formatMoney,
  subscriptionBillingCadencePhrase,
  type WorkspaceFeeCadence,
  type WorkspaceProgram,
  type WorkspaceProgramFee,
  type WorkspaceProgramKind,
  type WorkspaceProgramSchedule,
} from '@wayel/shared/services/workspace-program';
import {
  approvePendingPeriod,
  listSubscriptionsForTenant,
  prettifyEventKind,
  rejectPendingPeriod,
  subscriptionStateLabel,
  summarizeSubscriptions,
  type SubscriptionRow,
  type SubscriptionState,
  type SubscriptionSummary,
} from '@wayel/shared/services/workspace-subscription';

type StateFilter = 'all' | SubscriptionState;
type PendingAction = 'approve' | 'reject';

interface InboxDraft {
  /** Identifies the request row being edited. */
  requestId: string;
  action: PendingAction;
  classroom: string;
  reason: string;
}

interface PeriodDraft {
  periodId: string;
  action: PendingAction;
  classroom: string;
  reason: string;
}

interface FilterChip {
  id: StateFilter;
  label: string;
  count: number;
}

/**
 * Subscriptions section for the institution workspace.
 *
 * Read-only roll-up of every subscription period at the tenant — KPI
 * tiles (active count, MRR, YTD revenue), state-filter chips, search,
 * and a card-per-period list with the matched program, latest fee and
 * most recent lifecycle event.
 *
 * State changes (pause / resume / end) are intentionally **not** wired
 * up here — those are owned by the parent self-service flow and the
 * staff approval bridges; this tab is an operations view only.
 */
@Component({
  selector: 'app-workspace-subscription-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, ParentProfileDrawerComponent, PulseLoaderComponent],
  template: `
    <header class="ws-main-head">
      <div>
        <h2 class="ws-title">Subscriptions</h2>
        <p class="ws-sub">
          {{ summary().totalPeriods }}
          {{ summary().totalPeriods === 1 ? 'period' : 'periods' }} on file at
          {{ institutionLabel || 'this institution' }}.
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
          <nk-pulse-loader size="sm" [block]="false" label="Loading subscriptions…" />
        }
      </div>
    }

    @if (pendingRequests().length > 0) {
      <section class="inbox" aria-labelledby="inbox-title">
        <header class="inbox-head">
          <div>
            <h3 id="inbox-title" class="inbox-title">
              <span class="material-icons-outlined" aria-hidden="true">inbox</span>
              Pending requests
              <span class="inbox-count">{{ pendingRequests().length }}</span>
            </h3>
            <p class="inbox-sub">
              New subscription requests from parents. Approve to enrol the
              child immediately, or reject with a reason that's sent back.
            </p>
          </div>
        </header>

        @if (!schoolYearOpen()) {
          <div class="school-year-closed" role="status" aria-live="polite">
            <span class="material-icons-outlined" aria-hidden="true">event_busy</span>
            <div>
              <strong>Approvals are paused for the school break.</strong>
              <p>
                Wayel follows the SA school year (8 January –
                10 December). Approvals reopen on
                <strong>{{ schoolYearReopensOn() }}</strong>. Pending
                requests stay queued — you can still review parent
                profiles in the meantime.
              </p>
            </div>
          </div>
        }

        <ul class="inbox-list" role="list">
          @for (req of pendingRequests(); track req.id) {
            <li
              class="inbox-card"
              role="listitem"
              [attr.id]="'subscription-request-' + req.id"
              [class.flash]="flashedRequestId() === req.id"
            >
              <div class="inbox-card-head">
                <div class="inbox-avatar">{{ initials(req.childDisplayName) }}</div>
                <div class="inbox-id">
                  <div class="inbox-child-row">
                    <strong class="inbox-child">{{ req.childDisplayName }}</strong>
                    @if (requestDocsPill(req); as docPill) {
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
                  <span class="inbox-meta">
                    Requested by
                    <button
                      type="button"
                      class="link-btn"
                      (click)="openParentDrawerForRequest(req)"
                      [attr.aria-label]="
                        'View parent profile for ' +
                        (req.parentDisplayName || req.parentEmail)
                      "
                    >
                      {{ req.parentDisplayName || req.parentEmail }}
                      <span class="material-icons-outlined" aria-hidden="true">
                        open_in_new
                      </span>
                    </button>
                    · {{ req.requestedAt | date: 'd MMM yyyy, HH:mm' }}
                  </span>
                </div>
                <span class="pill state" data-state="pending">Pending</span>
              </div>

              <div class="inbox-vetting">
                <button
                  type="button"
                  class="btn ghost vet-btn"
                  (click)="openParentDrawerForRequest(req)"
                >
                  <span class="material-icons-outlined" aria-hidden="true">
                    fact_check
                  </span>
                  Review child &amp; guardian
                </button>
                <span class="vet-hint">
                  Verify the child's profile, additional details and the
                  responsible guardian before approval.
                </span>
              </div>

              @if (req.classroomRequested) {
                <div class="inbox-line">
                  <span class="inbox-label">Classroom</span>
                  <span class="inbox-value">{{ req.classroomRequested }}</span>
                </div>
              }
              @if (billingCadenceHint(req.requestedCadence); as bc) {
                <div class="inbox-line">
                  <span class="inbox-label">Billing preference</span>
                  <span class="inbox-value">{{ bc }}</span>
                </div>
              }
              @if (req.message) {
                <blockquote class="inbox-quote">{{ req.message }}</blockquote>
              }

              @if (inboxDraft()?.requestId !== req.id) {
                <div class="inbox-actions">
                  <button
                    type="button"
                    class="btn primary"
                    (click)="startInboxAction(req, 'approve')"
                    [disabled]="!schoolYearOpen()"
                    [attr.title]="
                      !schoolYearOpen()
                        ? 'Approvals reopen on ' + schoolYearReopensOn()
                        : null
                    "
                  >
                    <span class="material-icons-outlined" aria-hidden="true">check</span>
                    Approve
                  </button>
                  <button
                    type="button"
                    class="btn danger"
                    (click)="startInboxAction(req, 'reject')"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">close</span>
                    Reject
                  </button>
                </div>
              } @else {
                <form
                  class="inbox-form"
                  (ngSubmit)="submitInbox(req)"
                  [attr.data-action]="inboxDraft()?.action"
                >
                  @if (inboxDraft()?.action === 'approve') {
                    <label class="field">
                      <span class="field-label">Classroom</span>
                      <input
                        type="text"
                        class="text-input"
                        placeholder="e.g. Sunflowers (3-4 yrs)"
                        [ngModel]="inboxDraft()?.classroom"
                        (ngModelChange)="updateInboxField('classroom', $event)"
                        name="classroom"
                      />
                    </label>
                  } @else {
                    <label class="field">
                      <span class="field-label">Reason (sent to parent)</span>
                      <textarea
                        class="text-input"
                        rows="2"
                        required
                        placeholder="e.g. Sunflowers room is full for 2026 — try Lilies."
                        [ngModel]="inboxDraft()?.reason"
                        (ngModelChange)="updateInboxField('reason', $event)"
                        name="reason"
                      ></textarea>
                    </label>
                  }
                  <div class="inbox-form-actions">
                    <button type="button" class="btn ghost" (click)="cancelInbox()">Cancel</button>
                    <button
                      type="submit"
                      class="btn"
                      [class.primary]="inboxDraft()?.action === 'approve'"
                      [class.danger]="inboxDraft()?.action === 'reject'"
                      [disabled]="busyRequestId() === req.id || !canSubmitInbox()"
                    >
                      @if (busyRequestId() === req.id) {
                        Working…
                      } @else {
                        Confirm {{ inboxDraft()?.action }}
                      }
                    </button>
                  </div>
                </form>
              }

              @if (errorByRequestId()[req.id]; as msg) {
                <p class="inbox-error" role="alert">{{ msg }}</p>
              }
            </li>
          }
        </ul>
      </section>
    }

    <div class="kpi-grid">
      <article class="kpi">
        <span class="kpi-label">Active</span>
        <span class="kpi-value">{{ summary().active }}</span>
        <span class="kpi-sub">
          @if (summary().pending > 0) { {{ summary().pending }} pending · }
          @if (summary().paused > 0) { {{ summary().paused }} paused · }
          {{ summary().ended }} ended
        </span>
      </article>
      <article class="kpi">
        <span class="kpi-label">Monthly recurring</span>
        <span class="kpi-value">
          {{ formatMoney(summary().mrr, summary().currency) }}
        </span>
        <span class="kpi-sub">across active periods</span>
      </article>
      <article class="kpi">
        <span class="kpi-label">YTD revenue</span>
        <span class="kpi-value">
          {{ formatMoney(summary().ytdRevenue, summary().currency) }}
        </span>
        <span class="kpi-sub">{{ currentYear }} estimate</span>
      </article>
      <article class="kpi">
        <span class="kpi-label">Avg / active</span>
        <span class="kpi-value">
          {{ avgPerActive() }}
        </span>
        <span class="kpi-sub">monthly per child</span>
      </article>
    </div>

    <div class="filter-row">
      <div class="chip-row" role="tablist" aria-label="Filter by state">
        @for (chip of chips(); track chip.id) {
          <button
            type="button"
            class="chip"
            role="tab"
            [class.active]="stateFilter() === chip.id"
            [attr.aria-selected]="stateFilter() === chip.id"
            (click)="setStateFilter(chip.id)"
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
          placeholder="Search by child, parent, or classroom…"
          [value]="search()"
          (input)="setSearch($any($event.target).value)"
          aria-label="Search subscriptions"
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
        <span class="material-icons-outlined" aria-hidden="true">card_membership</span>
        <p>
          @if (allRows().length === 0) {
            No subscription periods on file yet. They'll appear here as
            parents enrol children at this institution.
          } @else {
            No subscriptions match the current filters.
          }
        </p>
      </div>
    } @else {
      <ul class="sub-list" role="list">
        @for (row of filteredRows(); track row.id) {
          <li class="sub-card" role="listitem">
            <div class="sub-card-head">
              <div class="sub-avatar" [class.with-img]="row.child.photoUrl">
                @if (row.child.photoUrl) {
                  <img [src]="row.child.photoUrl" [alt]="row.childName" />
                } @else {
                  {{ initials(row.childName) }}
                }
              </div>
              <div class="sub-id">
                <strong class="sub-child">{{ row.childName }}</strong>
                <!--
                  Parent line wraps onto a second row when the email
                  doesn't fit instead of ellipsing into oblivion. The
                  email sits on its own line so the eye scans
                  child → age → parent → email naturally and the
                  state pills on the right keep their padding.
                -->
                <span class="sub-parent">
                  {{ ageLabel(row.ageYears) }} · Parent
                  <button
                    type="button"
                    class="link-btn"
                    (click)="openParentDrawerForRow(row)"
                    [attr.aria-label]="'View parent profile for ' + row.parentName"
                  >
                    {{ row.parentName }}
                    <span class="material-icons-outlined" aria-hidden="true">
                      open_in_new
                    </span>
                  </button>
                </span>
                @if (row.parentEmail) {
                  <a
                    class="sub-email"
                    [href]="'mailto:' + row.parentEmail"
                    [title]="row.parentEmail"
                  >
                    {{ row.parentEmail }}
                  </a>
                }
              </div>
              <div class="sub-pills">
                <span class="pill state" [attr.data-state]="row.state">
                  {{ stateLabel(row.state) }}
                </span>
                @if (row.classroom) {
                  <span class="pill room">{{ row.classroom }}</span>
                }
              </div>
            </div>

            <div class="sub-meta">
              <div class="meta-cell">
                <span class="meta-label">Program</span>
                @if (row.matchedProgram) {
                  <span class="meta-value">{{ row.matchedProgram.name }}</span>
                } @else {
                  <span class="meta-value muted">Unmatched</span>
                }
              </div>
              <div class="meta-cell">
                <span class="meta-label">Fee</span>
                @if (row.feeLabel) {
                  <span class="meta-value strong">{{ row.feeLabel }}</span>
                } @else {
                  <span class="meta-value muted">No fee</span>
                }
              </div>
              <div class="meta-cell">
                <span class="meta-label">Enrolled</span>
                @if (row.enrolledAt) {
                  <span class="meta-value">
                    {{ row.enrolledAt | date: 'd MMM yyyy' }}
                  </span>
                } @else {
                  <span class="meta-value muted">—</span>
                }
              </div>
              <div class="meta-cell">
                <span class="meta-label">
                  {{ row.state === 'ended' ? 'Ended' : 'Length' }}
                </span>
                @if (row.endedAt) {
                  <span class="meta-value">
                    {{ row.endedAt | date: 'd MMM yyyy' }}
                  </span>
                } @else if (row.enrolledAt) {
                  <span class="meta-value">{{ duration(row.enrolledAt) }}</span>
                } @else {
                  <span class="meta-value muted">—</span>
                }
              </div>
            </div>

            @if (row.lastEvent) {
              <div class="sub-event">
                <span class="event-kind">
                  {{ prettifyEventKind(row.lastEvent.kind) }}
                </span>
                <span class="event-summary">{{ row.lastEvent.summary }}</span>
                <span class="event-when">
                  {{ row.lastEvent.occurredAt | date: 'd MMM yyyy' }}
                </span>
              </div>
            }

            @if (row.endedReason) {
              <div class="sub-end-reason">
                <span class="material-icons-outlined" aria-hidden="true">flag</span>
                <span>Ended: {{ row.endedReason }}</span>
              </div>
            }

            @if (row.state === 'pending') {
              @if (isLinkedToInbox(row)) {
                <p class="sub-hint">
                  <span class="material-icons-outlined" aria-hidden="true">north</span>
                  This subscription has a pending request — resolve it from the
                  inbox above so the parent gets notified.
                </p>
              } @else if (liveMode) {
                <p class="sub-hint">
                  <span class="material-icons-outlined" aria-hidden="true">info</span>
                  Inline pending-period actions are handled from the inbox in
                  live mode — no orphan period rows here.
                </p>
              } @else if (periodDraft()?.periodId !== row.id) {
                <div class="sub-actions">
                  <button
                    type="button"
                    class="btn primary"
                    (click)="startPeriodAction(row, 'approve')"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">check</span>
                    Accept &amp; activate
                  </button>
                  <button
                    type="button"
                    class="btn danger"
                    (click)="startPeriodAction(row, 'reject')"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">close</span>
                    Decline
                  </button>
                </div>
              } @else {
                <form
                  class="inbox-form"
                  (ngSubmit)="submitPeriod(row)"
                  [attr.data-action]="periodDraft()?.action"
                >
                  @if (periodDraft()?.action === 'approve') {
                    <label class="field">
                      <span class="field-label">Classroom</span>
                      <input
                        type="text"
                        class="text-input"
                        placeholder="e.g. Sunflowers (3-4 yrs)"
                        [ngModel]="periodDraft()?.classroom"
                        (ngModelChange)="updatePeriodField('classroom', $event)"
                        name="classroom"
                      />
                    </label>
                  } @else {
                    <label class="field">
                      <span class="field-label">Reason (recorded on the period)</span>
                      <textarea
                        class="text-input"
                        rows="2"
                        required
                        placeholder="Why is this subscription being declined?"
                        [ngModel]="periodDraft()?.reason"
                        (ngModelChange)="updatePeriodField('reason', $event)"
                        name="reason"
                      ></textarea>
                    </label>
                  }
                  <div class="inbox-form-actions">
                    <button type="button" class="btn ghost" (click)="cancelPeriod()">Cancel</button>
                    <button
                      type="submit"
                      class="btn"
                      [class.primary]="periodDraft()?.action === 'approve'"
                      [class.danger]="periodDraft()?.action === 'reject'"
                      [disabled]="busyPeriodId() === row.id || !canSubmitPeriod()"
                    >
                      @if (busyPeriodId() === row.id) {
                        Working…
                      } @else {
                        Confirm {{ periodDraft()?.action }}
                      }
                    </button>
                  </div>
                </form>
              }

              @if (errorByPeriodId()[row.id]; as msg) {
                <p class="inbox-error" role="alert">{{ msg }}</p>
              }
            }
          </li>
        }
      </ul>
    }

    <app-parent-profile-drawer
      [open]="drawerOpen()"
      [parent]="drawerParent()"
      [highlightedChildId]="drawerHighlightChildId()"
      (closed)="closeParentDrawer()"
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

    /* Live mode banner */
    .live-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 12.5px;
      font-weight: 600;
      margin-top: 8px;
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
      animation: ws-sub-spin 0.9s linear infinite;
      transform-origin: 50% 50%;
    }
    @keyframes ws-sub-spin {
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
    .ws-empty p { margin: 0; max-width: 360px; font-size: 13.5px; line-height: 1.5; }

    /* ─────────── List ─────────── */
    .sub-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .sub-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 16px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px;
      background: #fff;
    }
    .sub-card-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .sub-avatar {
      flex-shrink: 0;
      width: 42px; height: 42px;
      border-radius: 50%;
      background: var(--nk-sky-soft, #e0ebf6);
      color: var(--nk-sky-deep, #1f4e79);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 13px;
      letter-spacing: 0.04em;
    }
    .sub-avatar.with-img { overflow: hidden; background: #f3f4f6; }
    .sub-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .sub-id {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .sub-child {
      font-size: 14px;
      font-weight: 700;
      color: var(--sd-color-text, #111827);
      line-height: 1.25;
    }
    .sub-parent {
      font-size: 12.5px;
      color: #6b7280;
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      line-height: 1.4;
    }
    .sub-parent strong { color: #4b5563; font-weight: 600; }
    .sub-email {
      font-size: 12px;
      color: #6b7280;
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      line-height: 1.3;
    }
    .sub-email:hover {
      color: var(--sd-color-primary, #4f46e5);
      text-decoration: underline;
    }

    .sub-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      flex-shrink: 0;
    }
    .pill {
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .pill.state[data-state='active']  { background: rgba(34, 197, 94, 0.16);  color: #15803d; }
    .pill.state[data-state='pending'] { background: rgba(251, 191, 36, 0.22); color: #b45309; }
    .pill.state[data-state='paused']  { background: rgba(99, 102, 241, 0.14); color: #4f46e5; }
    .pill.state[data-state='ended']   { background: #e5e7eb;                  color: #6b7280; }
    .pill.room {
      background: rgba(91, 168, 224, 0.16);
      color: #1f4e79;
      border: 1px solid rgba(91, 168, 224, 0.32);
    }
    .pill.docs {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px 2px 6px;
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

    .sub-meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 10px 12px;
      background: #f9fafb;
      border-radius: 10px;
    }
    .meta-cell {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .meta-label {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .meta-value {
      font-size: 13px;
      color: var(--sd-color-text, #111827);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta-value.muted { color: #9ca3af; }
    .meta-value.strong { font-weight: 700; }

    @media (max-width: 600px) {
      .sub-meta { grid-template-columns: repeat(2, 1fr); }
    }

    .sub-event {
      display: flex;
      gap: 10px;
      align-items: baseline;
      padding: 8px 12px;
      border-left: 3px solid var(--sd-color-primary, #4f46e5);
      background: rgba(99, 102, 241, 0.04);
      border-radius: 0 8px 8px 0;
    }
    .event-kind {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--sd-color-primary, #4f46e5);
      flex-shrink: 0;
    }
    .event-summary {
      flex: 1;
      min-width: 0;
      font-size: 13px;
      color: var(--sd-color-text, #111827);
      line-height: 1.4;
    }
    .event-when {
      font-size: 11.5px;
      color: #9ca3af;
      flex-shrink: 0;
    }

    .sub-end-reason {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 8px;
      background: rgba(248, 113, 113, 0.1);
      color: #b91c1c;
      font-size: 12.5px;
    }
    .sub-end-reason .material-icons-outlined { font-size: 16px; }

    /* ─────────── Pending requests inbox ─────────── */
    .inbox {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 16px;
      border: 1px solid rgba(251, 191, 36, 0.5);
      background: linear-gradient(180deg, #fffbeb, #fff);
      border-radius: 12px;
    }
    .inbox-head { display: flex; justify-content: space-between; gap: 12px; }
    .inbox-title {
      margin: 0;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 1.05rem;
      font-weight: 700;
      color: #78350f;
      letter-spacing: -0.01em;
    }
    .inbox-title .material-icons-outlined { font-size: 20px; }
    .inbox-count {
      padding: 1px 9px;
      border-radius: 999px;
      background: #f59e0b;
      color: #fff;
      font-size: 11.5px;
      font-weight: 700;
    }
    .inbox-sub { margin: 4px 0 0; color: #92400e; font-size: 12.5px; }

    .school-year-closed {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin: 10px 0 6px;
      padding: 12px 14px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 12px;
    }
    .school-year-closed .material-icons-outlined {
      color: #c2410c;
      font-size: 24px;
      line-height: 1;
    }
    .school-year-closed strong {
      color: #9a3412;
      display: block;
      margin-bottom: 4px;
    }
    .school-year-closed p {
      margin: 0;
      color: #7c2d12;
      font-size: 13px;
      line-height: 1.45;
    }

    .inbox-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .inbox-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 14px;
      background: #fff;
      border: 1px solid #fde68a;
      border-radius: 10px;
      transition: box-shadow 0.3s ease, border-color 0.3s ease, background-color 0.3s ease;
      scroll-margin-top: 80px;
    }
    /*
      Flash highlight applied to a deep-linked pending request after the
      Memberships tab scrolls it into view. The animation fades the card
      from a tinted amber to its resting state so the staff member's
      eye lands on it without being jarred. Cleared by the host
      component ~3.5 s after activation.
    */
    .inbox-card.flash {
      animation: inbox-card-flash 3.5s ease-out;
      box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.6);
      border-color: #f59e0b;
    }
    @keyframes inbox-card-flash {
      0%   { background-color: #fef3c7; box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.65); }
      30%  { background-color: #fffbeb; box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.45); }
      100% { background-color: #fff;    box-shadow: 0 0 0 0   rgba(251, 191, 36, 0);    }
    }
    .inbox-card-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .inbox-avatar {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: #fef3c7;
      color: #92400e;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 12.5px; letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .inbox-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .inbox-child-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .inbox-child { font-size: 13.5px; font-weight: 700; color: var(--sd-color-text, #111827); }
    .inbox-meta { font-size: 12px; color: #6b7280; }
    .inbox-meta strong { color: #4b5563; font-weight: 600; }
    .inbox-line {
      display: flex;
      gap: 8px;
      align-items: baseline;
      font-size: 12.5px;
      color: #4b5563;
    }
    .inbox-label {
      font-size: 10.5px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-weight: 700;
      color: #6b7280;
    }
    .inbox-quote {
      margin: 0;
      padding: 8px 12px;
      border-left: 3px solid #f59e0b;
      background: #fffbeb;
      color: #4b5563;
      font-size: 12.5px;
      line-height: 1.45;
      border-radius: 0 8px 8px 0;
    }
    .inbox-actions, .sub-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      color: var(--sd-color-text, #111827);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .btn:hover { background: #f3f4f6; }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn .material-icons-outlined { font-size: 16px; }
    .btn.primary {
      background: #15803d;
      border-color: #15803d;
      color: #fff;
    }
    .btn.primary:hover { background: #166534; border-color: #166534; }
    .btn.danger {
      background: #fff;
      border-color: #fecaca;
      color: #b91c1c;
    }
    .btn.danger:hover { background: #fef2f2; border-color: #fca5a5; }
    .btn.ghost { background: transparent; border-color: transparent; color: #6b7280; }
    .btn.ghost:hover { background: #f3f4f6; color: var(--sd-color-text, #111827); }

    .inbox-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 12px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .inbox-form[data-action='reject'] {
      background: #fef2f2;
    }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label {
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-weight: 700;
      color: #6b7280;
    }
    .text-input {
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      font: inherit;
      font-size: 13px;
      color: var(--sd-color-text, #111827);
      resize: vertical;
    }
    .text-input:focus {
      outline: 2px solid var(--sd-color-primary, #4f46e5);
      outline-offset: 1px;
    }
    .inbox-form-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .inbox-error {
      margin: 0;
      padding: 6px 10px;
      border-radius: 8px;
      background: rgba(248, 113, 113, 0.12);
      color: #b91c1c;
      font-size: 12.5px;
    }

    .sub-hint {
      margin: 0;
      padding: 8px 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #fffbeb;
      color: #92400e;
      border: 1px dashed #fde68a;
      border-radius: 8px;
      font-size: 12.5px;
    }
    .sub-hint .material-icons-outlined { font-size: 16px; }

    /* Inline parent-name link → opens the drawer. */
    .link-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0;
      background: transparent;
      border: 0;
      color: var(--sd-color-primary, #4f46e5);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .link-btn:hover { color: #312e81; }
    .link-btn .material-icons-outlined { font-size: 13px; opacity: 0.65; }

    .inbox-vetting {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: rgba(99, 102, 241, 0.05);
      border: 1px dashed rgba(99, 102, 241, 0.35);
      border-radius: 8px;
      flex-wrap: wrap;
    }
    .vet-btn {
      background: #fff;
      border-color: rgba(99, 102, 241, 0.4);
      color: #4338ca;
    }
    .vet-btn:hover { background: #eef2ff; }
    .vet-hint {
      font-size: 12px;
      color: #4338ca;
      flex: 1;
      min-width: 180px;
    }
  `,
})
export class WorkspaceSubscriptionSectionComponent implements OnInit, OnChanges {
  @Input({ required: true }) institutionId!: string;
  @Input() institutionLabel: string | null = null;
  /**
   * When set (typically from a deep-link query param), the matching
   * pending-request card scrolls into view and gets a transient
   * `flash` highlight. Stays in place across re-pollings of the inbox
   * until the linger timer fires; the parent clears it back to `null`
   * when the URL no longer carries `?request=`.
   */
  @Input() highlightRequestId: string | null = null;

  private readonly bridge = inject(SubscriptionRequestsBridgeService);
  private readonly subsApi = inject(WayelAdminSubscriptionsService);
  private readonly payoutsApi = inject(InstitutionPayoutsApiService);
  private readonly tenantsApi = inject(WayelAdminTenantsService);
  private readonly toasts = inject(ToastService);
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Currently-flashing pending-request id. Distinct from
   * `highlightRequestId` so the flash can keep playing for a moment
   * after the parent clears the input — and so we don't re-trigger the
   * flash on every poll while the URL hasn't changed.
   */
  protected readonly flashedRequestId = signal<string | null>(null);
  /** Tracks the row we've already scrolled to so a `pendingRequests`
   *  refresh tick on the same target id doesn't re-scroll the page.
   *  Cleared whenever the input changes to a new id. */
  private lastHandledHighlight: string | null = null;
  private flashTimerId: number | null = null;

  /**
   * `true` when the REMOVED is talking to the live API. Drives the
   * read path off `/api/v1/subscription-periods`. Mock fallback is kept
   * intact for the customer-portal mock build and unit tests.
   */
  protected readonly liveMode = !environment.useMock;
  protected readonly liveLoading = signal(false);
  protected readonly liveError = signal<string | null>(null);
  private readonly liveRows = signal<SubscriptionRow[]>([]);
  private readonly liveSummary = signal<SubscriptionSummary | null>(null);

  protected readonly currentYear = new Date().getFullYear();
  protected readonly stateFilter = signal<StateFilter>('all');
  protected readonly search = signal('');
  /**
   * Bumped after every approve/reject so the computed signals re-derive.
   * The mock data store is module-level, so plain inputs alone won't trip
   * Angular's change detection on the signals.
   */
  private readonly version = signal(0);

  protected readonly pendingRequests = signal<Phase0SubscriptionRequestDto[]>([]);
  protected readonly inboxDraft = signal<InboxDraft | null>(null);
  protected readonly periodDraft = signal<PeriodDraft | null>(null);
  protected readonly busyRequestId = signal<string | null>(null);
  protected readonly busyPeriodId = signal<string | null>(null);
  protected readonly errorByRequestId = signal<Record<string, string>>({});
  protected readonly errorByPeriodId = signal<Record<string, string>>({});

  /** Parent currently shown in the side drawer (null when closed). */
  protected readonly drawerParent = signal<MockParent | null>(null);
  /** Optional child id to highlight inside the drawer's children list. */
  protected readonly drawerHighlightChildId = signal<string | null>(null);

  protected readonly drawerOpen = computed<boolean>(() => this.drawerParent() !== null);

  /**
   * Platform-wide SA school-year envelope (8 Jan – 10 Dec). The
   * backend rejects approvals outside this window with a typed
   * `subscription.outside_school_year` error; we mirror that here
   * to gate the Approve button + render a calm "approvals reopen
   * on …" banner above the inbox instead of letting curators click
   * into a server error.
   */
  /**
   * Per-institution subscription window resolved from the API. Set by
   * `loadSubscriptionWindow()` on first input-bind / on each
   * `institutionId` change. `null` while loading — banners stay hidden
   * during that brief gap so the staff curator doesn't see a flash of
   * the old institution's banner.
   */
  protected readonly tenantWindow = signal<InstitutionSubscriptionWindow | null>(null);

  /**
   * Per-institution required-documents list resolved from the API.
   * Each entry pairs a `DOCUMENT_CATEGORY` code with its catalogue
   * display name + (optionally) a tenant-authored hint. Drives the
   * "Docs ✓ / Docs missing" pill on every pending request row by
   * comparing each entry against the request's child
   * `requiredDocuments.categoryCodesPresent` set.
   *
   * <para>
   *   `null` while loading or when running against the mock API. In
   *   mock mode we fall back to the platform-baseline booleans
   *   (clinic card + birth certificate) on the request — same
   *   posture as the parent SPA, so the inbox still shows a sensible
   *   pill without a tenant-settings round-trip.
   * </para>
   * <para>
   *   Empty array means "tenant has no extra required documents
   *   configured" — pill collapses to the platform-baseline check.
   * </para>
   */
  protected readonly tenantRequiredDocs = signal<
    ReadonlyArray<WayelAdminTenantRequiredDocumentDto> | null
  >(null);

  protected readonly schoolYearOpen = computed<boolean>(() => {
    const w = this.tenantWindow();
    if (!w) {
      // While the window is still loading, default to "open" so the
      // approve button doesn't flicker disabled.
      return true;
    }
    return isInsideEffectiveWindow(toSubWindow(w));
  });

  protected readonly schoolYearReopensOn = computed<string>(() => {
    const w = resolveEffectiveWindow(toSubWindow(this.tenantWindow()));
    return formatWindowDate(nextWindowOpen(w));
  });

  /** Set of `parentChildId` for any *pending* request — used to suppress the
   * inline approve/reject buttons on a period row that the parent has also
   * filed a request for, so staff resolve it from the inbox (which keeps the
   * parent in the loop). */
  protected readonly inboxParentChildIds = computed<Set<string>>(() => {
    return new Set(this.pendingRequests().map((r) => r.parentChildId));
  });

  protected readonly allRows = computed<SubscriptionRow[]>(() => {
    this.version();
    if (!this.institutionId) return [];
    if (this.liveMode) return this.liveRows();
    return listSubscriptionsForTenant(this.institutionId);
  });

  protected readonly summary = computed<SubscriptionSummary>(() => {
    if (this.liveMode) {
      const live = this.liveSummary();
      if (live) return live;
    }
    return summarizeSubscriptions(this.allRows());
  });

  protected readonly chips = computed<FilterChip[]>(() => {
    const rows = this.allRows();
    const counts: Record<SubscriptionState, number> = {
      active: 0,
      pending: 0,
      paused: 0,
      ended: 0,
    };
    for (const r of rows) counts[r.state] += 1;
    return [
      { id: 'all', label: 'All', count: rows.length },
      { id: 'active', label: 'Active', count: counts.active },
      { id: 'pending', label: 'Pending', count: counts.pending },
      { id: 'paused', label: 'Paused', count: counts.paused },
      { id: 'ended', label: 'Ended', count: counts.ended },
    ];
  });

  protected readonly filteredRows = computed<SubscriptionRow[]>(() => {
    const state = this.stateFilter();
    const q = this.search().trim().toLowerCase();
    let rows = this.allRows();
    if (state !== 'all') rows = rows.filter((r) => r.state === state);
    if (q) {
      rows = rows.filter(
        (r) =>
          r.childName.toLowerCase().includes(q) ||
          r.parentName.toLowerCase().includes(q) ||
          r.parentEmail.toLowerCase().includes(q) ||
          (r.classroom ?? '').toLowerCase().includes(q),
      );
    }
    return rows;
  });

  protected setStateFilter(id: StateFilter): void {
    this.stateFilter.set(id);
  }

  protected setSearch(value: string): void {
    this.search.set(value);
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase() || '??';
  }

  protected ageLabel(years: number): string {
    if (years <= 0) return 'Under 1';
    if (years === 1) return '1 yr';
    return `${years} yrs`;
  }

  protected stateLabel(s: SubscriptionState): string {
    return subscriptionStateLabel(s);
  }

  protected prettifyEventKind = prettifyEventKind;

  protected formatMoney = formatMoney;

  protected avgPerActive(): string {
    const s = this.summary();
    if (s.active === 0) return '—';
    return formatMoney(Math.round(s.mrr / s.active), s.currency);
  }

  /** Human duration since `iso`, e.g. "3 months", "2 years". */
  protected duration(iso: string): string {
    const start = new Date(iso);
    if (Number.isNaN(start.getTime())) return '—';
    const now = new Date();
    const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
    if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'}`;
    if (days < 365) {
      const m = Math.round(days / 30);
      return `${m} ${m === 1 ? 'month' : 'months'}`;
    }
    const y = Math.round(days / 365);
    return `${y} ${y === 1 ? 'year' : 'years'}`;
  }

  /* ─── lifecycle ─────────────────────────────────────────────────────── */

  ngOnInit(): void {
    if (this.liveMode) {
      void this.loadLive();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reset the "already handled" memo when the parent navigates to a
    // different `?request=` (or clears it). Without this, returning to
    // the same id later wouldn't re-scroll, which is the wrong UX after
    // the user navigated away and back.
    if ('highlightRequestId' in changes) {
      this.lastHandledHighlight = null;
      // The list might already contain the row — try the highlight
      // immediately so we don't have to wait for the next refresh tick.
      this.tryFlashHighlightedRequest();
    }

    if ('institutionId' in changes) {
      this.refreshPendingRequests();
      this.cancelInbox();
      this.cancelPeriod();
      if (this.liveMode) {
        this.liveRows.set([]);
        this.liveSummary.set(null);
        this.liveError.set(null);
        void this.loadLive();
      }
      // Re-fetch the subscription window when the parent navigates to
      // a different institution — each tenant carries its own envelope.
      this.tenantWindow.set(null);
      void this.loadSubscriptionWindow();
      // Same story for the configured required-documents list — the
      // pill on each pending row is per-tenant, so we wipe any
      // stale list before the next fetch lands.
      this.tenantRequiredDocs.set(null);
      void this.loadRequiredDocuments();
    }
  }

  /**
   * Loads the institution's resolved annual subscription window from
   * the API. Failures fall back to the platform default by leaving
   * `tenantWindow` null — the `schoolYearOpen` computed treats that
   * as "open" so a transient blip never disables the approve queue.
   */
  private async loadSubscriptionWindow(): Promise<void> {
    if (!this.institutionId || !this.liveMode) return;
    try {
      const result = await this.payoutsApi.getSubscriptionWindow(this.institutionId);
      this.tenantWindow.set(result);
    } catch {
      // Swallow — banner just stays hidden; backend-side guard still
      // rejects out-of-window approvals so we fail safe.
      this.tenantWindow.set(null);
    }
  }

  /**
   * Loads the institution's configured required-documents list (the
   * chip set the tenant admin authored). Stays a no-op in mock mode
   * — the inbox falls back to the platform-baseline booleans on
   * each request when the list is `null`. Failures are swallowed
   * for the same reason as the window loader: the backend is the
   * authoritative gate, the pill is just a hint.
   */
  private async loadRequiredDocuments(): Promise<void> {
    if (!this.institutionId || !this.liveMode) return;
    try {
      const result = await this.tenantsApi.getRequiredDocuments(this.institutionId);
      this.tenantRequiredDocs.set(result.items ?? []);
    } catch {
      this.tenantRequiredDocs.set(null);
    }
  }

  /** Re-issue the live read after a transient API failure. */
  protected reloadLive(): void {
    void this.loadLive();
  }

  /**
   * Pulls the live subscription list + KPI rollup for the current
   * institution and projects them onto the component's `SubscriptionRow`
   * shape. Errors surface inline (banner + Retry) so the workspace
   * shell never white-screens.
   */
  private async loadLive(): Promise<void> {
    if (!this.institutionId) return;
    this.liveLoading.set(true);
    this.liveError.set(null);
    try {
      const [list, summary] = await Promise.all([
        this.subsApi.list(this.institutionId),
        this.subsApi.summary(this.institutionId),
      ]);
      this.liveRows.set(list.items.map(wireToSubscriptionRow));
      this.liveSummary.set(buildSummaryFromKpi(summary, list.activeCount + list.archivedCount));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not load subscriptions for this institution.';
      this.liveError.set(msg);
      this.liveRows.set([]);
      this.liveSummary.set(null);
    } finally {
      this.liveLoading.set(false);
    }
  }

  private refreshPendingRequests(): void {
    if (!this.institutionId) {
      this.pendingRequests.set([]);
      return;
    }
    this.bridge
      .listForInstitution(this.institutionId, { status: 'pending', pageSize: 100 })
      .pipe(catchError(() => of({ items: [], totalCount: 0, page: 1, pageSize: 100 })))
      .subscribe((res) => {
        this.pendingRequests.set(res.items);
        // The deep-link target might have been waiting for the inbox to
        // load. Re-attempt the highlight now that we have a fresh row
        // set; `tryFlashHighlightedRequest` is idempotent for ids it's
        // already handled, so a second poll on the same id won't
        // re-scroll mid-read.
        this.tryFlashHighlightedRequest();
      });
  }

  /**
   * Looks for a pending-request card matching `highlightRequestId` in
   * the current DOM and, when found, scrolls it into view + flashes the
   * `.flash` class for ~3.5 s. Safe to call repeatedly: it remembers the
   * last id it acted on and bails on a no-op if nothing new came in.
   *
   * Lives behind `requestAnimationFrame` so the queryselector runs after
   * Angular has had a chance to commit the latest pendingRequests render
   * pass — otherwise the matching `<li>` may not exist yet on the very
   * first call.
   */
  private tryFlashHighlightedRequest(): void {
    const target = this.highlightRequestId;
    if (!target) {
      // Parent cleared the input; release the memo so a future deep-link
      // back to a previously-flashed id can still trigger a fresh flash.
      this.lastHandledHighlight = null;
      return;
    }
    if (this.lastHandledHighlight === target) return;

    // Only attempt if the target is actually in the current pending set —
    // otherwise wait for the next refresh tick rather than scrolling to a
    // ghost id.
    if (!this.pendingRequests().some((r) => r.id === target)) return;

    this.lastHandledHighlight = target;

    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return;

    requestAnimationFrame(() => {
      // The UUID guard in the parent component (loose 32-40 char hex/dash
      // regex) keeps `target` in a CSS-selector-safe charset, so we can
      // template it straight in without `CSS.escape` polyfill ceremony.
      const root = this.host.nativeElement;
      const el = root.querySelector<HTMLElement>(`#subscription-request-${target}`);
      if (!el) return;

      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // `scrollIntoView` with options can be a no-op in older browsers
        // (e.g. test JSDOM). Fall back to the boolean form so we still
        // land near the row even if the smooth scroll is unavailable.
        el.scrollIntoView();
      }

      this.flashedRequestId.set(target);
      this.cdr.markForCheck();

      if (this.flashTimerId !== null) {
        window.clearTimeout(this.flashTimerId);
      }
      this.flashTimerId = window.setTimeout(() => {
        this.flashedRequestId.set(null);
        this.flashTimerId = null;
        this.cdr.markForCheck();
      }, 3500);
    });
  }

  /* ─── inbox actions ─────────────────────────────────────────────────── */

  protected isLinkedToInbox(row: SubscriptionRow): boolean {
    return this.inboxParentChildIds().has(row.child.id);
  }

  protected startInboxAction(req: Phase0SubscriptionRequestDto, action: PendingAction): void {
    this.cancelPeriod();
    this.clearRequestError(req.id);
    this.inboxDraft.set({
      requestId: req.id,
      action,
      classroom: req.classroomRequested ?? '',
      reason: '',
    });
  }

  protected updateInboxField(field: 'classroom' | 'reason', value: string): void {
    const draft = this.inboxDraft();
    if (!draft) return;
    this.inboxDraft.set({ ...draft, [field]: value });
  }

  protected cancelInbox(): void {
    this.inboxDraft.set(null);
  }

  protected canSubmitInbox(): boolean {
    const draft = this.inboxDraft();
    if (!draft) return false;
    if (draft.action === 'reject') return draft.reason.trim().length > 0;
    return true;
  }

  protected submitInbox(req: Phase0SubscriptionRequestDto): void {
    const draft = this.inboxDraft();
    if (!draft || draft.requestId !== req.id) return;
    this.busyRequestId.set(req.id);
    this.clearRequestError(req.id);

    const done = () => {
      this.busyRequestId.set(null);
      this.inboxDraft.set(null);
      this.refreshPendingRequests();
      this.version.update((n) => n + 1);
    };

    const tenantId = this.liveMode ? this.institutionId : null;

    if (draft.action === 'approve') {
      this.bridge
        .approve(
          req.id,
          { classroom: draft.classroom.trim() || null },
          { tenantId },
        )
        .pipe(
          catchError((err: unknown) => {
            this.setRequestError(req.id, this.errorMessage(err, 'Could not approve.'));
            this.busyRequestId.set(null);
            return EMPTY;
          }),
        )
        .subscribe(() => done());
    } else {
      this.bridge
        .reject(
          req.id,
          { reason: draft.reason.trim() },
          { tenantId },
        )
        .pipe(
          catchError((err: unknown) => {
            this.setRequestError(req.id, this.errorMessage(err, 'Could not reject.'));
            this.busyRequestId.set(null);
            return EMPTY;
          }),
        )
        // POST /reject returns **204 No Content** — HttpClient emits `null`.
        // The old `if (r !== null) done()` treated that success as failure,
        // left the inbox stuck, and never refreshed the list.
        .subscribe(() => done());
    }
  }

  /* ─── inline period actions ────────────────────────────────────────── */

  protected startPeriodAction(row: SubscriptionRow, action: PendingAction): void {
    this.cancelInbox();
    this.clearPeriodError(row.id);
    this.periodDraft.set({
      periodId: row.id,
      action,
      classroom: row.classroom ?? '',
      reason: '',
    });
  }

  protected updatePeriodField(field: 'classroom' | 'reason', value: string): void {
    const draft = this.periodDraft();
    if (!draft) return;
    this.periodDraft.set({ ...draft, [field]: value });
  }

  protected cancelPeriod(): void {
    this.periodDraft.set(null);
  }

  protected canSubmitPeriod(): boolean {
    const draft = this.periodDraft();
    if (!draft) return false;
    if (draft.action === 'reject') return draft.reason.trim().length > 0;
    return true;
  }

  protected submitPeriod(row: SubscriptionRow): void {
    const draft = this.periodDraft();
    if (!draft || draft.periodId !== row.id) return;
    this.busyPeriodId.set(row.id);
    this.clearPeriodError(row.id);

    const result =
      draft.action === 'approve'
        ? approvePendingPeriod(this.institutionId, {
            periodId: row.id,
            classroom: draft.classroom.trim() || null,
          })
        : rejectPendingPeriod(this.institutionId, {
            periodId: row.id,
            reason: draft.reason.trim(),
          });

    this.busyPeriodId.set(null);
    if (!result.ok) {
      this.setPeriodError(row.id, result.error || 'Operation failed.');
      return;
    }
    this.periodDraft.set(null);
    this.version.update((n) => n + 1);
  }

  /* ─── error helpers ─────────────────────────────────────────────────── */

  private setRequestError(id: string, msg: string): void {
    this.errorByRequestId.update((m) => ({ ...m, [id]: msg }));
  }

  private clearRequestError(id: string): void {
    this.errorByRequestId.update((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  private setPeriodError(id: string, msg: string): void {
    this.errorByPeriodId.update((m) => ({ ...m, [id]: msg }));
  }

  private clearPeriodError(id: string): void {
    this.errorByPeriodId.update((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  private errorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  /** Parent-chosen subscription cadence on the request (API lowercase or mock PascalCase). */
  protected billingCadenceHint(cadence: string | null | undefined): string | null {
    return subscriptionBillingCadencePhrase(cadence);
  }

  /**
   * Pill descriptor next to the child name on each pending request
   * row. Drives a green "Docs ✓" badge when the parent vault
   * already carries everything *this* institution requires, a red
   * "Docs missing" badge otherwise.
   *
   * <para>
   *   Two-tier evaluation:
   *   <list type="number">
   *     <item><description>
   *       If we know the institution's configured
   *       <c>requiredDocuments</c> list (live mode, fetched on
   *       institution bind), each entry is checked against the
   *       request's <c>requiredDocuments.categoryCodesPresent</c>
   *       set — same gate the backend will run when staff click
   *       Approve. Missing entries surface with their resolved
   *       catalogue display name in the tooltip.
   *     </description></item>
   *     <item><description>
   *       Otherwise (mock / list still loading / fetch failed) we
   *       fall back to the platform-baseline booleans (clinic
   *       card + birth certificate) on the request — the same
   *       conservative posture the parent SPA uses when the
   *       institution wire shape is missing.
   *     </description></item>
   *   </list>
   * </para>
   *
   * Returns <c>null</c> when the wire didn't include the
   * <c>requiredDocuments</c> block on the request (legacy server)
   * so the inbox doesn't lie about the absence of data.
   */
  protected requestDocsPill(req: Phase0SubscriptionRequestDto): {
    state: 'complete' | 'missing';
    label: string;
    icon: string;
    tooltip: string;
  } | null {
    const docs = req.requiredDocuments;
    if (!docs) return null;

    // Build the authoritative present-codes set. Platform-baseline
    // booleans are folded in so we never under-report a missing
    // baseline doc when an older deploy doesn't send
    // `categoryCodesPresent`.
    const present = new Set<string>(
      (docs.categoryCodesPresent ?? []).map((c) => c.toUpperCase()),
    );
    if (docs.hasClinicCard) present.add('CLINIC_CARD');
    if (docs.hasBirthCertificate) present.add('BIRTH_CERTIFICATE');

    const tenantList = this.tenantRequiredDocs();
    if (tenantList && tenantList.length > 0) {
      // Per-tenant gate — compare against this institution's
      // configured chip set. Missing entries carry their lookup
      // display name so the tooltip reads "missing Clinic Card and
      // Proof of Address" instead of raw codes.
      const missingLabels: string[] = [];
      for (const r of tenantList) {
        const code = (r.categoryCode ?? '').trim().toUpperCase();
        if (!code) continue;
        if (!present.has(code)) {
          missingLabels.push(r.displayName?.trim() || code);
        }
      }
      if (missingLabels.length === 0) {
        return {
          state: 'complete',
          label: 'Docs ✓',
          icon: 'verified',
          tooltip:
            'Parent vault has every document this institution requires.',
        };
      }
      return {
        state: 'missing',
        label: 'Docs missing',
        icon: 'priority_high',
        tooltip:
          `Parent has not uploaded ${missingLabels.join(', ')} for this child yet.`,
      };
    }

    // Legacy / mock fallback — only the platform baseline is known.
    if (docs.hasClinicCard && docs.hasBirthCertificate) {
      return {
        state: 'complete',
        label: 'Docs ✓',
        icon: 'verified',
        tooltip:
          'Clinic card and birth certificate are both on file in the parent vault.',
      };
    }
    const missing: string[] = [];
    if (!docs.hasClinicCard) missing.push('clinic card');
    if (!docs.hasBirthCertificate) missing.push('birth certificate');
    return {
      state: 'missing',
      label: 'Docs missing',
      icon: 'priority_high',
      tooltip: `Parent has not uploaded ${missing.join(' and ')} for this child yet.`,
    };
  }

  /* ─── parent profile drawer ─────────────────────────────────────────── */

  protected openParentDrawerForRequest(req: Phase0SubscriptionRequestDto): void {
    if (this.liveMode) {
      // Synth a thin parent stub from the matching live row so we don't
      // need a separate parents-API round trip just to open the drawer.
      const row = this.allRows().find((r) => r.subscription.id === req.id || r.parent.id === req.parentId);
      if (!row) {
        this.toasts.info('No matching subscription row to open the parent drawer for.');
        return;
      }
      this.drawerParent.set(row.parent);
      this.drawerHighlightChildId.set(row.child.id);
      return;
    }
    const link = findMockParentChild(req.parentChildId);
    if (!link) return;
    this.drawerParent.set(link.parent);
    this.drawerHighlightChildId.set(link.child.id);
  }

  protected openParentDrawerForRow(row: SubscriptionRow): void {
    this.drawerParent.set(row.parent);
    this.drawerHighlightChildId.set(row.child.id);
  }

  protected closeParentDrawer(): void {
    this.drawerParent.set(null);
    this.drawerHighlightChildId.set(null);
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Live-mode wire mappers                                                     */
/*                                                                            */
/* The live API returns a flat `WayelSubscriptionPeriodSummary` per period.   */
/* The backend joins in parent + child names / contact details *and* the      */
/* best-fit programme + latest fee for the child's age, so the                */
/* `SubscriptionRow` gets real values for chips, search, KPI tiles, the       */
/* parent profile drawer, and the per-row program/fee meta cells. When the    */
/* match is ambiguous (multiple programmes that fit the age, no DOB) the      */
/* matchedProgram fields stay `null` and the SPA renders "Unmatched / No fee" */
/* — staff can resolve those by linking the period to a programme later.      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Lift the API DTO onto the shared `SubscriptionWindow` type. Returns
 * null when the input is null so callers can use the fallback chain
 * (`resolveEffectiveWindow(null)` → platform default).
 */
function toSubWindow(
  dto: InstitutionSubscriptionWindow | null,
): SubscriptionWindow | null {
  if (!dto) return null;
  return {
    openMonth: dto.openMonth,
    openDay: dto.openDay,
    closeMonth: dto.closeMonth,
    closeDay: dto.closeDay,
  };
}

function wireToSubscriptionRow(p: WayelSubscriptionPeriodSummary): SubscriptionRow {
  const state: SubscriptionRow['state'] = p.isActive ? 'active' : 'ended';
  const childId = p.parentChildId || p.institutionChildId || p.subscriptionPeriodId;

  const sub: MockParentChildSubscription = {
    id: p.subscriptionPeriodId,
    institutionId: p.institutionId,
    institutionChildId: p.institutionChildId ?? undefined,
    state,
    enrolledAt: p.startedOnUtc ? p.startedOnUtc.slice(0, 10) : null,
    endedAt: p.archivedOnUtc ? p.archivedOnUtc.slice(0, 10) : null,
    endedReason: p.archiveReason,
    archivedAt: p.archivedOnUtc,
    classroom: null,
    events: [],
  };

  const childName = (p.childDisplayName ?? '').trim() || 'Child';
  const childDob = p.childDateOfBirth ?? '2020-01-01';

  const child: MockParentChild = {
    id: childId,
    displayName: childName,
    dateOfBirth: childDob,
    notes: null,
    photoUrl: p.childPhotoUrl ?? null,
    subscriptions: [sub],
  };

  const parentName = (p.parentDisplayName ?? '').trim() || 'Parent';
  const parentEmail = (p.parentEmail ?? '').trim();

  const parent: MockParent = {
    id: p.parentId,
    displayName: parentName,
    email: parentEmail,
    phone: p.parentPhone ?? null,
    createdAt: p.startedOnUtc,
    profile: wireToGuardianProfile(p),
    children: [child],
  };

  const ageYears = computeAgeYears(childDob);
  const matchedProgram = wireToWorkspaceProgram(p);
  const fee = wireToWorkspaceFee(p);

  return {
    id: p.subscriptionPeriodId,
    parent,
    child,
    subscription: sub,
    childName: child.displayName,
    parentName: parent.displayName,
    parentEmail: parent.email,
    classroom: null,
    matchedProgram,
    fee,
    feeLabel: fee
      ? `${formatMoney(fee.amount, fee.currency)}/${cadenceShort(fee.cadence)}`
      : null,
    state,
    enrolledAt: sub.enrolledAt,
    endedAt: sub.endedAt,
    endedReason: sub.endedReason,
    archivedAt: sub.archivedAt,
    ageYears,
    lastEvent: null,
  };
}

/**
 * Project the wire fee fields onto a `WorkspaceProgramFee`. Returns
 * `null` when the API didn't surface a fee for the matched programme
 * (either no programme matched, or the programme has no fee rows yet).
 */
function wireToWorkspaceFee(
  p: WayelSubscriptionPeriodSummary,
): WorkspaceProgramFee | null {
  if (
    p.latestFeeYear == null ||
    p.latestFeeAmount == null ||
    p.latestFeeCurrency == null ||
    p.latestFeeCadence == null
  ) {
    return null;
  }
  return {
    year: p.latestFeeYear,
    amount: p.latestFeeAmount,
    currency: p.latestFeeCurrency,
    cadence: cadenceFromWire(p.latestFeeCadence),
    notes: null,
    updatedAt: '',
  };
}

/**
 * Project the matched-programme wire fields onto a thin
 * `WorkspaceProgram` shell. We only fill what the workspace
 * subscriptions tab actually renders (id, name, kind, schedule); the
 * fee list and staff slots stay empty here — the full programme record
 * is owned by the programs tab.
 */
function wireToWorkspaceProgram(
  p: WayelSubscriptionPeriodSummary,
): WorkspaceProgram | null {
  if (!p.matchedProgramId || !p.matchedProgramName) {
    return null;
  }
  const fee = wireToWorkspaceFee(p);
  return {
    id: p.matchedProgramId,
    institutionId: p.institutionId,
    kind: kindFromWire(p.matchedProgramKind),
    schedule: scheduleFromWire(p.matchedProgramSchedule),
    name: p.matchedProgramName,
    description: null,
    capacity: null,
    ageMin: null,
    ageMax: null,
    active: true,
    teacherStaffId: null,
    assistantStaffId: null,
    fees: fee ? [fee] : [],
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * Project the parent-side guardian profile fields the API joins onto
 * each subscription period row into the `MockGuardianProfile` shape the
 * parent-profile drawer was built around. Returns `undefined` when the
 * parent hasn't filled in any field — the drawer falls back to the
 * legacy email / phone display in that case.
 *
 * <para>
 * The wire enum vocabularies are slightly tighter than the mock ones —
 * the mock has "Miss" / "Other" that don't have a wire counterpart, and
 * the wire has "Mx" that isn't in the mock title list. We map only the
 * shared values; missing values fall back to <c>null</c> so the drawer
 * renders an em-dash.
 * </para>
 */
function wireToGuardianProfile(
  p: WayelSubscriptionPeriodSummary,
): MockGuardianProfile | undefined {
  const anyFieldSet =
    (p.parentTitle && p.parentTitle !== 'Undisclosed') ||
    p.parentFirstName ||
    p.parentLastName ||
    (p.parentIdType && p.parentIdType !== 'Undisclosed') ||
    p.parentIdNumber ||
    p.parentMobile ||
    p.parentTelephone ||
    p.parentFinancialEmail;
  if (!anyFieldSet) return undefined;

  return {
    title: titleFromWire(p.parentTitle),
    firstName: p.parentFirstName ?? null,
    lastName: p.parentLastName ?? null,
    idNumberType: idTypeFromWire(p.parentIdType),
    idNumber: p.parentIdNumber ?? null,
    mobile: p.parentMobile ?? null,
    telephone: p.parentTelephone ?? null,
    financialEmail: p.parentFinancialEmail ?? null,
  };
}

function titleFromWire(t: WayelGuardianTitle | null): MockGuardianTitle | null {
  switch (t) {
    case 'Mr':
    case 'Mrs':
    case 'Ms':
    case 'Dr':
    case 'Prof':
      return t;
    case 'Undisclosed':
      return 'Undisclosed';
    case 'Mx':
    case null:
    case undefined:
    default:
      return null;
  }
}

function idTypeFromWire(t: WayelGuardianIdType | null): MockGuardianIdType | null {
  switch (t) {
    case 'RsaId':
      return 'RSA ID';
    case 'Passport':
      return 'Passport';
    case 'Undisclosed':
    case null:
    case undefined:
    default:
      return null;
  }
}

function kindFromWire(k: WayelProgramKind | null): WorkspaceProgramKind {
  // Preschool / childcare tenants are all daycare in Phase 0; keep the
  // default sticky so a future "Session" enum addition doesn't crash
  // the UI on an unexpected wire value.
  if (k === 'Session') return 'session';
  return 'daycare';
}

function scheduleFromWire(
  s: WayelProgramSchedule | null,
): WorkspaceProgramSchedule | null {
  if (s === 'FullDay') return 'full_day';
  if (s === 'HalfDay') return 'half_day';
  return null;
}

function cadenceFromWire(c: WayelProgramFeeCadence): WorkspaceFeeCadence {
  switch (c) {
    case 'Term':
      return 'term';
    case 'Year':
      return 'year';
    case 'Month':
    default:
      return 'month';
  }
}

function cadenceShort(c: WorkspaceFeeCadence): string {
  switch (c) {
    case 'term':
      return 'term';
    case 'year':
      return 'year';
    case 'month':
    default:
      return 'month';
  }
}

function computeAgeYears(isoDob: string): number {
  const dob = new Date(isoDob);
  if (isNaN(dob.getTime())) return 0;
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) years--;
  return Math.max(0, years);
}

/**
 * Project the API's KPI summary onto the section's `SubscriptionSummary`
 * shape. The wire DTO already carries an MRR estimate and totals — we
 * fan them out into the field names the template reads.
 */
function buildSummaryFromKpi(
  kpi: WayelSubscriptionsSummary,
  totalKnown: number,
): SubscriptionSummary {
  return {
    totalPeriods: Math.max(kpi.totalSubscriptions, totalKnown),
    active: kpi.activeSubscriptions,
    pending: 0,
    paused: 0,
    ended: kpi.archivedSubscriptions,
    mrr: kpi.estimatedMrrAmount,
    ytdRevenue: kpi.estimatedMrrAmount * 12,
    currency: kpi.currency || 'ZAR',
  };
}
