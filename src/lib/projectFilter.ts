// Pure helpers for the public project technology filter (SSR markup + src/scripts/projectFilter.ts).

const byLabel = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** Every distinct tag across projects: case-insensitive distinct, first spelling kept, sorted alphabetically. */
export function collectTags(projects: { tags: string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const p of projects) for (const t of p.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort(byLabel);
}

/** Ids of the projects carrying `tag` (case-insensitive); `null` -> all. */
export function filterProjectIds(projects: { id: string; tags: string[] }[], tag: string | null): Set<string> {
  const wanted = tag?.toLowerCase();
  return new Set(projects.filter((p) => wanted == null || p.tags.some((t) => t.toLowerCase() === wanted)).map((p) => p.id));
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
