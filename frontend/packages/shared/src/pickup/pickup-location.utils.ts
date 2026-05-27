import type {
  PickupBranchSummary,
  PickupLocationConfig,
} from './pickup-location.types';

export function formatPickupAddress(location: PickupLocationConfig): string {
  const lines = [
    location.line1,
    location.line2,
    [location.city, location.region, location.postalCode].filter(Boolean).join(', '),
    location.country,
  ].filter((line): line is string => !!line && line.trim().length > 0);
  return lines.join('\n');
}

export function formatPickupAddressInline(location: PickupLocationConfig): string {
  return formatPickupAddress(location).replace(/\n/g, ', ');
}

export function pickupMapsQuery(location: PickupLocationConfig): string {
  if (location.geo?.placeId) {
    return `place_id:${location.geo.placeId}`;
  }
  if (location.geo) {
    return `${location.geo.lat},${location.geo.lng}`;
  }
  return formatPickupAddressInline(location);
}

export function googleMapsSearchUrl(location: PickupLocationConfig): string {
  const query = encodeURIComponent(pickupMapsQuery(location));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function googleMapsDirectionsUrl(location: PickupLocationConfig): string {
  const destination = encodeURIComponent(pickupMapsQuery(location));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function googleMapsEmbedUrl(
  location: PickupLocationConfig,
  apiKey: string,
): string | null {
  const key = apiKey.trim();
  if (!key) return null;
  const q = encodeURIComponent(pickupMapsQuery(location));
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${q}&zoom=16`;
}

export function formatPickupPhoneDisplay(phone?: string, phoneAlt?: string): string | null {
  const parts = [phone, phoneAlt].filter((p): p is string => !!p?.trim());
  return parts.length > 0 ? parts.join(' / ') : null;
}

/** Merge API branch data with static region config (config wins for geo/contact). */
export function enrichPickupLocation(
  branch: PickupBranchSummary,
  regionId: string,
  config?: PickupLocationConfig | null,
): PickupLocationConfig {
  const geoFromApi =
    branch.latitude != null && branch.longitude != null
      ? {
          lat: branch.latitude,
          lng: branch.longitude,
          placeId: branch.googlePlaceId ?? undefined,
        }
      : undefined;

  return {
    id: branch.id,
    regionId: config?.regionId ?? regionId,
    name: branch.name || config?.name || branch.id,
    line1: branch.line1 || config?.line1 || '',
    line2: branch.line2 ?? config?.line2 ?? null,
    city: branch.city || config?.city || '',
    region: branch.region || config?.region || '',
    country: config?.country ?? 'Eswatini',
    countryCode: branch.countryCode || config?.countryCode || 'SZ',
    postalCode: branch.postalCode || config?.postalCode,
    poBox: branch.poBox || config?.poBox,
    phone: branch.phone || config?.phone,
    phoneAlt: branch.phoneAlt || config?.phoneAlt,
    description: branch.description || config?.description || '',
    geo: config?.geo ?? geoFromApi,
    sortOrder: config?.sortOrder,
  };
}

export function findPickupConfigById(
  configs: PickupLocationConfig[],
  id: string,
): PickupLocationConfig | undefined {
  return configs.find((c) => c.id === id);
}
