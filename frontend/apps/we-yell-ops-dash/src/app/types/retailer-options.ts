/** Retailers / order sources when receiving parcels in ops. */
export const RETAILER_OPTIONS = [
  'Takealot',
  'Shein',
  'Superbalist',
  'Makro',
  'Woolworths',
  'Zando',
  'Dis-Chem',
  'Incredible Connection',
  'Cape Union Mart',
  'Bash',
  'Mr Price',
  'Temu',
  'AliExpress',
  'Amazon US',
  'eBay',
  'Walmart',
  'Other',
] as const;

export type RetailerOption = (typeof RETAILER_OPTIONS)[number];

/** OCR patterns — ids must match {@link RETAILER_OPTIONS} entries. */
export const RETAILER_OCR_PATTERNS: { id: RetailerOption; re: RegExp }[] = [
  { id: 'Takealot', re: /\btakealot\b/i },
  { id: 'Shein', re: /\bshein\b/i },
  { id: 'Superbalist', re: /\bsuperbalist\b/i },
  { id: 'Makro', re: /\bmakro\b/i },
  { id: 'Woolworths', re: /\bwoolworths\b/i },
  { id: 'Zando', re: /\bzando\b/i },
  { id: 'Dis-Chem', re: /\bdis[\s-]?chem\b/i },
  { id: 'Incredible Connection', re: /\bincredible\s+connection\b/i },
  { id: 'Cape Union Mart', re: /\bcape\s+union\s+mart\b/i },
  { id: 'Bash', re: /\bbash\b/i },
  { id: 'Mr Price', re: /\bmr\s*price\b|\bmrp\b/i },
  { id: 'Temu', re: /\btemu\b/i },
  { id: 'AliExpress', re: /\baliexpress\b|\bali\s*express\b/i },
  { id: 'Amazon US', re: /\bamazon(?:\.com)?\b/i },
  { id: 'Walmart', re: /\bwalmart\b/i },
  { id: 'eBay', re: /\bebay\b/i },
];

export function retailerBadgeLetter(retailer: string): string {
  if (retailer.startsWith('Amazon')) return 'a';
  if (retailer === 'Takealot') return 'T';
  if (retailer === 'Shein') return 'S';
  return retailer.slice(0, 1).toUpperCase();
}

export function isRetailerOption(value: string): value is RetailerOption {
  return (RETAILER_OPTIONS as readonly string[]).includes(value);
}
