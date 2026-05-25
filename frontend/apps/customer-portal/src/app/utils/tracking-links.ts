import type { ParcelListItem } from '../models/parcel.models';
import { parcelInShipment } from '../models/parcel.models';

export function canTrackParcel(p: ParcelListItem): boolean {
  return (
    !!p.shipmentId ||
    parcelInShipment(p.status) ||
    p.quoteState === 'InShipment'
  );
}

/** Route to live shipment tracking (API-backed). */
export function trackParcelRoute(p: ParcelListItem): string[] | null {
  if (!canTrackParcel(p)) return null;
  if (p.shipmentId) return ['/shipments', p.shipmentId, 'track'];
  return ['/parcels', p.id, 'track'];
}
