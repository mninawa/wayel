import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ShipmentOpsApiService,
  type OpsShipmentListItemDto,
  type OpsShipmentTrackingDetailDto,
} from '../../services/shipment-ops-api.service';
import { OpsSessionService } from '../../services/ops-session.service';

/**
 * Segment tab — keeps the filter state declarative and the template clean.
 * `key` is the value we filter by (and the query param we sync to the URL);
 * `label` and `match` predicate live next to each other so a new bucket
 * only requires editing this array.
 */
interface StatusSegment {
  key: 'all' | 'paid' | 'in-transit' | 'delivered' | 'other';
  label: string;
  match: (s: OpsShipmentListItemDto) => boolean;
}

type SortKey = 'recent' | 'oldest' | 'stale' | 'customer';

@Component({
  selector: 'ops-shipment-status',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shipment-status.component.html',
  styleUrl: './shipment-status.component.css',
})
export class ShipmentStatusComponent implements OnInit, OnDestroy {
  private readonly api = inject(ShipmentOpsApiService);
  private readonly session = inject(OpsSessionService);

  // ── Page state ────────────────────────────────────────────────────────
  readonly shipments = signal<OpsShipmentListItemDto[]>([]);
  readonly busy = signal(false);
  readonly bulkBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly lastRefreshedAt = signal<Date | null>(null);

  // ── Filter / sort state ──────────────────────────────────────────────
  readonly activeSegment = signal<StatusSegment['key']>('all');
  readonly search = signal('');
  readonly sort = signal<SortKey>('recent');
  readonly autoRefresh = signal(false);

  // ── Multi-select ─────────────────────────────────────────────────────
  readonly selected = signal<Set<string>>(new Set());

  // ── Side drawer ──────────────────────────────────────────────────────
  readonly drawerShipmentId = signal<string | null>(null);
  readonly drawerDetail = signal<OpsShipmentTrackingDetailDto | null>(null);
  readonly drawerBusy = signal(false);
  readonly drawerError = signal<string | null>(null);

  /** Status segments wired up once — predicates run client-side so users
   *  get instant feedback when a row changes status after a bulk action. */
  readonly segments: StatusSegment[] = [
    { key: 'all', label: 'All', match: () => true },
    { key: 'paid', label: 'Ready to ship', match: (s) => s.status === 'Paid' },
    { key: 'in-transit', label: 'In transit', match: (s) => s.status === 'InTransit' },
    { key: 'delivered', label: 'Delivered', match: (s) => s.status === 'Delivered' },
    {
      key: 'other',
      label: 'Other',
      match: (s) => !['Paid', 'InTransit', 'Delivered'].includes(s.status),
    },
  ];

