export const accountRoutes = {
  list: '/ops/accounts',
  detail: (userId: string) => `/ops/accounts/${userId}`,
} as const;

export const DESTINATION_COUNTRIES = [
  { code: 'SZ', label: 'Eswatini' },
  { code: 'BW', label: 'Botswana' },
  { code: 'NA', label: 'Namibia' },
] as const;

export const KYC_STATUS_OPTIONS = [
  'NotStarted',
  'Pending',
  'Verified',
  'Rejected',
] as const;

export const SUITE_STATUS_OPTIONS = [
  'trial',
  'Active',
  'ExpiringSoon',
  'Expired',
  'PendingPayment',
  'Suspended',
  'none',
] as const;
