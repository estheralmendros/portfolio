import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/lib/slugify';

describe('slugify', () => {
  it.each([
    ['Gestión de Inventario', 'gestion-de-inventario'],
    ['  Hello,   World!! ', 'hello-world'],
    ['Ñandú & Co.', 'nandu-co'],
    ['C++ / C#', 'c-c'],
    ['already-a-slug', 'already-a-slug'],
    ['日本語', ''],
  ])('%j -> %j', (input, out) => expect(slugify(input)).toBe(out));
  it('caps at 60 chars and re-trims a trailing hyphen', () => {
    const s = slugify(`${'a'.repeat(59)} bcd`);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
    expect(s).toBe('a'.repeat(59));
  });
});
