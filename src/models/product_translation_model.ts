/*
 * Product names and descriptions in other languages, for
 * GET /api/product-translations and translated product search. English is
 * the Product row itself, so it has no translations.
 */

export const TRANSLATION_LOCALES = ['cy', 'ga', 'fr'] as const;

export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

export interface ProductText {
  name: string;
  description: string;
}

/** Translations for one language, by product id. */
export type ProductTranslations = Map<string, ProductText>;

/** A supported language code, or null for anything else (including English). */
export function normaliseTranslationLocale(
  raw: unknown,
): TranslationLocale | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return TRANSLATION_LOCALES.find((locale) => locale === value) ?? null;
}

export interface ProductTranslationDatabase {
  productTranslation: {
    findMany(args: {
      where: { locale: string };
      select: { productId: true; name: true; description: true };
    }): PromiseLike<{ productId: string; name: string; description: string }[]>;
  };
}
