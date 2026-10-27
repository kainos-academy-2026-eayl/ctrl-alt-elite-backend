import type { Request, Response } from 'express';
import {
  AddBasketItemSchema,
  BasketItemParamsSchema,
  BasketParamsSchema,
  toBasketResponse,
  UpdateBasketItemSchema,
} from '../dtos/basketDto';
import { validateRequest } from '../dtos/validateRequest';
import type { BasketService } from '../service/basketService';

export class BasketController {
  private readonly basketService: BasketService;

  constructor(basketService: BasketService) {
    this.basketService = basketService;
  }

  createBasket = async (_req: Request, res: Response): Promise<void> => {
    const basket = await this.basketService.createBasket();
    res
      .status(201)
      .location(`/api/baskets/${basket.id}`)
      .json(toBasketResponse(basket));
  };

  getBasket = async (req: Request, res: Response): Promise<void> => {
    const { basketId } = validateRequest(BasketParamsSchema, req.params);
    const basket = await this.basketService.getBasket(basketId);
    res.json(toBasketResponse(basket));
  };

  addItem = async (req: Request, res: Response): Promise<void> => {
    const { basketId } = validateRequest(BasketParamsSchema, req.params);
    const { productId } = validateRequest(AddBasketItemSchema, req.body);
    const { basket, isNewLine } = await this.basketService.addItem(
      basketId,
      productId,
    );
    res.status(isNewLine ? 201 : 200).json(toBasketResponse(basket));
  };

  updateItemQuantity = async (req: Request, res: Response): Promise<void> => {
    const { basketId, productId } = validateRequest(
      BasketItemParamsSchema,
      req.params,
    );
    const update = validateRequest(UpdateBasketItemSchema, req.body);
    const basket = await this.basketService.updateItemQuantity(
      basketId,
      productId,
      update,
    );
    res.json(toBasketResponse(basket));
  };

  removeItem = async (req: Request, res: Response): Promise<void> => {
    const { basketId, productId } = validateRequest(
      BasketItemParamsSchema,
      req.params,
    );
    await this.basketService.removeItem(basketId, productId);
    res.status(204).end();
  };
}
