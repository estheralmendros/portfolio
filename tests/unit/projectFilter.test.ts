import { describe, expect, it } from 'vitest';
import { collectTags, decodeTags, encodeTags, filterProjectIds } from '../../src/lib/projectFilter';

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

describe('filterProjectIds', () => {
  it('null tag -> every project', () => expect(filterProjectIds(projects, null)).toEqual(new Set(['a', 'b', 'c', 'd'])));
  it('matches case-insensitively', () => {
    expect(filterProjectIds(projects, 'REACT')).toEqual(new Set(['a', 'b']));
    expect(filterProjectIds(projects, 'react')).toEqual(new Set(['a', 'b']));
  });
  it('tags with delimiters match exactly', () => {
    expect(filterProjectIds(projects, 'c|d')).toEqual(new Set(['b']));
    expect(filterProjectIds(projects, 'C')).toEqual(new Set());
    expect(filterProjectIds(projects, 'a,b')).toEqual(new Set(['d']));
    expect(filterProjectIds(projects, 'r&d')).toEqual(new Set(['d']));
  });
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
