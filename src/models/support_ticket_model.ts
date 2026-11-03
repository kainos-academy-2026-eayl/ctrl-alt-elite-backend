import { z } from 'zod';
import { TicketCategory, TicketStatus } from '../generated/prisma/enums';

export const supportTicketSchema = z.object({
  category: z.enum(TicketCategory),
  subject: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(2000),
});

export const ticketStatusUpdateSchema = z.object({
  status: z.enum(TicketStatus),
});

export const ticketIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export type CreateComment = z.infer<typeof commentSchema>;

export type CreateSupportTicket = z.infer<typeof supportTicketSchema>;
export type TicketStatusUpdate = z.infer<typeof ticketStatusUpdateSchema>;
