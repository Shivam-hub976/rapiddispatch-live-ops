const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:5000'
).replace(/\/+$/, '');

export const fetchTickets = async ({ timeoutMs = 8000 } = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch freight tickets (HTTP ${response.status}).`);
    }

    const payload = await response.json();
    if (!payload?.success || !Array.isArray(payload.data)) {
      throw new Error('Unexpected response format from RapidDispatch API.');
    }

    return payload.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Server request timed out. Please verify the backend is running.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};