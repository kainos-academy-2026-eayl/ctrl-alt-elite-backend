import {
  AccountNotFoundError,
  OrderNotFoundError,
} from '../errors/order_errors';
import {
  type Account,
  type CreateOrderInput,
  DELIVERY_OPTIONS,
  type DeliveryOption,
  findDeliveryOption,
  type OrderResponseDto,
  toOrderResponse,
} from '../models/order_model';
import type { OrderRepository } from '../repo/order_repository';

export interface OrderResult {
  order: OrderResponseDto;
  creditBalancePence: number;
}

export function createOrderService(repository: OrderRepository) {
  async function getAccount(userId: string): Promise<Account> {
    const account = await repository.findAccount(userId);
    if (!account) {
      throw new AccountNotFoundError();
    }
    return account;
  }

  return {
    getAccount,

    listDeliveryOptions(): readonly DeliveryOption[] {
      return DELIVERY_OPTIONS;
    },

    async placeOrder(
      customerId: string,
      input: CreateOrderInput,
    ): Promise<OrderResult> {
      const delivery = findDeliveryOption(input.deliveryOption);
      // The request schema only accepts known options, so this cannot happen.
      if (!delivery) {
        throw new Error(`Unknown delivery option: ${input.deliveryOption}`);
      }
      const { order, creditBalancePence } = await repository.create(
        customerId,
        input,
        delivery,
      );
      return { order: toOrderResponse(order), creditBalancePence };
    },

    async getOrder(customerId: string, orderId: string): Promise<OrderResult> {
      const order = await repository.findForCustomer(orderId, customerId);
      if (!order) {
        throw new OrderNotFoundError();
      }
      const { creditBalancePence } = await getAccount(customerId);
      return { order: toOrderResponse(order), creditBalancePence };
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
