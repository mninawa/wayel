/** Mock data for WeYell UI screens (Phase 1 demos). */

export const MOCK_USER = {
  displayName: 'Sabelo Dlamini',
  email: 'sabelo.dlamini@example.com',
  phone: '+268 76 123 4567',
  country: 'Eswatini',
  deliveryMethod: 'Door-to-Door',
  idNumber: '8001011234567',
  kycVerified: true,
};

export const MOCK_SUITE = {
  number: '24789',
  status: 'Expired',
  plan: 'Quarterly',
  priceLabel: 'R200 / 3 months',
  expiredOn: '20 Aug 2026',
  shipOutLocked: true,
  renewMonthly: { label: 'Renew for R100 / 1 Month', price: 100, months: 1 },
  renewQuarterly: { label: 'Renew for R200 / 3 Months', price: 200, months: 3 },
};

export const MOCK_SA_ADDRESS = {
  title: 'WeYell – Suite 24789',
  lines: [
    'Shoprite Checkers Crowthorne',
    'Cnr Old Pretoria Road & Crowthorne Drive',
    'Crowthorne, Midrand, Gauteng, 1685',
    'South Africa',
  ],
};

export const MOCK_PARCELS = [
  {
    id: 'BBSA100563',
    tracking: 'BRC100012345ZA',
    retailer: 'Takealot',
    item: 'Sony WH-1000XM5',
    category: 'Headphones',
    receivedOn: '19 Aug 2026',
    weight: '0.65 kg',
    status: 'Received',
    invoice: 'uploaded' as const,
    declaredValue: 2899,
    dimensions: '30 x 22 x 15 cm',
    daysInWarehouse: 5,
  },
  {
    id: 'BBSA100564',
    tracking: 'BRC100012346ZA',
    retailer: 'Superbalist',
    item: 'Nike Air Max Excee',
    category: "Men's Shoes",
    receivedOn: '18 Aug 2026',
    weight: '1.20 kg',
    status: 'Ready to Ship',
    invoice: 'uploaded' as const,
    declaredValue: 1650,
    dimensions: '35 x 25 x 12 cm',
    daysInWarehouse: 6,
  },
  {
    id: 'BBSA100565',
    tracking: 'BRC100012347ZA',
    retailer: 'Makro',
    item: 'Samsung Galaxy Buds2',
    category: 'Electronics',
    receivedOn: '17 Aug 2026',
    weight: '0.40 kg',
    status: 'Received',
    invoice: 'pending' as const,
    declaredValue: 1299,
    dimensions: '12 x 10 x 8 cm',
    daysInWarehouse: 7,
  },
  {
    id: 'BBSA100566',
    tracking: 'BRC100012348ZA',
    retailer: 'Woolworths',
    item: 'Linen Shirt Bundle',
    category: 'Clothing',
    receivedOn: '16 Aug 2026',
    weight: '0.55 kg',
    status: 'Received',
    invoice: 'uploaded' as const,
    declaredValue: 890,
    dimensions: '28 x 20 x 6 cm',
    daysInWarehouse: 8,
  },
  {
    id: 'BBSA100567',
    tracking: 'BRC100012349ZA',
    retailer: 'Zando',
    item: 'Levi\'s 501 Jeans',
    category: 'Clothing',
    receivedOn: '15 Aug 2026',
    weight: '0.70 kg',
    status: 'Ready to Ship',
    invoice: 'pending' as const,
    declaredValue: 749,
    dimensions: '32 x 24 x 8 cm',
    daysInWarehouse: 9,
  },
  {
    id: 'BBSA100568',
    tracking: 'BRC100012350ZA',
    retailer: 'Dis-Chem',
    item: 'Skincare Gift Set',
    category: 'Health & Beauty',
    receivedOn: '14 Aug 2026',
    weight: '0.85 kg',
    status: 'Received',
    invoice: 'uploaded' as const,
    declaredValue: 520,
    dimensions: '22 x 18 x 10 cm',
    daysInWarehouse: 10,
  },
];

