/**
 * Product categories aligned with Google Product Taxonomy (top-level + common
 * subcategories). Used for parcel intake, customs, and quote workflows.
 * @see https://www.google.com/basepages/producttype/taxonomy.en-US.txt
 */

export interface EcommerceSubcategory {
  id: string;
  label: string;
}

export interface EcommerceCategoryGroup {
  /** Stable slug stored in API payloads (prefix of taxonomy path). */
  id: string;
  label: string;
  subcategories: EcommerceSubcategory[];
}

export const ECOMMERCE_CATEGORY_GROUPS: EcommerceCategoryGroup[] = [
  {
    id: 'apparel_accessories',
    label: 'Apparel & Accessories',
    subcategories: [
      { id: 'clothing', label: 'Clothing' },
      { id: 'shoes', label: 'Shoes' },
      { id: 'handbags', label: 'Handbags & Wallets' },
      { id: 'jewelry', label: 'Jewelry' },
      { id: 'watches', label: 'Watches' },
      { id: 'sunglasses', label: 'Sunglasses & Eyewear' },
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    subcategories: [
      { id: 'computers', label: 'Computers & Tablets' },
      { id: 'phones', label: 'Cell Phones & Accessories' },
      { id: 'tv_audio', label: 'TV, Audio & Video' },
      { id: 'cameras', label: 'Cameras & Photography' },
      { id: 'gaming', label: 'Video Games & Consoles' },
      { id: 'wearables', label: 'Wearable Technology' },
      { id: 'components', label: 'Computer Components' },
    ],
  },
  {
    id: 'home_garden',
    label: 'Home & Garden',
    subcategories: [
      { id: 'kitchen', label: 'Kitchen & Dining' },
      { id: 'furniture', label: 'Furniture' },
      { id: 'decor', label: 'Home Decor' },
      { id: 'bedding', label: 'Bedding & Bath' },
      { id: 'appliances', label: 'Household Appliances' },
      { id: 'tools_garden', label: 'Garden & Outdoor' },
    ],
  },
  {
    id: 'health_beauty',
    label: 'Health & Beauty',
    subcategories: [
      { id: 'skincare', label: 'Skin Care' },
      { id: 'makeup', label: 'Makeup' },
      { id: 'hair', label: 'Hair Care' },
      { id: 'fragrance', label: 'Fragrance' },
      { id: 'personal_care', label: 'Personal Care' },
      { id: 'vitamins', label: 'Vitamins & Supplements' },
    ],
  },
  {
    id: 'sporting_goods',
    label: 'Sporting Goods',
    subcategories: [
      { id: 'fitness', label: 'Exercise & Fitness' },
      { id: 'outdoor', label: 'Outdoor Recreation' },
      { id: 'team_sports', label: 'Team Sports' },
      { id: 'cycling', label: 'Cycling' },
    ],
  },
  {
    id: 'toys_games',
    label: 'Toys & Games',
    subcategories: [
      { id: 'action_figures', label: 'Action Figures & Dolls' },
      { id: 'building', label: 'Building & Construction Toys' },
      { id: 'board_games', label: 'Board & Card Games' },
      { id: 'educational', label: 'Educational Toys' },
    ],
  },
  {
    id: 'baby_toddler',
    label: 'Baby & Toddler',
    subcategories: [
      { id: 'nursery', label: 'Nursery & Bedding' },
      { id: 'feeding', label: 'Feeding' },
      { id: 'gear', label: 'Baby Gear & Car Seats' },
      { id: 'diapering', label: 'Diapering' },
    ],
  },
  {
    id: 'automotive',
    label: 'Vehicles & Parts',
    subcategories: [
      { id: 'parts', label: 'Replacement Parts' },
      { id: 'accessories', label: 'Car Electronics & Accessories' },
      { id: 'tools_equipment', label: 'Tools & Equipment' },
    ],
  },
  {
    id: 'office',
    label: 'Office Supplies',
    subcategories: [
      { id: 'stationery', label: 'Stationery' },
      { id: 'office_electronics', label: 'Office Electronics' },
      { id: 'furniture_office', label: 'Office Furniture' },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    subcategories: [
      { id: 'books', label: 'Books' },
      { id: 'music', label: 'Music' },
      { id: 'movies', label: 'Movies & TV' },
    ],
  },
  {
    id: 'food',
    label: 'Food, Beverages & Tobacco',
    subcategories: [
      { id: 'packaged_food', label: 'Packaged Foods' },
      { id: 'beverages', label: 'Beverages' },
      { id: 'snacks', label: 'Snacks' },
    ],
  },
  {
    id: 'pet',
    label: 'Animals & Pet Supplies',
    subcategories: [
      { id: 'pet_food', label: 'Pet Food' },
      { id: 'pet_toys', label: 'Pet Toys & Accessories' },
    ],
  },
  {
    id: 'luggage',
    label: 'Luggage & Bags',
    subcategories: [
      { id: 'suitcases', label: 'Suitcases' },
      { id: 'backpacks', label: 'Backpacks' },
      { id: 'travel_accessories', label: 'Travel Accessories' },
    ],
  },
  {
    id: 'arts',
    label: 'Arts & Entertainment',
    subcategories: [
      { id: 'crafts', label: 'Arts & Crafts' },
      { id: 'musical_instruments', label: 'Musical Instruments' },
    ],
  },
  {
    id: 'hardware',
    label: 'Hardware',
    subcategories: [
      { id: 'tools', label: 'Tools' },
      { id: 'building_materials', label: 'Building Materials' },
      { id: 'plumbing', label: 'Plumbing & Electrical' },
    ],
  },
  {
    id: 'business',
    label: 'Business & Industrial',
    subcategories: [
      { id: 'lab', label: 'Lab & Scientific' },
      { id: 'industrial', label: 'Industrial Equipment' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    subcategories: [{ id: 'general', label: 'General merchandise' }],
  },
];

export function findCategoryGroup(id: string): EcommerceCategoryGroup | undefined {
  return ECOMMERCE_CATEGORY_GROUPS.find((g) => g.id === id);
}

export function formatProductCategory(categoryId: string, subcategoryId: string): string {
  const group = findCategoryGroup(categoryId);
  if (!group) {
    return categoryId.trim() || 'Other';
  }
  if (!subcategoryId.trim()) {
    return group.label;
  }
  const sub = group.subcategories.find((s) => s.id === subcategoryId);
  return sub ? `${group.label} > ${sub.label}` : group.label;
}

export const DEFAULT_CATEGORY_ID = 'electronics';
export const DEFAULT_SUBCATEGORY_ID = 'tv_audio';
