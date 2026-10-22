import 'dotenv/config';
import { SAMPLE_PRODUCTS } from '../src/data/sampleProducts';
import { createDatabase } from '../src/database';

const database = createDatabase();
try {
  for (const [displayOrder, { id, ...details }] of SAMPLE_PRODUCTS.entries()) {
    const product = {
      ...details,
      keywords: [...details.keywords],
      displayOrder,
    };
    await database.product.upsert({
      where: { id },
      update: product,
      create: { id, ...product },
    });
  }
  console.log(`Seeded ${SAMPLE_PRODUCTS.length} products`);
} finally {
  await database.$disconnect();
}
