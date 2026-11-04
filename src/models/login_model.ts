export const supportedRoles = [
  'CUSTOMER',
  'ADMIN',
  'CUSTOMER_SERVICE',
  'INVENTORY_MANAGEMENT',
] as const;
export type UserRole = (typeof supportedRoles)[number];
