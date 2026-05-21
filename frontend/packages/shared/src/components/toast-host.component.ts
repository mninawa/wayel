import { Component, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';

/**
 * Mount once at the app shell (e.g. inside the root `<app-root>` or any
 * always-on layout component). Reads from `ToastService` and renders a
 * stack of dismissible toasts in the bottom-right corner.
 */
@Component({
  selector: 'nk-toast-host',
  standalone: true,
  template: `
    <div
      class="toast-host"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      @for (t of toasts.items(); track t.id) {
        <div class="toast" [attr.data-variant]="t.variant" role="status">
          <span class="toast-icon material-icons-outlined" aria-hidden="true">
            {{ iconFor(t.variant) }}
          </span>
          <div class="toast-body">
            @if (t.title) {
              <p class="toast-title">{{ t.title }}</p>
            }
            <p class="toast-msg">{{ t.message }}</p>
          </div>
          @if (t.action) {
            <button
              type="button"
              class="toast-action"
              (click)="t.action!.run(); toasts.dismiss(t.id)"
            >
              {{ t.action.label }}
            </button>
          }
          <button
            type="button"
            class="toast-close"
            (click)="toasts.dismiss(t.id)"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-host {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      max-width: min(420px, calc(100vw - 2rem));
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      gap: 0.6rem;
      align-items: start;
      padding: 0.7rem 0.85rem 0.7rem 0.7rem;
      background: var(--nk-surface, #fff);
      color: var(--nk-text, #0f172a);
      border: 1px solid var(--nk-border, #e2e8f0);
      border-left: 4px solid var(--toast-accent, #64748b);
      border-radius: 12px;
      box-shadow:
        0 12px 28px rgba(15, 23, 42, 0.18),
        0 2px 6px rgba(15, 23, 42, 0.08);
      animation: toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
      font-size: 0.9rem;
      line-height: 1.35;
    }
    .toast[data-variant='success'] {
      --toast-accent: #10b981;
      --toast-icon-color: #047857;
    }
    .toast[data-variant='error'] {
      --toast-accent: #ef4444;
      --toast-icon-color: #b91c1c;
    }
    .toast[data-variant='warning'] {
      --toast-accent: #f59e0b;
      --toast-icon-color: #b45309;
    }
    .toast[data-variant='info'] {
      --toast-accent: #3b82f6;
      --toast-icon-color: #1d4ed8;
    }
    .toast-icon {
      color: var(--toast-icon-color, #475569);
      font-size: 22px;
      line-height: 1;
      margin-top: 1px;
    }
    .toast-body {
      min-width: 0;
    }
    .toast-title {
      margin: 0 0 0.15rem;
      font-weight: 700;
      font-size: 0.92rem;
    }
    .toast-msg {
      margin: 0;
      color: var(--nk-text, #1f2937);
      word-wrap: break-word;
    }
    .toast-action {
      align-self: center;
      appearance: none;
      border: 0;
      background: transparent;
      color: var(--toast-icon-color, #1d4ed8);
      font: inherit;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.25rem 0.55rem;
      border-radius: 6px;
      cursor: pointer;
    }
    .toast-action:hover {
      background: rgba(15, 23, 42, 0.05);
    }
    .toast-close {
      align-self: start;
      appearance: none;
      border: 0;
      background: transparent;
      color: var(--nk-muted, #64748b);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0.1rem 0.35rem;
      border-radius: 6px;
    }
    .toast-close:hover {
      background: rgba(15, 23, 42, 0.06);
      color: var(--nk-text, #0f172a);
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: none;
      }
    }
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);

  protected iconFor(variant: 'success' | 'error' | 'info' | 'warning'): string {
    switch (variant) {
      case 'success':
        return 'check_circle';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  }
}
