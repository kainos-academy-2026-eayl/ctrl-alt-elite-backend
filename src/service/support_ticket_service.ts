import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors/appErrors';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import {
  type CreateComment,
  type CreateSupportTicket,
  commentSchema,
  supportTicketSchema,
  type TicketStatusUpdate,
  ticketIdSchema,
  ticketStatusUpdateSchema,
} from '../models/support_ticket_model';

const ticketSelect = {
  id: true,
  subject: true,
  category: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function validateSupportTicket(body: unknown): CreateSupportTicket {
  const result = supportTicketSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function validateTicketId(id: unknown): string {
  const result = ticketIdSchema.safeParse(id);
  if (!result.success) {
    throw new ValidationError([
      {
        field: 'ticketId',
        message:
          'Ticket id must be 1-64 characters: letters, numbers or hyphens.',
      },
    ]);
  }
  return result.data;
}

export function validateStatusUpdate(body: unknown): TicketStatusUpdate {
  const result = ticketStatusUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError([
      {
        field: 'status',
        message: 'Status must be OPEN, IN_PROGRESS, RESOLVED or CLOSED.',
      },
    ]);
  }
  return result.data;
}

const adminTicketSelect = {
  ...ticketSelect,
  customer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

type AdminTicketRow = Awaited<ReturnType<typeof findAdminTicketRows>>[number];

function findAdminTicketRows(database: PrismaClient) {
  return database.supportTicket.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: adminTicketSelect,
  });
}

function toAdminTicket(ticket: AdminTicketRow) {
  const { customer } = ticket;
  return {
    ...ticket,
    customerId: customer.id,
    customerName: `${customer.firstName} ${customer.lastName}`.trim(),
    customerEmail: customer.email,
  };
}

export async function listAllSupportTickets(database: PrismaClient) {
  return (await findAdminTicketRows(database)).map(toAdminTicket);
}

export async function getAdminSupportTicket(
  database: PrismaClient,
  id: string,
) {
  const ticket = await database.supportTicket.findUnique({
    where: { id },
    select: adminTicketSelect,
  });
  if (!ticket) throw new NotFoundError('Support ticket not found.');
  return toAdminTicket(ticket);
}

export async function updateSupportTicketStatus(
  database: PrismaClient,
  id: string,
  { status }: TicketStatusUpdate,
) {
  try {
    const ticket = await database.supportTicket.update({
      where: { id },
      data: { status },
      select: adminTicketSelect,
    });
    return toAdminTicket(ticket);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundError('Support ticket not found.');
    }
    throw error;
  }
}

export function createSupportTicket(
  database: PrismaClient,
  customerId: string,
  ticket: CreateSupportTicket,
) {
  return database.supportTicket.create({
    data: {
      customerId,
      subject: ticket.subject,
      category: ticket.category,
      description: ticket.description,
    },
    select: ticketSelect,
  });
}

export function listSupportTickets(database: PrismaClient, customerId: string) {
  return database.supportTicket.findMany({
    where: { customerId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: ticketSelect,
  });
}

export async function getSupportTicket(
  database: PrismaClient,
  customerId: string,
  id: string,
) {
  const ticket = await database.supportTicket.findFirst({
    where: { id, customerId },
    select: ticketSelect,
  });
  if (!ticket) throw new NotFoundError('Support ticket not found.');
  return ticket;
}

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { firstName: true, lastName: true, role: true } },
} as const;

type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  author: { firstName: string; lastName: string; role: string };
};

function toComment({ author, ...comment }: CommentRow) {
  return {
    ...comment,
    authorName: `${author.firstName} ${author.lastName}`.trim(),
    authorRole: author.role,
  };
}

export function validateComment(body: unknown): CreateComment {
  const result = commentSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError([
      {
        field: 'body',
        message: 'Comment must be between 1 and 2000 characters.',
      },
    ]);
  }
  return result.data;
}

// Passing customerId restricts the ticket to that customer; admins omit it.
export async function listTicketComments(
  database: PrismaClient,
  id: string,
  customerId?: string,
) {
  const ticket = await database.supportTicket.findFirst({
    where: customerId ? { id, customerId } : { id },
    select: {
      messages: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: commentSelect,
      },
    },
  });
  if (!ticket) throw new NotFoundError('Support ticket not found.');
  return ticket.messages.map(toComment);
}

export function addTicketComment(
  database: PrismaClient,
  id: string,
  authorId: string,
  { body }: CreateComment,
  customerId?: string,
) {
  return database.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: customerId ? { id, customerId } : { id },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundError('Support ticket not found.');

    // Touching the row locks it, so a concurrent close cannot slip past the check.
    const open = await tx.supportTicket.updateMany({
      where: { id, status: { not: 'CLOSED' } },
      data: { updatedAt: new Date() },
    });
    if (open.count === 0) throw new ConflictError('This ticket is closed.');

    return toComment(
      await tx.ticketMessage.create({
        data: { ticketId: id, authorId, body },
        select: commentSelect,
      }),
    );
  });
}
