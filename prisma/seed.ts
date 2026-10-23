import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createDatabase } from '../src/database';

const products = [
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a01',
    name: 'Swaggy Jeans',
    category: 'Jeans',
    description: 'Stylish and comfortable jeans for everyday wear.',
    price: 24.99,
    stock: 18,
    image: readFileSync(new URL('./images/jeans.jpeg', import.meta.url)),
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a02',
    name: 'POU Shirt',
    category: 'Shirt',
    description: 'A stylish shirt for everyday wear, everyone loves pou.',
    price: 12.5,
    stock: 40,
    image: readFileSync(new URL('./images/pou.jpeg', import.meta.url)),
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a03',
    name: 'Kainos Hoodie',
    category: 'Hoodie',
    description: 'A cozy hoodie for everyday wear.',
    price: 8.99,
    stock: 65,
    image: readFileSync(new URL('./images/hoodie.png', import.meta.url)),
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
    image: readFileSync(
      new URL('./images/wavy-brown-hair.svg', import.meta.url),
    ),
  },
  {
    id: '99a89432-b64d-4c54-b6af-71591fdb0a06',
    name: 'Metellica Band Shirt',
    category: 'Shirt',
    description: 'Show off you love for Metallica.',
    price: 15.99,
    stock: 25,
    image: readFileSync(new URL('./images/metellica.jpg', import.meta.url)),
  },
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
  console.log(
    `Seeded ${out_of_stock_testing.length} out of stock testing products.`,
  );
} finally {
  await database.$disconnect();
}
