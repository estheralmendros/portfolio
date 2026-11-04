import { expect, it } from 'vitest';
import { initials } from '../../src/lib/initials';

it.each([
  ['TypeScript', 'TS'],
  ['JavaScript', 'JS'],
  ['GitHub Actions', 'GA'],
  ['Docker', 'Do'],
  ['Esther Almendros', 'EA'],
  ['x', 'X'],
  ['  ', '?'],
])('%j -> %j', (name, out) => expect(initials(name)).toBe(out));
