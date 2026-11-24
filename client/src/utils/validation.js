const DANGEROUS_BLOCK_REGEX = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG_REGEX = /<[^>]*>/g;

export const MIN_RESOLUTION_LENGTH = 5;
export const MAX_RESOLUTION_LENGTH = 1500;

/**
 * Mirrors server-side sanitization so invalid or empty inputs are blocked
 * immediately on the client before emitting WebSocket frames.
 */
export const sanitizeResolutionInput = (rawValue) => {
  if (typeof rawValue !== 'string') return '';

  return rawValue
    .replace(DANGEROUS_BLOCK_REGEX, '')
    .replace(HTML_TAG_REGEX, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const validateResolutionNote = (rawValue) => {
  const cleaned = sanitizeResolutionInput(rawValue);

  if (!cleaned) {
    return {
      valid: false,
      cleaned,
      error: 'Please enter a dispatch resolution note before submitting.',
    };
  }

  if (cleaned.length < MIN_RESOLUTION_LENGTH) {
    return {
      valid: false,
      cleaned,
      error: `Resolution note must contain at least ${MIN_RESOLUTION_LENGTH} characters of plain text.`,
    };
  }

  if (cleaned.length > MAX_RESOLUTION_LENGTH) {
    return {
      valid: false,
      cleaned: cleaned.slice(0, MAX_RESOLUTION_LENGTH),
      error: `Resolution note cannot exceed ${MAX_RESOLUTION_LENGTH} characters.`,
    };
  }

  return {
    valid: true,
    cleaned,
    error: '',
  };
};