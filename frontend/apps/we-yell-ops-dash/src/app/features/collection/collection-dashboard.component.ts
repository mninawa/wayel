import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CollectionApiService,
  type OpsCollectionBoardCardDto,
  type OpsCollectionBoardDto,
} from '../../services/collection-api.service';
import { OpsCoverPhotoLoaderService } from '../../services/ops-cover-photo-loader.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';
import { COLLECTION_COLUMN } from '../../types/collection.types';
import {
  bulkAdvanceLabel,
  canBulkAdvance,
  canDropOnColumn,
  dropBlockedMessage,
} from './collection-board-transitions';
import {
  CollectionPickupModalComponent,
  type CollectionPickupConfirm,
} from './collection-pickup-modal.component';

@Component({
  selector: 'ops-collection-dashboard',
  standalone: true,
  imports: [FormsModule, CollectionPickupModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-dashboard.component.html',
  styleUrl: './collection-dashboard.component.css',
})
export class CollectionDashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(CollectionApiService);
  private readonly coverPhotos = inject(OpsCoverPhotoLoaderService);
  private readonly session = inject(OpsSessionService);
  private disposeCoverPhotos: (() => void) | null = null;

  readonly board = signal<OpsCollectionBoardDto | null>(null);
  readonly coverImageUrls = signal<Record<string, string>>({});
  readonly busy = signal(false);
  readonly scanBusy = signal(false);
  readonly moving = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly pickupCard = signal<OpsCollectionBoardCardDto | null>(null);
  readonly pickupError = signal<string | null>(null);
  readonly dragPayload = signal<{ card: OpsCollectionBoardCardDto; fromColumnId: string } | null>(null);
  readonly dropTargetColumn = signal<string | null>(null);
  readonly dropBlockedColumn = signal<string | null>(null);

  scanValue = '';
  searchFilter = '';
  hubFilter = '';
  scanHubCity = 'Mbabane';

  readonly canMove = computed(() => this.session.can(OPS_CAP.collectionWrite));
  readonly hubOptions = ['Mbabane', 'Manzini'];
  readonly bulkAdvanceLabel = bulkAdvanceLabel;
  readonly canBulkAdvance = canBulkAdvance;

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.disposeCoverPhotos?.();
  }

  coverImageUrl(card: OpsCollectionBoardCardDto): string | null {
    const photoId = this.coverPhotos.normalizePhotoId(card.coverPhotoId);
    if (!photoId) return null;
    return this.coverImageUrls()[photoId] ?? null;
  }

  private loadCoverImages(board: OpsCollectionBoardDto): void {
    this.disposeCoverPhotos?.();
    this.disposeCoverPhotos = null;
    this.coverImageUrls.set({});

    const photoIds = board.columns.flatMap((col) => col.cards.map((c) => c.coverPhotoId));
    this.disposeCoverPhotos = this.coverPhotos.load(photoIds, (urls) => {
      this.coverImageUrls.set(urls);
    });
  }

  refresh(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api
      .getBoard({
        search: this.searchFilter.trim() || undefined,
        hubCity: this.hubFilter.trim() || undefined,
      })
      .subscribe({
        next: (b) => {
          this.board.set(b);
          this.busy.set(false);
          this.loadCoverImages(b);
        },
        error: () => {
          this.error.set('Could not load collection board.');
          this.busy.set(false);
        },
      });
  }

  applyFilters(): void {
    this.refresh();
  }

  scanArrival(): void {
    const value = this.scanValue.trim();
    if (!value || !this.canMove()) return;

    this.scanBusy.set(true);
    this.error.set(null);
    this.message.set(null);
    this.api.scanArrival(value, this.scanHubCity).subscribe({
      next: (res) => {
        this.message.set(res.message);
        this.scanValue = '';
        this.scanBusy.set(false);
        this.refresh();
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? err?.error?.title ?? 'Scan failed.');
        this.scanBusy.set(false);
      },
    });
  }

  bulkAdvance(columnId: string): void {
    if (!this.canMove() || !canBulkAdvance(columnId)) return;

    this.moving.set(true);
    this.error.set(null);
    this.message.set(null);
    const hub = this.hubFilter.trim() || undefined;
    this.api.bulkAdvanceColumn(columnId, hub).subscribe({
      next: (res) => {
        this.message.set(res.message);
        this.moving.set(false);
        this.refresh();
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? err?.error?.title ?? 'Bulk move failed.');
        this.moving.set(false);
      },
    });
  }

  onDragStart(event: DragEvent, card: OpsCollectionBoardCardDto, fromColumnId: string): void {
    if (!this.canMove()) {
      event.preventDefault();
      return;
    }
    this.message.set(null);
    this.error.set(null);
    this.dragPayload.set({ card, fromColumnId });
    event.dataTransfer?.setData('text/plain', card.cardKey);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent, toColumnId: string): void {
    const payload = this.dragPayload();
    if (!payload || !this.canMove()) return;

    event.preventDefault();

    if (!canDropOnColumn(payload.fromColumnId, toColumnId)) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      this.dropTargetColumn.set(null);
      this.dropBlockedColumn.set(toColumnId);
      return;
    }

    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropBlockedColumn.set(null);
    this.dropTargetColumn.set(toColumnId);
  }

  onDragLeave(event: DragEvent, columnId: string): void {
    const related = event.relatedTarget as Node | null;
    const current = event.currentTarget as HTMLElement;
    if (related && current.contains(related)) return;
    if (this.dropTargetColumn() === columnId) {
      this.dropTargetColumn.set(null);
    }
    if (this.dropBlockedColumn() === columnId) {
      this.dropBlockedColumn.set(null);
    }
  }

  onDrop(event: DragEvent, toColumnId: string): void {
    event.preventDefault();
    this.dropTargetColumn.set(null);
    this.dropBlockedColumn.set(null);

    const payload = this.dragPayload();
    if (!payload || !this.canMove()) return;

    const { card, fromColumnId } = payload;
    this.onDragEnd();

    if (fromColumnId === toColumnId) return;

    if (!canDropOnColumn(fromColumnId, toColumnId)) {
      this.error.set(dropBlockedMessage(fromColumnId, toColumnId));
      return;
    }

    if (toColumnId === COLLECTION_COLUMN.collected) {
      this.openPickup(card);
      return;
    }

    this.moving.set(true);
    this.api
      .moveBoardItem({
        shipmentId: card.shipmentId,
        fromColumnId,
        toColumnId,
        hubCity: toColumnId === COLLECTION_COLUMN.readyForCollection ? this.scanHubCity : undefined,
      })
      .subscribe({
        next: (res) => {
          this.message.set(res.message);
          this.moving.set(false);
          this.refresh();
        },
        error: (err) => {
          this.error.set(err?.error?.detail ?? err?.error?.title ?? 'Move failed.');
          this.moving.set(false);
        },
      });
  }

  onDragEnd(): void {
    this.dragPayload.set(null);
    this.dropTargetColumn.set(null);
    this.dropBlockedColumn.set(null);
  }

  openPickup(card: OpsCollectionBoardCardDto): void {
    if (!this.canMove()) return;
    if (card.columnId !== COLLECTION_COLUMN.readyForCollection) {
      this.error.set('Only ready-for-collection items can be collected.');
      return;
    }
    this.pickupError.set(null);
    this.pickupCard.set(card);
  }

  confirmPickup(payload: CollectionPickupConfirm): void {
    this.busy.set(true);
    this.pickupError.set(null);
    this.api
      .confirmPickup({
        shipmentId: payload.shipmentId,
        idDocumentType: payload.idDocumentType,
        idNumber: payload.idNumber,
        collectorName: payload.collectorName || undefined,
      })
      .subscribe({
        next: (res) => {
          this.message.set(res.message);
          this.pickupCard.set(null);
          this.busy.set(false);
          this.refresh();
        },
        error: (err) => {
          this.pickupError.set(err?.error?.detail ?? err?.error?.title ?? 'Could not confirm pickup.');
          this.busy.set(false);
        },
      });
  }

  hubAccent(city: string): string {
    if (city.toLowerCase().includes('manzini')) return 'manzini';
    return 'mbabane';
  }
}
