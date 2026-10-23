import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createDatabase } from '../src/database';

const products = [
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a01',
    name: 'Placeholder Desk Lamp',
    category: 'Home',
    description: 'A compact desk lamp for your workspace.',
    price: 24.99,
    stock: 18,
    image: readFileSync(new URL('./images/desk-lamp.svg', import.meta.url)),
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a02',
    name: 'Placeholder Ceramic Mug',
    category: 'Kitchen',
    description: 'A ceramic mug for your favourite hot drink.',
    price: 12.5,
    stock: 40,
    image: readFileSync(new URL('./images/ceramic-mug.svg', import.meta.url)),
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a03',
    name: 'Placeholder Notebook',
    category: 'Stationery',
    description: 'A notebook for everyday notes and ideas.',
    price: 8.99,
    stock: 65,
    image: readFileSync(new URL('./images/notebook.svg', import.meta.url)),
  },
];

const testing_product_upload = [
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a04',
    name: 'Princess Dylan Crown',
    category: 'Home',
    description:
      'Be a princess with this crown and win lots of task master points.',
    price: 9999,
    stock: 88,
    image: readFileSync(new URL('./images/crown.svg', import.meta.url)),
  },
];

const out_of_stock_testing = [
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a05',
    name: "Lee's Hair",
    category: 'Home',
    description: 'Lees long lushious locks of hair.',
    price: 828938392829282,
    stock: 0,
    image: readFileSync(new URL('./images/wavy-brown-hair.svg', import.meta.url)),
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a06',
    name: 'Eggy Egg',
    category: 'Kitchen',
    description: "Don't Break the egg or you will lose task master points",
    price: 15.99,
    stock: 25,
    image: readFileSync(new URL('./images/egg-face.svg', import.meta.url)),
  }
];


const database = createDatabase();

try {
  for (const product of products) {
    await database.product.upsert({
      where: { id: product.id },
      create: product,
      update: product,
    });
  }
  console.log(`Seeded ${products.length} placeholder products.`);

  for (const product of testing_product_upload) {
    await database.product.upsert({
      where: { id: product.id },
      create: product,
      update: product,
    });
  }
  console.log(`Seeded ${testing_product_upload.length} testing products.`);

  for (const product of out_of_stock_testing) {
    await database.product.upsert({
      where: { id: product.id },
      create: product,
      update: product,
    });
  }
  console.log(`Seeded ${out_of_stock_testing.length} out of stock testing products.`);
} finally {
  await database.$disconnect();
}
