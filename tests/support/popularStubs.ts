// Inert popular products dependencies for catalogue tests that never call them.
export const noOrders = { groupBy: async () => [], findMany: async () => [] };

export const noPopular = {
  findUnitsSold: async () => new Map<string, number>(),
  findTopSellingIds: async () => [],
  findInStockByIds: async () => [],
  findNewestInStock: async () => [],
};
