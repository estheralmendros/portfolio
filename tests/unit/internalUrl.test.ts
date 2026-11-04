import { describe, expect, it } from 'vitest';
import { isInternalUrlOk } from '../smoke/internalUrl';

const page = (p: string) => `https://estheralmendros.github.io/portfolio/${p}`;

describe('isInternalUrlOk', () => {
  it.each([
    ['https://estheralmendros.github.io/portfolio', 'skipped'],
    ['https://estheralmendros.github.io/other-site/', 'skipped'],
    ['mailto:a@b.co', 'skipped'],
    ['data:image/png;base64,AA', 'skipped'],
    ['tel:123', 'skipped'],
    ['', 'skipped'],
    ['#frag', 'skipped'],
    ['//cdn.example.com/x.js', 'skipped'],
    ['/portfolio', 'ok'],
    ['/portfolio/projects/x/', 'ok'],
    ['/projects/x/', 'fail'],
    ['/portfolio-old/x', 'fail'],
  ] as const)('%j from home -> %s', (value, expected) => expect(isInternalUrlOk(value, page(''))).toBe(expected));

  it('resolves relative values against the page URL', () => {
    expect(isInternalUrlOk('../x/', page('projects/a/'))).toBe('ok');
    expect(isInternalUrlOk('./rel', page('projects/a/'))).toBe('ok');
    expect(isInternalUrlOk('../../../foo', page('projects/a/'))).toBe('fail');
  });
});
