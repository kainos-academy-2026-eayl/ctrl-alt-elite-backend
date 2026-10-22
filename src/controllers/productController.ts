import type { Request, Response } from 'express';
import { toProductSearchResponse } from '../dtos/productDto';
import { normaliseSearchTerm } from '../models/productSearch';
import type { ProductService } from '../services/productService';

export class ProductController {
  private readonly productService: ProductService;

  constructor(productService: ProductService) {
    this.productService = productService;
  }

  /** Like the frontend, a missing, repeated or long `q` is normalised rather than rejected. */
  searchProducts = async (req: Request, res: Response): Promise<void> => {
    const searchTerm = normaliseSearchTerm(req.query.q);
    const result = await this.productService.searchProducts(searchTerm);
    res.json(toProductSearchResponse(searchTerm, result));
  };
}
