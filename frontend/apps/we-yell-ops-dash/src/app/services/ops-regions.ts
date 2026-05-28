/** Mirrors backend <see cref="OpsRegions"/> — functional areas of the ops console. */
export const OPS_REGION = {
  receiving: 'receiving',
  collection: 'collection',
  warehouse: 'warehouse',
  platform: 'platform',
} as const;

export type OpsRegion = (typeof OPS_REGION)[keyof typeof OPS_REGION];

export const OPS_REGION_LABELS: Record<OpsRegion, string> = {
  receiving: 'Receiving (South Africa)',
  collection: 'Collection (Eswatini)',
  warehouse: 'Warehouse',
  platform: 'Platform admin',
};

export const OPS_ROLE_REGION_PRESETS: Record<string, OpsRegion[]> = {
  lead: [
    OPS_REGION.receiving,
    OPS_REGION.collection,
    OPS_REGION.warehouse,
    OPS_REGION.platform,
  ],
  clerk: [OPS_REGION.receiving, OPS_REGION.warehouse, OPS_REGION.collection],
  finance: [OPS_REGION.receiving, OPS_REGION.platform],
  receiver: [OPS_REGION.receiving],
  collector: [OPS_REGION.collection],
};

export function normalizeOpsRegions(values: readonly string[] | undefined | null): OpsRegion[] {
  const allowed = new Set<string>(Object.values(OPS_REGION));
  const out: OpsRegion[] = [];
  for (const raw of values ?? []) {
    const v = raw?.trim().toLowerCase();
    if (!v || !allowed.has(v) || out.includes(v as OpsRegion)) {
      continue;
    }
    out.push(v as OpsRegion);
  }
  return out;
}

export function regionsForRole(role: string, stored?: readonly string[] | null): OpsRegion[] {
  const explicit = normalizeOpsRegions(stored);
  if (explicit.length > 0) {
    return explicit;
  }
  return OPS_ROLE_REGION_PRESETS[role.trim().toLowerCase()] ?? [OPS_REGION.receiving];
}

export function defaultHomePath(regions: readonly OpsRegion[]): string {
  if (regions.includes(OPS_REGION.collection) && !regions.includes(OPS_REGION.receiving)) {
    return '/ops/collection';
  }
  if (regions.includes(OPS_REGION.receiving)) {
    return '/ops/receiving/new';
  }
  if (regions.includes(OPS_REGION.collection)) {
    return '/ops/collection';
  }
  if (regions.includes(OPS_REGION.warehouse)) {
    return '/ops/warehouse';
  }
  return '/ops/receiving';
}
