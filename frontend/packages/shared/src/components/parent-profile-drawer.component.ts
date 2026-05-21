import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import type {
  MockChildProfile,
  MockGuardianProfile,
  MockParent,
  MockParentChild,
} from '@wayel/shared/core/mock/mock-parents';

/**
 * Read-only side drawer that surfaces the full guardian profile (title, ID,
 * mobile/telephone split, financial email, etc.) staff need to verify before
 * approving a subscription request.
 *
 * Triggered from the workspace Subscriptions tab — the parent name on every
 * pending request and pending period card opens this drawer. Approve / Reject
 * buttons remain inline; this drawer doesn't own the lifecycle action, just
 * the *vetting* surface that comes before it.
 */
@Component({
  selector: 'app-parent-profile-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DatePipe],
  template: `
    @if (open && parent) {
      <div class="backdrop" (click)="onBackdropClick()" aria-hidden="true"></div>

      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'parent-profile-title-' + parent.id"
      >
        <header class="head">
          <div class="head-text">
            <span class="eyebrow">
              {{ highlightedChild() ? 'Pre-approval review' : 'Guardian' }}
            </span>
            <h2 [id]="'parent-profile-title-' + parent.id" class="title">
              @if (highlightedChild(); as c) {
                {{ c.displayName }}
              } @else {
                {{ displayName() }}
              }
            </h2>
            <p class="lead">
              @if (highlightedChild()) {
                Verify the child's profile and the responsible guardian
                before approving this subscription.
              } @else {
                The person responsible for paying the account.
              }
            </p>
          </div>
          <button
            type="button"
            class="close"
            (click)="closed.emit()"
            aria-label="Close parent profile"
          >
            <span class="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <div class="body">
          @if (highlightedChild(); as child) {
            <section class="card-section" aria-labelledby="child-profile-heading">
              <h3 id="child-profile-heading" class="section-heading">
                <span class="material-icons-outlined" aria-hidden="true">child_care</span>
                Profile Details
                <span class="section-sub">Child being subscribed</span>
              </h3>

              <div class="grid">
                <div class="field">
                  <span class="label">First name</span>
                  <span
                    class="value"
                    [class.muted]="!childProfile()?.firstName && !firstNameFromChildDisplay(child)"
                  >
                    {{ childProfile()?.firstName || firstNameFromChildDisplay(child) || '—' }}
                  </span>
                </div>
                <div class="field">
                  <span class="label">Last name</span>
                  <span
                    class="value"
                    [class.muted]="!childProfile()?.lastName && !lastNameFromChildDisplay(child)"
                  >
                    {{ childProfile()?.lastName || lastNameFromChildDisplay(child) || '—' }}
                  </span>
                </div>
                <div class="field">
                  <span class="label">Date of birth</span>
                  <span class="value with-icon">
                    <span class="material-icons-outlined" aria-hidden="true">
                      calendar_month
                    </span>
                    {{ child.dateOfBirth | date: 'd MMM yyyy' }}
                    <span class="age-pill">
                      {{ ageLabel(child.dateOfBirth) }}
                    </span>
                  </span>
                </div>
                <div class="field">
                  <span class="label">Gender</span>
                  <span
                    class="value pill"
                    [class.muted]="!childProfile()?.gender"
                  >
                    {{ childProfile()?.gender || 'Undisclosed' }}
                  </span>
                </div>
              </div>
            </section>

            <section class="card-section" aria-labelledby="additional-heading">
              <h3 id="additional-heading" class="section-heading">
                <span class="material-icons-outlined" aria-hidden="true">fact_check</span>
                Additional Details
              </h3>

              <ul class="check-list" role="list">
                <li class="check-row">
                  <span
                    class="check"
                    [attr.data-state]="boolState(childProfile()?.hasEpilepsyHistory)"
                    aria-hidden="true"
                  >
                    @if (childProfile()?.hasEpilepsyHistory === true) {
                      <span class="material-icons-outlined">check</span>
                    } @else if (childProfile()?.hasEpilepsyHistory === false) {
                      <span class="material-icons-outlined">close</span>
                    } @else {
                      <span class="material-icons-outlined">help_outline</span>
                    }
                  </span>
                  <div class="check-text">
                    <strong>Is there any history of epilepsy?</strong>
                    <span [class.warn]="childProfile()?.hasEpilepsyHistory === true">
                      {{ boolLabel(childProfile()?.hasEpilepsyHistory) }}
                    </span>
                  </div>
                </li>

                <li class="check-row">
                  <span
                    class="check"
                    [attr.data-state]="boolState(childProfile()?.allowSocialMediaSharing)"
                    aria-hidden="true"
                  >
                    @if (childProfile()?.allowSocialMediaSharing === true) {
                      <span class="material-icons-outlined">check</span>
                    } @else if (childProfile()?.allowSocialMediaSharing === false) {
                      <span class="material-icons-outlined">close</span>
                    } @else {
                      <span class="material-icons-outlined">help_outline</span>
                    }
                  </span>
                  <div class="check-text">
                    <strong>Allow social media sharing?</strong>
                    <span class="hint">
                      Allow photos to be shared on social media.
                    </span>
                    <span [class.warn]="childProfile()?.allowSocialMediaSharing === false">
                      {{ boolLabel(childProfile()?.allowSocialMediaSharing) }}
                    </span>
                  </div>
                </li>

                <li class="check-row">
                  <span
                    class="check"
                    [attr.data-state]="
                      childProfile()?.ailmentsAllergiesConditions
                        ? 'yes'
                        : childProfile()?.ailmentsAllergiesConditions === null
                          ? 'no'
                          : 'unknown'
                    "
                    aria-hidden="true"
                  >
                    @if (childProfile()?.ailmentsAllergiesConditions) {
                      <span class="material-icons-outlined">priority_high</span>
                    } @else {
                      <span class="material-icons-outlined">close</span>
                    }
                  </span>
                  <div class="check-text">
                    <strong>
                      Are there any ailments, allergies or conditions that
                      we should know about?
                    </strong>
                    @if (childProfile()?.ailmentsAllergiesConditions; as text) {
                      <p class="conditions">{{ text }}</p>
                    } @else {
                      <span>None disclosed.</span>
                    }
                  </div>
                </li>
              </ul>
            </section>

          }

          <section class="card-section" aria-labelledby="guardian-heading">
            <h3 id="guardian-heading" class="section-heading">
              <span class="material-icons-outlined" aria-hidden="true">badge</span>
              Guardian
              <span class="section-sub">Responsible for the account</span>
            </h3>
            <div class="grid">
              <div class="field">
                <span class="label">ID Number Type</span>
              <span class="value pill" [class.muted]="!profile()?.idNumberType">
                {{ profile()?.idNumberType || '—' }}
              </span>
            </div>
            <div class="field">
              <span class="label">ID/Passport No.</span>
              <span class="value mono" [class.muted]="!profile()?.idNumber">
                {{ profile()?.idNumber || '—' }}
              </span>
            </div>
            <div class="field">
              <span class="label">Title</span>
              <span class="value" [class.muted]="!profile()?.title">
                {{ profile()?.title || 'Undisclosed' }}
              </span>
            </div>
            <div class="field">
              <span class="label">First name</span>
              <span class="value" [class.muted]="!profile()?.firstName">
                {{ profile()?.firstName || firstNameFromDisplay() || '—' }}
              </span>
            </div>
            <div class="field">
              <span class="label">Last name</span>
              <span class="value" [class.muted]="!profile()?.lastName">
                {{ profile()?.lastName || lastNameFromDisplay() || '—' }}
              </span>
            </div>
            <div class="field">
              <span class="label">Mobile</span>
              <span class="value" [class.muted]="!mobileNumber()">
                {{ mobileNumber() || '—' }}
              </span>
            </div>
            <div class="field">
              <span class="label">Telephone</span>
              <span class="value" [class.muted]="!profile()?.telephone">
                {{ profile()?.telephone || '—' }}
              </span>
            </div>
            <div class="field">
              <span class="label">Email</span>
              <span class="value" [class.muted]="!parent.email">
                {{ parent.email || '—' }}
              </span>
            </div>
              <div class="field">
                <span class="label">Financial email</span>
                <span class="value" [class.muted]="!financialEmail()">
                  {{ financialEmail() || '—' }}
                </span>
                <span class="hint">
                  Where we send documents related to finance. Defaults to
                  'Email' when blank.
                </span>
              </div>
            </div>
          </section>

          <section class="meta">
            <div class="meta-row">
              <span class="material-icons-outlined" aria-hidden="true">badge</span>
              <span>
                Account on file since
                <strong>{{ parent.createdAt | date: 'd MMM yyyy' }}</strong>
              </span>
            </div>
            <div class="meta-row">
              <span class="material-icons-outlined" aria-hidden="true">family_restroom</span>
              <span>
                {{ parent.children.length }}
                {{ parent.children.length === 1 ? 'child' : 'children' }} on
                this guardian's roster
              </span>
            </div>
          </section>

          @if (parent.children.length > 0) {
            <section class="children">
              <h3 class="section-title">Children</h3>
              <ul class="child-list" role="list">
                @for (c of parent.children; track c.id) {
                  <li class="child-row" role="listitem">
                    <div
                      class="child-avatar"
                      [class.with-img]="c.photoUrl"
                    >
                      @if (c.photoUrl) {
                        <img [src]="c.photoUrl" [alt]="c.displayName" />
                      } @else {
                        {{ initials(c.displayName) }}
                      }
                    </div>
                    <div class="child-id">
                      <strong>{{ c.displayName }}</strong>
                      <span>
                        Born {{ c.dateOfBirth | date: 'd MMM yyyy' }}
                        @if (highlightedChildId === c.id) {
                          <span class="badge">This subscription</span>
                        }
                      </span>
                      @if (c.notes) {
                        <span class="child-notes">{{ c.notes }}</span>
                      }
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
        </div>

        <footer class="foot">
          <button type="button" class="btn ghost" (click)="closed.emit()">
            Close
          </button>
        </footer>
      </aside>
    }
  `,
  styles: `
    :host { display: contents; }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 90;
      animation: fade-in 140ms ease-out;
    }
    .drawer {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: min(440px, 100vw);
      background: #fff;
      z-index: 91;
      display: flex;
      flex-direction: column;
      box-shadow: -8px 0 24px rgba(15, 23, 42, 0.18);
      animation: slide-in 180ms ease-out;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slide-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--surface-border, #e5e7eb);
      background: linear-gradient(180deg, #f8fafc, #fff);
    }
    .head-text { flex: 1; min-width: 0; }
    .eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--sd-color-primary, #4f46e5);
    }
    .title {
      margin: 4px 0 4px;
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--sd-color-text, #111827);
      letter-spacing: -0.01em;
    }
    .lead { margin: 0; color: #6b7280; font-size: 12.5px; line-height: 1.45; }
    .close {
      flex-shrink: 0;
      width: 32px; height: 32px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      color: #6b7280;
      cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .close:hover { background: #f3f4f6; color: var(--sd-color-text, #111827); }
    .close .material-icons-outlined { font-size: 20px; }

    .body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .card-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 14px 16px;
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px;
    }
    .section-heading {
      margin: 0;
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--sd-color-primary, #4f46e5);
      letter-spacing: -0.005em;
    }
    .section-heading .material-icons-outlined {
      font-size: 18px;
      transform: translateY(2px);
    }
    .section-sub {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #9ca3af;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 14px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    /* Wide rows by default — short fields (Title / First / Last / Mobile)
       collapse to two-column on mid-sized drawers. */
    .field {
      grid-column: 1 / -1;
    }
    @media (min-width: 380px) {
      /* Inside the Guardian section: idType / idNumber / financial-email span
         the row, but Title / First / Last / Mobile / Telephone / Email pair up. */
      .card-section[aria-labelledby='guardian-heading'] .field:nth-child(3),
      .card-section[aria-labelledby='guardian-heading'] .field:nth-child(4),
      .card-section[aria-labelledby='guardian-heading'] .field:nth-child(5),
      .card-section[aria-labelledby='guardian-heading'] .field:nth-child(6) {
        grid-column: span 1;
      }
      /* Inside the child Profile Details section: First / Last / Gender pair up. */
      .card-section[aria-labelledby='child-profile-heading'] .field:nth-child(1),
      .card-section[aria-labelledby='child-profile-heading'] .field:nth-child(2),
      .card-section[aria-labelledby='child-profile-heading'] .field:nth-child(4) {
        grid-column: span 1;
      }
    }
    .label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .value {
      padding: 9px 11px;
      border-radius: 8px;
      border: 1.5px solid #d1d5db;
      background: #f9fafb;
      font-size: 13.5px;
      color: var(--sd-color-text, #111827);
      min-height: 38px;
      display: inline-flex;
      align-items: center;
    }
    .value.pill {
      background: #ecfdf5;
      border-color: #6ee7b7;
      color: #065f46;
      font-weight: 600;
    }
    .value.mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }
    .value.muted { color: #9ca3af; font-style: italic; }
    .value.with-icon {
      gap: 6px;
    }
    .value.with-icon .material-icons-outlined {
      font-size: 16px;
      color: #6b7280;
    }
    .age-pill {
      margin-left: auto;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--nk-sky-soft, #e0ebf6);
      color: var(--nk-sky-deep, #1f4e79);
      font-size: 11px;
      font-weight: 700;
    }
    .hint {
      font-size: 11.5px;
      color: #6b7280;
      line-height: 1.4;
    }

    /* ─── Additional Details checklist ─── */
    .check-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .check-row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      background: #f9fafb;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
    }
    .check {
      flex-shrink: 0;
      width: 28px; height: 28px;
      border-radius: 8px;
      display: inline-flex; align-items: center; justify-content: center;
      background: #fff;
      border: 1.5px solid #d1d5db;
    }
    .check .material-icons-outlined { font-size: 18px; }
    .check[data-state='yes'] {
      background: #ecfdf5;
      border-color: #6ee7b7;
      color: #065f46;
    }
    .check[data-state='no'] {
      background: #f3f4f6;
      border-color: #d1d5db;
      color: #6b7280;
    }
    .check[data-state='unknown'] {
      background: #fffbeb;
      border-color: #fde68a;
      color: #b45309;
    }
    .check-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
      color: var(--sd-color-text, #111827);
    }
    .check-text strong {
      font-weight: 600;
      color: var(--sd-color-text, #111827);
    }
    .check-text > span {
      font-size: 12.5px;
      color: #4b5563;
    }
    .check-text .warn {
      color: #b91c1c;
      font-weight: 700;
    }
    .conditions {
      margin: 4px 0 0;
      padding: 8px 10px;
      background: #fff7ed;
      border-left: 3px solid #f59e0b;
      border-radius: 0 8px 8px 0;
      color: #92400e;
      font-size: 12.5px;
      line-height: 1.45;
    }

    .meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 14px;
      background: #f9fafb;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
    }
    .meta-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #4b5563;
      font-size: 12.5px;
    }
    .meta-row strong { color: var(--sd-color-text, #111827); font-weight: 600; }
    .meta-row .material-icons-outlined { font-size: 17px; color: #6b7280; }

    .section-title {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .child-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .child-row {
      display: flex;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 10px;
      background: #fff;
    }
    .child-avatar {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: var(--nk-sky-soft, #e0ebf6);
      color: var(--nk-sky-deep, #1f4e79);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 12.5px; letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .child-avatar.with-img { overflow: hidden; background: #f3f4f6; }
    .child-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .child-id {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .child-id strong { font-size: 13.5px; color: var(--sd-color-text, #111827); }
    .child-id span { font-size: 12px; color: #6b7280; }
    .child-notes { color: #4b5563; font-style: italic; }
    .badge {
      margin-left: 6px;
      padding: 1px 7px;
      border-radius: 999px;
      background: rgba(251, 191, 36, 0.22);
      color: #b45309;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .foot {
      padding: 12px 18px;
      border-top: 1px solid var(--surface-border, #e5e7eb);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      background: #f9fafb;
    }
    .btn {
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid var(--surface-border, #e5e7eb);
      background: #fff;
      color: var(--sd-color-text, #111827);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn.ghost { background: transparent; border-color: transparent; color: #6b7280; }
    .btn.ghost:hover { background: #f3f4f6; color: var(--sd-color-text, #111827); }
  `,
})
export class ParentProfileDrawerComponent {
  @Input() open = false;
  @Input() parent: MockParent | null = null;
  /**
   * Optional id of the child being subscribed — when set, the matching row
   * in the children list is highlighted with a "This subscription" badge.
   */
  @Input() highlightedChildId: string | null = null;
  @Input() closeOnBackdrop = true;
  @Output() closed = new EventEmitter<void>();

