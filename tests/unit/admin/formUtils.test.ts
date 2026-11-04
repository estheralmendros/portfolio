import { describe, expect, it } from 'vitest';
import { emptyToUndefined, issuesToFieldErrors, parseLines, parseTags } from '../../../src/admin/lib/formUtils';

describe('parseTags', () => {
  it('trims, drops empties, dedupes case-insensitively keeping the first spelling', () =>
    expect(parseTags(' React, TypeScript,, react ,  , Astro,TYPESCRIPT')).toEqual(['React', 'TypeScript', 'Astro']));
  it('returns [] for an empty input', () => expect(parseTags('   ')).toEqual([]));
});

describe('emptyToUndefined', () => {
  it('omits empty and whitespace-only strings', () => {
    const out = emptyToUndefined({ a: '', b: '  ', c: 'x', d: false, e: [] as string[], f: 0 });
    expect(out).toEqual({ c: 'x', d: false, e: [], f: 0 });
    expect('a' in out).toBe(false);
  });
});

describe('issuesToFieldErrors', () => {
  it('keeps the first message per joined path', () =>
    expect(
      issuesToFieldErrors([
        { path: ['summary'], message: 'Required' },
        { path: ['summary'], message: 'Too short' },
        { path: ['socials', 'email'], message: 'Invalid email' },
      ]),
    ).toEqual({ summary: 'Required', 'socials.email': 'Invalid email' }));
  it('maps array-item issues to the parent field (review R6), first message wins', () =>
    expect(
      issuesToFieldErrors([
        { path: ['tags', 1], message: 'Too long' },
        { path: ['tags', 3], message: 'Too short' },
        { path: ['highlights', 0], message: 'Too big' },
        { path: ['highlights'], message: 'Too many' },
      ]),
    ).toEqual({ tags: 'Too long', highlights: 'Too big' }));
});

describe('parseLines', () => {
  it('splits on newlines (LF and CRLF), trims and drops blank lines', () => {
    expect(parseLines('  Led the team \r\n\n   \nShipped v2\n')).toEqual(['Led the team', 'Shipped v2']);
  });
  it('returns [] for empty or whitespace-only input', () => {
    expect(parseLines('')).toEqual([]);
    expect(parseLines(' \n \t ')).toEqual([]);
  });
  it('keeps duplicates and inner spacing', () => {
    expect(parseLines('a  b\na  b')).toEqual(['a  b', 'a  b']);
  });
});
