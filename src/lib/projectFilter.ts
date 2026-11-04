// Pure helpers for the public project technology filter (SSR markup + src/scripts/projectFilter.ts).

const byLabel = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** Every distinct tag across projects: case-insensitive distinct, first spelling kept, sorted alphabetically. */
export function collectTags(projects: { tags: string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const p of projects) for (const t of p.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort(byLabel);
}

/**
 * Whether a card stays visible under the active filter `tag` ('' = All). Case-insensitive.
 * `tags === null` (unparseable `data-tags`) keeps the card visible under every filter.
 */
export function cardMatches(tags: string[] | null, tag: string): boolean {
  if (tag === '' || tags === null) return true;
  const wanted = tag.toLowerCase();
  return tags.some((t) => t.toLowerCase() === wanted);
}

/** `data-tags` value: a JSON array of lowercased tags (no delimiter to break). */
export function encodeTags(tags: string[]): string {
  return JSON.stringify(tags.map((t) => t.toLowerCase()));
}

/** Parses a `data-tags` value; null when missing, invalid or not an array of strings. */
export function decodeTags(attr: string | null): string[] | null {
  if (attr == null) return null;
  try {
    const value: unknown = JSON.parse(attr);
    return Array.isArray(value) && value.every((t) => typeof t === 'string') ? (value as string[]) : null;
  } catch {
    return null;
  }
}
