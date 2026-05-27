import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpsOverlayService } from './ops-overlay.service';

@Component({
  selector: 'ops-overlay-host',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (overlay.prompt(); as modal) {
      <div class="backdrop" (click)="overlay.cancelPrompt()" aria-hidden="true"></div>
      <div
        class="modal"
        [class.note]="modal.variant === 'note'"
        [class.dialog]="modal.variant === 'dialog'"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'ops-prompt-title'"
      >
        @if (modal.variant === 'note') {
          <span class="note-pin" aria-hidden="true"></span>
        }
        <h2 id="ops-prompt-title" class="modal-title">{{ modal.title }}</h2>
        @if (modal.message) {
          <p class="modal-message">{{ modal.message }}</p>
        }
        @if (modal.hint) {
          <p class="modal-hint">{{ modal.hint }}</p>
        }
        @for (field of modal.fields; track field.id) {
          <label class="field">
            <span>{{ field.label }}</span>
            @if (field.multiline) {
              <textarea
                rows="4"
                [placeholder]="field.placeholder ?? ''"
                [ngModel]="modal.values[field.id]"
                (ngModelChange)="overlay.updatePromptValue(field.id, $event)"
              ></textarea>
            } @else {
              <input
                type="text"
                [placeholder]="field.placeholder ?? ''"
                [ngModel]="modal.values[field.id]"
                (ngModelChange)="overlay.updatePromptValue(field.id, $event)"
              />
            }
          </label>
        }
        @if (modal.fieldError) {
          <p class="field-error" role="alert">{{ modal.fieldError }}</p>
        }
        <div class="modal-actions">
          <button type="button" class="ops-btn ops-btn-ghost" (click)="overlay.cancelPrompt()">
            {{ modal.cancelLabel }}
          </button>
          <button
            type="button"
            class="ops-btn"
            [class.ops-btn-primary]="modal.variant === 'dialog'"
            [class.ops-btn-danger]="modal.variant === 'note'"
            (click)="overlay.confirmPrompt()"
          >
            {{ modal.confirmLabel }}
          </button>
        </div>
      </div>
    }

    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      @for (toast of overlay.toasts(); track toast.id) {
        <div class="toast" [class]="toast.tone" role="status">
          <span class="material-icons-outlined toast-icon" aria-hidden="true">
            {{ toastIcon(toast.tone) }}
          </span>
          <span class="toast-text">{{ toast.message }}</span>
          <button type="button" class="toast-close" (click)="overlay.dismissToast(toast.id)" aria-label="Dismiss">
            <span class="material-icons-outlined">close</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 1200;
    }
    .modal {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 1201;
      width: min(420px, calc(100vw - 2rem));
      padding: 1.25rem 1.35rem 1.1rem;
      border-radius: var(--ops-radius);
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
    }
    .modal.note {
      background: linear-gradient(165deg, #fffef0 0%, #fef9c3 55%, #fde68a 100%);
      border: 1px solid #facc15;
      transform: translate(-50%, -50%) rotate(-1.2deg);
    }
    .modal.dialog {
      background: var(--ops-surface);
      border: 1px solid var(--ops-border);
    }
    .note-pin {
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #fca5a5, #ef4444 70%);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
    }
    .modal-title {
      margin: 0 0 0.45rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--ops-text);
    }
    .modal-message { margin: 0 0 0.65rem; font-size: 0.88rem; color: var(--ops-text); line-height: 1.45; }
    .modal-hint {
      margin: 0 0 0.85rem;
      font-size: 0.78rem;
      color: #92400e;
      background: rgba(255, 255, 255, 0.45);
      border-radius: var(--ops-radius-sm);
      padding: 0.45rem 0.6rem;
    }
    .modal.dialog .modal-hint {
      color: var(--ops-muted);
      background: var(--ops-bg);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin-bottom: 0.85rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--ops-muted);
    }
    .field input, .field textarea {
      padding: 0.6rem 0.75rem;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: var(--ops-radius-sm);
      font: inherit;
      font-weight: 400;
      color: var(--ops-text);
      background: rgba(255, 255, 255, 0.82);
      resize: vertical;
    }
    .modal.dialog .field input,
    .modal.dialog .field textarea {
      background: #fff;
      border-color: var(--ops-border);
    }
    .field-error {
      margin: -0.35rem 0 0.65rem;
      font-size: 0.82rem;
      color: #b91c1c;
      font-weight: 600;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .ops-btn-danger {
      background: #b91c1c;
      color: #fff;
      border: 1px solid #991b1b;
    }
    .ops-btn-danger:hover { background: #991b1b; }
    .toast-stack {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 1300;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      max-width: min(360px, calc(100vw - 2rem));
      pointer-events: none;
    }
    .toast {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.55rem;
      align-items: start;
      padding: 0.75rem 0.65rem 0.75rem 0.85rem;
      border-radius: var(--ops-radius-sm);
      border: 1px solid var(--ops-border);
      background: var(--ops-surface);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      pointer-events: auto;
      animation: toast-in 0.2s ease-out;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .toast.success { border-color: #86efac; background: #f0fdf4; }
    .toast.error { border-color: #fecaca; background: #fef2f2; }
    .toast.info { border-color: #c4b5fd; background: #f5f3ff; }
    .toast-icon { font-size: 20px; margin-top: 1px; }
    .toast.success .toast-icon { color: #15803d; }
    .toast.error .toast-icon { color: #b91c1c; }
    .toast.info .toast-icon { color: var(--ops-link); }
    .toast-text { font-size: 0.84rem; line-height: 1.4; color: var(--ops-text); }
    .toast-close {
      border: none;
      background: transparent;
      color: var(--ops-muted);
      padding: 0;
      line-height: 1;
      cursor: pointer;
    }
    .toast-close .material-icons-outlined { font-size: 18px; }
  `,
})
export class OpsOverlayHostComponent {
  readonly overlay = inject(OpsOverlayService);

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.overlay.prompt()) {
      this.overlay.cancelPrompt();
    }
  }

  toastIcon(tone: string): string {
    if (tone === 'success') return 'check_circle';
    if (tone === 'error') return 'error';
    return 'info';
  }
}
