const DANGEROUS_BLOCK_REGEX = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG_REGEX = /<[^>]*>/g;
const TICKET_ID_REGEX = /^RD-\d{3,6}$/;

/**
 * Strips script/style blocks, HTML tags, collapses whitespace, and enforces max length.
 */
export const sanitizeText = (value, maxLength = 200) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(DANGEROUS_BLOCK_REGEX, '')
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
 * Sanitizes an agent display name with a safe minimum length check.
 */
export const sanitizeAgentName = (value) => {
  const cleaned = sanitizeText(value, 50);
  return cleaned.length >= 2 ? cleaned : null;
};

/**
 * Sanitizes and validates a freight ticket resolution note.
 * Strips script/style blocks and HTML tags, trims blank space, and enforces 5–1500 char bounds.
 */
export const sanitizeResolutionNote = (value) => {
  if (typeof value !== 'string') {
    return {
      valid: false,
      value: '',
      message: 'Resolution note is required.',
    };
  }

  const cleaned = value
    .replace(DANGEROUS_BLOCK_REGEX, '')
    .replace(HTML_TAG_REGEX, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length < 5) {
    return {
      valid: false,
      value: cleaned,
      message: 'Resolution note must be at least 5 characters of valid text.',
    };
  }

  if (cleaned.length > 1500) {
    return {
      valid: false,
      value: cleaned.slice(0, 1500),
      message: 'Resolution note cannot exceed 1500 characters.',
    };
  }

  return {
    valid: true,
    value: cleaned,
    message: null,
  };
};