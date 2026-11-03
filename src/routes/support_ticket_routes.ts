import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client';
import { noStore } from '../middleware/no_store';
import { requireJson } from '../middleware/requireJson';
import {
  addTicketComment,
  createSupportTicket,
  getAdminSupportTicket,
  getSupportTicket,
  listAllSupportTickets,
  listSupportTickets,
  listTicketComments,
  updateSupportTicketStatus,
  validateComment,
  validateStatusUpdate,
  validateSupportTicket,
  validateTicketId,
} from '../service/support_ticket_service';

export function createSupportTicketRouter(database: PrismaClient): Router {
  const router = Router();
  router.use(noStore);

  router.post('/', requireJson, async (req, res) => {
    const input = validateSupportTicket(req.body);
    const ticket = await createSupportTicket(
      database,
      res.locals.userId,
      input,
    );
    res
      .location(`/api/support/tickets/${ticket.id}`)
      .status(201)
      .json({ ticket });
  });

  router.get('/', async (_req, res) => {
    res.json({
      tickets: await listSupportTickets(database, res.locals.userId),
    });
  });

  router.get('/:ticketId', async (req, res) => {
    const id = validateTicketId(req.params.ticketId);
    res.json({
      ticket: await getSupportTicket(database, res.locals.userId, id),
    });
  });

  router.get('/:ticketId/comments', async (req, res) => {
    const id = validateTicketId(req.params.ticketId);
    res.json({
      comments: await listTicketComments(database, id, res.locals.userId),
    });
  });

  router.post('/:ticketId/comments', requireJson, async (req, res) => {
    const id = validateTicketId(req.params.ticketId);
    const input = validateComment(req.body);
    const comment = await addTicketComment(
      database,
      id,
      res.locals.userId,
      input,
      res.locals.userId,
    );
    res.status(201).json({ comment });
  });

  return router;
}

export function createAdminSupportTicketRouter(database: PrismaClient): Router {
  const router = Router();
  router.use(noStore);

  router.get('/', async (_req, res) => {
    res.json({ tickets: await listAllSupportTickets(database) });
  });

  router.get('/:ticketId', async (req, res) => {
    const id = validateTicketId(req.params.ticketId);
    res.json({ ticket: await getAdminSupportTicket(database, id) });
  });

  router.get('/:ticketId/comments', async (req, res) => {
    const id = validateTicketId(req.params.ticketId);
    res.json({ comments: await listTicketComments(database, id) });
  });

  router.post('/:ticketId/comments', requireJson, async (req, res) => {
    const id = validateTicketId(req.params.ticketId);
    const input = validateComment(req.body);
    const comment = await addTicketComment(
      database,
      id,
      res.locals.userId,
      input,
    );
    res.status(201).json({ comment });
  });

  router.patch('/:ticketId/status', requireJson, async (req, res) => {
    const id = validateTicketId(req.params.ticketId);
    const update = validateStatusUpdate(req.body);
    res.json({ ticket: await updateSupportTicketStatus(database, id, update) });
  });

  return router;
}
