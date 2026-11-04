import { describe, expect, it } from 'vitest';
import { toOgImage } from '../../src/lib/ogImage';

describe('toOgImage', () => {
  it('no image -> undefined (Seo falls back to the default OG image)', () => expect(toOgImage(undefined)).toBeUndefined());
  it('https image is used as-is without size', () =>
    expect(toOgImage({ src: 'https://x.com/a.png' })).toEqual({ url: 'https://x.com/a.png' }));
  it('public path (already based) becomes absolute', () =>
    expect(toOgImage({ src: '/portfolio/images/a.png' })).toEqual({ url: 'https://estheralmendros.github.io/portfolio/images/a.png' }));
  it('optimized upload -> absolute URL with width and height', () =>
    expect(toOgImage({ src: '/portfolio/_astro/shot.Ab12.webp', width: 1200, height: 675 })).toEqual({
      url: 'https://estheralmendros.github.io/portfolio/_astro/shot.Ab12.webp',
      width: 1200,
      height: 675,
    }));
  it('omits size unless both are known', () =>
    expect(toOgImage({ src: '/portfolio/_astro/a.webp', width: 1200 })).toEqual({
      url: 'https://estheralmendros.github.io/portfolio/_astro/a.webp',
    }));
});
