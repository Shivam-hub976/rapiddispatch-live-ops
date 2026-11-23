export const CLIENT_EVENTS = Object.freeze({
  JOIN_DASHBOARD: 'join_dashboard',
  LOCK_TICKET: 'lock_ticket',
  UNLOCK_TICKET: 'unlock_ticket',
  RESOLVE_TICKET: 'resolve_ticket',
});

export const SERVER_EVENTS = Object.freeze({
  DASHBOARD_JOINED: 'dashboard_joined',
  ACTIVE_AGENTS_UPDATED: 'active_agents_updated',
  LOCK_STATE_SYNC: 'lock_state_sync',
  TICKET_LOCKED: 'ticket_locked',
  TICKET_UNLOCKED: 'ticket_unlocked',
  TICKETS_RELEASED: 'tickets_released',
  LOCK_REJECTED: 'lock_rejected',
  TICKET_RESOLVED: 'ticket_resolved',
});