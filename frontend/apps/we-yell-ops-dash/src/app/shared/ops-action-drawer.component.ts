import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

export interface OpsDrawerAction {
  label: string;
  description?: string;
  route: string | string[];
  icon: string;
}

@Component({
  selector: 'ops-action-drawer',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="ops-btn ops-btn-outline drawer-trigger"
      [attr.aria-expanded]="open()"
      aria-controls="ops-action-drawer-panel"
      (click)="toggle()"
    >
      <span class="material-icons-outlined" aria-hidden="true">menu_open</span>
      {{ triggerLabel() }}
    </button>

    @if (open()) {
      <div class="drawer-backdrop" (click)="close()" aria-hidden="true"></div>
      <aside
        id="ops-action-drawer-panel"
        class="drawer-panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="panelTitle()"
      >
        <header class="drawer-head">
          <div>
            <h2 class="drawer-title">{{ panelTitle() }}</h2>
            @if (panelSubtitle()) {
              <p class="drawer-sub">{{ panelSubtitle() }}</p>
            }
          </div>
          <button type="button" class="drawer-close" aria-label="Close" (click)="close()">
            <span class="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        <nav class="drawer-nav" aria-label="Parcel workflow actions">
          @for (action of actions(); track action.label) {
            <a [routerLink]="action.route" class="drawer-item" (click)="close()">
              <span class="drawer-icon material-icons-outlined" aria-hidden="true">{{ action.icon }}</span>
              <span class="drawer-copy">
                <strong>{{ action.label }}</strong>
                @if (action.description) {
                  <span class="drawer-desc">{{ action.description }}</span>
                }
              </span>
              <span class="material-icons-outlined drawer-chevron" aria-hidden="true">chevron_right</span>
            </a>
          }
        </nav>
      </aside>
    }
  `,
  styles: `
    :host { display: inline-block; position: relative; }
    .drawer-trigger .material-icons-outlined { font-size: 18px; }
    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.35);
      z-index: 200;
      animation: fade-in 0.2s ease;
    }
    .drawer-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(360px, 92vw);
      background: var(--ops-surface);
      border-left: 1px solid var(--ops-border);
      box-shadow: -8px 0 32px rgba(15, 23, 42, 0.12);
      z-index: 201;
      display: flex;
      flex-direction: column;
      animation: slide-in 0.22s ease;
    }
    .drawer-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1.15rem 1.25rem;
      border-bottom: 1px solid var(--ops-border);
    }
    .drawer-title { margin: 0; font-size: 1rem; font-weight: 700; }
    .drawer-sub { margin: 0.25rem 0 0; font-size: 0.82rem; color: var(--ops-muted); }
    .drawer-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: var(--ops-radius-sm);
      background: var(--ops-bg);
      color: var(--ops-muted);
      flex-shrink: 0;
    }
    .drawer-close:hover { background: var(--ops-primary-soft); color: var(--ops-link); }
    .drawer-nav { padding: 0.65rem; display: flex; flex-direction: column; gap: 0.35rem; overflow-y: auto; }
    .drawer-item {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0.85rem 0.9rem;
      border-radius: var(--ops-radius-sm);
      text-decoration: none;
      color: var(--ops-text);
      border: 1px solid transparent;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .drawer-item:hover {
      background: var(--ops-primary-soft);
      border-color: rgba(132, 94, 194, 0.25);
    }
    .drawer-icon {
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: var(--ops-primary-soft);
      color: var(--ops-link);
      flex-shrink: 0;
    }
    .drawer-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
    .drawer-copy strong { font-size: 0.9rem; }
    .drawer-desc { font-size: 0.78rem; color: var(--ops-muted); line-height: 1.35; }
    .drawer-chevron { color: var(--ops-muted); font-size: 20px; flex-shrink: 0; }
    @keyframes slide-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `,
})
export class OpsActionDrawerComponent {
  readonly triggerLabel = input('Workflow');
  readonly panelTitle = input('Parcel workflow');
  readonly panelSubtitle = input<string | null>(null);
  readonly actions = input.required<OpsDrawerAction[]>();

  readonly closed = output<void>();

  readonly open = signal(false);

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (!this.open()) this.closed.emit();
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.closed.emit();
  }
}
