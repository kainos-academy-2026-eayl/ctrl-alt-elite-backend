export const supportedRoles = ['CUSTOMER', 'ADMIN'] as const;
export type UserRole = (typeof supportedRoles)[number];