  // Filtered + sorted view — recomputes whenever any of the inputs change.
  readonly filtered = computed(() => {
    const segment = this.segments.find((s) => s.key === this.activeSegment());
    const q = this.search().trim().toLowerCase();
    const sortKey = this.sort();

    let rows = this.shipments();
    if (segment) {
      rows = rows.filter((r) => segment.match(r));
    }
    if (q.length > 0) {
      rows = rows.filter((r) => {
        const hay = [
          r.primaryTrackingNumber ?? '',
          r.customerDisplayName ?? '',
          r.customerEmail ?? '',
          r.deliveryMethod ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // Note: shipments without `lastEventAtUtc` sort to the end on
    // every "by event date" sort key — operators looking for stale
    // shipments will see them clustered.
    const sorted = [...rows];
    const eventTime = (r: OpsShipmentListItemDto) =>
      r.lastEventAtUtc ? Date.parse(r.lastEventAtUtc) : Number.NaN;
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'recent':
          return safeCmp(eventTime(b), eventTime(a));
        case 'oldest':
          return safeCmp(eventTime(a), eventTime(b));
        case 'stale':
          // Stale = oldest non-delivered first
          if (a.status === 'Delivered' && b.status !== 'Delivered') return 1;
          if (b.status === 'Delivered' && a.status !== 'Delivered') return -1;
          return safeCmp(eventTime(a), eventTime(b));
        case 'customer':
          return (a.customerDisplayName ?? '').localeCompare(b.customerDisplayName ?? '');
      }
    });
    return sorted;
  });

  // KPI strip
  readonly kpis = computed(() => {
    const rows = this.shipments();
    const today = startOfTodayUtc();
    const deliveredToday = rows.filter(
      (r) =>
        r.status === 'Delivered'
        && r.lastEventAtUtc != null
        && Date.parse(r.lastEventAtUtc) >= today,
    ).length;
    const staleCutoff = Date.now() - 48 * 60 * 60 * 1000;
    const stale = rows.filter(
      (r) =>
        r.status !== 'Delivered'
        && r.lastEventAtUtc != null
        && Date.parse(r.lastEventAtUtc) < staleCutoff,
    ).length;
    return {
      ready: rows.filter((r) => r.status === 'Paid').length,
      inTransit: rows.filter((r) => r.status === 'InTransit').length,
      deliveredToday,
      stale,
      total: rows.length,
    };
  });

  readonly segmentCount = (seg: StatusSegment['key']) => {
    const s = this.segments.find((x) => x.key === seg);
    if (!s) return 0;
    return this.shipments().filter((r) => s.match(r)).length;
  };

  /** Rows currently visible in the filtered table that are also selected.
   *  Used to decide which bulk actions are enabled (the bulk action only
   *  flips rows where the transition is legal, but we hide the button
   *  altogether if no selected row could accept the transition). */
  readonly selectedVisible = computed(() => {
    const sel = this.selected();
    return this.filtered().filter((r) => sel.has(r.shipmentId));
  });

  readonly canBulkInTransit = computed(() =>
    this.selectedVisible().some((s) => s.status === 'Paid'),
  );
  readonly canBulkDeliver = computed(() =>
    this.selectedVisible().some((s) => s.status === 'InTransit'),
  );

  // Auto-refresh timer — fires every 60s while toggle is on. Cleared on
  // toggle-off and on destroy.
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Toggle wiring — declarative effect so we don't have to remember
    // to clear/restart the interval in two places.
    effect(() => {
      if (this.autoRefresh()) {
        if (!this.autoRefreshTimer) {
          this.autoRefreshTimer = setInterval(() => this.refresh(), 60_000);
        }
      } else if (this.autoRefreshTimer) {
        clearInterval(this.autoRefreshTimer);
        this.autoRefreshTimer = null;
      }
    });
  }

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  // ── Refresh ──────────────────────────────────────────────────────────
  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.listShipments(key).subscribe({
      next: (items) => {
        this.shipments.set(items);
        this.busy.set(false);
        this.lastRefreshedAt.set(new Date());
        // Drop any selections that are no longer in the list (e.g. after
        // a status flip removed them from the active filter).
        const ids = new Set(items.map((i) => i.shipmentId));
        const current = this.selected();
        const next = new Set([...current].filter((id) => ids.has(id)));
        if (next.size !== current.size) this.selected.set(next);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  // ── Single-row actions ───────────────────────────────────────────────
  markInTransit(s: OpsShipmentListItemDto): void {
    this.updateStatus(s.shipmentId, 'InTransit');
  }

  markDelivered(s: OpsShipmentListItemDto): void {
    this.updateStatus(s.shipmentId, 'Delivered');
  }

  // ── Bulk actions ─────────────────────────────────────────────────────
  bulkMark(target: 'InTransit' | 'Delivered'): void {
    const candidates = this.selectedVisible().filter((s) =>
      target === 'InTransit' ? s.status === 'Paid' : s.status === 'InTransit',
    );
    if (candidates.length === 0) return;
    const key = this.session.opsKey();
    if (!key) return;
    const total = candidates.length;
    if (!confirmBulk(target, total)) return;

    this.bulkBusy.set(true);
    this.error.set(null);
    this.success.set(null);
    let done = 0;
    let failed = 0;
    const finish = () => {
      done += 1;
      if (done === total) {
        this.bulkBusy.set(false);
        const label = target === 'InTransit' ? 'In transit' : 'Delivered';
        if (failed === 0) {
          this.success.set(`${total} shipment(s) marked ${label}.`);
        } else {
          this.success.set(
            `${total - failed} of ${total} shipment(s) marked ${label}; ${failed} failed.`,
          );
        }
        this.selected.set(new Set());
        this.refresh();
      }
    };

    for (const s of candidates) {
      this.api.updateStatus(s.shipmentId, { status: target }, key).subscribe({
        next: () => finish(),
        error: () => {
          failed += 1;
          finish();
        },
      });
    }
  }

  // ── Drawer ───────────────────────────────────────────────────────────
  openDrawer(s: OpsShipmentListItemDto): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.drawerShipmentId.set(s.shipmentId);
    this.drawerDetail.set(null);
    this.drawerBusy.set(true);
    this.drawerError.set(null);
    this.api.getTrackingDetail(s.shipmentId, key).subscribe({
      next: (detail) => {
        this.drawerDetail.set(detail);
        this.drawerBusy.set(false);
      },
      error: (err) => {
        this.drawerBusy.set(false);
        this.drawerError.set(this.formatError(err));
      },
    });
  }

  closeDrawer(): void {
    this.drawerShipmentId.set(null);
    this.drawerDetail.set(null);
    this.drawerError.set(null);
  }

  /** Copy the customer-facing tracking URL to clipboard so ops can DM/email
   *  it to a customer without hunting through the portal. */
  copyTrackingLink(s: OpsShipmentListItemDto): void {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // The ops dashboard runs on a different origin (e.g. *-ops.onrender.com)
    // than the customer portal. Strip any "-ops" suffix to land on the
    // customer side; local dev tolerates this because the port differs
    // anyway and we just need a copyable shape for the operator to paste.
    const portalOrigin = origin.replace('-ops.', '.').replace(':8081', ':8080');
    const url = `${portalOrigin}/shipments/${s.shipmentId}/track`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.success.set(`Customer tracking link copied: ${url}`),
        () => this.success.set(`Tracking link: ${url}`),
      );
    } else {
      this.success.set(`Tracking link: ${url}`);
    }
  }

