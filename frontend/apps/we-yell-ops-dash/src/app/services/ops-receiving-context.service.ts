import { Injectable, computed, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import {
  ReceivingApiService,
  type OpsParcelSearchHitDto,
  type OpsReceivingStatsDto,
} from './receiving-api.service';
import { OpsSessionService } from './ops-session.service';

@Injectable({ providedIn: 'root' })
export class OpsReceivingContextService {
  private readonly api = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);

  private readonly statsSignal = signal<OpsReceivingStatsDto | null>(null);
  private readonly loading = signal(false);

  readonly stats = this.statsSignal.asReadonly();
  readonly exceptionCount = computed(() => this.statsSignal()?.exceptions ?? 0);
  readonly loadingStats = this.loading.asReadonly();

  applyStats(stats: OpsReceivingStatsDto): void {
    this.statsSignal.set(stats);
  }

  refreshStats(): void {
    const key = this.session.opsKey();
    if (!key) {
      this.statsSignal.set(null);
      return;
    }

    this.loading.set(true);
    this.api.getDashboard(key, 1).subscribe({
      next: (data) => {
        this.statsSignal.set(data.stats);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  search(query: string): Observable<OpsParcelSearchHitDto[]> {
    const key = this.session.opsKey();
    if (!key) {
      throw new Error('Not connected');
    }
    return this.api.search(query, key);
  }
}
