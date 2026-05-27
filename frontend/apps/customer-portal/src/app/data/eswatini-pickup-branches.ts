import type { PickupBranchSummary } from '@wayel/shared/pickup/pickup-location.types';
import { ESWATINI_PICKUP_REGION } from '@wayel/shared/pickup/pickup-regions.config';
import type { PickupBranch } from '../models/customer-account.models';

/** Offline fallback when GET /borderbox/pickup-branches is unavailable. */
export const ESWATINI_PICKUP_BRANCHES: PickupBranch[] = ESWATINI_PICKUP_REGION.locations.map(
  (loc) => ({
    id: loc.id,
    name: loc.name,
    line1: loc.line1,
    line2: loc.line2 ?? null,
    city: loc.city,
    region: loc.region,
    description: loc.description,
    poBox: loc.poBox ?? null,
    postalCode: loc.postalCode,
    countryCode: loc.countryCode,
    phone: loc.phone ?? null,
    phoneAlt: loc.phoneAlt ?? null,
    latitude: loc.geo?.lat ?? null,
    longitude: loc.geo?.lng ?? null,
    googlePlaceId: loc.geo?.placeId ?? null,
  }),
);

export function findPickupBranch(id: string): PickupBranch | undefined {
  return ESWATINI_PICKUP_BRANCHES.find((b) => b.id === id);
}

export function toPickupBranchSummary(branch: PickupBranch): PickupBranchSummary {
  return {
    id: branch.id,
    name: branch.name,
    line1: branch.line1,
    line2: branch.line2,
    city: branch.city,
    region: branch.region,
    description: branch.description,
    countryCode: branch.countryCode,
    postalCode: branch.postalCode,
    poBox: branch.poBox ?? undefined,
    phone: branch.phone ?? undefined,
    phoneAlt: branch.phoneAlt ?? undefined,
    latitude: branch.latitude,
    longitude: branch.longitude,
    googlePlaceId: branch.googlePlaceId,
  };
}
