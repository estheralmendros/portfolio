/** Comma-separated tags: trimmed, empties removed, de-duplicated case-insensitively keeping the first spelling. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const tag = raw.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

/** Optional = omitted: drops keys whose value is an empty or whitespace-only string. */
export function emptyToUndefined<T extends Record<string, unknown>>(values: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out as T;
}

/**
 * First message per field. The path is cut at the first array index, so an issue on an item
 * ('tags.1', 'highlights.0') belongs to its parent field ('tags', 'highlights') (review R6).
 * Nested object paths are kept joined ('socials.email').
 */
export function issuesToFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const index = issue.path.findIndex((p) => typeof p === 'number');
    const key = (index === -1 ? issue.path : issue.path.slice(0, index)).map(String).join('.');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** One entry per line (highlights): trimmed, blank lines dropped. */
export function parseLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
