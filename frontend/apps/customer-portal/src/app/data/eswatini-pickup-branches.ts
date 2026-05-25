import type { PickupBranch } from '../models/customer-account.models';

/** Offline fallback when GET /borderbox/pickup-branches is unavailable. Live data is in MongoDB `pickup_branches`. */
export const ESWATINI_PICKUP_BRANCHES: PickupBranch[] = [
  {
    id: 'mbabane-plaza',
    name: 'Mbabane Plaza',
    line1: 'Mbabane Plaza Shopping Centre',
    line2: null,
    city: 'Mbabane',
    region: 'Hhohho Region',
    description: 'WeYell pickup point — collect your parcels at Mbabane Plaza.',
  },
  {
    id: 'manzini-hub',
    name: 'Manzini Hub',
    line1: 'Matsapha Road',
    line2: 'Near NRZ Industrial',
    city: 'Manzini',
    region: 'Manzini Region',
    description: 'WeYell pickup point in Manzini.',
  },
  {
    id: 'siteki-branch',
    name: 'Siteki Branch',
    line1: 'Main Street',
    line2: null,
    city: 'Siteki',
    region: 'Lubombo Region',
    description: 'WeYell pickup point in Siteki.',
  },
  {
    id: 'nhlangano-branch',
    name: 'Nhlangano Branch',
    line1: 'Nhlangano Town Centre',
    line2: null,
    city: 'Nhlangano',
    region: 'Shiselweni Region',
    description: 'WeYell pickup point in Nhlangano.',
  },
];

export function findPickupBranch(id: string): PickupBranch | undefined {
  return ESWATINI_PICKUP_BRANCHES.find((b) => b.id === id);
}
