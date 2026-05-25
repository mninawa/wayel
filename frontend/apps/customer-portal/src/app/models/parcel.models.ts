/** Parcel list + detail view models (API + mock). */

export type InvoiceStatus = 'Pending' | 'Uploaded';

export interface ParcelPhoto {
  id: string;
  url: string;
  caption: string | null;
  capturedAtUtc: string | null;
}

export interface ParcelListItem {
  id: string;
  retailer: string;
  trackingNumber: string | null;
  itemName: string;
  category: string;
  status: string;
  weightKg: number | null;
  declaredValueZar: number | null;
  dimensionsLabel?: string | null;
  receivedAtUtc: string;
  invoiceStatus: InvoiceStatus;
  invoiceFileName: string | null;
  quoteState?: string;
  quoteStateLabel?: string;
  openQuoteId?: string | null;
  openQuoteDisplayNumber?: string | null;
  shipmentId?: string | null;
  canRequestQuote?: boolean;
  quoteRequestBlocker?: string | null;
}

export interface ParcelDetail extends ParcelListItem {
  suiteNumber: string;
  dimensionsLabel: string | null;
  daysInWarehouse: number;
  invoiceFileSizeBytes: number | null;
  invoiceUploadedAtUtc: string | null;
  canUploadInvoice: boolean;
  invoiceDownloadUrl?: string | null;
  photos: ParcelPhoto[];
}

export interface ParcelSummary {
  total: number;
  uploaded: number;
  pending: number;
  ready: number;
}

export function formatParcelDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatParcelDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Customer-facing parcel reference (e.g. BBSA-019E5454-A1B2). */
export function formatParcelReference(parcelId: string): string {
  const compact = parcelId.replace(/-/g, '').toUpperCase();
  if (compact.length <= 8) return `BBSA-${compact}`;
  return `BBSA-${compact.slice(0, 8)}-${compact.slice(-4)}`;
}

export function formatDimensionsLabel(label: string | null): string {
  if (!label?.trim()) return '—';
  const normalized = label
    .replace(/cm/gi, '')
    .replace(/[x×]/gi, ' × ')
    .trim();
  if (normalized.includes('×')) {
    return `${normalized} cm`;
  }
  return label;
}

export function formatWeight(kg: number | null): string {
  if (kg == null) return '—';
  return `${kg.toFixed(2)} kg`;
}

export function invoiceUiStatus(status: InvoiceStatus): 'uploaded' | 'pending' {
  return status === 'Uploaded' ? 'uploaded' : 'pending';
}

/** Human-readable parcel warehouse status (API returns enum names). */
export function parcelStatusLabel(status: string): string {
  const s = status.toLowerCase().replace(/\s+/g, '');
  if (s.includes('ready')) return 'Ready to ship';
  if (s.includes('received')) return 'Received';
  if (s.includes('awaiting')) return 'Awaiting invoice';
  if (s.includes('inshipment') || s.includes('intransit')) return 'In shipment';
  if (s.includes('delivered')) return 'Delivered';
  return status.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function parcelStatusPillClass(status: string): string {
  const s = status.toLowerCase().replace(/\s+/g, '');
  if (s.includes('ready')) return 'bb-pill bb-pill-ready';
  if (s.includes('inshipment') || s.includes('intransit')) return 'bb-pill bb-pill-transit';
  if (s.includes('awaiting')) return 'bb-pill bb-pill-awaiting';
  if (s.includes('delivered')) return 'bb-pill bb-pill-delivered';
  return 'bb-pill bb-pill-received';
}

export function parcelInShipment(status: string): boolean {
  const s = status.toLowerCase().replace(/\s+/g, '');
  return s.includes('inshipment') || s.includes('delivered');
}

export function parcelReadyToShip(status: string): boolean {
  const s = status.toLowerCase().replace(/\s+/g, '');
  return s.includes('ready');
}

export function quoteStatusPillClass(quoteState?: string, quoteStateLabel?: string): string {
  const q = `${quoteState ?? ''} ${quoteStateLabel ?? ''}`.toLowerCase().replace(/\s+/g, '');
  if (q.includes('notquoted')) return 'bb-pill pill-quote-muted';
  if (q.includes('inquote') || q.includes('quoterequested')) return 'bb-pill pill-quote-active';
  if (q.includes('quoted') || q.includes('quoteapproved')) return 'bb-pill pill-quote-active';
  if (q.includes('expired')) return 'bb-pill pill-quote-expired';
  if (q.includes('inshipment') || q.includes('shipped')) return 'bb-pill pill-quote-transit';
  return 'bb-pill pill-quote-muted';
}

export function isReadyToQuoteParcel(p: ParcelListItem): boolean {
  if (typeof p.canRequestQuote === 'boolean') {
    return p.canRequestQuote;
  }
  if (!parcelReadyToShip(p.status)) return false;
  const q = `${p.quoteState ?? ''} ${p.quoteStateLabel ?? ''}`.toLowerCase().replace(/\s+/g, '');
  return q.includes('notquoted') || q.length === 0;
}

/** Parcels eligible for a new quote request (matches API {@link ParcelListItem.canRequestQuote}). */
export function isQuoteEligibleParcel(p: ParcelListItem): boolean {
  return isReadyToQuoteParcel(p);
}

export interface ParcelPageMetrics {
  total: number;
  readyToQuote: number;
  inShipment: number;
  invoicesPending: number;
  ready: number;
  uploaded: number;
}

export function computeParcelPageMetrics(items: ParcelListItem[]): ParcelPageMetrics {
  const uploaded = items.filter((p) => p.invoiceStatus === 'Uploaded').length;
  return {
    total: items.length,
    readyToQuote: items.filter((p) => isReadyToQuoteParcel(p)).length,
    inShipment: items.filter((p) => parcelInShipment(p.status)).length,
    invoicesPending: items.length - uploaded,
    ready: items.filter((p) => parcelReadyToShip(p.status)).length,
    uploaded,
  };
}
