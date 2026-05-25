import type {
  OpsDispatchManifestDetailDto,
  OpsDispatchManifestDto,
} from '../services/warehouse-api.service';

export interface ManifestShipmentRow {
  shipmentId: string;
  displayId: string;
  customer: string;
  destination: string;
  packages: number;
  weightKg: number;
  labelStatus: 'Printed' | 'Pending';
}

export interface ManifestHandoverCheck {
  label: string;
  done: boolean;
}

export interface ManifestDetailPreview {
  destinationRegion: string;
  totalPackages: number;
  totalWeightKg: number;
  shipments: ManifestShipmentRow[];
  checks: ManifestHandoverCheck[];
}

export interface StatusDistributionSegment {
  status: string;
  label: string;
  count: number;
  pct: number;
  tone: string;
}

const COURIERS = ['PUDO', 'Blue Dart', 'Delhivery', 'Ekart', 'Fastway'];

export function courierTone(courier: string): string {
  const c = courier.toLowerCase();
  if (c.includes('pudo')) return 'purple';
  if (c.includes('blue')) return 'blue';
  if (c.includes('delhi')) return 'orange';
  if (c.includes('ekart')) return 'teal';
  return 'gray';
}

export function manifestStatusTone(status: string): string {
  const s = status.toUpperCase();
  if (s === 'HANDED_OVER') return 'green';
  if (s === 'READY') return 'green';
  if (s === 'PRINTED') return 'blue';
  if (s === 'DRAFT') return 'gray';
  if (s === 'CANCELLED') return 'red';
  return 'gray';
}

export function manifestStatusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === 'HANDED_OVER') return 'Handed over';
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function estimatePackages(manifest: OpsDispatchManifestDto): number {
  return Math.max(manifest.shipmentCount, Math.round(manifest.shipmentCount * 1.4));
}

export function estimateWeightKg(manifest: OpsDispatchManifestDto): number {
  let hash = 0;
  for (let i = 0; i < manifest.manifestId.length; i++) {
    hash += manifest.manifestId.charCodeAt(i);
  }
  const base = 8 + (hash % 40);
  return Math.round(manifest.shipmentCount * base * 10) / 10;
}

/**
 * Maps the server-side manifest detail payload onto the UI shape used by the
 * dispatch dashboard. The backend already aggregates packages, weight and
 * label state per shipment, so this is a pure DTO -> view-model conversion
 * (no client-side hashing or sample data).
 */
export function fromManifestDetail(detail: OpsDispatchManifestDetailDto): ManifestDetailPreview {
  return {
    destinationRegion: detail.shipments[0]?.destination ?? '—',
    totalPackages: detail.totalPackages,
    totalWeightKg: detail.totalWeightKg,
    shipments: detail.shipments.map<ManifestShipmentRow>((s) => ({
      shipmentId: s.shipmentId,
      displayId: s.displayId,
      customer: s.customer,
      destination: s.destination,
      packages: s.packages,
      weightKg: s.weightKg,
      labelStatus: s.labelStatus === 'Pending' ? 'Pending' : 'Printed',
    })),
    checks: detail.checks.map<ManifestHandoverCheck>((c) => ({
      label: c.label,
      done: c.done,
    })),
  };
}

export function computeStatusDistribution(
  items: OpsDispatchManifestDto[],
): StatusDistributionSegment[] {
  const statuses = ['DRAFT', 'READY', 'PRINTED', 'HANDED_OVER', 'CANCELLED'] as const;
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    READY: 'Ready',
    PRINTED: 'Printed',
    HANDED_OVER: 'Handed over',
    CANCELLED: 'Cancelled',
  };
  const tones: Record<string, string> = {
    DRAFT: 'gray',
    READY: 'green',
    PRINTED: 'blue',
    HANDED_OVER: 'dark-green',
    CANCELLED: 'pink',
  };
  const total = items.length || 1;
  return statuses
    .map((status) => {
      const count = items.filter((i) => i.status.toUpperCase() === status).length;
      return {
        status,
        label: labels[status] ?? status,
        count,
        pct: Math.round((count / total) * 100),
        tone: tones[status] ?? 'gray',
      };
    })
    .filter((s) => s.count > 0);
}

export const COURIER_FILTER_OPTIONS = ['', ...COURIERS];

export const STATUS_FILTER_OPTIONS = [
  '',
  'DRAFT',
  'READY',
  'PRINTED',
  'HANDED_OVER',
  'CANCELLED',
];
