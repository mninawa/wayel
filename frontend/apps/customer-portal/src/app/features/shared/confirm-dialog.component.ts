import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnChanges,
  SimpleChanges,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Visual tone for the confirm button. Use `danger` for destructive actions
 * (cancellations, deletes); `primary` for everything else.
 */
export type ConfirmDialogTone = 'primary' | 'danger';

/**
 * Reusable, accessibility-conscious confirmation modal.
 *
 * Replaces native `window.confirm(...)` calls so the UI stays branded and we
 * can phrase questions richly (title + supporting copy) instead of a single
 * cramped string. Mount it once inside a feature template, drive `open` with
 * a signal/state, and react to `confirmed` / `cancelled` outputs.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="cd-backdrop"
        role="presentation"
        (click)="onCancel()"
      ></div>
      <div
        class="cd-dialog"
        role="alertdialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="messageId"
      >
        <h2 [id]="titleId" class="cd-title">{{ title() }}</h2>
        @if (message()) {
          <p [id]="messageId" class="cd-message">{{ message() }}</p>
        }
        <footer class="cd-actions">
          <button
            type="button"
            class="bb-btn bb-btn-outline"
            (click)="onCancel()"
            [disabled]="busy()"
          >
            {{ cancelLabel() }}
          </button>
          <button
            #confirmBtn
            type="button"
            class="bb-btn"
            [class.bb-btn-danger]="tone() === 'danger'"
            [class.bb-btn-primary]="tone() !== 'danger'"
            (click)="onConfirm()"
            [disabled]="busy()"
          >
            @if (busy()) {
              <span class="material-icons-outlined cd-spin" aria-hidden="true">sync</span>
            }
            {{ confirmLabel() }}
          </button>
        </footer>
      </div>
    }
  `,
  styles: `
    .cd-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 200;
      animation: cd-fade 140ms ease-out;
    }
    .cd-dialog {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 201;
      width: min(440px, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      overflow-y: auto;
      background: var(--bb-surface);
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      padding: 1.35rem 1.5rem 1.25rem;
      animation: cd-pop 160ms cubic-bezier(0.2, 0.9, 0.4, 1.2);
    }
    .cd-title {
      margin: 0 0 0.5rem;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .cd-message {
      margin: 0 0 1.25rem;
      font-size: 0.9rem;
      color: var(--bb-muted);
      line-height: 1.5;
      white-space: pre-line;
    }
    .cd-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .cd-actions .bb-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .bb-btn-danger {
      background: var(--bb-danger, #dc2626);
      border-color: var(--bb-danger, #dc2626);
      color: white;
    }
    .bb-btn-danger:hover:not(:disabled) {
      background: #b91c1c;
      border-color: #b91c1c;
    }
    .cd-spin {
      font-size: 1rem;
      animation: cd-spin 1s linear infinite;
    }
    @keyframes cd-spin { to { transform: rotate(360deg); } }
    @keyframes cd-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes cd-pop {
      from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  `,
})
export class ConfirmDialogComponent implements OnChanges {
  readonly open = input.required<boolean>();
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly confirmLabel = input<string>('Confirm');
  readonly cancelLabel = input<string>('Cancel');
  readonly tone = input<ConfirmDialogTone>('primary');
  /** Disables both buttons and shows a spinner on the confirm action. */
  readonly busy = input<boolean>(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly confirmBtn = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  /** Stable ids so screen readers correctly bind title/description. */
  private static idSeed = 0;
  private readonly _suffix = ++ConfirmDialogComponent.idSeed;
  readonly titleId = `cd-title-${this._suffix}`;
  readonly messageId = `cd-message-${this._suffix}`;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      // Pull focus to the confirm button on next tick so keyboard users can
      // hit Enter immediately. We do NOT autofocus the cancel button — the
      // primary action is the intended path; Esc still cancels.
      queueMicrotask(() => this.confirmBtn()?.nativeElement.focus());
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open() && !this.busy()) this.onCancel();
  }

  onConfirm(): void {
    if (this.busy()) return;
    this.confirmed.emit();
  }

  onCancel(): void {
    if (this.busy()) return;
    this.cancelled.emit();
  }
}
