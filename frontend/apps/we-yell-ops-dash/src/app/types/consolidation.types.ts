export const CONSOLIDATION_BASE = '/ops/consolidation';

export const consolidationRoutes = {
  inventory: `${CONSOLIDATION_BASE}/inventory`,
  readyShipments: `${CONSOLIDATION_BASE}/ready-shipments`,
  parcel: (parcelId: string) => `/ops/receiving/parcels/${parcelId}`,
} as const;
