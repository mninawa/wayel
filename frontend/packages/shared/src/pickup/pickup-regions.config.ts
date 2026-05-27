import type { PickupLocationConfig, PickupRegionConfig } from './pickup-location.types';

/**
 * Static pickup location registry by region.
 * Used for Google Maps coordinates, phone numbers, and offline fallback
 * when the API has not yet been enriched.
 */
export const PICKUP_REGIONS: PickupRegionConfig[] = [
  {
    id: 'eswatini',
    label: 'Eswatini',
    flag: '🇸🇿',
    countryCode: 'SZ',
    locations: [
      {
        id: 'mbabane-plaza',
        regionId: 'eswatini',
        name: 'Mbabane New Mall',
        line1: 'New Mall, First Floor, Suite 101',
        line2: 'Dr Sishayi Road',
        city: 'Mbabane',
        region: 'Hhohho Region',
        country: 'Eswatini',
        countryCode: 'SZ',
        postalCode: 'H100',
        poBox: 'P.O. Box 1988',
        phone: '+268 3454 1872',
        phoneAlt: '+268 7842 5197',
        description: 'WeYell pickup point at New Mall, Mbabane — collect your parcels on the first floor.',
        geo: { lat: -26.3197, lng: 31.1345 },
        sortOrder: 1,
      },
      {
        id: 'manzini-hub',
        regionId: 'eswatini',
        name: 'Manzini Hub',
        line1: 'Matsapha Road',
        line2: 'Near NRZ Industrial',
        city: 'Manzini',
        region: 'Manzini Region',
        country: 'Eswatini',
        countryCode: 'SZ',
        description: 'WeYell pickup point in Manzini.',
        geo: { lat: -26.4833, lng: 31.3667 },
        sortOrder: 2,
      },
      {
        id: 'siteki-branch',
        regionId: 'eswatini',
        name: 'Siteki Branch',
        line1: 'Main Street',
        city: 'Siteki',
        region: 'Lubombo Region',
        country: 'Eswatini',
        countryCode: 'SZ',
        description: 'WeYell pickup point in Siteki.',
        geo: { lat: -26.9833, lng: 31.95 },
        sortOrder: 3,
      },
      {
        id: 'nhlangano-branch',
        regionId: 'eswatini',
        name: 'Nhlangano Branch',
        line1: 'Nhlangano Town Centre',
        city: 'Nhlangano',
        region: 'Shiselweni Region',
        country: 'Eswatini',
        countryCode: 'SZ',
        description: 'WeYell pickup point in Nhlangano.',
        geo: { lat: -27.1167, lng: 31.2 },
        sortOrder: 4,
      },
    ],
  },
];

export const ESWATINI_PICKUP_REGION = PICKUP_REGIONS.find((r) => r.id === 'eswatini')!;

export function findPickupRegion(regionId: string): PickupRegionConfig | undefined {
  return PICKUP_REGIONS.find((r) => r.id === regionId);
}

export function findPickupLocationConfig(
  regionId: string,
  locationId: string,
): PickupLocationConfig | undefined {
  return findPickupRegion(regionId)?.locations.find((l) => l.id === locationId);
}