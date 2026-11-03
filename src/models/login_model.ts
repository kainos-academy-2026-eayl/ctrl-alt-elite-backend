export const supportedRoles = [
  'CUSTOMER',
  'ADMIN',
  'CUSTOMER_SERVICE',
] as const;
export type UserRole = (typeof supportedRoles)[number];
