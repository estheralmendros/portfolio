import { describe, expect, it } from 'vitest';
import { cardMatches, collectTags, decodeTags, encodeTags } from '../../src/lib/projectFilter';

const projects = [
  { id: 'a', tags: ['React', 'TypeScript'] },
  { id: 'b', tags: ['react', 'Astro', 'C|D'] },
  { id: 'c', tags: [] },
  { id: 'd', tags: ['Node.js', 'a,b', 'say "hi"', 'R&D'] },
];

describe('collectTags', () => {
  it('distinct case-insensitively, first spelling kept, sorted alphabetically', () => {
    expect(collectTags(projects)).toEqual(['a,b', 'Astro', 'C|D', 'Node.js', 'R&D', 'React', 'say "hi"', 'TypeScript']);
  });
  it('empty for no tags', () => expect(collectTags([{ tags: [] }])).toEqual([]));
});

describe('cardMatches', () => {
  const ids = (tag: string) => projects.filter((p) => cardMatches(p.tags, tag)).map((p) => p.id);
  it("'' (All) -> every card, even without tags", () => expect(ids('')).toEqual(['a', 'b', 'c', 'd']));
  it('matches case-insensitively', () => {
    expect(ids('REACT')).toEqual(['a', 'b']);
    expect(ids('react')).toEqual(['a', 'b']);
  });
  it('tags with delimiters match exactly', () => {
    expect(ids('c|d')).toEqual(['b']);
    expect(ids('C')).toEqual([]);
    expect(ids('a,b')).toEqual(['d']);
    expect(ids('r&d')).toEqual(['d']);
  });
  it('unparseable tags (null) stay visible under every filter', () => {
    expect(cardMatches(null, '')).toBe(true);
    expect(cardMatches(null, 'react')).toBe(true);
  });
  it('a card without the tag is hidden', () => expect(cardMatches([], 'react')).toBe(false));
});

describe('encodeTags / decodeTags', () => {
  it('encodes a JSON array of lowercased tags', () => expect(encodeTags(['React', 'C|D'])).toBe('["react","c|d"]'));
  it('round-trips |, commas, quotes and &', () => {
    const tags = ['C|D', 'a,b', 'say "hi"', "it's", 'R&D'];
    expect(decodeTags(encodeTags(tags))).toEqual(tags.map((t) => t.toLowerCase()));
  });
  it.each([null, '', 'not json', '{"a":1}', '"react"', '[1,2]', '["a",null]', 'null'])('invalid %j -> null', (attr) =>
    expect(decodeTags(attr)).toBeNull(),
  );
  it('empty array is valid', () => expect(decodeTags('[]')).toEqual([]));
});
