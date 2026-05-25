import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PlatformDashboardApiService,
  type PlatformDashboardDto,
  type PlatformRevenueMonthDto,
} from '../../services/platform-dashboard-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { accountRoutes } from '../../types/account.types';
import { platformRoutes } from '../../types/platform.types';

@Component({
  selector: 'ops-platform-dashboard',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './platform-dashboard.component.html',
  styleUrl: './platform-dashboard.component.css',
})
export class PlatformDashboardComponent implements OnInit {
  private readonly api = inject(PlatformDashboardApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = { ...platformRoutes, accounts: accountRoutes.list };

  readonly dashboard = signal<PlatformDashboardDto | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly metrics = computed(() => this.dashboard()?.metrics ?? []);
  readonly revenueMonths = computed(() => this.dashboard()?.revenueMonths ?? []);
  readonly forecastItems = computed(() => this.dashboard()?.forecastItems ?? []);
  readonly revenueBreakdown = computed(() => this.dashboard()?.revenueBreakdown ?? []);
  readonly donutGradient = computed(() => this.dashboard()?.donutGradient ?? 'conic-gradient(#e2e8f0 0% 100%)');
  readonly donutTotalLabel = computed(() => this.dashboard()?.donutTotalLabel ?? '—');
  readonly suitePerformance = computed(() => this.dashboard()?.suitePerformance ?? []);
  readonly shipmentBatches = computed(() => this.dashboard()?.shipmentBatches ?? []);
  readonly shipmentBatchParcelTotal = computed(() => this.dashboard()?.shipmentBatchParcelTotal ?? 0);
  readonly shipmentBatchRevenueTotalZar = computed(() => this.dashboard()?.shipmentBatchRevenueTotalZar ?? 0);
  readonly corridors = computed(() => this.dashboard()?.corridors ?? []);
  readonly quoteBuckets = computed(() => this.dashboard()?.quoteBuckets ?? []);
  readonly quotesPendingTotal = computed(() => this.dashboard()?.quotesPendingTotal ?? 0);
  readonly expiredCustomers = computed(() => this.dashboard()?.expiredCustomers ?? []);
  readonly expiredAttentionTotal = computed(() => this.dashboard()?.expiredAttentionTotal ?? 0);
  readonly scopeLabel = computed(() => this.dashboard()?.scopeLabel ?? 'WeYell Platform');

  readonly revenueMax = computed(() => {
    const months = this.revenueMonths();
    if (months.length === 0) return 1;
    return Math.max(...months.map((m) => m.suiteRevenueZar + m.shipmentRevenueZar), 1);
  });

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) {
      this.error.set('Sign in to load platform metrics.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.getDashboard(key).subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not load platform dashboard.');
      },
    });
  }

  totalHeight(month: PlatformRevenueMonthDto): number {
    const max = this.revenueMax();
    return ((month.suiteRevenueZar + month.shipmentRevenueZar) / max) * 100;
  }
}
