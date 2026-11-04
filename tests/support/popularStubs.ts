// Inert popular products dependencies for catalogue tests that never call them.
export const noOrders = { groupBy: async () => [] };

export const noPopular = {
  findTopSellingIds: async () => [],
  findInStockByIds: async () => [],
  findNewestInStock: async () => [],
};
