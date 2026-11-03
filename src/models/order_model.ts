import type { Prisma } from '../generated/prisma/client';

export type Order = Prisma.orderGetPayload<{
  include: {
    customer: true;
    id: true;
    products: {
      include: {
        product: true;
      };
    };
  };
}>;

