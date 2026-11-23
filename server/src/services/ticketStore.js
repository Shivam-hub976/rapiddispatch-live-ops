import Ticket from '../models/Ticket.js';
import { isDbConnected } from '../config/db.js';
import { SEED_TICKETS } from '../data/seedTickets.js';

// Fallback in-memory store used only when MongoDB Atlas is not connected
let memoryTickets = SEED_TICKETS.map((ticket) => ({
  ...ticket,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

export const seedInitialTickets = async () => {
  if (!isDbConnected()) {
    console.log(`[Seed] In-memory store initialized with ${memoryTickets.length} freight tickets.`);
    return;
  }

  const existingCount = await Ticket.countDocuments();
  if (existingCount === 0) {
    await Ticket.insertMany(SEED_TICKETS);
    console.log(`[Seed] Inserted ${SEED_TICKETS.length} RapidDispatch freight tickets into MongoDB.`);
  } else {
    console.log(`[Seed] MongoDB already contains ${existingCount} tickets. Skipping seed.`);
  }
};

export const getAllTickets = async () => {
  if (isDbConnected()) {
    return Ticket.find().sort({ ticketId: 1 }).lean();
  }
  return [...memoryTickets].sort((a, b) => a.ticketId.localeCompare(b.ticketId));
};

export const getTicketById = async (ticketId) => {
  if (isDbConnected()) {
    return Ticket.findOne({ ticketId }).lean();
  }
  return memoryTickets.find((t) => t.ticketId === ticketId) || null;
};

export const resolveTicketById = async (ticketId, { resolutionNote, resolvedBy }) => {
  const now = new Date();

  if (isDbConnected()) {
    return Ticket.findOneAndUpdate(
      { ticketId },
      {
        status: 'resolved',
        resolutionNote,
        resolvedBy,
        resolvedAt: now,
      },
      { new: true, runValidators: true }
    ).lean();
  }

  const index = memoryTickets.findIndex((t) => t.ticketId === ticketId);
  if (index === -1) return null;

  memoryTickets[index] = {
    ...memoryTickets[index],
    status: 'resolved',
    resolutionNote,
    resolvedBy,
    resolvedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return memoryTickets[index];
};