export const WAREHOUSE_BASE = '/ops/warehouse';

export const warehouseRoutes = {
  dashboard: WAREHOUSE_BASE,
  locations: `${WAREHOUSE_BASE}/locations`,
  storage: (parcelId: string) => `${WAREHOUSE_BASE}/storage/${parcelId}`,
  movements: `${WAREHOUSE_BASE}/movements`,
  picking: `${WAREHOUSE_BASE}/picking`,
  pickingTask: (taskId: string) => `${WAREHOUSE_BASE}/picking/${taskId}`,
  packing: `${WAREHOUSE_BASE}/packing`,
  packingShipment: (shipmentId: string) => `${WAREHOUSE_BASE}/packing/${shipmentId}`,
  dispatchStaging: `${WAREHOUSE_BASE}/dispatch-staging`,
  manifests: `${WAREHOUSE_BASE}/manifests`,
  parcel: (parcelId: string) => `/ops/receiving/parcels/${parcelId}`,
} as const;
