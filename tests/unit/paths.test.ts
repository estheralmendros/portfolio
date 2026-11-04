import { describe, expect, it } from 'vitest';
import { isExternalUrl, withBase } from '../../src/lib/paths';

describe('withBase', () => {
  it.each([
    ['/projects/x/', '/portfolio/projects/x/'],
    ['/', '/portfolio/'],
    ['', '/portfolio/'],
    ['projects/x/', '/portfolio/projects/x/'],
    ['/theme-init.js', '/portfolio/theme-init.js'],
    ['/#projects', '/portfolio/#projects'],
  ])('%j -> %j', (input, out) => expect(withBase(input)).toBe(out));
  it('leaves absolute URLs unchanged', () => {
    expect(withBase('https://example.com/a')).toBe('https://example.com/a');
    expect(withBase('mailto:a@b.co')).toBe('mailto:a@b.co');
  });
  it('is idempotent for paths already under the base', () => {
    expect(withBase('/portfolio/cv.pdf')).toBe('/portfolio/cv.pdf');
    expect(withBase('/portfolio')).toBe('/portfolio');
    expect(withBase(withBase('/x'))).toBe('/portfolio/x');
  });
  it('does not treat a lookalike prefix as the base', () => expect(withBase('/portfolio-old/x')).toBe('/portfolio/portfolio-old/x'));
  it('never produces a double slash', () => expect(withBase('//x')).not.toContain('//x'));
});

describe('isExternalUrl', () => {
  it.each(['https://a.com', 'http://a.com', 'mailto:x@y.z', '//a.com/x'])('%s is external', (u) => expect(isExternalUrl(u)).toBe(true));
  it.each(['/a', 'a', '#x', './a'])('%s is internal', (u) => expect(isExternalUrl(u)).toBe(false));
});
