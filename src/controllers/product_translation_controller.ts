import type { Request, Response } from 'express';
import {
  normaliseTranslationLocale,
  TRANSLATION_LOCALES,
} from '../models/product_translation_model';
import type { ProductTranslationRepository } from '../repo/product_translation_repository';

export function createProductTranslationController(
  repository: ProductTranslationRepository,
) {
  return {
    /** GET /api/product-translations?lang=cy */
    getByLocale: async (req: Request, res: Response) => {
      const locale = normaliseTranslationLocale(req.query.lang);
      if (!locale) {
        res.status(400).json({
          message: `lang must be one of: ${TRANSLATION_LOCALES.join(', ')}.`,
        });
        return;
      }
      const translations = await repository.findByLocale(locale);
      res.status(200).json({
        lang: locale,
        translations: Object.fromEntries(translations),
      });
    },
  };
}
