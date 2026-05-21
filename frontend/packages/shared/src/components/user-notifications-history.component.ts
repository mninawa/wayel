import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '@wayel/shared/services/toast.service';
import {
  UserNotificationsApiService,
  type UserNotificationDto,
  type UserNotificationKind,
} from '@wayel/shared/services/user-notifications-api.service';
import { formatRelativeTime } from '@wayel/shared/utils/relative-time';
import { userNotificationIcon } from '@wayel/shared/utils/user-notification-icon';

/**
 * Identifier for a chip-driven filter group. We don't expose individual
 * kinds in the UI — staff would tick "Approved" + "Rejected" together
 * 90% of the time — so we model groups instead and let each one carry
 * its set of wire-format kinds.
 */
type KindGroupId = 'reports' | 'updates' | 'requests' | 'team';

/**
 * Full-history page for the in-app inbox. Mounted under `/notifications`
 * in both the REMOVED and customer-portal SPAs so the experience is
 * the same regardless of where the user signed in.
 *
 * The bell panel only shows the most recent ~40 rows; this view paginates
 * through the entire inbox via the API's opaque `nextCursor`. Pages append
 * onto the in-memory list so the user can scroll back without losing
 * earlier rows.
 *
 * Mark-as-read (single-row + bulk) is wired through the same endpoints as
 * the bell. Clicking a row optimistically flips the read flag *before* the
 * API call so the UI doesn't lag a round-trip behind the user's intent.
 */
