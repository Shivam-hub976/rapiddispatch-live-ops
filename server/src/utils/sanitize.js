const HTML_TAG_REGEX = /<[^>]*>/g;
const TICKET_ID_REGEX = /^RD-\d{3,6}$/;

/**
 * Strips HTML tags, collapses excess whitespace, and enforces max length.
 */
export const sanitizeText = (value, maxLength = 200) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(HTML_TAG_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
};

/**
 * Validates and normalizes a RapidDispatch ticket ID (e.g., "rd-105" -> "RD-105").
 */
export const sanitizeTicketId = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return TICKET_ID_REGEX.test(normalized) ? normalized : null;
};

/**
 * Sanitizes an agent display name with a safe fallback length check.
 */
export const sanitizeAgentName = (value) => {
  const cleaned = sanitizeText(value, 50);
  return cleaned.length >= 2 ? cleaned : null;
};