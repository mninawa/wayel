/** Domain types from WeYell Ops Parcel Receiving build document. */

export type ParcelStatus =
  | 'RECEIVED'
  | 'UNMATCHED'
  | 'PARTIAL_MATCH'
  | 'MATCHED'
  | 'INSPECTED'
  | 'AWAITING_INVOICE'
  | 'INVOICE_UNDER_REVIEW'
  | 'INVOICED'
  | 'READY_FOR_QUOTE'
  | 'ON_HOLD'
  | 'EXCEPTION'
  | 'RESTRICTED'
  | 'DAMAGED';

export type InvoiceStatus =
  | 'NOT_UPLOADED'
  | 'UPLOADED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';

export type ConditionStatus =
  | 'NOT_INSPECTED'
  | 'GOOD'
  | 'MINOR_DAMAGE'
  | 'MAJOR_DAMAGE'
  | 'OTHER';

export type QuoteReadiness =
  | 'NOT_READY'
  | 'READY'
  | 'BLOCKED'
  | 'SENT_TO_QUOTE_QUEUE';

export type ExceptionType =
  | 'UNIDENTIFIED'
  | 'MISSING_INVOICE'
  | 'DAMAGED'
  | 'RESTRICTED'
  | 'DUPLICATE_TRACKING'
  | 'INVALID_SUITE';

export const RECEIVING_BASE = '/ops/receiving';

export const receivingRoutes = {
  dashboard: RECEIVING_BASE,
  /** @deprecated Use {@link dashboard} — kept for old links. */
  queue: RECEIVING_BASE,
  newParcel: `${RECEIVING_BASE}/new`,
  matching: (parcelId: string) => `${RECEIVING_BASE}/matching/${parcelId}`,
  parcel: (parcelId: string) => `${RECEIVING_BASE}/parcels/${parcelId}`,
  inspection: (parcelId: string) => `${RECEIVING_BASE}/parcels/${parcelId}/inspection`,
  invoice: (parcelId: string) => `${RECEIVING_BASE}/parcels/${parcelId}/invoice`,
  exceptions: `${RECEIVING_BASE}/exceptions`,
  readyForQuote: `${RECEIVING_BASE}/ready-for-quote`,
} as const;
