import { ConflictError, NotFoundError } from '../errors/appErrors';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { validateRequest } from '../middleware/validateRequest';
import { productSelect } from '../models/catalog_model';
import {
  orderedProductMessage,
  type ProductCreate,
  type ProductUpdate,
  productCreateSchema,
  productUpdateSchema,
} from '../models/product_model';
import { createCatalogRepository } from '../repo/catalog_repository';
import { serializeProduct } from './catalog_service';

const notFoundMessage = 'Product not found.';
const maxBasketDeleteRetries = 3;

export function validateProductCreate(body: unknown): ProductCreate {
  return validateRequest(productCreateSchema, body);
}

export function validateProductUpdate(body: unknown): ProductUpdate {
  return validateRequest(productUpdateSchema, body);
}

function hasCode(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

export async function listProducts(database: PrismaClient) {
  const products = await createCatalogRepository(database).findAll();
  return products.map(serializeProduct);
}

export async function getProduct(database: PrismaClient, id: string) {
  const product = await createCatalogRepository(database).findById(id);
  if (!product) throw new NotFoundError(notFoundMessage);
  return serializeProduct(product);
}

export async function createProduct(
  database: PrismaClient,
  input: ProductCreate,
) {
  const product = await database.product.create({
    data: input,
    select: productSelect,
  });
  return serializeProduct(product);
}

export async function updateProduct(
  database: PrismaClient,
  id: string,
  input: ProductUpdate,
) {
  // Omitting the image leaves the stored one untouched.
  const { image, ...fields } = input;
  try {
    const product = await database.product.update({
      where: { id },
      data: image ? { ...fields, image } : fields,
      select: productSelect,
    });
    return serializeProduct(product);
  } catch (error) {
    if (hasCode(error, 'P2025')) throw new NotFoundError(notFoundMessage);
    throw error;
  }
}

export async function deleteProduct(database: PrismaClient, id: string) {
  for (let retry = 0; ; retry += 1) {
    try {
      await database.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!product) throw new NotFoundError(notFoundMessage);

        const ordered = await tx.order_products.findFirst({
          where: { product_id: id },
          select: { product_id: true },
        });
        if (ordered) throw new ConflictError(orderedProductMessage);

        await tx.basketItem.deleteMany({ where: { productId: id } });
        await tx.product.delete({ where: { id } });
      });
      return;
    } catch (error) {
      // An order placed after the check above makes the delete violate its foreign key.
      if (hasCode(error, 'P2003')) {
        const ordered = await database.order_products.findFirst({
          where: { product_id: id },
          select: { product_id: true },
        });
        if (ordered) throw new ConflictError(orderedProductMessage);
        if (retry < maxBasketDeleteRetries) continue;
      }
      if (hasCode(error, 'P2025')) throw new NotFoundError(notFoundMessage);
      throw error;
    }
  }
}
