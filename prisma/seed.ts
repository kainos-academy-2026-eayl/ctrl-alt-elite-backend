import 'dotenv/config';
import { createDatabase } from '../src/database';

// Matches the frontend's temporary SAMPLE_PRODUCTS. Prices are whole pence.
const PRODUCTS = [
  { id: 'sample-lamp', name: 'Desk Lamp', unitPricePence: 2499 },
  { id: 'sample-mug', name: 'Ceramic Mug', unitPricePence: 550 },
  { id: 'sample-keyboard', name: 'Wireless Keyboard', unitPricePence: 4900 },
  {
    id: 'sample-headphones',
    name: 'Noise-Cancelling Headphones',
    unitPricePence: 12999,
  },
  { id: 'sample-notebook', name: 'A5 Notebook', unitPricePence: 375 },
  { id: 'sample-bottle', name: 'Water Bottle', unitPricePence: 1200 },
];

const database = createDatabase();
try {
  for (const { id, ...details } of PRODUCTS) {
    await database.product.upsert({
      where: { id },
      update: details,
      create: { id, ...details },
    });
  }
  console.log(`Seeded ${PRODUCTS.length} products`);
} finally {
  await database.$disconnect();
}
