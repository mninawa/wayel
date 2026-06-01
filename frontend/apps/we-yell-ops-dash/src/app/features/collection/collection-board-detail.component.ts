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
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import {
  CollectionApiService,
  type OpsCollectionBoardCardDto,
  type OpsCollectionParcelLineDto,
  type OpsCollectionShipmentDetailDto,
} from '../../services/collection-api.service';

@Component({
  selector: 'ops-collection-board-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe, OpsPillComponent, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-board-detail.component.html',
  styleUrl: './collection-board-detail.component.css',
})
export class CollectionBoardDetailComponent {
  private readonly api = inject(CollectionApiService);

  readonly card = input<OpsCollectionBoardCardDto | null>(null);
  readonly closed = output<void>();

  readonly loading = signal(false);
  readonly detail = signal<OpsCollectionShipmentDetailDto | null>(null);

  constructor() {
    effect(() => {
      const card = this.card();
      this.detail.set(null);
      if (!card) return;

      this.loading.set(true);
      this.api.getShipmentDetail(card.shipmentId).subscribe({
        next: (d) => {
          this.detail.set(d);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    });
  }

  parcels(): OpsCollectionParcelLineDto[] {
    return this.detail()?.parcels ?? this.card()?.parcels ?? [];
  }

  retailerInitial(retailer: string): string {
    return retailer.trim().charAt(0).toUpperCase() || '?';
  }

  statusTone(columnId: string): 'gray' | 'orange' | 'green' {
    if (columnId === 'collected') return 'green';
    if (columnId === 'ready_for_collection') return 'orange';
    return 'gray';
  }

  channelTone(status: string): 'green' | 'orange' | 'red' | 'gray' | 'blue' {
    const s = status.toLowerCase();
    if (s === 'sent' || s === 'posted') return 'green';
    if (s === 'skipped' || s === 'pending') return 'orange';
    if (s === 'failed') return 'red';
    return 'gray';
  }

  channelStatus(status: string): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }
}
