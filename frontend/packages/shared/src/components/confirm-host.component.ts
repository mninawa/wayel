import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmDialogService } from '../services/confirm-dialog.service';

/**
 * Modal renderer for {@link ConfirmDialogService}. Mount once at the shell.
 *
 * Behaviour:
 * - Confirm button is disabled when an `input` is configured but invalid.
 * - `Esc` cancels, `Enter` confirms (when there's no `<textarea>` focused).
 * - Backdrop click cancels.
 */
@Component({
  selector: 'nk-confirm-host',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (svc.active(); as a) {
      <div
        class="cd-backdrop"
        (click)="cancel()"
        role="presentation"
      >
        <div
          class="cd-dialog"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="'cd-title'"
          [attr.aria-describedby]="a.message ? 'cd-message' : null"
          (click)="$event.stopPropagation()"
          (keydown)="onKeyDown($event)"
        >
          <header class="cd-head">
            <h2 id="cd-title" class="cd-title">{{ a.title }}</h2>
          </header>
          @if (a.message) {
            <p id="cd-message" class="cd-msg">{{ a.message }}</p>
          }
          @if (a.input) {
            <label class="cd-field">
              <span class="cd-label">{{ a.input.label }}</span>
              @if (a.input.kind === 'textarea') {
                <textarea
                  #inp
                  class="cd-input cd-textarea"
                  rows="3"
                  [placeholder]="a.input.placeholder ?? ''"
                  [ngModel]="value()"
                  (ngModelChange)="value.set($event); validate()"
                  (keydown.enter)="$event.stopPropagation()"
                  autofocus
                ></textarea>
              } @else {
                <input
                  #inp
                  type="text"
                  class="cd-input"
                  [placeholder]="a.input.placeholder ?? ''"
                  [ngModel]="value()"
                  (ngModelChange)="value.set($event); validate()"
                  autofocus
                />
              }
              @if (errorMsg(); as err) {
                <span class="cd-err">{{ err }}</span>
              }
            </label>
          }
          <footer class="cd-actions">
            <button
              type="button"
              class="cd-btn cd-btn-secondary"
              (click)="cancel()"
            >
              {{ a.cancelLabel ?? 'Cancel' }}
            </button>
            <button
              type="button"
              class="cd-btn cd-btn-primary"
              [attr.data-kind]="a.kind ?? 'default'"
              [disabled]="!canConfirm()"
              (click)="confirm()"
            >
              {{ a.confirmLabel ?? 'Confirm' }}
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    .cd-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(15, 23, 42, 0.45);
      animation: cd-fade 160ms ease-out;
    }
    .cd-dialog {
      background: var(--nk-surface, #fff);
      color: var(--nk-text, #0f172a);
      border-radius: 14px;
      box-shadow:
        0 24px 60px rgba(15, 23, 42, 0.32),
        0 4px 12px rgba(15, 23, 42, 0.16);
      width: 100%;
      max-width: 460px;
      padding: 1.1rem 1.2rem 0.9rem;
      animation: cd-pop 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .cd-head {
      margin-bottom: 0.6rem;
    }
    .cd-title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
    }
    .cd-msg {
      margin: 0 0 0.85rem;
      color: var(--nk-muted, #475569);
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .cd-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin-bottom: 0.85rem;
    }
    .cd-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--nk-muted, #475569);
    }
    .cd-input {
      width: 100%;
      padding: 0.55rem 0.7rem;
      border-radius: 8px;
      border: 1px solid var(--nk-border, #e2e8f0);
      font: inherit;
      font-size: 0.95rem;
      background: var(--nk-surface, #fff);
      color: var(--nk-text, #0f172a);
    }
    .cd-textarea {
      resize: vertical;
      min-height: 80px;
    }
    .cd-input:focus {
      outline: 2px solid rgba(59, 130, 246, 0.4);
      outline-offset: 0;
      border-color: #3b82f6;
    }
    .cd-err {
      color: #b91c1c;
      font-size: 0.78rem;
    }
    .cd-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.4rem;
    }
    .cd-btn {
      appearance: none;
      border: 1px solid var(--nk-border, #e2e8f0);
      background: var(--nk-surface, #fff);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font: inherit;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      color: var(--nk-text, #0f172a);
    }
    .cd-btn:hover:not(:disabled) {
      background: #f8fafc;
    }
    .cd-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .cd-btn-secondary {
      color: var(--nk-text, #0f172a);
    }
    .cd-btn-primary[data-kind='default'] {
      background: var(--nk-primary, #3b82f6);
      color: #fff;
      border-color: transparent;
    }
    .cd-btn-primary[data-kind='danger'] {
      background: #dc2626;
      color: #fff;
      border-color: transparent;
    }
    .cd-btn-primary[data-kind='warning'] {
      background: #f59e0b;
      color: #1f2937;
      border-color: transparent;
    }
    .cd-btn-primary:hover:not(:disabled) {
      filter: brightness(1.05);
    }
    @keyframes cd-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes cd-pop {
      from { opacity: 0; transform: translateY(8px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .cd-backdrop, .cd-dialog { animation: none; }
    }
  `,
})
export class ConfirmHostComponent {
  protected readonly svc = inject(ConfirmDialogService);

  protected readonly value = signal('');
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly canConfirm = computed(() => {
    const a = this.svc.active();
    if (!a?.input) return true;
    if (this.errorMsg()) return false;
    const trimmed = this.value().trim();
    if (a.input.required !== false && !trimmed) return false;
    return true;
  });

  constructor() {
    effect(() => {
      const a = this.svc.active();
      if (a) {
        this.value.set(a.input?.initial ?? '');
        this.errorMsg.set(null);
      }
    });
  }

  protected validate(): void {
    const a = this.svc.active();
    if (!a?.input?.validate) {
      this.errorMsg.set(null);
      return;
    }
    this.errorMsg.set(a.input.validate(this.value()));
  }

  protected confirm(): void {
    const a = this.svc.active();
    if (!a) return;
    if (!this.canConfirm()) return;
    if (a.input) {
      this.svc.resolve({ confirmed: true, value: this.value().trim() });
    } else {
      this.svc.resolve({ confirmed: true });
    }
  }

  protected cancel(): void {
    this.svc.resolve({ confirmed: false });
  }

  protected onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.cancel();
      return;
    }
    if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName !== 'TEXTAREA') {
      ev.preventDefault();
      this.confirm();
    }
  }
}
