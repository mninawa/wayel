import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import type { MockPlatformAuditEntry } from '../core/mock/mock-data';

/**
 * Collapsible "History (n)" disclosure used on rows that carry an audit
 * trail (staff invitations, partnerships, …).
 *
 * Pass it the list of entries plus an optional formatter for the action
 * key — the component owns the open/closed state, accessibility wiring
 * (`aria-expanded` + `aria-controls`), and the styling for the timeline
 * list itself.
 *
 * Usage:
 * ```html
 * <nk-history-disclosure
 *   [entries]="historyForRow(r)"
 *   [actionLabel]="prettyActionLabel"
 *   prefix="hist-invite-"
 *   [subjectId]="r.id"
 * />
 * ```
 */
@Component({
  selector: 'nk-history-disclosure',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @if (entries().length > 0) {
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="domId()"
        (click)="toggle()"
      >
        <span class="caret" [class.open]="open()" aria-hidden="true">▸</span>
        {{ label() }} ({{ entries().length }})
      </button>
      @if (open()) {
        <ol class="list" [id]="domId()" [attr.aria-label]="label() + ' entries'">
          @for (e of entries(); track e.id) {
            <li class="item" [attr.data-action]="e.action">
              <span class="tag">{{ format(e.action) }}</span>
              @if (e.detail) {
                <span class="detail">{{ e.detail }}</span>
              }
              <span class="meta">
                {{ e.occurredAt | date: 'medium' }} · {{ e.actorEmail }}
              </span>
            </li>
          }
        </ol>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .toggle {
      background: none; border: none; padding: 0.25rem 0;
      color: var(--sd-color-accent, #4338ca); font-weight: 500;
      cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;
      font-size: 0.82rem;
    }
    .toggle:hover { text-decoration: underline; }
    .caret { transition: transform 120ms; display: inline-block; }
    .caret.open { transform: rotate(90deg); }

    .list {
      list-style: none; padding: 0.5rem 0 0; margin: 0;
      display: flex; flex-direction: column; gap: 0.45rem;
      border-top: 1px dashed var(--surface-border, #e5e7eb);
      margin-top: 0.45rem;
    }
    .item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.4rem 0.6rem;
      padding: 0.35rem 0;
      font-size: 0.82rem;
    }
    .tag {
      grid-row: 1; grid-column: 1;
      font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.1rem 0.5rem; border-radius: 999px;
      background: rgba(99, 102, 241, 0.12); color: #4338ca;
      align-self: start;
      white-space: nowrap;
    }
    .item[data-action$='.created']    .tag,
    .item[data-action$='.requested']  .tag { background: rgba(34, 197, 94, 0.14); color: #15803d; }
    .item[data-action$='.accepted']   .tag { background: rgba(34, 197, 94, 0.18); color: #166534; }
    .item[data-action$='.declined']   .tag { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }
    .item[data-action$='.removed']    .tag,
    .item[data-action$='.revoked']    .tag { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }
    .item[data-action$='.paused']     .tag { background: rgba(148, 163, 184, 0.18); color: #475569; }
    .item[data-action$='.resumed']    .tag { background: rgba(59, 130, 246, 0.14); color: #1d4ed8; }
    .item[data-action$='.updated']    .tag,
    .item[data-action$='.edited']     .tag { background: rgba(217, 119, 6, 0.14); color: #b45309; }
    .item[data-action$='.resent']     .tag { background: rgba(234, 88, 12, 0.14); color: #c2410c; }
    .item[data-action$='.copied']     .tag { background: rgba(99, 102, 241, 0.14); color: #4338ca; }

    .detail {
      grid-row: 1; grid-column: 2;
      color: var(--sd-color-text, #111827); line-height: 1.4;
    }
    .meta {
      grid-row: 2; grid-column: 1 / -1;
      color: var(--nk-muted, #6b7280); font-size: 0.74rem;
    }
  `,
})
export class HistoryDisclosureComponent {
  readonly entries = input<readonly MockPlatformAuditEntry[]>([]);
  readonly label = input<string>('History');
  readonly subjectId = input<string>('');
  readonly prefix = input<string>('history-');
  /**
   * Optional formatter for the action key. If omitted, the last segment of
   * the dotted action key is shown title-cased ("staff_invitation.resent" →
   * "Resent").
   */
  readonly actionLabel = input<((action: string) => string) | null>(null);

  protected readonly open = signal(false);

  protected readonly domId = computed(() => `${this.prefix()}${this.subjectId()}`);

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected format(action: string): string {
    const fn = this.actionLabel();
    if (fn) return fn(action);
    const tail = action.split('.').pop() ?? action;
    return tail.charAt(0).toUpperCase() + tail.slice(1).replace(/_/g, ' ');
  }
}
