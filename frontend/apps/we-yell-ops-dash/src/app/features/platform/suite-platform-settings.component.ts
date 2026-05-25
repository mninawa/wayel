import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SUITE_REGION_FLAGS,
  SuitePlatformApiService,
  type SuitePlatformConfigDto,
  type SuitePlatformRegionSummaryDto,
  type UpdateSuitePlatformConfigRequest,
} from '../../services/suite-platform-api.service';
import { platformRoutes } from '../../types/platform.types';

@Component({
  selector: 'ops-suite-platform-settings',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suite-platform-settings.component.html',
  styleUrl: './suite-platform-settings.component.css',
})
export class SuitePlatformSettingsComponent implements OnInit {
  private readonly api = inject(SuitePlatformApiService);

  readonly routes = platformRoutes;
  readonly regionFlags = SUITE_REGION_FLAGS;

  readonly regions = signal<SuitePlatformRegionSummaryDto[]>([]);
  readonly selectedRegionCode = signal('SZ');
  readonly config = signal<SuitePlatformConfigDto | null>(null);
  readonly form = signal<UpdateSuitePlatformConfigRequest>(this.emptyForm());
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly selectedRegion = computed(() => {
    const code = this.selectedRegionCode();
    return this.regions().find((r) => r.regionCode === code) ?? null;
  });

  readonly platformTotals = computed(() => {
    const list = this.regions();
    return {
      assigned: list.reduce((sum, r) => sum + r.assignedSuiteCount, 0),
      capacity: list.reduce((sum, r) => sum + r.totalSuiteCapacity, 0),
      activeCorridors: list.filter((r) => r.isActive).length,
    };
  });

  readonly capacityUsedPct = computed(() => {
    const cfg = this.config();
    const cap = this.form().totalSuiteCapacity;
    if (!cfg || cap <= 0) return 0;
    return Math.min(100, Math.round((cfg.assignedSuiteCount / cap) * 100));
  });

  readonly editedAvailableCount = computed(() => {
    const cfg = this.config();
    if (!cfg) return 0;
    return Math.max(0, this.form().totalSuiteCapacity - cfg.assignedSuiteCount);
  });

  readonly addressPreviewLines = computed(() => {
    const f = this.form();
    const cfg = this.config();
    const lines = [
      f.warehouseName,
      f.addressLine1,
      f.addressLine2,
      [f.city, f.province, f.postalCode].filter(Boolean).join(', '),
      f.countryCode === 'ZA' ? 'South Africa' : f.countryCode,
    ].filter((line): line is string => Boolean(line && line.trim()));

    if (cfg) {
      lines.push(`Delivers to ${cfg.destinationCountryLabel}`);
    }

    return lines;
  });

  readonly exampleSuiteNumber = computed(() => {
    const f = this.form();
    const prefix = f.numberPrefix.trim().toUpperCase() || 'WY';
    if (f.generationMode === 'Sequential') {
      const pad = Math.max(4, f.sequencePadLength || 6);
      return `${prefix}-${String(f.nextSequenceNumber || 1).padStart(pad, '0')}`;
    }
    return `${prefix}-019E4AE2`;
  });

  ngOnInit(): void {
    this.loadRegions();
  }

  selectRegion(regionCode: string): void {
    if (regionCode === this.selectedRegionCode()) return;
    this.selectedRegionCode.set(regionCode);
    this.loadConfig(regionCode);
  }

  loadRegions(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.listRegions().subscribe({
      next: (regions) => {
        this.regions.set(regions);
        const initial =
          regions.find((r) => r.regionCode === this.selectedRegionCode())?.regionCode
          ?? regions[0]?.regionCode
          ?? 'SZ';
        this.selectedRegionCode.set(initial);
        this.loadConfig(initial, false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  loadConfig(regionCode: string, markBusy = true): void {
    if (markBusy) this.busy.set(true);
    this.error.set(null);
    this.api.getConfig(regionCode).subscribe({
      next: (cfg) => {
        this.applyConfig(cfg);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  load(): void {
    this.message.set(null);
    this.loadRegions();
  }

  save(): void {
    const regionCode = this.selectedRegionCode();
    const body = this.form();
    this.busy.set(true);
    this.message.set(null);
    this.error.set(null);
    this.api.updateConfig(regionCode, body).subscribe({
      next: (cfg) => {
        this.applyConfig(cfg);
        this.refreshRegionSummary(cfg);
        this.message.set(`${cfg.corridorLabel} settings saved.`);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  patchForm(partial: Partial<UpdateSuitePlatformConfigRequest>): void {
    this.form.update((current) => ({ ...current, ...partial }));
  }

  setGenerationMode(mode: 'UserIdSuffix' | 'Sequential'): void {
    this.patchForm({ generationMode: mode });
  }

  regionFlag(code: string): string {
    return this.regionFlags[code] ?? '🌍';
  }

  regionUsedPct(region: SuitePlatformRegionSummaryDto): number {
    if (region.totalSuiteCapacity <= 0) return 0;
    return Math.min(100, Math.round((region.assignedSuiteCount / region.totalSuiteCapacity) * 100));
  }

  private applyConfig(cfg: SuitePlatformConfigDto): void {
    this.config.set(cfg);
    this.form.set(this.toForm(cfg));
  }

  private refreshRegionSummary(cfg: SuitePlatformConfigDto): void {
    this.regions.update((list) =>
      list.map((r) =>
        r.regionCode === cfg.regionCode
          ? {
              ...r,
              isActive: cfg.isActive,
              assignedSuiteCount: cfg.assignedSuiteCount,
              totalSuiteCapacity: cfg.totalSuiteCapacity,
              availableSuiteCount: cfg.availableSuiteCount,
              numberPrefix: cfg.numberPrefix,
              updatedAtUtc: cfg.updatedAtUtc,
            }
          : r,
      ),
    );
  }

  private toForm(cfg: SuitePlatformConfigDto): UpdateSuitePlatformConfigRequest {
    return {
      isActive: cfg.isActive,
      warehouseName: cfg.warehouseName,
      addressLine1: cfg.addressLine1,
      addressLine2: cfg.addressLine2,
      city: cfg.city,
      province: cfg.province,
      postalCode: cfg.postalCode,
      countryCode: cfg.countryCode,
      totalSuiteCapacity: cfg.totalSuiteCapacity,
      numberPrefix: cfg.numberPrefix,
      generationMode: cfg.generationMode,
      userIdSuffixLength: cfg.userIdSuffixLength,
      sequencePadLength: cfg.sequencePadLength,
      nextSequenceNumber: cfg.nextSequenceNumber,
    };
  }

  private emptyForm(): UpdateSuitePlatformConfigRequest {
    return {
      isActive: true,
      warehouseName: '',
      addressLine1: '',
      addressLine2: null,
      city: '',
      province: '',
      postalCode: '',
      countryCode: 'ZA',
      totalSuiteCapacity: 10000,
      numberPrefix: 'WY',
      generationMode: 'UserIdSuffix',
      userIdSuffixLength: 8,
      sequencePadLength: 6,
      nextSequenceNumber: 1,
    };
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Session expired — sign in again from the warehouse access screen.';
      }
      const body = err.error as { detail?: string; title?: string } | null;
      return body?.detail ?? body?.title ?? 'Request failed.';
    }
    return 'Request failed.';
  }
}