export const MOCK_DASHBOARD_STATS = {
  received: { value: 6, label: 'Parcels in suite' },
  readyToShip: { value: 2, label: 'Awaiting ship-out' },
  inTransit: { value: 1, label: 'On the way to Eswatini' },
  outstanding: { value: 'R650.00', label: 'Due immediately' },
};

export const MOCK_RECENT_ACTIVITY = [
  { item: 'Wireless Headphones', tracking: 'BBSA100563', status: 'Received', date: '19 Aug' },
  { item: 'Nike Air Max Shoes', tracking: 'BBSA100564', status: 'Ready to Ship', date: '18 Aug' },
  { item: 'Samsung Galaxy Buds', tracking: 'BBSA100565', status: 'In Transit', date: '17 Aug' },
  { item: 'Linen Shirt Bundle', tracking: 'BBSA100566', status: 'Delivered', date: '10 Aug' },
];

export const MOCK_QUOTE = {
  id: 'QUO-24789',
  created: '18 Aug 2026',
  validUntil: '25 Aug 2026',
  shipTo: 'Eswatini',
  deliveryEstimate: '4–6 working days',
  total: 1842.5,
  parcels: 2,
  weightKg: 3.2,
  method: 'Air Express',
  consolidation: 'Yes',
  warehouse: 'Midrand, Gauteng',
  breakdown: [
    { label: 'Item Value', amount: 4140 },
    { label: 'International Shipping', amount: 680 },
    { label: 'Insurance', amount: 0 },
    { label: 'Subtotal', amount: 4820 },
    { label: 'Customs Duty (15%)', amount: 621 },
    { label: 'VAT (15%)', amount: 621 },
    { label: 'Processing Fee', amount: 120 },
    { label: 'Payment Handling Fee', amount: 45 },
  ],
};

export const MOCK_SHIPMENT_TIMELINE = [
  { label: 'Received in South Africa', done: true, current: false },
  { label: 'In Transit to Eswatini', done: false, current: true },
  { label: 'Arrived in Eswatini', done: false, current: false },
  { label: 'Out for Delivery', done: false, current: false },
];

export const MOCK_TRACKING = {
  trackingNumber: 'BBSA100563',
  reference: 'SHP-24789-001',
  orderNumber: 'ORD-88291',
  service: 'Standard Delivery',
  weight: '4.20 kg',
  pieces: 1,
  from: 'Midrand, Gauteng, South Africa',
  to: 'Manzini, Eswatini',
  estimatedDelivery: '20 Aug 2026 by 18:00',
  status: 'In Transit',
};

export const MOCK_TICKET = {
  id: 'SUP-12784',
  date: '19 Aug 2026',
  subject: 'Delivery delay inquiry',
  snippet: 'Hi, I wanted to check on the status of my shipment…',
  status: 'Open',
};

export const SUITE_EXPIRED_MESSAGE =
  'Your suite 24789 is still reserved, but parcels cannot be couriered until your suite access is renewed.';

export const MOCK_SUITE_PLANS = [
  { id: 'plan_monthly', name: 'Monthly', months: 1, priceZar: 100, recommended: false },
  { id: 'plan_quarterly', name: 'Quarterly', months: 3, priceZar: 200, recommended: true },
] as const;

export function getParcelById(id: string) {
  return MOCK_PARCELS.find((p) => p.id === id) ?? MOCK_PARCELS[0];
}

export function parcelSummaryFromMock() {
  return {
    total: MOCK_PARCELS.length,
    uploaded: MOCK_PARCELS.filter((p) => p.invoice === 'uploaded').length,
    pending: MOCK_PARCELS.filter((p) => p.invoice === 'pending').length,
    ready: MOCK_PARCELS.filter((p) => p.status === 'Ready to Ship').length,
    inTransit: 0,
    delivered: 0,
  };
}