  protected profile(): MockGuardianProfile | null {
    return this.parent?.profile ?? null;
  }

  protected displayName(): string {
    const p = this.profile();
    if (p?.title && p.firstName && p.lastName) {
      return `${p.title} ${p.firstName} ${p.lastName}`;
    }
    if (p?.firstName && p.lastName) return `${p.firstName} ${p.lastName}`;
    return this.parent?.displayName ?? '—';
  }

  protected firstNameFromDisplay(): string | null {
    return this.parent?.displayName.split(/\s+/)[0] ?? null;
  }

  protected lastNameFromDisplay(): string | null {
    const parts = this.parent?.displayName.split(/\s+/) ?? [];
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }

  protected mobileNumber(): string | null {
    return this.profile()?.mobile ?? this.parent?.phone ?? null;
  }

  protected financialEmail(): string | null {
    return this.profile()?.financialEmail ?? null;
  }

  protected highlightedChild(): MockParentChild | null {
    if (!this.highlightedChildId || !this.parent) return null;
    return this.parent.children.find((c) => c.id === this.highlightedChildId) ?? null;
  }

  protected childProfile(): MockChildProfile | null {
    return this.highlightedChild()?.profile ?? null;
  }

  protected firstNameFromChildDisplay(child: MockParentChild): string | null {
    return child.displayName.split(/\s+/)[0] ?? null;
  }

  protected lastNameFromChildDisplay(child: MockParentChild): string | null {
    const parts = child.displayName.split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }

  protected ageLabel(dob: string): string {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
    if (years <= 0) {
      const months = Math.max(
        0,
        (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()),
      );
      return `${months} mo`;
    }
    return `${years} ${years === 1 ? 'yr' : 'yrs'}`;
  }

  protected boolLabel(value: boolean | null | undefined): string {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return 'Not disclosed';
  }

  protected boolState(value: boolean | null | undefined): 'yes' | 'no' | 'unknown' {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return 'unknown';
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase() || '??';
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop) this.closed.emit();
  }

  // Track helper for child rows (kept as a method so it can be referenced
  // from templates if a future binding needs it).
  trackByChild(_: number, c: MockParentChild): string {
    return c.id;
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open) this.closed.emit();
  }
}
