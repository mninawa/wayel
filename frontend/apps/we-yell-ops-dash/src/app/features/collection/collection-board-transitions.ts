import { COLLECTION_COLUMN, type CollectionColumnId } from '../../types/collection.types';

export { COLLECTION_COLUMN };

export function canDropOnColumn(fromColumnId: string, toColumnId: string): boolean {
  if (fromColumnId === toColumnId) return false;
  if (fromColumnId === COLLECTION_COLUMN.inTransit && toColumnId === COLLECTION_COLUMN.readyForCollection) {
    return true;
  }
  if (fromColumnId === COLLECTION_COLUMN.readyForCollection && toColumnId === COLLECTION_COLUMN.inTransit) {
    return true;
  }
  if (fromColumnId === COLLECTION_COLUMN.readyForCollection && toColumnId === COLLECTION_COLUMN.collected) {
    return true;
  }
  return false;
}

export function nextColumnId(columnId: string): CollectionColumnId | null {
  switch (columnId) {
    case COLLECTION_COLUMN.inTransit:
      return COLLECTION_COLUMN.readyForCollection;
    case COLLECTION_COLUMN.readyForCollection:
      return COLLECTION_COLUMN.collected;
    default:
      return null;
  }
}

export function canBulkAdvance(columnId: string): boolean {
  return columnId === COLLECTION_COLUMN.inTransit;
}

export function bulkAdvanceLabel(columnId: string): string {
  if (columnId === COLLECTION_COLUMN.inTransit) {
    return 'Move all to Ready for Collection';
  }
  return 'Move all to next step';
}

export function dropBlockedMessage(fromColumnId: string, toColumnId: string): string {
  if (toColumnId === COLLECTION_COLUMN.collected && fromColumnId === COLLECTION_COLUMN.inTransit) {
    return 'Move to Ready for Collection first, then collect with ID proof.';
  }
  if (toColumnId === COLLECTION_COLUMN.collected) {
    return 'Use Collect or drop here to record ID proof.';
  }
  return 'This move is not allowed.';
}

export function columnLabel(columnId: string): string {
  switch (columnId) {
    case COLLECTION_COLUMN.inTransit:
      return 'In Transit';
    case COLLECTION_COLUMN.readyForCollection:
      return 'Ready for Collection';
    case COLLECTION_COLUMN.collected:
      return 'Collected';
    default:
      return columnId.replace(/_/g, ' ');
  }
}
