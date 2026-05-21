import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
  signal,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MockPlatformAuditEntry } from '@wayel/shared/core/mock/mock-data';
import {
  MOCK_INSTITUTIONS,
  MOCK_INSTITUTION_CATEGORY_LABELS,
  institutionById,
  type MockInstitution,
  type MockInstitutionCategory,
} from '@wayel/shared/core/mock/mock-institutions';
import { ConfirmDialogService } from '@wayel/shared/services/confirm-dialog.service';
import { MockPlatformAuditService } from '@wayel/shared/services/mock-platform-audit.service';
import { ToastService } from '@wayel/shared/services/toast.service';
import {
  type InstitutionPartnership,
  type PartnershipBadge,
  type PartnershipScope,
  type PartnershipStatus,
} from '@wayel/shared/core/mock/mock-partnerships';
import { EmptyStateComponent } from '@wayel/shared/components/empty-state.component';
import { HistoryDisclosureComponent } from '@wayel/shared/components/history-disclosure.component';
import {
  acceptPartnership,
  addPartnership,
  declinePartnership,
  listAddablePartnerInstitutions,
  listIncomingInvitesForTenant,
  listPartnersForTenant,
  pausePartnership,
  removePartnership,
  resumePartnership,
  summarizePartnerships,
  updatePartnership,
  type PartnershipRow,
  type PartnershipSummary,
} from '@wayel/shared/services/workspace-partnership';
import {
  listProgramsForInstitution,
  type WorkspaceProgram,
} from '@wayel/shared/services/workspace-program';
import {
  WayelAdminPartnershipsService,
  type WayelAcceptPartnershipBody,
  type WayelInvitePartnershipBody,
  type WayelPartnershipBadge,
  type WayelPartnershipScopeKind,
  type WayelPartnershipSummary,
  type WayelPartnershipStatus,
} from '@wayel/shared/services/wayel-admin-partnerships.service';
import {
  InstitutionsApiService,
  projectCategory,
  type WirePublicInstitutionEntry,
} from '@wayel/shared/services/institutions-api.service';
import { environment } from '@app/environment';

type StatusFilter = 'all' | PartnershipStatus;
type ScopeChoice = 'tenant' | 'programs';
type AddStep = 'pick' | 'configure';
type CategoryFilter = 'all' | MockInstitutionCategory;

interface FilterChip {
  id: StatusFilter;
  label: string;
  count: number;
}

interface CategoryChip {
  id: CategoryFilter;
  label: string;
  count: number;
}

interface AddDraft {
  partnerInstitutionId: string;
  badge: PartnershipBadge;
  scopeKind: ScopeChoice;
  programIds: string[];
  pitch: string;
}

interface EditDraft extends AddDraft {
  partnershipId: string;
}

interface InboxAcceptDraft {
  partnershipId: string;
  pitch: string;
  scopeKind: ScopeChoice;
  programIds: string[];
}

interface InboxDeclineDraft {
  partnershipId: string;
  reason: string;
}

const DEFAULT_ACTOR_EMAIL = 'admin@platform.local';

const BADGE_LABELS: Record<PartnershipBadge, string> = {
  preferred: 'Preferred',
  partner: 'Partner',
  sister_school: 'Sister school',
};

const STATUS_LABELS: Record<PartnershipStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  pending: 'Pending',
  declined: 'Declined',
};

/**
 * Partners section for the institution workspace.
 *
 * Lets staff curate the institutions they recommend to parents. Top of the
 * pane carries an inline inbox of incoming invitations (mirrors the
 * subscriptions pattern). Below that sits a filter strip + grid of cards
 * for active/paused/pending/declined partnerships.
 *
 * The component owns its own busy + draft signals so it can be embedded in
 * either `/tenants/:id/workspace` (REMOVED) or
 * `/staff/institution/workspace` (customer-portal) with no extra plumbing.
 */
