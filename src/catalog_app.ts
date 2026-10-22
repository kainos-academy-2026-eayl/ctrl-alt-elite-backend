import express, { type Request, type Response } from 'express';
import type { PrismaClient } from './generated/prisma/client';

const productSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  price: true,
  stock: true,
  image: true,
} as const;

function serializeProduct<T extends { image: Uint8Array }>(product: T) {
  const image = Buffer.from(product.image);
  let mimeType: string;
  if (image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    mimeType = 'image/png';
  } else if (image.toString('utf8').trimStart().startsWith('<svg ')) {
    mimeType = 'image/svg+xml';
  } else {
    throw new Error('Product image must contain PNG or SVG data.');
  }

  return {
    ...product,
    image: `data:${mimeType};base64,${image.toString('base64')}`,
  };
}

export function createCatalogRouter(database: PrismaClient) {
  const router = express.Router();

  router.get('/products', async (_req: Request, res: Response) => {
    const products = await database.product.findMany({
      orderBy: { name: 'asc' },
      select: productSelect,
    });
    res.status(200).json({ products: products.map(serializeProduct) });
  });

  router.get('/products/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string') {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    const product = await database.product.findUnique({
      where: { id },
      select: productSelect,
    });
    if (!product) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }
    res.status(200).json({ product: serializeProduct(product) });
  });

  return router;
}
