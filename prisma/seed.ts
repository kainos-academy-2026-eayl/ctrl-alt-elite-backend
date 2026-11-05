import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createDatabase } from '../src/config/database_config';
import { PRODUCT_TRANSLATIONS } from './product_translations';

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

// Each catalogue product has an illustration named after it, e.g.
// "Cotton Crew Socks (3 Pack)" -> images/cotton-crew-socks-3-pack.svg
function catalogueImage(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return readFileSync(new URL(`./images/${slug}.svg`, import.meta.url));
}

// [id suffix, name, category, description, price, stock]
const catalogue_rows: [string, string, string, string, number, number][] = [
  [
    '07',
    'Classic White Tee',
    'T-Shirt',
    'A crisp white cotton tee that goes with everything.',
    9.99,
    84,
  ],
  [
    '08',
    'Black Slim Chinos',
    'Trousers',
    'Slim-fit chinos in black, smart enough for the office.',
    29.99,
    47,
  ],
  [
    '09',
    'Denim Jacket',
    'Jackets',
    'A classic denim jacket with a relaxed fit.',
    44.5,
    23,
  ],
  [
    '10',
    'Striped Polo Shirt',
    'Shirt',
    'A breathable striped polo for warm days.',
    18,
    56,
  ],
  [
    '11',
    'Cargo Shorts',
    'Shorts',
    'Roomy cargo shorts with plenty of pockets.',
    19.99,
    61,
  ],
  [
    '12',
    'Fleece Zip-Up',
    'Hoodie',
    'A soft fleece zip-up to keep you warm.',
    34.99,
    38,
  ],
  [
    '13',
    'Waterproof Parka',
    'Jackets',
    'A hooded parka that keeps the rain out.',
    79.99,
    15,
  ],
  [
    '14',
    'Wool Beanie',
    'Accessories',
    'A snug wool beanie for cold mornings.',
    7.5,
    92,
  ],
  [
    '15',
    'Knitted Scarf',
    'Accessories',
    'A chunky knitted scarf in a warm weave.',
    11.99,
    73,
  ],
  [
    '16',
    'Leather Belt',
    'Accessories',
    'A durable leather belt with a brushed buckle.',
    16.5,
    44,
  ],
  [
    '17',
    'Canvas Sneakers',
    'Footwear',
    'Lightweight canvas sneakers for everyday wear.',
    39.99,
    52,
  ],
  [
    '18',
    'Running Trainers',
    'Footwear',
    'Cushioned trainers built for daily runs.',
    64.99,
    29,
  ],
  [
    '19',
    'Chelsea Boots',
    'Footwear',
    'Polished Chelsea boots with elastic side panels.',
    89,
    18,
  ],
  [
    '20',
    'Cotton Crew Socks (3 Pack)',
    'Accessories',
    'Three pairs of soft cotton crew socks.',
    6.99,
    96,
  ],
  [
    '21',
    'Baseball Cap',
    'Accessories',
    'An adjustable cotton baseball cap.',
    10.99,
    78,
  ],
  [
    '22',
    'Aviator Sunglasses',
    'Accessories',
    'Classic aviator sunglasses with UV protection.',
    22,
    34,
  ],
  [
    '23',
    'Leather Wallet',
    'Accessories',
    'A slim leather wallet with card slots.',
    27.5,
    41,
  ],
  [
    '24',
    'Canvas Tote Bag',
    'Bags',
    'A sturdy canvas tote for shopping and daily use.',
    8.5,
    88,
  ],
  [
    '25',
    'Everyday Backpack',
    'Bags',
    'A roomy backpack with a padded laptop pocket.',
    35.99,
    36,
  ],
  [
    '26',
    'Graphic Print Tee',
    'T-Shirt',
    'A soft cotton tee with a bold graphic print.',
    13.99,
    67,
  ],
  [
    '27',
    'Oversized Sweatshirt',
    'Hoodie',
    'A cosy oversized sweatshirt for relaxed days.',
    26.99,
    49,
  ],
  [
    '28',
    'Jogger Sweatpants',
    'Trousers',
    'Comfortable joggers with a tapered leg.',
    22.99,
    58,
  ],
  [
    '29',
    'Linen Summer Shirt',
    'Shirt',
    'A lightweight linen shirt for hot weather.',
    24.5,
    31,
  ],
  [
    '30',
    'Floral Midi Dress',
    'Dresses',
    'A flowing midi dress with a floral print.',
    38,
    22,
  ],
  [
    '31',
    'Pleated Skirt',
    'Skirts',
    'A pleated skirt that moves with you.',
    21.99,
    45,
  ],
  [
    '32',
    'Puffer Vest',
    'Jackets',
    'A warm, light puffer vest for layering.',
    41.99,
    27,
  ],
  [
    '33',
    'Silk Tie',
    'Accessories',
    'A smooth silk tie for formal occasions.',
    14.99,
    53,
  ],
  [
    '34',
    'Kainos Water Bottle',
    'Home',
    'A reusable Kainos water bottle.',
    5.99,
    100,
  ],
  ['35', 'Kainos Tote Bag', 'Bags', 'A branded Kainos tote bag.', 4.99, 99],
  ['36', 'Pyjama Set', 'Nightwear', 'A comfy two-piece pyjama set.', 23.5, 39],
];

const catalogue_products = catalogue_rows.map(
  ([suffix, name, category, description, price, stock]) => ({
    id: `99a89432-b64d-4c54-b6af-71591fdb0a${suffix}`,
    name,
    category,
    description,
    price,
    stock,
    image: catalogueImage(name),
  }),
);

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

  for (const product of catalogue_products) {
    await database.product.upsert({
      where: { id: product.id },
      create: product,
      update: product,
    });
  }
  console.log(`Seeded ${catalogue_products.length} catalogue products.`);

  let translationCount = 0;
  for (const [productId, languages] of Object.entries(PRODUCT_TRANSLATIONS)) {
    for (const [locale, text] of Object.entries(languages)) {
      await database.productTranslation.upsert({
        where: { productId_locale: { productId, locale } },
        create: { productId, locale, ...text },
        update: text,
      });
      translationCount += 1;
    }
  }
  console.log(`Seeded ${translationCount} product translations.`);
} finally {
  await database.$disconnect();
}