@Component({
  selector: 'app-workspace-partner-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, EmptyStateComponent, HistoryDisclosureComponent],
  template: `
    <header class="ws-main-head">
      <div>
        <h2 class="ws-title">Partner institutions</h2>
        <p class="ws-sub">
          Curate the institutions you recommend to families.
          {{ summary().active }}
          active partner{{ summary().active === 1 ? '' : 's' }} surface to
          parents at {{ institutionLabel || 'this institution' }}.
        </p>
      </div>
      @if (!showAddPanel()) {
        <button
          type="button"
          class="btn-primary"
          (click)="openAddPanel()"
          [attr.aria-label]="'Add a new partner institution'"
        >
          <span class="material-icons-outlined" aria-hidden="true">add</span>
          Add partner
        </button>
      }
    </header>

    @if (liveLoading()) {
      <p class="live-state" role="status">Loading partner directory…</p>
    } @else if (liveError()) {
      <p class="live-state live-error" role="alert">
        Could not reach the partnership service ({{ liveError() }}).
      </p>
    }

    <ul class="kpi-grid" role="list">
      <li class="kpi">
        <span class="kpi-label">Active</span>
        <strong class="kpi-value">{{ summary().active }}</strong>
        @if (summary().hasAnyMutual) {
          <span class="kpi-meta">at least one is mutual</span>
        } @else {
          <span class="kpi-meta">none mutual yet</span>
        }
      </li>
      <li class="kpi">
        <span class="kpi-label">Pending invites</span>
        <strong class="kpi-value">
          {{ summary().pendingIncoming + summary().pendingOutgoing }}
        </strong>
        <span class="kpi-meta">
          {{ summary().pendingIncoming }} in / {{ summary().pendingOutgoing }} out
        </span>
      </li>
      <li class="kpi">
        <span class="kpi-label">Programs covered</span>
        <strong class="kpi-value">{{ summary().programsCovered }}</strong>
        <span class="kpi-meta">
          via active partnerships
        </span>
      </li>
      <li class="kpi">
        <span class="kpi-label">Paused</span>
        <strong class="kpi-value">{{ summary().paused }}</strong>
        <span class="kpi-meta">hidden from parents</span>
      </li>
    </ul>

    @if (incoming().length > 0) {
      <section class="inbox" aria-labelledby="partner-inbox-title">
        <header class="inbox-head">
          <div>
            <h3 id="partner-inbox-title" class="inbox-title">
              <span class="material-icons-outlined" aria-hidden="true">mail</span>
              Pending invitations
              <span class="inbox-count">{{ incoming().length }}</span>
            </h3>
            <p class="inbox-sub">
              Other institutions that want to recommend you. Accepting creates
              a mutual partnership and starts surfacing their suggestion to
              parents enrolled with them.
            </p>
          </div>
        </header>

        <ul class="inbox-list" role="list">
          @for (row of incoming(); track row.partnership.id) {
            <li class="inbox-card" role="listitem">
              <div class="inbox-card-head">
                <div
                  class="logo-pill"
                  [style.background]="row.partner.accentColor"
                  aria-hidden="true"
                >
                  {{ initials(row.partner.name) }}
                </div>
                <div class="inbox-id">
                  <strong class="inbox-child">{{ row.partner.name }}</strong>
                  <span class="inbox-meta">
                    {{ row.partner.area }} · {{ row.partner.city }}
                    · invited {{ row.partnership.createdAt | date: 'mediumDate' }}
                  </span>
                </div>
                <span class="badge badge-{{ row.partnership.badge }}">
                  {{ badgeLabel(row.partnership.badge) }}
                </span>
              </div>

              <p class="pitch">"{{ row.partnership.pitch }}"</p>

              <p class="scope-line">
                <span class="material-icons-outlined" aria-hidden="true">tune</span>
                Their scope: <strong>{{ row.scopeLabel }}</strong>
              </p>

              @if (acceptDraft()?.partnershipId === row.partnership.id) {
                <form
                  class="inline-form"
                  (ngSubmit)="submitAccept(row)"
                >
                  <p class="form-lead">
                    Set how <strong>your</strong> reciprocal recommendation
                    will look to families on the {{ row.partner.name }} side.
                  </p>

                  <label class="field">
                    <span class="field-label">Pitch shown to their parents</span>
                    <textarea
                      rows="2"
                      maxlength="200"
                      [(ngModel)]="acceptDraft()!.pitch"
                      name="pitch"
                      placeholder="Why you'd recommend the curator's families to us…"
                    ></textarea>
                  </label>

                  <fieldset class="scope-field">
                    <legend class="field-label">Reciprocal scope</legend>
                    <label class="radio">
                      <input
                        type="radio"
                        name="rec-scope"
                        value="tenant"
                        [(ngModel)]="acceptDraft()!.scopeKind"
                      />
                      All of our programs
                    </label>
                    <label class="radio">
                      <input
                        type="radio"
                        name="rec-scope"
                        value="programs"
                        [(ngModel)]="acceptDraft()!.scopeKind"
                      />
                      Specific programs only
                    </label>
                    @if (acceptDraft()!.scopeKind === 'programs') {
                      <ul class="program-checks" role="list">
                        @for (pg of ownerPrograms(); track pg.id) {
                          <li>
                            <label class="check">
                              <input
                                type="checkbox"
                                [checked]="acceptDraft()!.programIds.includes(pg.id)"
                                (change)="toggleAcceptProgram(pg.id, $event)"
                              />
                              {{ pg.name }}
                            </label>
                          </li>
                        }
                        @empty {
                          <li class="hint">
                            No programs configured yet — leaving as tenant-wide.
                          </li>
                        }
                      </ul>
                    }
                  </fieldset>

                  <div class="inline-actions">
                    <button
                      type="button"
                      class="btn-ghost"
                      (click)="cancelAccept()"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="btn-primary"
                      [disabled]="busyId() === row.partnership.id"
                    >
                      Confirm partnership
                    </button>
                  </div>
                </form>
              } @else if (declineDraft()?.partnershipId === row.partnership.id) {
                <form
                  class="inline-form"
                  (ngSubmit)="submitDecline(row)"
                >
                  <label class="field">
                    <span class="field-label">Reason (sent to {{ row.partner.name }})</span>
                    <textarea
                      rows="2"
                      maxlength="200"
                      [(ngModel)]="declineDraft()!.reason"
                      name="reason"
                      placeholder="Politely decline so they understand why…"
                      required
                    ></textarea>
                  </label>
                  <div class="inline-actions">
                    <button
                      type="button"
                      class="btn-ghost"
                      (click)="cancelDecline()"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="btn-danger"
                      [disabled]="busyId() === row.partnership.id || !declineDraft()!.reason.trim()"
                    >
                      Decline invitation
                    </button>
                  </div>
                </form>
              } @else {
                <div class="inline-actions">
                  <button
                    type="button"
                    class="btn-ghost"
                    (click)="startDecline(row)"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">close</span>
                    Decline
                  </button>
                  <button
                    type="button"
                    class="btn-primary"
                    (click)="startAccept(row)"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">handshake</span>
                    Accept &amp; reciprocate
                  </button>
                </div>
              }

              @let inboxErr = errorByPartnershipId()[row.partnership.id];
              @if (inboxErr) {
                <p class="error" role="alert">{{ inboxErr }}</p>
              }

              <nk-history-disclosure
                [entries]="historyFor(row.partnership)"
                label="History"
                prefix="hist-incoming-"
                [subjectId]="row.partnership.id"
                [actionLabel]="partnerActionLabel"
              />
            </li>
          }
        </ul>
      </section>
    }

    @if (showAddPanel()) {
      <section class="add-panel" aria-labelledby="add-panel-title">
        <header class="add-panel-head">
          <div>
            <h3 id="add-panel-title">
              @if (addStep() === 'pick') {
                Step 1 · Pick a partner institution
              } @else {
                Step 2 · Configure the partnership
              }
            </h3>
            <p class="step-sub">
              @if (addStep() === 'pick') {
                Browse the directory below and pick the institution you'd like to partner with.
              } @else {
                Set how this partnership shows up to your families. They'll
                only see it once {{ pickedInstitution()?.name }} accepts.
              }
            </p>
          </div>
          <button
            type="button"
            class="icon-btn"
            (click)="closeAddPanel()"
            aria-label="Close add panel"
          >
            <span class="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        @if (addStep() === 'pick') {
          <div class="picker">
            <div class="picker-controls">
              <label class="search-field">
                <span class="material-icons-outlined" aria-hidden="true">search</span>
                <input
                  type="search"
                  placeholder="Search by name, suburb, or tagline…"
                  [ngModel]="pickerSearch()"
                  (ngModelChange)="pickerSearch.set($event)"
                  name="picker-search"
                  aria-label="Search institutions"
                />
              </label>
              <div class="cat-chips" role="tablist" aria-label="Filter by category">
                @for (chip of categoryChips(); track chip.id) {
                  <button
                    type="button"
                    role="tab"
                    class="chip"
                    [class.chip--active]="pickerCategory() === chip.id"
                    [attr.aria-selected]="pickerCategory() === chip.id"
                    (click)="pickerCategory.set(chip.id)"
                  >
                    {{ chip.label }}
                    <span class="chip-count">{{ chip.count }}</span>
                  </button>
                }
              </div>
            </div>

            @if (pickerResults().length === 0) {
              @if (addableInstitutions().length === 0) {
                <nk-empty
                  icon="people"
                  title="All caught up"
                  description="Every other institution in the directory is already in your partner list."
                />
              } @else {
                <nk-empty
                  icon="search"
                  title="No matching institutions"
                  description="Try a different keyword or clear the category filter."
                />
              }
            } @else {
              <ul class="inst-grid" role="list">
                @for (inst of pickerResults(); track inst.id) {
                  <li
                    class="inst-card"
                    [style.--accent]="inst.accentColor"
                  >
                    <div class="inst-cover" [class.has-image]="!!inst.imageUrl">
                      @if (inst.imageUrl) {
                        <img [src]="inst.imageUrl" [alt]="inst.name + ' cover'" />
                      } @else {
                        <div class="cover-fallback" aria-hidden="true">
                          {{ initials(inst.name) }}
                        </div>
                      }
                      <span class="kind-pill" [attr.data-kind]="inst.kind">
                        {{ inst.kind === 'daycare' ? 'Full-time' : 'Session' }}
                      </span>
                    </div>

                    <div class="inst-body">
                      <h4 class="inst-name">{{ inst.name }}</h4>
                      <p class="inst-tagline">{{ inst.tagline }}</p>
                      <ul class="inst-facts" role="list">
                        <li>
                          <span class="material-icons-outlined" aria-hidden="true">place</span>
                          {{ inst.area }}, {{ inst.city }}
                        </li>
                        <li>
                          <span class="material-icons-outlined" aria-hidden="true">child_care</span>
                          Ages {{ inst.ageRangeYears.min }}–{{ inst.ageRangeYears.max }}
                        </li>
                        <li>
                          <span class="material-icons-outlined" aria-hidden="true">category</span>
                          {{ categoryLabel(inst.category) }}
                        </li>
                      </ul>
                    </div>

                    <div class="inst-actions">
                      <button
                        type="button"
                        class="btn-primary"
                        (click)="pickInstitution(inst)"
                      >
                        <span class="material-icons-outlined" aria-hidden="true">handshake</span>
                        Partner with this
                      </button>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        } @else {
          @let picked = pickedInstitution();
          @if (picked) {
          <form class="add-form" (ngSubmit)="submitAdd()">
            <div class="picked-card">
              <div
                class="logo-pill"
                [style.background]="picked.accentColor"
                aria-hidden="true"
              >
                {{ initials(picked.name) }}
              </div>
              <div class="picked-id">
                <strong class="picked-name">{{ picked.name }}</strong>
                <span class="picked-meta">
                  {{ picked.area }} · {{ picked.city }} ·
                  {{ categoryLabel(picked.category) }}
                </span>
              </div>
              <button
                type="button"
                class="link-btn"
                (click)="changePickedInstitution()"
              >
                Change
              </button>
            </div>

            <label class="field">
              <span class="field-label">Endorsement</span>
              <div class="badge-choices" role="radiogroup" aria-label="Endorsement level">
                <label class="badge-radio" [class.is-active]="addDraft.badge === 'preferred'">
                  <input
                    type="radio"
                    name="add-badge"
                    value="preferred"
                    [(ngModel)]="addDraft.badge"
                  />
                  <span class="badge-radio-title">
                    <span class="material-icons-outlined" aria-hidden="true">star</span>
                    Preferred
                  </span>
                  <span class="badge-radio-sub">Top of suggestions</span>
                </label>
                <label class="badge-radio" [class.is-active]="addDraft.badge === 'sister_school'">
                  <input
                    type="radio"
                    name="add-badge"
                    value="sister_school"
                    [(ngModel)]="addDraft.badge"
                  />
                  <span class="badge-radio-title">
                    <span class="material-icons-outlined" aria-hidden="true">school</span>
                    Sister school
                  </span>
                  <span class="badge-radio-sub">Formal affiliation</span>
                </label>
                <label class="badge-radio" [class.is-active]="addDraft.badge === 'partner'">
                  <input
                    type="radio"
                    name="add-badge"
                    value="partner"
                    [(ngModel)]="addDraft.badge"
                  />
                  <span class="badge-radio-title">
                    <span class="material-icons-outlined" aria-hidden="true">handshake</span>
                    Partner
                  </span>
                  <span class="badge-radio-sub">Neutral curated entry</span>
                </label>
              </div>
            </label>

            <fieldset class="scope-field">
              <legend class="field-label">Who sees this suggestion?</legend>
              <label class="radio">
                <input
                  type="radio"
                  name="add-scope"
                  value="tenant"
                  [(ngModel)]="addDraft.scopeKind"
                />
                All families at our institution
              </label>
              <label class="radio">
                <input
                  type="radio"
                  name="add-scope"
                  value="programs"
                  [(ngModel)]="addDraft.scopeKind"
                />
                Only families in specific programs
              </label>
              @if (addDraft.scopeKind === 'programs') {
                <ul class="program-checks" role="list">
                  @for (pg of ownerPrograms(); track pg.id) {
                    <li>
                      <label class="check">
                        <input
                          type="checkbox"
                          [checked]="addDraft.programIds.includes(pg.id)"
                          (change)="toggleAddProgram(pg.id, $event)"
                        />
                        {{ pg.name }}
                      </label>
                    </li>
                  }
                  @empty {
                    <li class="hint">
                      No programs configured yet — add one before scoping.
                    </li>
                  }
                </ul>
              }
            </fieldset>

            <label class="field">
              <span class="field-label">Pitch shown to parents</span>
              <textarea
                rows="3"
                maxlength="200"
                [(ngModel)]="addDraft.pitch"
                name="add-pitch"
                placeholder="Why families would love this partner…"
                required
              ></textarea>
              <span class="hint">{{ addDraft.pitch.length }} / 200 characters</span>
            </label>

            @if (addError()) {
              <p class="error" role="alert">{{ addError() }}</p>
            }

            <div class="inline-actions">
              <button type="button" class="btn-ghost" (click)="changePickedInstitution()">
                <span class="material-icons-outlined" aria-hidden="true">arrow_back</span>
                Pick a different institution
              </button>
              <button
                type="submit"
                class="btn-primary"
                [disabled]="!canSubmitAdd()"
              >
                Send invitation to {{ picked.name }}
              </button>
            </div>
            <p class="hint">
              Invitations sit in the partner's inbox until they accept. The
              suggestion only goes live to parents once they reciprocate.
            </p>
          </form>
          }
        }
      </section>
    }

    <section class="filter-strip" aria-label="Filter partners">
      <div class="chips" role="tablist">
        @for (chip of filterChips(); track chip.id) {
          <button
            type="button"
            role="tab"
            class="chip"
            [class.chip--active]="statusFilter() === chip.id"
            [attr.aria-selected]="statusFilter() === chip.id"
            (click)="statusFilter.set(chip.id)"
          >
            {{ chip.label }}
            <span class="chip-count">{{ chip.count }}</span>
          </button>
        }
      </div>
    </section>

    @if (filteredOwned().length === 0) {
      @if (owned().length === 0) {
        <nk-empty
          icon="people"
          title="No partner institutions yet"
          description="Recommend other institutions to your families. Invitations sit in the partner's inbox until they accept."
        >
          <button type="button" class="btn-primary" (click)="openAddPanel()">
            <span class="material-icons-outlined" aria-hidden="true">add</span>
            Add the first partner
          </button>
        </nk-empty>
      } @else {
        <nk-empty
          icon="search"
          title="No partners in this view"
          description="Try the “All” filter to see every partnership regardless of status."
        />
      }
    } @else {
      <ul class="partner-grid" role="list">
        @for (row of filteredOwned(); track row.partnership.id) {
          <li class="partner-card" role="listitem">
            <div class="partner-card-head">
              <div
                class="logo-pill"
                [style.background]="row.partner.accentColor"
                aria-hidden="true"
              >
                {{ initials(row.partner.name) }}
              </div>
              <div class="partner-id">
                <strong class="partner-name">{{ row.partner.name }}</strong>
                <span class="partner-meta">
                  {{ row.partner.area }} · {{ row.partner.city }}
                </span>
              </div>
              <div class="partner-status">
                <span class="badge badge-{{ row.partnership.badge }}">
                  {{ badgeLabel(row.partnership.badge) }}
                </span>
                <span class="status-pill status-{{ row.partnership.status }}">
                  {{ statusLabel(row.partnership.status) }}
                </span>
              </div>
            </div>

            <p class="pitch">"{{ row.partnership.pitch }}"</p>

            <dl class="partner-facts">
              <div>
                <dt>Scope</dt>
                <dd>{{ row.scopeLabel }}</dd>
              </div>
              <div>
                <dt>Mutual</dt>
                <dd>
                  @if (row.isMutual) {
                    <span class="mutual-yes">
                      <span class="material-icons-outlined" aria-hidden="true">check_circle</span>
                      They list you back
                    </span>
                  } @else if (row.partnership.status === 'pending') {
                    <span class="mutual-pending">Awaiting their response…</span>
                  } @else if (row.partnership.status === 'declined') {
                    <span class="mutual-declined">
                      Declined: "{{ row.partnership.declineReason || '—' }}"
                    </span>
                  } @else {
                    <span class="mutual-no">One-sided for now</span>
                  }
                </dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{{ row.partnership.createdAt | date: 'mediumDate' }}</dd>
              </div>
            </dl>

            @if (editDraft()?.partnershipId === row.partnership.id) {
              <form class="inline-form" (ngSubmit)="submitEdit(row)">
                <label class="field">
                  <span class="field-label">Endorsement</span>
                  <select [(ngModel)]="editDraft()!.badge" name="edit-badge">
                    <option value="preferred">Preferred</option>
                    <option value="sister_school">Sister school</option>
                    <option value="partner">Partner</option>
                  </select>
                </label>

                <fieldset class="scope-field">
                  <legend class="field-label">Scope</legend>
                  <label class="radio">
                    <input
                      type="radio"
                      name="edit-scope"
                      value="tenant"
                      [(ngModel)]="editDraft()!.scopeKind"
                    />
                    All families
                  </label>
                  <label class="radio">
                    <input
                      type="radio"
                      name="edit-scope"
                      value="programs"
                      [(ngModel)]="editDraft()!.scopeKind"
                    />
                    Specific programs
                  </label>
                  @if (editDraft()!.scopeKind === 'programs') {
                    <ul class="program-checks" role="list">
                      @for (pg of ownerPrograms(); track pg.id) {
                        <li>
                          <label class="check">
                            <input
                              type="checkbox"
                              [checked]="editDraft()!.programIds.includes(pg.id)"
                              (change)="toggleEditProgram(pg.id, $event)"
                            />
                            {{ pg.name }}
                          </label>
                        </li>
                      }
                    </ul>
                  }
                </fieldset>

                <label class="field">
                  <span class="field-label">Pitch</span>
                  <textarea
                    rows="3"
                    maxlength="200"
                    [(ngModel)]="editDraft()!.pitch"
                    name="edit-pitch"
                  ></textarea>
                </label>

                <div class="inline-actions">
                  <button type="button" class="btn-ghost" (click)="cancelEdit()">
                    Cancel
                  </button>
                  <button type="submit" class="btn-primary">Save changes</button>
                </div>
              </form>
            } @else {
              <div class="inline-actions">
                <button
                  type="button"
                  class="btn-ghost"
                  (click)="startEdit(row)"
                >
                  <span class="material-icons-outlined" aria-hidden="true">edit</span>
                  Edit
                </button>
                @if (row.partnership.status === 'active') {
                  <button
                    type="button"
                    class="btn-ghost"
                    (click)="onPause(row)"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">pause</span>
                    Pause
                  </button>
                } @else if (row.partnership.status === 'paused') {
                  <button
                    type="button"
                    class="btn-ghost"
                    (click)="onResume(row)"
                  >
                    <span class="material-icons-outlined" aria-hidden="true">play_arrow</span>
                    Resume
                  </button>
                }
                <button
                  type="button"
                  class="btn-danger"
                  (click)="onRemove(row)"
                >
                  <span class="material-icons-outlined" aria-hidden="true">delete</span>
                  Remove
                </button>
              </div>
            }

            @let rowErr = errorByPartnershipId()[row.partnership.id];
            @if (rowErr) {
              <p class="error" role="alert">{{ rowErr }}</p>
            }

            <nk-history-disclosure
              [entries]="historyFor(row.partnership)"
              label="History"
              prefix="hist-partner-"
              [subjectId]="row.partnership.id"
              [actionLabel]="partnerActionLabel"
            />
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; }
    .ws-main-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; margin-bottom: 1rem;
    }
    .ws-title { margin: 0 0 0.2rem; font-size: 1.3rem; }
    .ws-sub { margin: 0; color: var(--nk-muted); max-width: 64ch; }

    .btn-primary {
      background: var(--sd-color-accent, #d97706); color: #fff;
      border: none; border-radius: 8px; padding: 0.55rem 0.95rem;
      font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; gap: 0.4rem;
    }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-ghost {
      background: transparent; color: var(--sd-color-accent, #d97706);
      border: 1px solid currentColor; border-radius: 8px;
      padding: 0.5rem 0.85rem; font-weight: 500; cursor: pointer;
      display: inline-flex; align-items: center; gap: 0.4rem;
    }
    .btn-danger {
      background: transparent; color: #b91c1c;
      border: 1px solid currentColor; border-radius: 8px;
      padding: 0.5rem 0.85rem; font-weight: 500; cursor: pointer;
      display: inline-flex; align-items: center; gap: 0.4rem;
    }
    .icon-btn {
      background: transparent; border: none; cursor: pointer;
      color: var(--nk-muted); padding: 0.25rem; border-radius: 6px;
      display: grid; place-items: center;
    }
    .icon-btn:hover { background: rgba(0,0,0,0.05); color: var(--sd-color-text); }
    .link-inline {
      background: none; border: none; color: var(--sd-color-accent);
      font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline;
    }

    .kpi-grid {
      list-style: none; padding: 0; margin: 0 0 1.25rem;
      display: grid; gap: 0.75rem;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .kpi {
      background: var(--surface-bg, #fff);
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px; padding: 0.85rem 1rem;
      display: flex; flex-direction: column; gap: 0.15rem;
    }
    .kpi-label { color: var(--nk-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .kpi-value { font-size: 1.6rem; font-weight: 700; color: var(--sd-color-text); }
    .kpi-meta { color: var(--nk-muted); font-size: 0.78rem; }

    .inbox {
      background: linear-gradient(135deg, #fefce8 0%, #fff 100%);
      border: 1px solid rgba(217, 119, 6, 0.3);
      border-radius: 12px; padding: 1rem 1.1rem; margin-bottom: 1.25rem;
    }
    .inbox-head { margin-bottom: 0.75rem; }
    .inbox-title {
      margin: 0; font-size: 1rem;
      display: inline-flex; align-items: center; gap: 0.45rem;
    }
    .inbox-count {
      background: #d97706; color: #fff; font-size: 0.75rem;
      padding: 0.1rem 0.5rem; border-radius: 999px; font-weight: 600;
    }
    .inbox-sub { color: var(--nk-muted); margin: 0.25rem 0 0; font-size: 0.85rem; max-width: 70ch; }
    .inbox-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.85rem; }
    .inbox-card {
      background: #fff; border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px; padding: 0.85rem 1rem;
      display: flex; flex-direction: column; gap: 0.6rem;
    }
    .inbox-card-head {
      display: grid; grid-template-columns: auto 1fr auto;
      gap: 0.7rem; align-items: center;
    }
    .inbox-id { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
    .inbox-child { color: var(--sd-color-text); }
    .inbox-meta { color: var(--nk-muted); font-size: 0.78rem; }

    .add-panel {
      background: var(--surface-bg, #fff);
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px; padding: 1rem 1.1rem; margin-bottom: 1.25rem;
    }
    .add-panel-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; margin-bottom: 0.85rem;
    }
    .add-panel-head h3 { margin: 0; font-size: 1rem; }
    .step-sub { color: var(--nk-muted); font-size: 0.85rem; margin: 0.2rem 0 0; max-width: 60ch; }
    .add-form { display: flex; flex-direction: column; gap: 0.85rem; }

    /* ── picker (step 1) ─────────────────────────────────────────────── */
    .picker { display: flex; flex-direction: column; gap: 0.85rem; }
    .picker-controls { display: flex; flex-direction: column; gap: 0.6rem; }
    .search-field {
      display: flex; align-items: center; gap: 0.4rem;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 999px; padding: 0.4rem 0.75rem;
      background: #fff;
    }
    .search-field .material-icons-outlined { color: var(--nk-muted); font-size: 1.1rem; }
    .search-field input {
      flex: 1; border: none; outline: none; background: transparent;
      font: inherit; padding: 0.15rem 0; color: var(--sd-color-text);
    }
    .cat-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }

    .inst-grid {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: 0.85rem;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    }
    .inst-card {
      --accent: #e5e7eb;
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px;
      display: flex; flex-direction: column;
      overflow: hidden;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .inst-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(0,0,0,0.06);
    }
    .inst-cover {
      position: relative;
      height: 110px;
      background: var(--accent);
      display: grid; place-items: center;
    }
    .inst-cover.has-image { background: #f3f4f6; }
    .inst-cover img { width: 100%; height: 100%; object-fit: cover; }
    .cover-fallback {
      font-size: 1.8rem; font-weight: 700; color: rgba(31, 41, 55, 0.7);
      letter-spacing: 0.04em;
    }
    .kind-pill {
      position: absolute; top: 0.5rem; right: 0.5rem;
      background: rgba(255,255,255,0.92); color: #1f2937;
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.5rem; border-radius: 999px;
    }
    .kind-pill[data-kind='daycare'] { color: #d97706; }
    .inst-body {
      padding: 0.7rem 0.85rem 0; display: flex; flex-direction: column; gap: 0.35rem; flex: 1;
    }
    .inst-name { margin: 0; font-size: 0.95rem; color: var(--sd-color-text); }
    .inst-tagline { margin: 0; color: var(--nk-muted); font-size: 0.82rem; line-height: 1.35; }
    .inst-facts {
      list-style: none; padding: 0.4rem 0 0; margin: 0;
      display: flex; flex-direction: column; gap: 0.25rem;
    }
    .inst-facts li {
      display: inline-flex; align-items: center; gap: 0.35rem;
      color: var(--nk-muted); font-size: 0.78rem;
    }
    .inst-facts .material-icons-outlined { font-size: 0.9rem; }
    .inst-actions {
      padding: 0.7rem 0.85rem 0.85rem;
    }
    .inst-actions .btn-primary { width: 100%; justify-content: center; }

    /* ── picked institution card (step 2) ────────────────────────────── */
    .picked-card {
      display: grid; grid-template-columns: auto 1fr auto;
      gap: 0.7rem; align-items: center;
      background: rgba(34, 197, 94, 0.06);
      border: 1px solid rgba(34, 197, 94, 0.25);
      border-radius: 10px; padding: 0.7rem 0.85rem;
    }
    .picked-id { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
    .picked-name { color: var(--sd-color-text); }
    .picked-meta { color: var(--nk-muted); font-size: 0.78rem; }
    .link-btn {
      background: none; border: none; cursor: pointer;
      color: var(--sd-color-accent, #d97706);
      font-weight: 600; font-size: 0.85rem;
      padding: 0.25rem 0.5rem; border-radius: 6px;
    }
    .link-btn:hover { background: rgba(217, 119, 6, 0.08); }

    /* ── badge radio choices (step 2) ────────────────────────────────── */
    .badge-choices {
      display: grid; gap: 0.5rem;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    }
    .badge-radio {
      position: relative;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px; padding: 0.65rem 0.8rem;
      cursor: pointer; display: flex; flex-direction: column; gap: 0.15rem;
      background: #fff; transition: border-color 0.1s, background 0.1s;
    }
    .badge-radio input { position: absolute; opacity: 0; pointer-events: none; }
    .badge-radio:hover { border-color: rgba(217, 119, 6, 0.4); }
    .badge-radio.is-active {
      border-color: var(--sd-color-accent, #d97706);
      background: rgba(217, 119, 6, 0.05);
    }
    .badge-radio-title {
      display: inline-flex; align-items: center; gap: 0.3rem;
      font-weight: 600; font-size: 0.9rem; color: var(--sd-color-text);
    }
    .badge-radio-title .material-icons-outlined { font-size: 1.05rem; color: var(--sd-color-accent, #d97706); }
    .badge-radio-sub { color: var(--nk-muted); font-size: 0.78rem; }

    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    .field-label { font-weight: 600; font-size: 0.85rem; color: var(--sd-color-text); }
    .field select, .field textarea, .field input[type='text'] {
      width: 100%; padding: 0.55rem 0.65rem;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 8px; background: #fff; color: var(--sd-color-text);
      font: inherit;
    }
    .field textarea { resize: vertical; }
    .hint { color: var(--nk-muted); font-size: 0.78rem; margin: 0; }

    .scope-field {
      border: 1px dashed var(--surface-border, #e5e7eb);
      border-radius: 10px; padding: 0.6rem 0.8rem;
      display: flex; flex-direction: column; gap: 0.4rem; margin: 0;
    }
    .scope-field legend.field-label { padding: 0 0.3rem; }
    .radio, .check {
      display: flex; align-items: center; gap: 0.5rem;
      cursor: pointer; font-size: 0.9rem;
    }
    .program-checks {
      list-style: none; padding: 0.4rem 0 0; margin: 0;
      display: grid; gap: 0.3rem; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }

    .filter-strip { margin: 1rem 0; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chip {
      display: inline-flex; align-items: center; gap: 0.35rem;
      background: var(--surface-bg, #fff); border: 1px solid var(--surface-border, #e5e7eb);
      color: var(--sd-color-text); padding: 0.35rem 0.75rem;
      border-radius: 999px; cursor: pointer; font-size: 0.85rem; font-weight: 500;
    }
    .chip--active { background: var(--sd-color-accent, #d97706); color: #fff; border-color: transparent; }
    .chip-count {
      background: rgba(0,0,0,0.06); padding: 0.05rem 0.5rem;
      border-radius: 999px; font-size: 0.75rem;
    }
    .chip--active .chip-count { background: rgba(255,255,255,0.25); }

    .ws-empty {
      background: var(--surface-bg, #fff);
      border: 1px dashed var(--surface-border, #e5e7eb);
      border-radius: 12px; padding: 2rem 1rem; text-align: center;
      color: var(--nk-muted); display: grid; gap: 0.5rem; place-items: center;
    }
    .ws-empty .material-icons-outlined { font-size: 2rem; color: var(--nk-muted); }

    .partner-grid {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: 0.85rem;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    }
    .partner-card {
      background: var(--surface-bg, #fff);
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px; padding: 0.95rem 1rem;
      display: flex; flex-direction: column; gap: 0.7rem;
    }
    .partner-card-head {
      display: grid; grid-template-columns: auto 1fr auto;
      gap: 0.7rem; align-items: start;
    }
    .partner-id { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
    .partner-name { color: var(--sd-color-text); }
    .partner-meta { color: var(--nk-muted); font-size: 0.78rem; }
    .partner-status { display: flex; flex-direction: column; gap: 0.3rem; align-items: flex-end; }

    .logo-pill {
      width: 42px; height: 42px; border-radius: 10px;
      display: grid; place-items: center;
      color: #1f2937; font-weight: 700; font-size: 0.85rem;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 0.3rem;
      padding: 0.15rem 0.55rem; border-radius: 999px;
      font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-preferred { background: rgba(34, 197, 94, 0.15); color: #15803d; }
    .badge-sister_school { background: rgba(99, 102, 241, 0.15); color: #4338ca; }
    .badge-partner { background: rgba(148, 163, 184, 0.18); color: #334155; }

    .status-pill {
      font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 999px;
      text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
    }
    .status-active { background: rgba(34, 197, 94, 0.12); color: #15803d; }
    .status-paused { background: rgba(148, 163, 184, 0.18); color: #475569; }
    .status-pending { background: rgba(217, 119, 6, 0.15); color: #b45309; }
    .status-declined { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }

    .pitch {
      margin: 0; font-style: italic; color: var(--sd-color-text);
      background: rgba(0,0,0,0.02); padding: 0.55rem 0.7rem;
      border-radius: 8px; border-left: 3px solid rgba(217, 119, 6, 0.4);
      font-size: 0.9rem; line-height: 1.4;
    }
    .scope-line {
      margin: 0; color: var(--nk-muted); font-size: 0.85rem;
      display: inline-flex; align-items: center; gap: 0.35rem;
    }
    .scope-line .material-icons-outlined { font-size: 1rem; }

    .partner-facts {
      margin: 0; display: grid; gap: 0.4rem 1rem;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }
    .partner-facts > div { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
    .partner-facts dt {
      color: var(--nk-muted); font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .partner-facts dd { margin: 0; color: var(--sd-color-text); font-size: 0.85rem; }
    .mutual-yes {
      display: inline-flex; align-items: center; gap: 0.25rem;
      color: #15803d; font-weight: 500;
    }
    .mutual-yes .material-icons-outlined { font-size: 1rem; }
    .mutual-no { color: var(--nk-muted); font-style: italic; }
    .mutual-pending { color: #b45309; font-style: italic; }
    .mutual-declined { color: #b91c1c; font-size: 0.8rem; }

    .inline-form {
      background: rgba(0,0,0,0.02); border-radius: 10px;
      padding: 0.85rem 0.95rem; display: flex; flex-direction: column; gap: 0.7rem;
    }
    .form-lead { margin: 0; font-size: 0.85rem; color: var(--nk-muted); }
    .inline-actions {
      display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap;
    }

    .error {
      background: rgba(254, 226, 226, 0.85); color: #991b1b;
      padding: 0.5rem 0.8rem; border-radius: 8px; font-size: 0.85rem;
      margin: 0;
    }
    .live-state {
      margin: 0 0 0.85rem; padding: 0.5rem 0.8rem; border-radius: 8px;
      background: rgba(15, 118, 110, 0.08); color: #0f766e;
      font-size: 0.85rem;
    }
    .live-state.live-error {
      background: rgba(254, 226, 226, 0.85); color: #991b1b;
    }
  `,
})
export class WorkspacePartnerSectionComponent implements OnChanges {
  @Input() institutionId = '';
  @Input() institutionLabel = '';
  /** Email of the staff acting on partnerships. Falls back to platform op. */
  @Input() actorEmail: string | null = null;

  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly audit = inject(MockPlatformAuditService);
  private readonly partnershipsApi = inject(WayelAdminPartnershipsService);
  private readonly institutionsApi = inject(InstitutionsApiService);

