import type {
  ProductTranslationDatabase,
  ProductTranslations,
  TranslationLocale,
} from '../models/product_translation_model';

export function createProductTranslationRepository(
  database: ProductTranslationDatabase,
) {
  return {
    async findByLocale(
      locale: TranslationLocale,
    ): Promise<ProductTranslations> {
      const rows = await database.productTranslation.findMany({
        where: { locale },
        select: { productId: true, name: true, description: true },
      });
      return new Map(
        rows.map((row) => [
          row.productId,
          { name: row.name, description: row.description },
        ]),
      );
    },
  };
}

export type ProductTranslationRepository = ReturnType<
  typeof createProductTranslationRepository
>;
