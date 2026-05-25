/** Location id for a customer's suite slot in the warehouse. */
export function suiteLocationId(suiteNumber: string | null | undefined): string | null {
  const trimmed = suiteNumber?.trim();
  if (!trimmed) return null;
  return `SUITE-${trimmed}`;
}

export function isSuiteLocationId(locationId: string | null | undefined): boolean {
  return (locationId?.trim().toUpperCase() ?? '').startsWith('SUITE-');
}

/** Human-readable label for a storage slot on board cards and inventory. */
export function formatStorageLocationLabel(
  locationId: string | null | undefined,
  suiteNumber: string | null | undefined,
): string | null {
  if (!locationId?.trim()) return null;
  const trimmed = locationId.trim();
  if (isSuiteLocationId(trimmed) && suiteNumber?.trim()) {
    return `Suite ${suiteNumber.trim()}`;
  }
  if (suiteNumber?.trim() && /postbox/i.test(trimmed)) {
    return `Suite ${suiteNumber.trim()}`;
  }
  return trimmed;
}

export function locationOptionLabel(
  locationId: string,
  zone: string,
  occupancy: number,
  capacity: number,
  suiteNumber: string | null | undefined,
): string {
  if (isSuiteLocationId(locationId) && suiteNumber?.trim()) {
    return `Suite ${suiteNumber.trim()} (${occupancy}/${capacity} parcels)`;
  }
  return `${locationId} — ${zone} (${occupancy}/${capacity})`;
}