@Component({
  selector: 'wayel-user-notifications-history',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nh-page">
      <header class="nh-head">
        <div>
          <h1 class="nh-title">Notifications</h1>
          <p class="nh-sub">
            @if (unreadCount() > 0) {
              {{ unreadCount() }} unread
            } @else {
              You're all caught up.
            }
          </p>
        </div>
        <div class="nh-head-actions">
          <a routerLink="/" class="nh-link">← Back</a>
          @if (unreadCount() > 0) {
            <button
              type="button"
              class="nh-btn-primary"
              [disabled]="markingAll()"
              (click)="markAllRead()"
            >
              Mark all as read
            </button>
          }
        </div>
      </header>

      <div class="nh-filter">
        <button
          type="button"
          class="nh-chip"
          [class.active]="!unreadOnly()"
          (click)="setUnreadOnly(false)"
        >
          All
        </button>
        <button
          type="button"
          class="nh-chip"
          [class.active]="unreadOnly()"
          (click)="setUnreadOnly(true)"
        >
          Unread
          @if (unreadCount() > 0) {
            <span class="nh-chip-count">{{
              unreadCount() > 99 ? '99+' : unreadCount()
            }}</span>
          }
        </button>

        <span class="nh-filter-sep" aria-hidden="true"></span>

        @for (group of kindGroups; track group.id) {
          <button
            type="button"
            class="nh-chip"
            [class.active]="kindGroup() === group.id"
            (click)="setKindGroup(group.id)"
          >
            {{ group.label }}
          </button>
        }
      </div>

      @if (initialLoading()) {
        <p class="nh-empty">Loading…</p>
      } @else if (errorMessage()) {
        <p class="nh-error">{{ errorMessage() }}</p>
      } @else if (items().length === 0) {
        <p class="nh-empty">
          {{ unreadOnly() ? 'No unread notifications.' : 'Nothing here yet.' }}
        </p>
      } @else {
        <ul class="nh-list">
          @for (n of items(); track n.id) {
            <li>
              <button
                type="button"
                class="nh-row"
                [class.unread]="!n.readOnUtc"
                (click)="openNotification(n)"
              >
                <span class="nh-row-icon" aria-hidden="true">
                  <span class="material-icons-outlined">{{ iconFor(n) }}</span>
                </span>
                <span class="nh-row-main">
                  <span class="nh-row-title">
                    @if (!n.readOnUtc) {
                      <span class="nh-dot" aria-hidden="true"></span>
                    }
                    {{ n.title }}
                  </span>
                  <span class="nh-row-body">{{ n.body }}</span>
                </span>
                <span class="nh-row-time" [title]="absoluteTime(n.createdOnUtc)">
                  {{ relativeTime(n.createdOnUtc) }}
                </span>
              </button>
            </li>
          }
        </ul>

        @if (nextCursor()) {
          <div class="nh-loadmore">
            <button
              type="button"
              class="nh-btn-secondary"
              [disabled]="loadingMore()"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        } @else {
          <p class="nh-tail">— end of inbox —</p>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .nh-page {
        max-width: 760px;
        margin: 0 auto;
        padding: 24px 16px 48px;
      }
      .nh-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .nh-title {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        color: #111827;
        letter-spacing: -0.01em;
      }
      .nh-sub {
        margin: 4px 0 0;
        font-size: 13px;
        color: #6b7280;
      }
      .nh-head-actions {
        display: inline-flex;
        align-items: center;
        gap: 12px;
      }
      .nh-link {
        font-size: 13px;
        color: #6b7280;
        text-decoration: none;
      }
      .nh-link:hover {
        color: #111827;
        text-decoration: underline;
      }
      .nh-btn-primary {
        background: #111827;
        color: #fff;
        border: 0;
        padding: 8px 14px;
        border-radius: 8px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .nh-btn-primary:hover:not(:disabled) {
        background: #1f2937;
      }
      .nh-btn-primary:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      .nh-btn-secondary {
        background: #fff;
        color: #111827;
        border: 1px solid #e5e7eb;
        padding: 8px 14px;
        border-radius: 8px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .nh-btn-secondary:hover:not(:disabled) {
        border-color: #9ca3af;
      }
      .nh-btn-secondary:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      .nh-filter {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
        align-items: center;
      }
      .nh-filter-sep {
        display: inline-block;
        width: 1px;
        height: 18px;
        background: #e5e7eb;
        margin: 0 4px;
      }
      .nh-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 999px;
        background: #fff;
        color: #6b7280;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .nh-chip:hover {
        border-color: #9ca3af;
        color: #111827;
      }
      .nh-chip.active {
        background: rgba(37, 99, 235, 0.08);
        border-color: #2563eb;
        color: #1d4ed8;
      }
      .nh-chip-count {
        background: #dc2626;
        color: #fff;
        border-radius: 999px;
        padding: 0 6px;
        min-width: 16px;
        height: 16px;
        font-size: 10px;
        line-height: 16px;
        text-align: center;
      }
      .nh-empty {
        margin: 24px 0;
        padding: 24px;
        background: #fff;
        border: 1px dashed #e5e7eb;
        border-radius: 12px;
        text-align: center;
        color: #6b7280;
        font-size: 13px;
      }
      .nh-error {
        margin: 24px 0;
        padding: 12px 16px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #991b1b;
        font-size: 13px;
      }
      .nh-list {
        list-style: none;
        padding: 0;
        margin: 0;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        overflow: hidden;
      }
      .nh-list li + li {
        border-top: 1px solid #f3f4f6;
      }
      .nh-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        width: 100%;
        padding: 14px 18px;
        border: 0;
        background: transparent;
        text-align: left;
        cursor: pointer;
        font: inherit;
      }
      .nh-row-icon {
        flex: none;
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: rgba(37, 99, 235, 0.1);
        color: #1d4ed8;
      }
      .nh-row-icon .material-icons-outlined {
        font-size: 20px;
      }
      .nh-row.unread .nh-row-icon {
        background: rgba(220, 38, 38, 0.12);
        color: #b91c1c;
      }
      .nh-row:hover {
        background: #f9fafb;
      }
      .nh-row.unread {
        background: rgba(37, 99, 235, 0.04);
      }
      .nh-row.unread:hover {
        background: rgba(37, 99, 235, 0.08);
      }
      .nh-row-main {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
      }
      .nh-row-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: #111827;
      }
      .nh-row.unread .nh-row-title {
        font-weight: 700;
      }
      .nh-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #dc2626;
        flex: none;
      }
      .nh-row-body {
        font-size: 13px;
        color: #4b5563;
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .nh-row-time {
        flex: none;
        font-size: 12px;
        color: #6b7280;
        font-variant-numeric: tabular-nums;
        padding-top: 2px;
      }
      .nh-loadmore {
        display: flex;
        justify-content: center;
        margin-top: 16px;
      }
      .nh-tail {
        margin: 24px 0 0;
        text-align: center;
        font-size: 12px;
        color: #9ca3af;
      }
    `,
  ],
})
export class UserNotificationsHistoryComponent {
  private readonly api = inject(UserNotificationsApiService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly items = signal<UserNotificationDto[]>([]);
  protected readonly unreadCount = signal(0);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly initialLoading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly markingAll = signal(false);
  protected readonly unreadOnly = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /**
   * Selected chip group, keyed by id. `null` (default) means "all kinds".
   * The chips are deliberately universal across audiences (parent + staff
   * + super-admin) — irrelevant chips just produce empty result sets,
   * which is cheaper to ship than per-role conditional UI.
   */
  protected readonly kindGroup = signal<KindGroupId | null>(null);

  /**
   * Filter chip groupings displayed in the strip. `kinds` is the wire
   * payload sent on the request; `id` is the local UI key. Order here
   * is the order rendered.
   */
  protected readonly kindGroups: ReadonlyArray<{
    id: KindGroupId;
    label: string;
    kinds: readonly UserNotificationKind[];
  }> = [
    {
      id: 'reports',
      label: 'Daily reports',
      kinds: ['dailyReportPublished'],
    },
    {
      id: 'updates',
      label: 'Subscription updates',
      kinds: ['subscriptionRequestApproved', 'subscriptionRequestRejected'],
    },
    {
      id: 'requests',
      label: 'New requests',
      kinds: ['subscriptionRequestReceived'],
    },
    {
      // "Team updates" rather than "Invitations" — the kind today is
      // accept-only, but a future "invitation revoked" / "invitation
      // expired" surface fits naturally under the same chip without
      // forcing a re-grouping. Same trick the "Subscription updates"
      // chip uses to bundle approved + rejected.
      id: 'team',
      label: 'Team updates',
      kinds: ['invitationAccepted'],
    },
  ];

  // Page size on the history view is intentionally larger than the bell
  // (which fetches 40) so a single click renders most users' entire inbox
  // without paging. Capped at the API limit (100).
  private readonly pageSize = 50;

  constructor() {
    effect(() => {
      // Re-fetch from the top whenever the unread filter or kind group
      // flips. Cancelling any in-flight "load more" is implicit: the
      // resulting `loadFirst()` overwrites items() and resets nextCursor
      // before we finish.
      this.unreadOnly();
      this.kindGroup();
      this.loadFirst();
    });
  }

  protected setUnreadOnly(value: boolean): void {
    if (this.unreadOnly() === value) return;
    this.unreadOnly.set(value);
  }

  /**
   * Toggle the kind chip — clicking the active group again clears it
   * (returns to "all kinds"). This is friendlier than forcing the user
   * to also have an explicit "All kinds" chip.
   */
  protected setKindGroup(id: KindGroupId): void {
    this.kindGroup.update((current) => (current === id ? null : id));
  }

  /**
   * Wire kinds for the currently-selected chip group. Centralised so
   * `loadFirst` / `loadMore` stay aligned and a future "multi-select"
   * version can fold in here without changing the request sites.
   */
  private currentKinds(): readonly UserNotificationKind[] | undefined {
    const id = this.kindGroup();
    if (!id) return undefined;
    return this.kindGroups.find((g) => g.id === id)?.kinds;
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api
      .listMine({
        take: this.pageSize,
        unreadOnly: this.unreadOnly(),
        cursor,
        kinds: this.currentKinds(),
      })
      .subscribe({
        next: (res) => {
          this.items.update((rows) => [...rows, ...res.items]);
          this.unreadCount.set(res.unreadCount);
          this.nextCursor.set(res.nextCursor);
          this.loadingMore.set(false);
        },
        error: (err: unknown) => {
          this.errorMessage.set(this.toErrorMessage(err));
          this.loadingMore.set(false);
        },
      });
  }

  protected openNotification(n: UserNotificationDto): void {
    if (!n.readOnUtc) {
      // Optimistically flip the row before the round-trip so the UI feels
      // instant. The poll on the bell will reconcile if the server lost it.
      const nowIso = new Date().toISOString();
      this.items.update((rows) =>
        rows.map((r) => (r.id === n.id ? { ...r, readOnUtc: nowIso } : r)),
      );
      this.unreadCount.update((c) => Math.max(0, c - 1));
      this.api.markRead(n.id).subscribe({
        // Swallow errors silently — the next poll on the bell + a future
        // refresh will surface real failures. Most "errors" here are 404s
        // from a row that was already-read on the server (race with the
        // bell's own mark-read), which we want to ignore.
        error: () => undefined,
      });
    }

    if (n.actionPath) {
      void this.router.navigateByUrl(n.actionPath);
    }
  }

  protected markAllRead(): void {
    if (this.markingAll() || this.unreadCount() === 0) return;
    this.markingAll.set(true);
    this.api.markAllRead().subscribe({
      next: (res) => {
        this.markingAll.set(false);
        // Toast only when the API actually flipped at least one row —
        // a zero-update response means another tab beat us to it and a
        // success toast there would lie. Reload the page either way so
        // the user sees the state they expect.
        if (res?.updated && res.updated > 0) {
          const noun = res.updated === 1 ? 'notification' : 'notifications';
          this.toasts.success(`${res.updated} ${noun} marked as read.`);
        }
        this.loadFirst();
      },
      error: () => {
        this.markingAll.set(false);
        this.toasts.error('Could not mark notifications as read. Try again.');
      },
    });
  }

  protected relativeTime(value: string | null | undefined): string {
    return formatRelativeTime(value);
  }

  /** Per-kind glyph for the row's leading icon column. */
  protected iconFor(n: UserNotificationDto): string {
    return userNotificationIcon(n.kind);
  }

  protected absoluteTime(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  private loadFirst(): void {
    this.initialLoading.set(true);
    this.errorMessage.set(null);
    this.api
      .listMine({
        take: this.pageSize,
        unreadOnly: this.unreadOnly(),
        kinds: this.currentKinds(),
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.unreadCount.set(res.unreadCount);
          this.nextCursor.set(res.nextCursor);
          this.initialLoading.set(false);
        },
        error: (err: unknown) => {
          this.errorMessage.set(this.toErrorMessage(err));
          this.items.set([]);
          this.nextCursor.set(null);
          this.initialLoading.set(false);
        },
      });
  }

  private toErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err && 'message' in err) {
      const m = (err as { message?: unknown }).message;
      if (typeof m === 'string' && m.trim()) return m;
    }
    return 'Could not load notifications. Try again in a moment.';
  }
}
