import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
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
      <div class="search-area">
        <label class="search-wrap">
          <span class="material-icons-outlined">search</span>
          <input
            type="search"
            [(ngModel)]="query"
            (keydown.enter)="runSearch()"
            (focus)="searchOpen.set(true)"
            placeholder="Search parcels, tracking numbers, retailers, suite matches…"
            autocomplete="off"
          />
          <kbd>↵</kbd>
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
        <button type="button" class="ghost-btn">
          <span class="dot online"></span>
          Ops Portal
          <span class="material-icons-outlined chev">expand_more</span>
        </button>
        <button type="button" class="icon-btn" aria-label="Notifications">
          <span class="material-icons-outlined">notifications</span>
        </button>
        <button type="button" class="icon-btn" aria-label="Help">
          <span class="material-icons-outlined">help_outline</span>
        </button>
        <div class="profile">
          <span class="avatar">AC</span>
          <div>
            <strong>{{ session.actorName() }}</strong>
            <span>{{ session.role() || 'operator' }}</span>
          </div>
        </div>
        <button type="button" class="sign-out" (click)="session.disconnect()">Sign out</button>
      </div>
    </header>
  `,
  styles: `
    .topbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.25rem;
      background: var(--ops-surface);
      border-bottom: 1px solid var(--ops-border);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .search-area { flex: 1; max-width: 640px; position: relative; }
    .search-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--ops-bg);
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      padding: 0.45rem 0.75rem;
      color: var(--ops-muted);
    }
    .search-wrap input {
      flex: 1;
      border: none;
      background: transparent;
      font: inherit;
      color: var(--ops-text);
      outline: none;
      min-width: 0;
    }
    .search-wrap kbd {
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
    .search-hit:hover { background: var(--ops-bg); }
    .search-hit strong { font-size: 0.88rem; }
    .hit-meta, .hit-time { color: var(--ops-muted); font-size: 0.75rem; }
    .search-msg { margin: 0.65rem 0.75rem; font-size: 0.82rem; color: var(--ops-muted); }
    .search-msg.err { color: var(--ops-danger); }
    .topbar-actions { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
    .ghost-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.4rem 0.65rem;
      background: var(--ops-surface);
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--ops-text);
    }
    .ghost-btn .chev { font-size: 18px; color: var(--ops-muted); }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.online { background: #22c55e; }
    .icon-btn {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      background: var(--ops-surface);
      color: var(--ops-muted);
    }
    .profile { display: flex; align-items: center; gap: 0.5rem; padding: 0 0.35rem; }
    .avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--ops-primary-soft);
      color: var(--ops-primary);
      display: grid;
      place-items: center;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .profile div { display: flex; flex-direction: column; line-height: 1.2; }
    .profile strong { font-size: 0.8rem; }
    .profile span { font-size: 0.68rem; color: var(--ops-muted); }
    .sign-out {
      background: none;
      border: none;
      color: var(--ops-primary);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.35rem;
    }
    @media (max-width: 900px) {
      .profile div, .sign-out, .ghost-btn span:not(.material-icons-outlined):not(.dot), kbd { display: none; }
    }
  `,
})
export class OpsTopbarComponent {
  private readonly receiving = inject(OpsReceivingContextService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly session = inject(OpsSessionService);
  readonly routes = receivingRoutes;

  query = '';
  readonly searchOpen = signal(false);
  readonly searchBusy = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly results = signal<OpsParcelSearchHitDto[]>([]);

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
