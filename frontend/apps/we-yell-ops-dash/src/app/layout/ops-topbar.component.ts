import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OpsReceivingContextService } from '../services/ops-receiving-context.service';
import { OpsSessionService } from '../services/ops-session.service';
import type { OpsParcelSearchHitDto } from '../services/receiving-api.service';
import { receivingRoutes } from '../types/receiving.types';

@Component({
  selector: 'ops-topbar',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topbar">
      <button
        type="button"
        class="menu-btn"
        aria-label="Open navigation menu"
        [attr.aria-expanded]="menuExpanded()"
        (click)="menuClick.emit()"
      >
        <span class="material-icons-outlined">menu</span>
      </button>

      <div class="topbar-greeting ops-hide-md-down">
        <span class="greeting-eyebrow">Operations</span>
        <strong class="greeting-name">{{ session.actorName() }}</strong>
      </div>

      <div class="search-area">
        <label class="ops-search-pill search">
          <span class="material-icons-outlined">search</span>
          <input
            type="search"
            [(ngModel)]="query"
            (keydown.enter)="runSearch()"
            (focus)="searchOpen.set(true)"
            placeholder="Search parcels, tracking, suites…"
            autocomplete="off"
          />
          <kbd class="ops-hide-md-down">↵</kbd>
        </label>

        @if (searchOpen() && (searchBusy() || searchError() || results().length > 0 || query.trim().length >= 2)) {
          <div class="search-panel ops-card" role="listbox">
            @if (searchError()) {
              <p class="search-msg err">{{ searchError() }}</p>
            } @else if (searchBusy()) {
              <p class="search-msg">Searching…</p>
            } @else if (query.trim().length < 2) {
              <p class="search-msg">Type at least 2 characters, then press Enter.</p>
            } @else if (results().length === 0) {
              <p class="search-msg">No parcels matched “{{ query.trim() }}”.</p>
            } @else {
              @for (hit of results(); track hit.parcelId) {
                <a
                  class="search-hit"
                  [routerLink]="routes.parcel(hit.parcelId)"
                  (click)="closeSearch()"
                  role="option"
                >
                  <strong>{{ hit.displayId }}</strong>
                  <span>{{ hit.trackingNumber || 'No tracking' }} · {{ hit.retailer }}</span>
                  <span class="hit-meta">{{ hit.customerDisplayName }} · Suite {{ hit.suiteNumber || '—' }}</span>
                  <span class="hit-time">{{ hit.receivedAtUtc | date:'medium' }}</span>
                </a>
              }
            }
          </div>
        }
      </div>

      <div class="topbar-actions">
        <button type="button" class="icon-btn" aria-label="Notifications">
          <span class="material-icons-outlined">notifications</span>
        </button>
        <button type="button" class="icon-btn ops-hide-md-down" aria-label="Help">
          <span class="material-icons-outlined">help_outline</span>
        </button>
        <button type="button" class="user-btn" (click)="session.disconnect()" aria-label="Sign out">
          <span class="avatar">{{ initials() }}</span>
          <span class="user-name">{{ session.actorName() }}</span>
          <span class="material-icons-outlined expand-icon ops-hide-md-down">expand_more</span>
        </button>
      </div>
    </header>
  `,
  styles: `
    .topbar {
      min-height: var(--ops-topbar-h);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      background: var(--ops-bg);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .topbar-greeting {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
      min-width: 0;
    }

    .greeting-eyebrow {
      font-size: 0.72rem;
      color: var(--ops-muted);
      font-weight: 500;
    }

    .greeting-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--ops-text);
      letter-spacing: -0.02em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-area {
      flex: 1;
      max-width: 420px;
      margin-left: auto;
      position: relative;
      min-width: 0;
    }

    .search {
      width: 100%;
    }

    .search kbd {
      font-size: 0.68rem;
      background: var(--ops-surface);
      border: 1px solid var(--ops-border);
      border-radius: 4px;
      padding: 0.1rem 0.35rem;
      color: var(--ops-muted);
    }

    .search-panel {
      position: absolute;
      top: calc(100% + 0.35rem);
      left: 0;
      right: 0;
      max-height: 360px;
      overflow-y: auto;
      z-index: 20;
      padding: 0.35rem;
    }

    .search-hit {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      padding: 0.65rem 0.75rem;
      border-radius: var(--ops-radius-sm);
      text-decoration: none;
      color: var(--ops-text);
      font-size: 0.82rem;
    }

    .search-hit:hover { background: var(--ops-surface-alt); }
    .search-hit strong { font-size: 0.88rem; }
    .hit-meta, .hit-time { color: var(--ops-muted); font-size: 0.75rem; }
    .search-msg { margin: 0.65rem 0.75rem; font-size: 0.82rem; color: var(--ops-muted); }
    .search-msg.err { color: var(--ops-danger); }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .icon-btn {
      position: relative;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: var(--ops-radius-pill);
      background: var(--ops-surface);
      color: var(--ops-muted);
      cursor: pointer;
      box-shadow: var(--ops-shadow);
      display: grid;
      place-items: center;
    }

    .user-btn {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.65rem;
      border: none;
      border-radius: var(--ops-radius-pill);
      background: var(--ops-surface);
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ops-text);
      box-shadow: var(--ops-shadow);
      cursor: pointer;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--ops-ink);
      color: var(--ops-lime);
      font-size: 0.72rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .user-name {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .expand-icon { font-size: 18px !important; color: var(--ops-muted); }

    .menu-btn {
      display: none;
    }

    @media (max-width: 1023px) {
      .menu-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border: none;
        border-radius: var(--ops-radius-pill);
        background: var(--ops-surface);
        color: var(--ops-text);
        cursor: pointer;
        box-shadow: var(--ops-shadow);
      }

      .topbar {
        gap: 0.5rem;
        padding: 0.65rem 1rem;
      }

      .search-area {
        flex: 1;
        max-width: none;
        margin-left: 0;
      }

      .user-name,
      .expand-icon {
        display: none;
      }

      .topbar-actions {
        gap: 0.35rem;
      }

      .user-btn {
        padding: 0.35rem;
      }
    }

    @media (max-width: 767px) {
      .search-area {
        display: none;
      }
    }
  `,
})
export class OpsTopbarComponent {
  private readonly receiving = inject(OpsReceivingContextService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly session = inject(OpsSessionService);
  readonly routes = receivingRoutes;

  readonly menuExpanded = input(false);
  readonly menuClick = output<void>();

  query = '';
  readonly searchOpen = signal(false);
  readonly searchBusy = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly results = signal<OpsParcelSearchHitDto[]>([]);

  readonly initials = computed(() => {
    const name = this.session.actorName() || 'Ops';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'OP';
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.searchOpen.set(false);
    }
  }

  runSearch(): void {
    const term = this.query.trim();
    this.searchOpen.set(true);
    if (term.length < 2) {
      this.results.set([]);
      this.searchError.set(null);
      return;
    }

    this.searchBusy.set(true);
    this.searchError.set(null);
    this.receiving.search(term).subscribe({
      next: (hits) => {
        this.results.set(hits);
        this.searchBusy.set(false);
      },
      error: (err) => {
        this.searchBusy.set(false);
        this.results.set([]);
        this.searchError.set(this.formatError(err));
      },
    });
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | null;
      if (body?.detail) return body.detail;
    }
    return 'Search failed.';
  }
}
