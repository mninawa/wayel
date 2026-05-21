import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '@wayel/shared/services/toast.service';
import {
  NotificationPreferencesApiService,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferenceEntryDto,
} from '@wayel/shared/services/notification-preferences-api.service';

interface Row {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

interface CategoryGroup {
  category: NotificationCategory;
  label: string;
  description: string;
}

interface ChannelHeader {
  channel: NotificationChannel;
  label: string;
}

/**
 * Settings page for per-user notification preferences.
 *
 * The shared component is mounted in both shells (parents see it under
 * `/account`, staff under `/me/preferences`). The shape is identical —
 * a small matrix of (category × channel) toggles — because the
 * underlying domain model doesn't care who owns the row.
 *
 * The page is intentionally optimistic-ish: edits are kept local until
 * the user clicks "Save changes". A status pill renders the last
 * server-acknowledged state so a half-finished toggle doesn't lie about
 * whether email is on or off.
 */
@Component({
  selector: 'wayel-notification-preferences-settings',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="np-page">
      <header class="np-head">
        <div>
          <h1 class="np-title">Notification preferences</h1>
          <p class="np-sub">
            Decide which channels each kind of update should reach you on.
            In-app notifications stay on regardless — these settings only
            affect email and WhatsApp delivery.
          </p>
        </div>
        <a [routerLink]="backLink" class="np-link">← Back</a>
      </header>

      @if (loading()) {
        <p class="np-empty">Loading…</p>
      } @else if (errorMessage()) {
        <p class="np-error">{{ errorMessage() }}</p>
      } @else {
        <div class="np-card">
          <table class="np-table">
            <thead>
              <tr>
                <th class="np-cat">Category</th>
                @for (h of channelHeaders; track h.channel) {
                  <th class="np-ch">{{ h.label }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (group of categoryGroups; track group.category) {
                <tr>
                  <td class="np-cat-cell">
                    <div class="np-cat-label">{{ group.label }}</div>
                    <div class="np-cat-desc">{{ group.description }}</div>
                  </td>
                  @for (h of channelHeaders; track h.channel) {
                    <td class="np-toggle-cell">
                      <label class="np-switch">
                        <input
                          type="checkbox"
                          [checked]="enabledFor(group.category, h.channel)"
                          (change)="
                            toggle(group.category, h.channel, $any($event.target).checked)
                          "
                        />
                        <span class="np-track" aria-hidden="true">
                          <span class="np-thumb"></span>
                        </span>
                        <span class="np-sr">
                          {{ group.label }} via {{ h.label }}
                        </span>
                      </label>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>

          <footer class="np-foot">
            <span class="np-status">
              @if (saving()) {
                Saving…
              } @else if (dirty()) {
                Unsaved changes
              } @else if (lastUpdated()) {
                Saved {{ lastUpdatedLabel() }}
              }
            </span>
            <button
              type="button"
              class="np-btn-primary"
              [disabled]="!dirty() || saving()"
              (click)="save()"
            >
              {{ saving() ? 'Saving…' : 'Save changes' }}
            </button>
          </footer>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .np-page {
        max-width: 760px;
        margin: 0 auto;
        padding: 24px 16px 48px;
      }
      .np-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }
      .np-title {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        color: #111827;
        letter-spacing: -0.01em;
      }
      .np-sub {
        margin: 6px 0 0;
        font-size: 13px;
        color: #6b7280;
        max-width: 520px;
      }
      .np-link {
        font-size: 13px;
        color: #6b7280;
        text-decoration: none;
        white-space: nowrap;
      }
      .np-link:hover {
        color: #111827;
        text-decoration: underline;
      }
      .np-card {
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        background: #fff;
        overflow: hidden;
      }
      .np-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .np-table thead th {
        text-align: left;
        padding: 14px 16px;
        background: #f9fafb;
        color: #6b7280;
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 1px solid #e5e7eb;
      }
      .np-table thead th.np-ch {
        width: 120px;
      }
      .np-cat-cell {
        padding: 16px;
        border-bottom: 1px solid #f3f4f6;
        vertical-align: top;
      }
      .np-cat-label {
        font-weight: 600;
        color: #111827;
      }
      .np-cat-desc {
        color: #6b7280;
        font-size: 13px;
        margin-top: 2px;
      }
      .np-toggle-cell {
        padding: 16px;
        border-bottom: 1px solid #f3f4f6;
        text-align: left;
      }
      tbody tr:last-child td {
        border-bottom: 0;
      }
      .np-switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 22px;
        cursor: pointer;
      }
      .np-switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .np-track {
        position: absolute;
        inset: 0;
        background: #d1d5db;
        border-radius: 999px;
        transition: background 120ms ease;
      }
      .np-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        transition: transform 120ms ease;
      }
      .np-switch input:checked + .np-track {
        background: #111827;
      }
      .np-switch input:checked + .np-track .np-thumb {
        transform: translateX(18px);
      }
      .np-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
      }
      .np-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        border-top: 1px solid #e5e7eb;
        background: #fbfbfb;
      }
      .np-status {
        font-size: 13px;
        color: #6b7280;
      }
      .np-btn-primary {
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
      .np-btn-primary:hover:not(:disabled) {
        background: #1f2937;
      }
      .np-btn-primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .np-empty,
      .np-error {
        padding: 40px 12px;
        text-align: center;
        color: #6b7280;
        font-size: 14px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
      }
      .np-error {
        color: #b91c1c;
      }
    `,
  ],
})
export class NotificationPreferencesSettingsComponent {
  /**
   * `routerLink` for the "Back" affordance. Defaults to `/notifications`
   * — both SPAs already mount the inbox there. Overridable per-shell.
   */
  backLink: string | unknown[] = '/notifications';

  protected readonly categoryGroups: CategoryGroup[] = [
    {
      category: 'EnrolmentUpdates',
      label: 'Enrolment updates',
      description:
        'Subscription decisions, invitations, and other staff/parent onboarding events.',
    },
    {
      category: 'DailyReports',
      label: 'Daily reports',
      description:
        'Notification when a new daily report is published for a child you parent.',
    },
  ];

  protected readonly channelHeaders: ChannelHeader[] = [
    { channel: 'Email', label: 'Email' },
    { channel: 'WhatsApp', label: 'WhatsApp' },
  ];

  private readonly api = inject(NotificationPreferencesApiService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly lastUpdated = signal<string | null>(null);

  /**
   * Server-acknowledged state. Resets on every successful PUT/GET.
   * `currentRows` is what the user is editing right now; `dirty()`
   * compares the two to drive the save button.
   */
  private readonly serverRows = signal<Row[]>([]);
  protected readonly currentRows = signal<Row[]>([]);

  constructor() {
    this.load();
  }

  protected dirty(): boolean {
    const a = this.serverRows();
    const b = this.currentRows();
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (a[i].enabled !== b[i].enabled) return true;
    }
    return false;
  }

  protected enabledFor(
    category: NotificationCategory,
    channel: NotificationChannel,
  ): boolean {
    const row = this.currentRows().find(
      (r) => r.category === category && r.channel === channel,
    );
    return row?.enabled ?? true;
  }

  protected toggle(
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean,
  ): void {
    this.currentRows.update((rows) =>
      rows.map((r) =>
        r.category === category && r.channel === channel
          ? { ...r, enabled }
          : r,
      ),
    );
  }

  protected save(): void {
    if (!this.dirty() || this.saving()) return;
    this.saving.set(true);

    const payload: NotificationPreferenceEntryDto[] = this.currentRows().map(
      (r) => ({ category: r.category, channel: r.channel, enabled: r.enabled }),
    );

    this.api.updateMine(payload).subscribe({
      next: (resp) => {
        const rows = this.toRows(resp.entries);
        this.serverRows.set(rows);
        this.currentRows.set(rows);
        this.lastUpdated.set(resp.updatedOnUtc);
        this.saving.set(false);
        this.toast.success('Notification preferences saved.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Could not save preferences. Please try again.');
      },
    });
  }

  protected lastUpdatedLabel(): string {
    const iso = this.lastUpdated();
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.api.getMine().subscribe({
      next: (resp) => {
        const rows = this.toRows(resp.entries);
        this.serverRows.set(rows);
        this.currentRows.set(rows);
        this.lastUpdated.set(resp.updatedOnUtc);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Could not load preferences. Please try again.');
      },
    });
  }

  /**
   * Project the server matrix onto the SPA's row model. The order
   * matters because `dirty()` does a positional compare and the API
   * already returns entries in a stable (category, channel) order
   * that matches `categoryGroups × channelHeaders`. We re-sort
   * defensively in case a future API change loosens that contract.
   */
  private toRows(entries: NotificationPreferenceEntryDto[]): Row[] {
    const out: Row[] = [];
    for (const cat of this.categoryGroups) {
      for (const ch of this.channelHeaders) {
        const match = entries.find(
          (e) => e.category === cat.category && e.channel === ch.channel,
        );
        out.push({
          category: cat.category,
          channel: ch.channel,
          enabled: match?.enabled ?? true,
        });
      }
    }
    return out;
  }
}
