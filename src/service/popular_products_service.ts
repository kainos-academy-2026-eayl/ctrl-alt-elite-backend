import type { PopularProduct } from '../models/popular_products_model';
import type { PopularProductsRepository } from '../repo/popular_products_repository';
import { toImageDataUrl } from './catalog_service';

/** The slim product shape the homepage conveyor belt needs. */
export interface PopularProductDto {
  id: string;
  name: string;
  /** Price in pounds as a 2 decimal place string, e.g. "24.99". */
  price: string;
  imageUrl: string;
}

function toPopularProduct(product: PopularProduct): PopularProductDto {
  return {
    id: product.id,
    name: product.name,
    price: product.price.toFixed(2),
    imageUrl: toImageDataUrl(product.image),
  };
}

export function createPopularProductsService(
  repository: PopularProductsRepository,
) {
  return {
    /**
     * Best sellers come first. If too few products have been ordered (e.g. a
     * fresh database), the rest of the slots are filled with the newest
     * in-stock products so the conveyor is never empty.
     */
    async getPopular(limit: number): Promise<PopularProductDto[]> {
      const topSellerIds = await repository.findTopSellingIds(limit);
      const topSellers =
        topSellerIds.length > 0
          ? await repository.findInStockByIds(topSellerIds)
          : [];
      const topSellersById = new Map(topSellers.map((p) => [p.id, p]));
      const ranked = topSellerIds.flatMap((id) => topSellersById.get(id) ?? []);

      const remaining = limit - ranked.length;
      const fillers =
        remaining > 0
          ? await repository.findNewestInStock(topSellerIds, remaining)
          : [];

      return [...ranked, ...fillers].map(toPopularProduct);
    },
  };
}

export type PopularProductsService = ReturnType<
  typeof createPopularProductsService
>;
