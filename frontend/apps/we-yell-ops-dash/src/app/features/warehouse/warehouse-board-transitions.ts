/** Kanban column ids — must match backend WarehouseBoardColumns. */
export const BOARD_COLUMN = {
  received: 'received',
  stored: 'stored',
  readyForQuote: 'ready_for_quote',
  preparingDispatch: 'preparing_dispatch',
  dispatched: 'dispatched',
  exceptionHold: 'exception_hold',
} as const;

export type BoardColumnId = (typeof BOARD_COLUMN)[keyof typeof BOARD_COLUMN];

const PARCEL_TARGETS: Record<string, string[]> = {
  [BOARD_COLUMN.received]: [BOARD_COLUMN.stored, BOARD_COLUMN.exceptionHold],
  [BOARD_COLUMN.stored]: [BOARD_COLUMN.received, BOARD_COLUMN.readyForQuote, BOARD_COLUMN.exceptionHold],
  [BOARD_COLUMN.readyForQuote]: [
    BOARD_COLUMN.stored,
    BOARD_COLUMN.exceptionHold,
    BOARD_COLUMN.preparingDispatch,
  ],
  [BOARD_COLUMN.exceptionHold]: [BOARD_COLUMN.received, BOARD_COLUMN.stored],
};

const SHIPMENT_TARGETS: Record<string, string[]> = {
  [BOARD_COLUMN.preparingDispatch]: [BOARD_COLUMN.dispatched],
};

export function allowedDropTargets(cardType: 'PARCEL' | 'SHIPMENT', fromColumnId: string): string[] {
  const from = fromColumnId.toLowerCase();
  if (cardType === 'SHIPMENT') {
    return SHIPMENT_TARGETS[from] ?? [];
  }
  return PARCEL_TARGETS[from] ?? [];
}

export function canDropOnColumn(
  cardType: 'PARCEL' | 'SHIPMENT',
  fromColumnId: string,
  toColumnId: string,
): boolean {
  return allowedDropTargets(cardType, fromColumnId).includes(toColumnId.toLowerCase());
}

export function dropBlockedMessage(
  cardType: 'PARCEL' | 'SHIPMENT',
  fromColumnId: string,
  toColumnId: string,
  displayId: string,
): string | null {
  if (canDropOnColumn(cardType, fromColumnId, toColumnId)) return null;

  const to = toColumnId.toLowerCase();
  const shipmentColumnIds: readonly string[] = [
    BOARD_COLUMN.preparingDispatch,
    BOARD_COLUMN.dispatched,
  ];
  const shipmentColumns = new Set(shipmentColumnIds);

  if (cardType === 'PARCEL' && shipmentColumns.has(to)) {
    if (to === BOARD_COLUMN.preparingDispatch) {
      return `${displayId} can only move to Preparing Dispatch from Ready for Quote.`;
    }
    return `${displayId} must start in Preparing Dispatch first — drag to that column, or move the shipment card.`;
  }

  if (cardType === 'SHIPMENT' && !shipmentColumns.has(to)) {
    return `Shipment cards cannot move to ${columnLabel(toColumnId)}.`;
  }

  return `Cannot move ${displayId} from ${columnLabel(fromColumnId)} to ${columnLabel(toColumnId)}.`;
}

export function columnLabel(columnId: string): string {
  switch (columnId) {
    case BOARD_COLUMN.received:
      return 'Received';
    case BOARD_COLUMN.stored:
      return 'Stored';
    case BOARD_COLUMN.readyForQuote:
      return 'Ready for Quote';
    case BOARD_COLUMN.preparingDispatch:
      return 'Preparing Dispatch';
    case BOARD_COLUMN.dispatched:
      return 'Dispatched';
    case BOARD_COLUMN.exceptionHold:
      return 'Exception / Hold';
    default:
      return columnId;
  }
}
