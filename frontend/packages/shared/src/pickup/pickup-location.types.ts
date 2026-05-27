/** Geographic point for map embeds and directions. */
export interface PickupGeoPoint {
  lat: number;
  lng: number;
  /** Google Place ID when known — preferred for embeds. */
  placeId?: string;
}

/**
 * Canonical pickup location configuration shared across apps and regions.
 * Live API branches are merged with static region config via {@link enrichPickupLocation}.
 */
export interface PickupLocationConfig {
  id: string;
  /** Region slug, e.g. `eswatini`, `botswana`. */
  regionId: string;
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  postalCode?: string;
  poBox?: string;
  phone?: string;
  phoneAlt?: string;
  description: string;
  geo?: PickupGeoPoint;
  sortOrder?: number;
}

export interface PickupRegionConfig {
  id: string;
  label: string;
  flag: string;
  countryCode: string;
  locations: PickupLocationConfig[];
}

/** Minimal branch shape returned by the BorderBox pickup-branches API. */
export interface PickupBranchSummary {
  id: string;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  description: string;
  countryCode?: string;
  postalCode?: string;
  poBox?: string;
  phone?: string;
  phoneAlt?: string;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
}
