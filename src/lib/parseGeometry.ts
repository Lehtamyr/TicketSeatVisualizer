/**
 * Parses geometry stored as a JSON string (e.g. from SQLite/Postgres text columns) or returns raw object.
 */
export function parseGeometry(raw: unknown) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      // Ignore malformed JSON and return raw
    }
  }
  return raw;
}
