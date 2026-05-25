import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { OpsPillComponent, type OpsPillTone } from '../../shared/ops-pill.component';
import {
  ReceivingApiService,
  type OpsActivityItemDto,
  type OpsParcelDetailDto,
  type OpsPhotoDto,
} from '../../services/receiving-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import {
  WarehouseApiService,
  type OpsParcelStorageDto,
  type OpsWarehouseBoardCardDto,
  type OpsWarehouseLocationDto,
} from '../../services/warehouse-api.service';
import { receivingRoutes } from '../../types/receiving.types';
import { warehouseRoutes } from '../../types/warehouse.types';

type DetailTab = 'summary' | 'details' | 'location' | 'activity' | 'documents';

@Component({
  selector: 'ops-warehouse-board-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, OpsPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warehouse-board-detail.component.html',
  styleUrl: './warehouse-board-detail.component.css',
})
export class WarehouseBoardDetailComponent {
  private readonly receivingApi = inject(ReceivingApiService);
  private readonly warehouseApi = inject(WarehouseApiService);
  private readonly session = inject(OpsSessionService);

  readonly card = input<OpsWarehouseBoardCardDto | null>(null);
  readonly closed = output<void>();

  readonly routes = warehouseRoutes;
  readonly recv = receivingRoutes;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'details', label: 'Details' },
    { id: 'location', label: 'Location' },
    { id: 'activity', label: 'Activity' },
    { id: 'documents', label: 'Documents' },
  ];

  readonly activeTab = signal<DetailTab>('summary');
  readonly loading = signal(false);
  readonly parcel = signal<OpsParcelDetailDto | null>(null);
  readonly storage = signal<OpsParcelStorageDto | null>(null);
  readonly activity = signal<OpsActivityItemDto[]>([]);
  readonly photos = signal<OpsPhotoDto[]>([]);
  readonly matchedLocation = signal<OpsWarehouseLocationDto | null>(null);

  constructor() {
    effect(() => {
      this.card();
      this.activeTab.set('summary');
      this.loadDetails();
    });
  }

  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
    if (tab === 'activity' && this.activity().length === 0) {
      this.loadActivity();
    }
    if (tab === 'documents' && this.photos().length === 0) {
      this.loadPhotos();
    }
  }

  retailerInitial(retailer: string): string {
    return retailer.trim().charAt(0).toUpperCase() || '?';
  }

  locationLabel(s: OpsParcelStorageDto): string {
    return s.currentLocationLabel ?? s.currentLocationId ?? 'Unassigned';
  }

  inspectionLabel(p: OpsParcelDetailDto): string {
    const c = p.inspection?.conditionStatus;
    if (!c || c === 'NOT_INSPECTED') return 'Not inspected';
    if (c === 'GOOD') return 'Complete';
    return c.replace(/_/g, ' ');
  }

  inspectionTone(p: OpsParcelDetailDto): OpsPillTone {
    const c = p.inspection?.conditionStatus;
    if (c === 'GOOD') return 'green';
    if (c === 'MINOR_DAMAGE') return 'orange';
    if (c === 'MAJOR_DAMAGE') return 'red';
    return 'gray';
  }

  invoiceTone(status: string): OpsPillTone {
    const s = status.toLowerCase();
    if (s.includes('verified') || s.includes('invoiced')) return 'green';
    if (s.includes('reject')) return 'red';
    if (s.includes('pending') || s.includes('awaiting')) return 'orange';
    return 'gray';
  }

  private loadDetails(): void {
    const card = this.card();
    this.parcel.set(null);
    this.storage.set(null);
    this.activity.set([]);
    this.photos.set([]);
    this.matchedLocation.set(null);

    if (!card || card.cardType !== 'PARCEL' || !card.parcelId) return;

    const key = this.session.opsKey();
    if (!key) return;

    this.loading.set(true);
    this.receivingApi.getParcel(card.parcelId, key).subscribe({
      next: (p) => {
        this.parcel.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.warehouseApi.getParcelStorage(card.parcelId, key).subscribe({
      next: (s) => {
        this.storage.set(s);
        const locId = s.currentLocationId;
        if (locId) {
          const match = s.eligibleLocations.find((l) => l.locationId === locId);
          this.matchedLocation.set(match ?? null);
        }
      },
    });
  }

  private loadActivity(): void {
    const card = this.card();
    const key = this.session.opsKey();
    if (!card?.parcelId || !key) return;
    this.receivingApi.listActivity(card.parcelId, key).subscribe({
      next: (items) => this.activity.set(items),
    });
  }

  private loadPhotos(): void {
    const card = this.card();
    const key = this.session.opsKey();
    if (!card?.parcelId || !key) return;
    this.receivingApi.listPhotos(card.parcelId, key).subscribe({
      next: (items) => this.photos.set(items),
    });
  }
}
