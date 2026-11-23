import { Router } from 'express';
import { getAllTickets, getTicketById } from '../services/ticketStore.js';

const router = Router();

// GET /api/tickets — List all freight support tickets
router.get('/', async (_req, res, next) => {
  try {
    const tickets = await getAllTickets();
    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tickets/:ticketId — Fetch a single ticket by ticketId (e.g., RD-105)
router.get('/:ticketId', async (req, res, next) => {
  try {
    const ticketId = req.params.ticketId.trim().toUpperCase();
    const ticket = await getTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: `Ticket ${ticketId} not found.`,
      });
    }

    res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
});

export default router;