  /**
   * In live mode the section reads partnerships from the backend
   * (`/api/v1/partnerships?tenantId=…`) and routes every lifecycle
   * verb through the live API. Mock mode keeps the in-memory bridge
   * for offline dev / Storybook-style demos.
   */
  private readonly liveMode = !environment.useMock;

  /**
   * Live snapshot of the partnership graph for the current tenant.
   * Refreshed by `loadLive()` after every mutation. Stays empty in
   * mock mode (the existing helpers drive `owned()` etc. directly).
   */
  protected readonly liveOwned = signal<PartnershipRow[]>([]);
  protected readonly liveIncoming = signal<PartnershipRow[]>([]);
  protected readonly liveSummary = signal<PartnershipSummary | null>(null);
  protected readonly liveAddable = signal<MockInstitution[]>([]);
  protected readonly liveLoading = signal(false);
  protected readonly liveError = signal<string | null>(null);

  /**
   * Cache of resolved tenant directory rows keyed by tenant id. Used to
   * decorate live partnerships with branding (name, area, accent
   * colour, …) without re-fetching the directory on every refresh.
   */
  private readonly directoryCache = new Map<string, MockInstitution>();

  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly busyId = signal<string | null>(null);
  protected readonly errorByPartnershipId = signal<Record<string, string>>({});