  // ── Selection helpers ────────────────────────────────────────────────
  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  toggleSelected(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  toggleSelectAll(): void {
    const visible = this.filtered();
    const selectableIds = visible
      .filter((s) => s.status === 'Paid' || s.status === 'InTransit')
      .map((s) => s.shipmentId);
    const allSelected = selectableIds.every((id) => this.selected().has(id));
    if (allSelected) {
      const next = new Set(this.selected());
      for (const id of selectableIds) next.delete(id);
      this.selected.set(next);
    } else {
      const next = new Set(this.selected());
      for (const id of selectableIds) next.add(id);
      this.selected.set(next);
    }
  }

  allVisibleSelected(): boolean {
    const visible = this.filtered().filter(
      (s) => s.status === 'Paid' || s.status === 'InTransit',
    );
    if (visible.length === 0) return false;
    return visible.every((s) => this.selected().has(s.shipmentId));
  }

  // ── Display helpers ──────────────────────────────────────────────────
  statusTone(status: string): 'paid' | 'in-transit' | 'delivered' | 'other' {
    switch (status) {
      case 'Paid':
        return 'paid';
      case 'InTransit':
        return 'in-transit';
      case 'Delivered':
        return 'delivered';
      default:
        return 'other';
    }
  }

  /** Hours since the last tracking event, used to colour-code "stale" rows
   *  in the list. Returns null when there's no event yet. */
  hoursSinceLastEvent(s: OpsShipmentListItemDto): number | null {
    if (!s.lastEventAtUtc) return null;
    const ms = Date.now() - Date.parse(s.lastEventAtUtc);
    return Math.max(0, Math.round(ms / (60 * 60 * 1000)));
  }

  ageTone(hours: number | null, status: string): 'fresh' | 'warn' | 'stale' | 'none' {
    if (hours == null || status === 'Delivered') return 'none';
    if (hours >= 72) return 'stale';
    if (hours >= 24) return 'warn';
    return 'fresh';
  }

  dismissSuccess(): void { this.success.set(null); }
  dismissError(): void { this.error.set(null); }

  clearSelection(): void { this.selected.set(new Set()); }

  selectSegment(key: StatusSegment['key']): void {
    this.activeSegment.set(key);
    this.clearSelection();
  }

  resetFilters(): void {
    this.activeSegment.set('all');
    this.search.set('');
  }

  // Drawer-footer helpers (avoid building a fake DTO in the template).
  markInTransitById(id: string): void { this.updateStatus(id, 'InTransit'); }
  markDeliveredById(id: string): void { this.updateStatus(id, 'Delivered'); }
  copyTrackingLinkById(id: string): void {
    this.copyTrackingLink({ shipmentId: id } as OpsShipmentListItemDto);
  }

  // ── Private ──────────────────────────────────────────────────────────
  private updateStatus(shipmentId: string, status: string): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.updateStatus(shipmentId, { status }, key).subscribe({
      next: (r) => {
        this.success.set(`${r.eventLabel} — now ${r.statusLabel}`);
        this.refresh();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
    }
    return 'Could not update shipment.';
  }
}

function safeCmp(a: number, b: number): number {
  // NaN-safe descending compare: NaN values always sink to the bottom.
  if (Number.isNaN(a) && Number.isNaN(b)) return 0;
  if (Number.isNaN(a)) return 1;
  if (Number.isNaN(b)) return -1;
  return a - b;
}

function startOfTodayUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function confirmBulk(target: 'InTransit' | 'Delivered', count: number): boolean {
  if (typeof window === 'undefined') return true;
  const label = target === 'InTransit' ? 'In transit' : 'Delivered';
  return window.confirm(`Mark ${count} shipment(s) ${label}?`);
}
