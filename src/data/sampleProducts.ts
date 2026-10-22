/*
 * Temporary seed catalogue, matching the frontend's SAMPLE_PRODUCTS (still used
 * by its homepage) in the same order. Replace with the real products when they
 * are ready. Prices are whole pence; the API returns them as "24.99" strings.
 */

const PLACEHOLDER_IMAGE = '/assets/images/placeholder.svg';

export interface SampleProduct {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  unitPricePence: number;
  keywords: readonly string[];
  isInStock: boolean;
}

export const SAMPLE_PRODUCTS: readonly SampleProduct[] = [
  {
    id: 'sample-lamp',
    name: 'Desk Lamp',
    description: 'Adjustable LED lamp with a warm and a cool light setting.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 2499,
    keywords: [
      'light',
      'lighting',
      'led',
      'office',
      'desk',
      'table',
      'bedside',
      'reading',
      'study',
      'bulb',
    ],
    isInStock: true,
  },
  {
    id: 'sample-mug',
    name: 'Ceramic Mug',
    description: 'Dishwasher-safe 350ml mug for tea and coffee.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 550,
    keywords: [
      'cup',
      'coffee',
      'tea',
      'kitchen',
      'drinkware',
      'hot drink',
      'latte',
    ],
    isInStock: true,
  },
  {
    id: 'sample-keyboard',
    name: 'Wireless Keyboard',
    description: 'Slim bluetooth keyboard with a quiet typing action.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 4900,
    keywords: [
      'computer',
      'typing',
      'bluetooth',
      'office',
      'keys',
      'pc',
      'laptop',
      'mac',
      'cordless',
    ],
    isInStock: true,
  },
  {
    id: 'sample-headphones',
    name: 'Noise-Cancelling Headphones',
    description: 'Over-ear headphones with active noise cancelling.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 12999,
    keywords: [
      'headphone',
      'audio',
      'music',
      'headset',
      'anc',
      'over-ear',
      'wireless',
      'bluetooth',
      'travel',
    ],
    isInStock: true,
  },
  {
    id: 'sample-notebook',
    name: 'A5 Notebook',
    description: 'Lined A5 notebook with 120 pages.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 375,
    keywords: [
      'paper',
      'stationery',
      'journal',
      'notes',
      'notepad',
      'diary',
      'writing',
      'lined',
      'school',
    ],
    isInStock: true,
  },
  {
    id: 'sample-bottle',
    name: 'Water Bottle',
    description: 'Insulated 500ml steel bottle that keeps drinks cold.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 1200,
    keywords: [
      'drink',
      'flask',
      'hydration',
      'travel',
      'insulated',
      'steel',
      'gym',
      'sports',
      'reusable',
    ],
    isInStock: true,
  },
  {
    id: 'sample-studio-headphones',
    name: 'Studio Headphones',
    description: 'Wired studio headphones with a flat sound profile.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 8900,
    keywords: [
      'headphone',
      'audio',
      'music',
      'wired',
      'monitor',
      'recording',
      'mixing',
      'dj',
    ],
    isInStock: false,
  },
  {
    id: 'sample-earbuds',
    name: 'Wireless Earbuds',
    description: 'Compact earbuds with a charging case.',
    imageUrl: PLACEHOLDER_IMAGE,
    unitPricePence: 5999,
    keywords: [
      'earphone',
      'earbud',
      'in-ear',
      'audio',
      'music',
      'bluetooth',
      'running',
      'sport',
    ],
    isInStock: false,
  },
];
