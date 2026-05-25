import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpsPillComponent, type OpsPillTone } from '../../shared/ops-pill.component';
import { OpsCoverPhotoLoaderService } from '../../services/ops-cover-photo-loader.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { OPS_CAP } from '../../services/ops-permissions';
import {
  WarehouseApiService,
  type OpsWarehouseBoardCardDto,
  type OpsWarehouseBoardColumnDto,
  type OpsWarehouseBoardDto,
} from '../../services/warehouse-api.service';
import { WarehouseBoardDetailComponent } from './warehouse-board-detail.component';
import { canDropOnColumn, columnLabel as boardColumnLabel, BOARD_COLUMN, dropBlockedMessage } from './warehouse-board-transitions';
import {
  WarehouseBoardStoreModalComponent,
  type WarehouseBoardStoreConfirm,
} from './warehouse-board-store-modal.component';
import { formatStorageLocationLabel, suiteLocationId } from './warehouse-location.utils';
import { warehouseRoutes } from '../../types/warehouse.types';

type BoardView = 'kanban' | 'table';

@Component({
  selector: 'ops-warehouse-dashboard',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, OpsPillComponent, WarehouseBoardDetailComponent, WarehouseBoardStoreModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warehouse-dashboard.component.html',
  styleUrl: './warehouse-dashboard.component.css',
})
export class WarehouseDashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(WarehouseApiService);
  private readonly coverPhotos = inject(OpsCoverPhotoLoaderService);
  private readonly session = inject(OpsSessionService);
  private disposeCoverPhotos: (() => void) | null = null;

  readonly routes = warehouseRoutes;

  readonly view = signal<BoardView>('kanban');
  readonly board = signal<OpsWarehouseBoardDto | null>(null);
  readonly selectedCard = signal<OpsWarehouseBoardCardDto | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly moveMessage = signal<string | null>(null);
  readonly moving = signal(false);
  readonly dragPayload = signal<{ card: OpsWarehouseBoardCardDto; fromColumnId: string } | null>(null);
  readonly dropTargetColumn = signal<string | null>(null);
  readonly dropBlockedColumn = signal<string | null>(null);
  readonly storePrompt = signal<{ card: OpsWarehouseBoardCardDto; fromColumnId: string } | null>(null);
  readonly coverImageUrls = signal<Record<string, string>>({});

  readonly canMove = computed(() => this.session.can(OPS_CAP.warehouseWrite));

  searchFilter = '';
  destinationFilter = '';
  serviceFilter = '';

  readonly destinationOptions = computed(() => {
    const b = this.board();
    if (!b) return [];
    return [...new Set(this.allCards(b).map((c) => c.destination).filter(Boolean) as string[])].sort();
  });

  readonly serviceOptions = computed(() => {
    const b = this.board();
    if (!b) return [];
    return [...new Set(this.allCards(b).map((c) => c.deliveryMethod).filter(Boolean) as string[])].sort();
  });

  readonly tableRows = computed(() => {
    const b = this.board();
    if (!b) return [];
    return [...this.allCards(b), ...b.exceptionCards];
  });

  readonly totalItems = computed(() => {
    const b = this.board();
    if (!b) return 0;
    return this.allCards(b).length + b.exceptionCards.length;
  });

  readonly shipmentCount = computed(() => {
    const b = this.board();
    if (!b) return 0;
    return this.allCards(b).filter((c) => c.cardType === 'SHIPMENT').length;
  });

  readonly exceptionCount = computed(() => this.board()?.exceptionCards.length ?? 0);

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.disposeCoverPhotos?.();
  }

  applyFilters(): void {
    this.refresh();
  }

  clearFilters(): void {
    this.searchFilter = '';
    this.destinationFilter = '';
    this.serviceFilter = '';
    this.refresh();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.api
      .getBoard(key, this.searchFilter, this.destinationFilter, this.serviceFilter)
      .subscribe({
        next: (b) => {
          this.board.set(b);
          this.busy.set(false);
          this.loadCoverImages(b);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(this.formatError(err));
        },
      });
  }

  selectCard(card: OpsWarehouseBoardCardDto): void {
    this.selectedCard.set(card);
  }

  coverImageUrl(card: OpsWarehouseBoardCardDto): string | null {
    const photoId = this.coverPhotos.normalizePhotoId(card.coverPhotoId);
    if (!photoId) return null;
    return this.coverImageUrls()[photoId] ?? null;
  }

  private loadCoverImages(board: OpsWarehouseBoardDto): void {
    this.disposeCoverPhotos?.();
    this.disposeCoverPhotos = null;
    this.coverImageUrls.set({});

    const photoIds = [...this.allCards(board), ...board.exceptionCards].map((c) => c.coverPhotoId);
    this.disposeCoverPhotos = this.coverPhotos.load(photoIds, (urls) => {
      this.coverImageUrls.set(urls);
    });
  }

  onDragStart(event: DragEvent, card: OpsWarehouseBoardCardDto, fromColumnId: string): void {
    if (!this.canMove()) {
      event.preventDefault();
      return;
    }
    this.moveMessage.set(null);
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

    if (!canDropOnColumn(payload.card.cardType, payload.fromColumnId, toColumnId)) {
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
    if (fromColumnId === toColumnId) return;

    if (!canDropOnColumn(card.cardType, fromColumnId, toColumnId)) {
      this.error.set(
        dropBlockedMessage(card.cardType, fromColumnId, toColumnId, card.displayId)
          ?? `Cannot move ${card.displayId} from ${boardColumnLabel(fromColumnId)} to ${boardColumnLabel(toColumnId)}.`,
      );
      return;
    }

    const key = this.session.opsKey();
    if (!key) return;

    if (this.needsStorePrompt(toColumnId, card, fromColumnId)) {
      this.storePrompt.set({ card, fromColumnId });
      this.onDragEnd();
      return;
    }

    this.executeMove(key, card, fromColumnId, toColumnId, card.locationId, null);
  }

  completeStoreMove(data: WarehouseBoardStoreConfirm, fromColumnId: string): void {
    const prompt = this.storePrompt();
    this.storePrompt.set(null);
    if (!prompt) return;

    const key = this.session.opsKey();
    if (!key) return;

    this.executeMove(key, prompt.card, fromColumnId, BOARD_COLUMN.stored, data.locationId, data.notes);
  }

  private needsStorePrompt(
    toColumnId: string,
    card: OpsWarehouseBoardCardDto,
    fromColumnId: string,
  ): boolean {
    if (toColumnId !== BOARD_COLUMN.stored || card.cardType !== 'PARCEL') return false;
    if (fromColumnId === BOARD_COLUMN.exceptionHold) return true;
    return !card.locationId;
  }

  private executeMove(
    opsKey: string,
    card: OpsWarehouseBoardCardDto,
    fromColumnId: string,
    toColumnId: string,
    locationId: string | null | undefined,
    reason: string | null,
  ): void {
    this.moving.set(true);
    this.error.set(null);
    this.moveMessage.set(null);

    this.api
      .moveBoardItem(opsKey, {
        cardKey: card.cardKey,
        fromColumnId,
        toColumnId,
        locationId,
        reason,
      })
      .subscribe({
        next: (result) => {
          this.moving.set(false);
          this.moveMessage.set(result.message);
          this.selectedCard.set(null);
          this.refresh();
        },
        error: (err) => {
          this.moving.set(false);
          this.error.set(this.formatMoveError(err, fromColumnId, toColumnId));
        },
      });
  }

  onDragEnd(): void {
    this.dragPayload.set(null);
    this.dropTargetColumn.set(null);
    this.dropBlockedColumn.set(null);
  }

  cardTitle(card: OpsWarehouseBoardCardDto): string {
    if (card.cardType === 'SHIPMENT') {
      return card.customerDisplayName ?? card.title;
    }
    return card.title?.trim() || card.displayId;
  }

  cardMeta(card: OpsWarehouseBoardCardDto): string | null {
    const parts: string[] = [];
    if (card.cardType === 'PARCEL' && card.customerDisplayName) {
      parts.push(card.customerDisplayName);
    }
    const loc = this.storageLabel(card);
    if (loc) parts.push(loc);
    if (card.cardType === 'SHIPMENT') {
      if (card.destination) parts.push(card.destination);
      if (card.deliveryMethod) parts.push(card.deliveryMethod);
    }
    if (card.isOverdue && card.overdueMinutes) {
      parts.push(`Overdue ${card.overdueMinutes}m`);
    } else if (card.dispatchByUtc && card.columnId === BOARD_COLUMN.preparingDispatch) {
      parts.push(
        `Dispatch by ${new Date(card.dispatchByUtc).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      );
    } else if (card.receivedAtUtc && card.columnId === BOARD_COLUMN.received) {
      parts.push(
        `Received ${new Date(card.receivedAtUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      );
    }
    return parts.length ? parts.join(' · ') : null;
  }

  showPriority(card: OpsWarehouseBoardCardDto): boolean {
    return this.priorityLabel(card) !== 'Low';
  }

  coverIcon(card: OpsWarehouseBoardCardDto): string {
    return card.cardType === 'SHIPMENT' ? 'local_shipping' : 'inventory_2';
  }

  storageLabel(card: OpsWarehouseBoardCardDto): string | null {
    if (!card.locationId) return null;
    const suiteLoc = suiteLocationId(card.suiteNumber);
    if (suiteLoc && card.locationId.toUpperCase() === suiteLoc.toUpperCase()) {
      return null;
    }
    const label = formatStorageLocationLabel(card.locationId, card.suiteNumber);
    if (!label) return null;
    return label.startsWith('Suite ') ? label : `Slot: ${label}`;
  }

  priorityLabel(card: OpsWarehouseBoardCardDto): string {
    if (card.isOverdue || card.issueSummary) return 'High';
    if (card.columnId === BOARD_COLUMN.preparingDispatch || card.dispatchByUtc) return 'Medium';
    return 'Low';
  }

  priorityClass(card: OpsWarehouseBoardCardDto): string {
    const label = this.priorityLabel(card).toLowerCase();
    return label;
  }

  categoryTag(card: OpsWarehouseBoardCardDto): string {
    if (card.cardType === 'SHIPMENT') return 'Shipment';
    if (card.retailer) return card.retailer.length > 18 ? `${card.retailer.slice(0, 16)}…` : card.retailer;
    return 'Parcel';
  }

  statusPillClass(card: OpsWarehouseBoardCardDto): string {
    const tone = this.statusTone(card);
    if (tone === 'red') return 'red';
    if (tone === 'green') return 'green';
    if (tone === 'orange') return 'orange';
    if (tone === 'gray') return 'gray';
    return 'blue';
  }

  columnLabel(columnId: string): string {
    const col = this.board()?.columns.find((c) => c.columnId === columnId);
    return col?.label ?? columnId;
  }

  statusTone(card: OpsWarehouseBoardCardDto): OpsPillTone {
    const label = card.statusLabel.toLowerCase();
    if (card.issueSummary || label.includes('hold')) return 'red';
    if (label.includes('overdue') || card.isOverdue) return 'red';
    if (label.includes('dispatch') || label.includes('courier')) return 'blue';
    if (label.includes('paid') || label.includes('quote')) return 'orange';
    if (label.includes('stored')) return 'green';
    if (label.includes('picked') || label.includes('packing')) return 'blue';
    if (label.includes('unmatched')) return 'gray';
    return 'blue';
  }

  retailerInitial(retailer: string): string {
    return retailer.trim().charAt(0).toUpperCase() || '?';
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  private allCards(b: OpsWarehouseBoardDto): OpsWarehouseBoardCardDto[] {
    return b.columns.flatMap((c: OpsWarehouseBoardColumnDto) => c.cards);
  }

  private formatMoveError(err: unknown, _fromColumnId: string, toColumnId: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return 'Your warehouse session expired. Sign in again to continue.';
      const body = err.error as { detail?: string; message?: string; title?: string } | null;
      const detail = body?.detail ?? body?.message ?? body?.title;
      if (detail) return detail;
      return `Could not move item to ${boardColumnLabel(toColumnId)}.`;
    }
    return `Could not move item to ${boardColumnLabel(toColumnId)}.`;
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return 'Your warehouse session expired. Sign in again to continue.';
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? 'Could not load warehouse board.';
    }
    return 'Could not load warehouse board.';
  }
}
