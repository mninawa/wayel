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
  WarehouseApiService,
  type OpsDispatchManifestDetailDto,
  type OpsDispatchManifestDto,
} from '../../services/warehouse-api.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import {
  COURIER_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  computeStatusDistribution,
  courierTone,
  estimatePackages,
  estimateWeightKg,
  fromManifestDetail,
  manifestStatusLabel,
  manifestStatusTone,
} from '../../types/manifest.types';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { warehouseRoutes } from '../../types/warehouse.types';

interface ManifestMetric {
  label: string;
  value: string;
  sub: string;
  subTone?: 'green' | 'amber' | 'red';
  icon: string;
  tone: string;
}

@Component({
  selector: 'ops-warehouse-manifests',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warehouse-manifests.component.html',
  styleUrl: './warehouse-manifests.component.css',
})
export class WarehouseManifestsComponent implements OnInit {
  private readonly api = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = warehouseRoutes;
  readonly courierOptions = COURIER_FILTER_OPTIONS;
  readonly statusOptions = STATUS_FILTER_OPTIONS;
  readonly courierTone = courierTone;
  readonly manifestStatusTone = manifestStatusTone;
  readonly manifestStatusLabel = manifestStatusLabel;
  readonly estimatePackages = estimatePackages;
  readonly estimateWeightKg = estimateWeightKg;

  readonly items = signal<OpsDispatchManifestDto[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly detailById = signal<Record<string, OpsDispatchManifestDetailDto>>({});
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  courierFilter = '';
  statusFilter = '';
  searchQuery = '';

  readonly filteredItems = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.items().filter((item) => {
      if (this.courierFilter && !item.courier.toLowerCase().includes(this.courierFilter.toLowerCase())) {
        return false;
      }
      if (this.statusFilter && item.status.toUpperCase() !== this.statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.displayId.toLowerCase().includes(q) ||
        item.courier.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q)
      );
    });
  });

  readonly selectedManifest = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.items().find((i) => i.manifestId === id) ?? null;
  });

  readonly detailPreview = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    const detail = this.detailById()[id];
    return detail ? fromManifestDetail(detail) : null;
  });

  readonly metrics = computed((): ManifestMetric[] => {
    const all = this.items();
    const today = new Date().toDateString();
    const draft = all.filter((m) => m.status.toUpperCase() === 'DRAFT').length;
    const ready = all.filter((m) => ['READY', 'PRINTED'].includes(m.status.toUpperCase())).length;
    const handedToday = all.filter(
      (m) =>
        m.status.toUpperCase() === 'HANDED_OVER' &&
        m.handedOverAtUtc &&
        new Date(m.handedOverAtUtc).toDateString() === today,
    ).length;
    const totalShipments = all.reduce((sum, m) => sum + m.shipmentCount, 0);

    return [
      { label: 'Draft Manifests', value: String(draft), sub: 'Awaiting review', subTone: 'amber', icon: 'edit_note', tone: 'amber' },
      { label: 'Ready for Pickup', value: String(ready), sub: 'Courier scheduled', subTone: 'green', icon: 'local_shipping', tone: 'green' },
      { label: 'Handed Over Today', value: String(handedToday), sub: 'Left warehouse today', subTone: 'green', icon: 'check_circle', tone: 'teal' },
      { label: 'Total Shipments', value: String(totalShipments), sub: 'Across all manifests', icon: 'inventory_2', tone: 'indigo' },
    ];
  });

  readonly statusDistribution = computed(() => computeStatusDistribution(this.items()));

  ngOnInit(): void {
    this.refresh();
  }

  canDispatch(): boolean {
    return this.session.can(OPS_CAP.dispatchWrite);
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.listManifests(key, 1, 100).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.busy.set(false);
        if (!this.selectedId() && r.items.length > 0) {
          this.selectManifest(r.items[0]!);
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  selectManifest(row: OpsDispatchManifestDto): void {
    this.selectedId.set(row.manifestId);
    this.loadManifestDetail(row.manifestId);
  }

  private loadManifestDetail(manifestId: string): void {
    if (this.detailById()[manifestId]) return;
    const key = this.session.opsKey();
    if (!key) return;
    this.detailLoading.set(true);
    this.api.getManifestDetail(manifestId, key).subscribe({
      next: (detail) => {
        this.detailById.update((map) => ({ ...map, [manifestId]: detail }));
        this.detailLoading.set(false);
      },
      error: (err) => {
        this.detailLoading.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  confirmHandover(): void {
    const row = this.selectedManifest();
    const key = this.session.opsKey();
    if (!row || !key || !this.canDispatch()) return;
    const proof = window.prompt('Proof of handover (optional reference)') ?? null;
    this.busyId.set(row.manifestId);
    this.success.set(null);
    this.api.confirmManifestHandover(row.manifestId, proof, key).subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set('Handover confirmed.');
        this.refresh();
      },
      error: (err) => {
        this.busyId.set(null);
        this.error.set(this.formatError(err));
      },
    });
  }

  printPreview(): void {
    window.alert('Ops preview — manifest print is not wired yet.');
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? 'Request failed.';
    }
    return 'Request failed.';
  }
}