  protected readonly addError = signal<string | null>(null);
  protected readonly showAddPanel = signal(false);
  protected readonly addStep = signal<AddStep>('pick');
  protected readonly pickerSearch = signal('');
  protected readonly pickerCategory = signal<CategoryFilter>('all');
  protected addDraft: AddDraft = blankAddDraft();

  protected readonly editDraft = signal<EditDraft | null>(null);
  protected readonly acceptDraft = signal<InboxAcceptDraft | null>(null);
  protected readonly declineDraft = signal<InboxDeclineDraft | null>(null);

  /** Bumped after every mutation so derived signals refetch. */
  private readonly version = signal(0);

  protected readonly owned = computed<PartnershipRow[]>(() => {
    this.version();
    if (!this.institutionId) return [];
    if (this.liveMode) return this.liveOwned();
    return listPartnersForTenant(this.institutionId);
  });

  protected readonly incoming = computed<PartnershipRow[]>(() => {
    this.version();
    if (!this.institutionId) return [];
    if (this.liveMode) return this.liveIncoming();
    return listIncomingInvitesForTenant(this.institutionId);
  });

  protected readonly summary = computed<PartnershipSummary>(() => {
    this.version();
    if (!this.institutionId) {
      return {
        active: 0,
        paused: 0,
        pendingIncoming: 0,
        pendingOutgoing: 0,
        programsCovered: 0,
        hasAnyMutual: false,
      };
    }
    if (this.liveMode) {
      return (
        this.liveSummary() ?? {
          active: 0,
          paused: 0,
          pendingIncoming: 0,
          pendingOutgoing: 0,
          programsCovered: 0,
          hasAnyMutual: false,
        }
      );
    }
    return summarizePartnerships(this.institutionId);
  });

