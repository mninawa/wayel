export const COLLECTION_BASE = '/ops/collection';

export const collectionRoutes = {
  board: COLLECTION_BASE,
} as const;

export const COLLECTION_COLUMN = {
  inTransit: 'in_transit',
  readyForCollection: 'ready_for_collection',
  collected: 'collected',
} as const;

export type CollectionColumnId = (typeof COLLECTION_COLUMN)[keyof typeof COLLECTION_COLUMN];