  protected readonly ownerPrograms = computed<WorkspaceProgram[]>(() => {
    this.version();
    if (!this.institutionId) return [];
    return listProgramsForInstitution(this.institutionId);
  });

  protected readonly addableInstitutions = computed<MockInstitution[]>(() => {
    this.version();
    if (!this.institutionId) return MOCK_INSTITUTIONS.slice();
    if (this.liveMode) return this.liveAddable();
    return listAddablePartnerInstitutions(this.institutionId);
  });

  /**
   * Picker results — `addableInstitutions` filtered by the search box and
   * the selected category chip. Sorted by name for stable layout.
   */
  protected readonly pickerResults = computed<MockInstitution[]>(() => {
    const all = this.addableInstitutions();
    const q = this.pickerSearch().trim().toLowerCase();
    const cat = this.pickerCategory();
    return all
      .filter((i) => cat === 'all' || i.category === cat)
      .filter((i) => {
        if (!q) return true;
        return (
          i.name.toLowerCase().includes(q) ||
          i.area.toLowerCase().includes(q) ||
          i.city.toLowerCase().includes(q) ||
          i.tagline.toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Category filter chips — counts respect the search box. */
  protected readonly categoryChips = computed<CategoryChip[]>(() => {
    const all = this.addableInstitutions();
    const q = this.pickerSearch().trim().toLowerCase();
    const search = (i: MockInstitution): boolean =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.area.toLowerCase().includes(q) ||
      i.city.toLowerCase().includes(q) ||
      i.tagline.toLowerCase().includes(q);
    const matched = all.filter(search);
    const counter = (cat: MockInstitutionCategory): number =>
      matched.filter((i) => i.category === cat).length;
    const chips: CategoryChip[] = [
      { id: 'all', label: 'All', count: matched.length },
    ];
    for (const cat of Object.keys(
      MOCK_INSTITUTION_CATEGORY_LABELS,
    ) as MockInstitutionCategory[]) {
      const count = counter(cat);
      if (count === 0) continue;
      chips.push({ id: cat, label: MOCK_INSTITUTION_CATEGORY_LABELS[cat], count });
    }
    return chips;
  });

  /** Resolved {@link MockInstitution} for the currently picked partner id. */
  protected readonly pickedInstitution = computed<MockInstitution | null>(() => {
    const id = this.addDraft.partnerInstitutionId;
    if (!id) return null;
    if (this.liveMode) {
      return this.liveAddable().find((i) => i.id === id) ?? null;
    }
    return MOCK_INSTITUTIONS.find((i) => i.id === id) ?? null;
  });

  protected readonly filterChips = computed<FilterChip[]>(() => {
    const all = this.owned();
    const counter = (status: PartnershipStatus) =>
      all.filter((r) => r.partnership.status === status).length;
    return [
      { id: 'all', label: 'All', count: all.length },
      { id: 'active', label: 'Active', count: counter('active') },
      { id: 'pending', label: 'Pending', count: counter('pending') },
      { id: 'paused', label: 'Paused', count: counter('paused') },
      { id: 'declined', label: 'Declined', count: counter('declined') },
    ];
  });

  protected readonly filteredOwned = computed<PartnershipRow[]>(() => {
    const filter = this.statusFilter();
    if (filter === 'all') return this.owned();
    return this.owned().filter((r) => r.partnership.status === filter);
  });

  /**
   * Reactive index from partnership id → audit entries (newest first), built
   * from `partnership.*` events. Drives the per-row history disclosure;
   * recomputes whenever the audit log signal changes.
   */
  protected readonly historyByPartnership = computed<
    Record<string, MockPlatformAuditEntry[]>
  >(() => {
    const out: Record<string, MockPlatformAuditEntry[]> = {};
    for (const e of this.audit.entries()) {
      if (!e.action.startsWith('partnership.')) continue;
      const key = e.subjectId ?? '';
      if (!key) continue;
      (out[key] ??= []).push(e);
    }
    return out;
  });

  protected historyFor(p: InstitutionPartnership): MockPlatformAuditEntry[] {
    return this.historyByPartnership()[p.id] ?? [];
  }

  /**
   * Compact, human-readable label for a `partnership.*` audit action. Bound
   * to the shared `<nk-history-disclosure>` so the timeline tag matches the
   * vocabulary used elsewhere in the partner UI.
   */
  protected readonly partnerActionLabel = (action: string): string => {
    switch (action) {
      case 'partnership.requested': return 'Requested';
      case 'partnership.accepted': return 'Accepted';
      case 'partnership.declined': return 'Declined';
      case 'partnership.updated': return 'Updated';
      case 'partnership.paused': return 'Paused';
      case 'partnership.resumed': return 'Resumed';
      case 'partnership.removed': return 'Removed';
      default: return action.split('.').pop() ?? action;
    }
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['institutionId']) {
      this.statusFilter.set('all');
      this.editDraft.set(null);
      this.acceptDraft.set(null);
      this.declineDraft.set(null);
      this.addDraft = blankAddDraft();
      this.showAddPanel.set(false);
      this.addStep.set('pick');
      this.pickerSearch.set('');
      this.pickerCategory.set('all');
      this.errorByPartnershipId.set({});
      this.addError.set(null);
      this.liveOwned.set([]);
      this.liveIncoming.set([]);
      this.liveSummary.set(null);
      this.liveAddable.set([]);
      this.liveError.set(null);
      this.bump();
      if (this.liveMode && this.institutionId) {
        void this.loadLive();
      }
    }
  }

  /* ── live mode helpers ────────────────────────────────────────────────── */

  /**
   * Pulls the partnership graph + tenant directory for the current
   * institution from the live API and rebuilds the read signals.
   * Falls back to an empty graph + a banner-friendly error message
   * when the call fails so the UI never crashes.
   */
  private async loadLive(): Promise<void> {
    const tenantId = this.institutionId;
    if (!tenantId) return;
    this.liveLoading.set(true);
    this.liveError.set(null);
    try {
      // Pull the directory once per refresh — partnerships reference
      // tenant ids, and the directory is the only source of branding /
      // location for them. We could be smarter (only fetch when ids
      // are missing from the cache) but the directory is small.
      const [list, directory] = await Promise.all([
        this.partnershipsApi.list(tenantId),
        firstValueFrom(this.institutionsApi.directory({ pageSize: 200 })),
      ]);

      this.directoryCache.clear();
      for (const entry of directory.items) {
        this.directoryCache.set(entry.id, wireToMockInstitution(entry));
      }

      const ownedRows = list.owned.map((p) =>
        this.wireToOwnedRow(p, tenantId),
      );
      const incomingRows = list.incomingInvites.map((p) =>
        this.wireToIncomingRow(p),
      );

      const programsCovered = countDistinctProgramsCovered(list.owned);
      const summary: PartnershipSummary = {
        active: list.summary.active,
        paused: list.summary.paused,
        pendingIncoming: list.summary.pendingIncoming,
        pendingOutgoing: list.summary.pendingOutgoing,
        programsCovered,
        hasAnyMutual: list.summary.hasAnyMutual,
      };

      // Addable list = directory rows we don't already have on file
      // (either as owner or via incoming invite) and which aren't us.
      const claimed = new Set<string>([tenantId]);
      for (const p of list.owned) claimed.add(p.partnerInstitutionId);
      for (const p of list.incomingInvites) claimed.add(p.ownerInstitutionId);
      const addable: MockInstitution[] = [];
      for (const entry of directory.items) {
        if (claimed.has(entry.id)) continue;
        addable.push(wireToMockInstitution(entry));
      }
      addable.sort((a, b) => a.name.localeCompare(b.name));

      this.liveOwned.set(ownedRows);
      this.liveIncoming.set(incomingRows);
      this.liveSummary.set(summary);
      this.liveAddable.set(addable);
      this.bump();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load partners.';
      this.liveError.set(msg);
      this.toasts.error(msg);
    } finally {
      this.liveLoading.set(false);
    }
  }

  /**
   * Resolves the {@link MockInstitution}-shaped partner record for a
   * tenant id. Falls back to a placeholder so cards still render even
   * when a partnership references a tenant that's no longer in the
   * directory (e.g. archived).
   */
  private resolvePartnerFromCache(tenantId: string): MockInstitution {
    return (
      this.directoryCache.get(tenantId) ?? {
        id: tenantId,
        name: 'Unknown institution',
        kind: 'daycare',
        category: 'preschool',
        area: '',
        city: '',
        tagline: '',
        description: '',
        monthlyFeeZar: null,
        ageRangeYears: { min: 0, max: 13 },
        accentColor: '#94a3b8',
        imageUrl: null,
      }
    );
  }

  private wireToOwnedRow(
    p: WayelPartnershipSummary,
    ownerTenantId: string,
  ): PartnershipRow {
    const partner = this.resolvePartnerFromCache(p.partnerInstitutionId);
    const programs = listProgramsForInstitution(ownerTenantId);
    const partnership = wireToInstitutionPartnership(p);
    const scoped = resolveScopedProgramsLive(partnership.scope, programs);
    return {
      partnership,
      partner,
      isMutual: p.isMutual,
      scopedPrograms: scoped,
      scopeLabel: scopeLabelLive(partnership.scope, scoped),
    };
  }

  private wireToIncomingRow(p: WayelPartnershipSummary): PartnershipRow {
    // For incoming invites the "partner" we render is the *owner* —
    // the tenant that sent the invitation our way.
    const owner = this.resolvePartnerFromCache(p.ownerInstitutionId);
    const programs = listProgramsForInstitution(p.ownerInstitutionId);
    const partnership = wireToInstitutionPartnership(p);
    const scoped = resolveScopedProgramsLive(partnership.scope, programs);
    return {
      partnership,
      partner: owner,
      isMutual: false,
      scopedPrograms: scoped,
      scopeLabel: scopeLabelLive(partnership.scope, scoped),
    };
  }

  /* ── add panel ────────────────────────────────────────────────────────── */

  protected openAddPanel(): void {
    this.addDraft = blankAddDraft();
    this.addError.set(null);
    this.addStep.set('pick');
    this.pickerSearch.set('');
    this.pickerCategory.set('all');
    this.showAddPanel.set(true);
    // The "Add partner" button hides itself once the panel opens so the
    // header doesn't show two affordances at once. To keep the UX
    // legible on long pages, scroll the freshly-rendered panel into
    // view on the next frame — without this it can feel like the
    // button "just disappeared" when the panel renders below the
    // viewport (e.g. after the inbox + KPI strip).
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        const panel = document.querySelector('.add-panel');
        if (panel instanceof HTMLElement) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }

  protected closeAddPanel(): void {
    this.showAddPanel.set(false);
    this.addError.set(null);
    this.addStep.set('pick');
  }

  protected pickInstitution(inst: MockInstitution): void {
    this.addDraft = { ...this.addDraft, partnerInstitutionId: inst.id };
    this.addStep.set('configure');
    this.addError.set(null);
  }

  protected changePickedInstitution(): void {
    this.addDraft = { ...this.addDraft, partnerInstitutionId: '' };
    this.addStep.set('pick');
    this.addError.set(null);
  }

  protected categoryLabel(cat: MockInstitutionCategory): string {
    return MOCK_INSTITUTION_CATEGORY_LABELS[cat];
  }

  protected toggleAddProgram(programId: string, evt: Event): void {
    const checked = (evt.target as HTMLInputElement).checked;
    const next = checked
      ? [...this.addDraft.programIds, programId]
      : this.addDraft.programIds.filter((id) => id !== programId);
    this.addDraft = { ...this.addDraft, programIds: next };
  }

  protected canSubmitAdd(): boolean {
    if (!this.addDraft.partnerInstitutionId) return false;
    if (!this.addDraft.pitch.trim()) return false;
    if (this.addDraft.scopeKind === 'programs' && this.addDraft.programIds.length === 0) {
      return false;
    }
    return true;
  }

  protected async submitAdd(): Promise<void> {
    if (!this.canSubmitAdd()) return;

    if (this.liveMode) {
      const partner = this.resolvePartnerFromCache(this.addDraft.partnerInstitutionId);
      const body: WayelInvitePartnershipBody = {
        partnerInstitutionId: this.addDraft.partnerInstitutionId,
        scopeKind: this.addDraft.scopeKind === 'tenant' ? 'Tenant' : 'Programs',
        programIds:
          this.addDraft.scopeKind === 'programs'
            ? [...this.addDraft.programIds]
            : null,
        badge: BADGE_TO_WIRE[this.addDraft.badge],
        pitch: this.addDraft.pitch,
      };
      try {
        const created = await this.partnershipsApi.invite(this.institutionId, body);
        this.recordAudit(
          'partnership.requested',
          created.partnershipId,
          `Invited ${partner.name} (${BADGE_LABELS[this.addDraft.badge]}).`,
        );
        this.toasts.success(`Invitation sent to ${partner.name}.`);
        this.showAddPanel.set(false);
        this.addError.set(null);
        await this.loadLive();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not add partner.';
        this.addError.set(msg);
        this.toasts.error(msg);
      }
      return;
    }

    try {
      const created = addPartnership({
        ownerInstitutionId: this.institutionId,
        partnerInstitutionId: this.addDraft.partnerInstitutionId,
        scope:
          this.addDraft.scopeKind === 'tenant'
            ? { kind: 'tenant' }
            : { kind: 'programs', programIds: [...this.addDraft.programIds] },
        badge: this.addDraft.badge,
        pitch: this.addDraft.pitch,
        actorEmail: this.actorEmail || DEFAULT_ACTOR_EMAIL,
      });
      const partner = institutionById(this.addDraft.partnerInstitutionId);
      this.recordAudit('partnership.requested', created.id,
        `Invited ${partner.name} (${BADGE_LABELS[created.badge]}).`);
      this.toasts.success(`Invitation sent to ${partner.name}.`);
      this.showAddPanel.set(false);
      this.addError.set(null);
      this.bump();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add partner.';
      this.addError.set(msg);
      this.toasts.error(msg);
    }
  }

  /* ── edit ─────────────────────────────────────────────────────────────── */

  protected startEdit(row: PartnershipRow): void {
    this.editDraft.set({
      partnershipId: row.partnership.id,
      partnerInstitutionId: row.partnership.partnerInstitutionId,
      badge: row.partnership.badge,
      scopeKind: row.partnership.scope.kind === 'tenant' ? 'tenant' : 'programs',
      programIds:
        row.partnership.scope.kind === 'programs'
          ? [...row.partnership.scope.programIds]
          : [],
      pitch: row.partnership.pitch,
    });
    this.clearError(row.partnership.id);
  }

  protected cancelEdit(): void {
    this.editDraft.set(null);
  }

  protected toggleEditProgram(programId: string, evt: Event): void {
    const draft = this.editDraft();
    if (!draft) return;
    const checked = (evt.target as HTMLInputElement).checked;
    const next = checked
      ? [...draft.programIds, programId]
      : draft.programIds.filter((id) => id !== programId);
    this.editDraft.set({ ...draft, programIds: next });
  }

  protected async submitEdit(row: PartnershipRow): Promise<void> {
    const draft = this.editDraft();
    if (!draft) return;

    if (this.liveMode) {
      this.busyId.set(row.partnership.id);
      try {
        const wireScopeKind: WayelPartnershipScopeKind =
          draft.scopeKind === 'programs' ? 'Programs' : 'Tenant';
        const updated = await this.partnershipsApi.update(
          this.institutionId,
          row.partnership.id,
          {
            scopeKind: wireScopeKind,
            programIds: wireScopeKind === 'Programs' ? [...draft.programIds] : null,
            badge: BADGE_TO_WIRE[draft.badge],
            pitch: draft.pitch,
          },
        );
        this.recordAudit(
          'partnership.updated',
          row.partnership.id,
          `Updated ${row.partner.name} (${BADGE_LABELS[BADGE_FROM_WIRE[updated.badge]]}).`,
        );
        this.toasts.success(`${row.partner.name} updated.`);
        this.editDraft.set(null);
        await this.loadLive();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not save changes.';
        this.setError(row.partnership.id, msg);
        this.toasts.error(msg);
      } finally {
        this.busyId.set(null);
      }
      return;
    }

    const scope: PartnershipScope =
      draft.scopeKind === 'tenant'
        ? { kind: 'tenant' }
        : { kind: 'programs', programIds: [...draft.programIds] };
    const updated = updatePartnership(this.institutionId, row.partnership.id, {
      scope,
      badge: draft.badge,
      pitch: draft.pitch,
    });
    if (!updated) {
      this.setError(row.partnership.id, 'Could not save changes.');
      this.toasts.error('Could not save changes.');
      return;
    }
    this.recordAudit('partnership.updated', row.partnership.id,
      `Updated ${row.partner.name} (${BADGE_LABELS[updated.badge]}).`);
    this.toasts.success(`${row.partner.name} updated.`);
    this.editDraft.set(null);
    this.bump();
  }

  /* ── pause / resume / remove ──────────────────────────────────────────── */

  protected async onPause(row: PartnershipRow): Promise<void> {
    if (this.liveMode) {
      this.busyId.set(row.partnership.id);
      try {
        await this.partnershipsApi.pause(this.institutionId, row.partnership.id);
        this.recordAudit('partnership.paused', row.partnership.id,
          `Paused ${row.partner.name} — hidden from parents.`);
        this.toasts.success(`${row.partner.name} paused.`);
        await this.loadLive();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not pause partnership.';
        this.setError(row.partnership.id, msg);
        this.toasts.error(msg);
      } finally {
        this.busyId.set(null);
      }
      return;
    }
    if (!pausePartnership(this.institutionId, row.partnership.id)) {
      this.setError(row.partnership.id, 'Could not pause partnership.');
      this.toasts.error('Could not pause partnership.');
      return;
    }
    this.recordAudit('partnership.paused', row.partnership.id,
      `Paused ${row.partner.name} — hidden from parents.`);
    this.toasts.success(`${row.partner.name} paused.`);
    this.bump();
  }

  protected async onResume(row: PartnershipRow): Promise<void> {
    if (this.liveMode) {
      this.busyId.set(row.partnership.id);
      try {
        await this.partnershipsApi.resume(this.institutionId, row.partnership.id);
        this.recordAudit('partnership.resumed', row.partnership.id,
          `Resumed ${row.partner.name} — visible to parents again.`);
        this.toasts.success(`${row.partner.name} resumed.`);
        await this.loadLive();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not resume partnership.';
        this.setError(row.partnership.id, msg);
        this.toasts.error(msg);
      } finally {
        this.busyId.set(null);
      }
      return;
    }
    if (!resumePartnership(this.institutionId, row.partnership.id)) {
      this.setError(row.partnership.id, 'Could not resume partnership.');
      this.toasts.error('Could not resume partnership.');
      return;
    }
    this.recordAudit('partnership.resumed', row.partnership.id,
      `Resumed ${row.partner.name} — visible to parents again.`);
    this.toasts.success(`${row.partner.name} resumed.`);
    this.bump();
  }

  protected onRemove(row: PartnershipRow): void {
    this.confirm
      .ask({
        title: `Remove ${row.partner.name}?`,
        message: "They'll no longer surface to your families as a partner.",
        confirmLabel: 'Remove partner',
        cancelLabel: 'Keep them',
        kind: 'danger',
      })
      .subscribe(async (res) => {
        if (!res.confirmed) return;

        if (this.liveMode) {
          this.busyId.set(row.partnership.id);
          try {
            await this.partnershipsApi.remove(this.institutionId, row.partnership.id);
            this.recordAudit('partnership.removed', row.partnership.id,
              `Removed ${row.partner.name} from partners.`);
            this.toasts.success(`${row.partner.name} removed from partners.`);
            await this.loadLive();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not remove partnership.';
            this.setError(row.partnership.id, msg);
            this.toasts.error(msg);
          } finally {
            this.busyId.set(null);
          }
          return;
        }

        if (!removePartnership(this.institutionId, row.partnership.id)) {
          this.setError(row.partnership.id, 'Could not remove partnership.');
          this.toasts.error('Could not remove partnership.');
          return;
        }
        this.recordAudit('partnership.removed', row.partnership.id,
          `Removed ${row.partner.name} from partners.`);
        this.bump();
        this.toasts.success(`${row.partner.name} removed from partners.`);
      });
  }

  /* ── inbox: accept ────────────────────────────────────────────────────── */

  protected startAccept(row: PartnershipRow): void {
    this.declineDraft.set(null);
    this.acceptDraft.set({
      partnershipId: row.partnership.id,
      pitch: '',
      scopeKind: 'tenant',
      programIds: [],
    });
    this.clearError(row.partnership.id);
  }

  protected cancelAccept(): void {
    this.acceptDraft.set(null);
  }

  protected toggleAcceptProgram(programId: string, evt: Event): void {
    const draft = this.acceptDraft();
    if (!draft) return;
    const checked = (evt.target as HTMLInputElement).checked;
    const next = checked
      ? [...draft.programIds, programId]
      : draft.programIds.filter((id) => id !== programId);
    this.acceptDraft.set({ ...draft, programIds: next });
  }

  protected async submitAccept(row: PartnershipRow): Promise<void> {
    const draft = this.acceptDraft();
    if (!draft) return;

    if (this.liveMode) {
      const body: WayelAcceptPartnershipBody = {
        scopeKind: draft.scopeKind === 'tenant' ? 'Tenant' : 'Programs',
        programIds: draft.scopeKind === 'programs' ? [...draft.programIds] : null,
        pitch: draft.pitch.trim() || null,
        badge: null,
      };
      this.busyId.set(row.partnership.id);
      try {
        const created = await this.partnershipsApi.accept(
          this.institutionId,
          row.partnership.id,
          body,
        );
        this.recordAudit('partnership.accepted', row.partnership.id,
          `Accepted ${row.partner.name}'s invitation. Reciprocal partnership created.`);
        this.recordAudit('partnership.accepted', created.partnershipId,
          `Reciprocal partnership with ${row.partner.name} now active.`);
        this.toasts.success(`Partnership with ${row.partner.name} is now active.`);
        this.acceptDraft.set(null);
        await this.loadLive();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not accept invitation.';
        this.setError(row.partnership.id, msg);
        this.toasts.error(msg);
      } finally {
        this.busyId.set(null);
      }
      return;
    }

    const scope: PartnershipScope =
      draft.scopeKind === 'tenant'
        ? { kind: 'tenant' }
        : { kind: 'programs', programIds: [...draft.programIds] };
    const created = acceptPartnership(this.institutionId, row.partnership.id, {
      actorEmail: this.actorEmail || DEFAULT_ACTOR_EMAIL,
      pitch: draft.pitch.trim() || undefined,
      scope,
    });
    if (!created) {
      this.setError(row.partnership.id, 'Could not accept invitation.');
      this.toasts.error('Could not accept invitation.');
      return;
    }
    this.recordAudit('partnership.accepted', row.partnership.id,
      `Accepted ${row.partner.name}'s invitation. Reciprocal partnership created.`);
    this.recordAudit('partnership.accepted', created.id,
      `Reciprocal partnership with ${row.partner.name} now active.`);
    this.toasts.success(`Partnership with ${row.partner.name} is now active.`);
    this.acceptDraft.set(null);
    this.bump();
  }

  /* ── inbox: decline ───────────────────────────────────────────────────── */

  protected startDecline(row: PartnershipRow): void {
    this.acceptDraft.set(null);
    this.declineDraft.set({ partnershipId: row.partnership.id, reason: '' });
    this.clearError(row.partnership.id);
  }

  protected cancelDecline(): void {
    this.declineDraft.set(null);
  }

  protected async submitDecline(row: PartnershipRow): Promise<void> {
    const draft = this.declineDraft();
    if (!draft) return;
    if (!draft.reason.trim()) return;

    if (this.liveMode) {
      this.busyId.set(row.partnership.id);
      try {
        await this.partnershipsApi.decline(
          this.institutionId,
          row.partnership.id,
          draft.reason.trim(),
        );
        this.recordAudit('partnership.declined', row.partnership.id,
          `Declined ${row.partner.name}: "${draft.reason.trim()}"`);
        this.toasts.success(`Declined ${row.partner.name}'s invitation.`);
        this.declineDraft.set(null);
        await this.loadLive();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not decline invitation.';
        this.setError(row.partnership.id, msg);
        this.toasts.error(msg);
      } finally {
        this.busyId.set(null);
      }
      return;
    }

    if (!declinePartnership(this.institutionId, row.partnership.id, draft.reason)) {
      this.setError(row.partnership.id, 'Could not decline invitation.');
      this.toasts.error('Could not decline invitation.');
      return;
    }
    this.recordAudit('partnership.declined', row.partnership.id,
      `Declined ${row.partner.name}: "${draft.reason.trim()}"`);
    this.toasts.success(`Declined ${row.partner.name}'s invitation.`);
    this.declineDraft.set(null);
    this.bump();
  }

  /* ── helpers ──────────────────────────────────────────────────────────── */

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join('');
  }

  protected badgeLabel(b: PartnershipBadge): string {
    return BADGE_LABELS[b];
  }

  protected statusLabel(s: PartnershipStatus): string {
    return STATUS_LABELS[s];
  }

  private setError(id: string, msg: string): void {
    this.errorByPartnershipId.update((curr) => ({ ...curr, [id]: msg }));
  }

  private clearError(id: string): void {
    this.errorByPartnershipId.update((curr) => {
      if (!(id in curr)) return curr;
      const next = { ...curr };
      delete next[id];
      return next;
    });
  }

  private bump(): void {
    this.version.update((v) => v + 1);
  }

  /**
   * Push a `partnership.*` event onto the audit log so the per-row history
   * disclosure and the platform `/audit` view stay in sync. The owning
   * institution is recorded as the tenant so super-admin filtering keeps
   * working.
   */
  private recordAudit(action: string, partnershipId: string, detail: string): void {
    // In live mode the API server already writes the canonical audit entry
    // (see PartnershipsEndpoints.WriteAudit). Mirroring it into the mock
    // log would double-count and surface a stale local copy that the
    // platform audit page never reads, so short-circuit here.
    if (this.liveMode) return;
    let tenantName: string | null = null;
    try {
      tenantName = institutionById(this.institutionId).name;
    } catch {
      tenantName = this.institutionLabel || null;
    }
    this.audit.record({
      action,
      detail,
      subjectId: partnershipId,
      tenantId: this.institutionId || null,
      tenantName,
      actorEmail: this.actorEmail || DEFAULT_ACTOR_EMAIL,
    });
  }
}

function blankAddDraft(): AddDraft {
  return {
    partnerInstitutionId: '',
    badge: 'partner',
    scopeKind: 'tenant',
    programIds: [],
    pitch: '',
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Live-mode wire mappers                                                     */
/*                                                                            */
/* The live API speaks PascalCase enums; the SPA template + helpers were     */
/* built around the Phase-0 mock vocabulary (lowercase + snake_case). These  */
/* mappers translate one direction at a time so the rest of the component   */
/* doesn't need to know which mode it's in.                                  */
/* ────────────────────────────────────────────────────────────────────────── */

const BADGE_FROM_WIRE: Record<WayelPartnershipBadge, PartnershipBadge> = {
  Preferred: 'preferred',
  Partner: 'partner',
  SisterSchool: 'sister_school',
};

const BADGE_TO_WIRE: Record<PartnershipBadge, WayelPartnershipBadge> = {
  preferred: 'Preferred',
  partner: 'Partner',
  sister_school: 'SisterSchool',
};

const STATUS_FROM_WIRE: Record<WayelPartnershipStatus, PartnershipStatus> = {
  Active: 'active',
  Paused: 'paused',
  Pending: 'pending',
  Declined: 'declined',
};

function wireToInstitutionPartnership(
  p: WayelPartnershipSummary,
): InstitutionPartnership {
  const scope: PartnershipScope =
    p.scope.kind === 'Programs'
      ? { kind: 'programs', programIds: [...p.scope.programIds] }
      : { kind: 'tenant' };
  return {
    id: p.partnershipId,
    ownerInstitutionId: p.ownerInstitutionId,
    partnerInstitutionId: p.partnerInstitutionId,
    scope,
    status: STATUS_FROM_WIRE[p.status],
    badge: BADGE_FROM_WIRE[p.badge],
    pitch: p.pitch,
    reciprocalPartnershipId: p.reciprocalPartnershipId,
    createdAt: p.createdOnUtc,
    createdByEmail: p.createdByEmail,
    updatedAt: p.updatedOnUtc,
    declineReason: p.declineReason,
  };
}

function wireToMockInstitution(
  entry: WirePublicInstitutionEntry,
): MockInstitution {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind === 'Daycare' ? 'daycare' : 'session',
    category: projectCategory(entry.category),
    area: entry.area ?? '',
    city: entry.city ?? '',
    tagline: entry.tagline ?? '',
    description: entry.description ?? '',
    monthlyFeeZar: entry.monthlyFeeZar,
    ageRangeYears: {
      min: entry.ageMinYears ?? 0,
      max: entry.ageMaxYears ?? 13,
    },
    accentColor: entry.accentColor ?? '#94a3b8',
    imageUrl: entry.imageUrl,
    website: entry.website ?? undefined,
  };
}

/**
 * Mirrors the Phase-0 `resolveScopedPrograms` helper without dragging
 * the mock-only file into the live path. Only the owner-side rows
 * carry meaningful program ids — anything we can't resolve in the
 * roster is dropped silently.
 */
function resolveScopedProgramsLive(
  scope: PartnershipScope,
  ownerPrograms: WorkspaceProgram[],
): WorkspaceProgram[] {
  if (scope.kind !== 'programs') return [];
  const lookup = new Map(ownerPrograms.map((p) => [p.id, p] as const));
  const resolved: WorkspaceProgram[] = [];
  for (const id of scope.programIds) {
    const found = lookup.get(id);
    if (found) resolved.push(found);
  }
  return resolved;
}

function scopeLabelLive(
  scope: PartnershipScope,
  scoped: WorkspaceProgram[],
): string {
  if (scope.kind !== 'programs') return 'All programs';
  if (scoped.length === 0) return `${scope.programIds.length} program(s)`;
  return scoped.map((p) => p.name).join(', ');
}

/**
 * Distinct count of program ids covered by *active* owner-side rows.
 * Tenant-wide rows count as 0 (we don't know the owner's program list
 * here without an extra fetch); pending / paused / declined are
 * excluded because they're not visible to parents.
 */
function countDistinctProgramsCovered(
  owned: ReadonlyArray<WayelPartnershipSummary>,
): number {
  const ids = new Set<string>();
  for (const p of owned) {
    if (p.status !== 'Active') continue;
    if (p.scope.kind !== 'Programs') continue;
    for (const id of p.scope.programIds) ids.add(id);
  }
  return ids.size;
}
