// v2: resolveImage is async and glob-backed (src/lib/images.ts). Unit tests only use the pure
// createImageResolver with an injected raster map; 'astro:assets' is aliased to tests/mocks/astroAssets.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ImageMetadata } from 'astro';
import { createImageResolver, type RasterMap } from '../../src/lib/imageResolver';

const meta = (src: string, width: number, height: number): ImageMetadata => ({ src, width, height, format: 'jpg' });
const rasters: RasterMap = {
  '/src/assets/uploads/projects/shot-a1b2c3.jpg': { default: meta('/@fs/shot.jpg', 2000, 1000) },
  '/src/assets/uploads/profile/profile-000000.png': { default: meta('/@fs/me.png', 300, 300) },
};
const resolve = createImageResolver(rasters);

describe('createImageResolver', () => {
  it('returns undefined for no ref', async () => expect(await resolve(undefined)).toBeUndefined());
  it('keeps https URLs (no size)', async () => expect(await resolve('https://x.com/a.png')).toEqual({ src: 'https://x.com/a.png' }));
  it('prefixes public paths with the base', async () =>
    expect(await resolve('/images/a.png', { width: 800 })).toEqual({ src: '/portfolio/images/a.png' }));

  it('optimizes an upload to WebP at the requested width', async () => {
    expect(await resolve('src/assets/uploads/projects/shot-a1b2c3.jpg', { width: 800 })).toEqual({
      src: '/portfolio/_astro/shot.jpg_800.webp',
      width: 800,
      height: 400,
    });
  });
  it('defaults to 1200 px', async () =>
    expect(await resolve('src/assets/uploads/projects/shot-a1b2c3.jpg')).toMatchObject({ width: 1200, height: 600 }));
  it('never upscales past the source width', async () =>
    expect(await resolve('src/assets/uploads/profile/profile-000000.png', { width: 400 })).toEqual({
      src: '/portfolio/_astro/me.png_300.webp',
      width: 300,
      height: 300,
    }));
  it('throws Missing image for an upload path not in the map', async () => {
    await expect(resolve('src/assets/uploads/projects/nope-a1b2c3.webp')).rejects.toThrow(
      'Missing image: src/assets/uploads/projects/nope-a1b2c3.webp',
    );
  });

  it('imageResolver.ts is pure (no glob); images.ts holds the glob', () => {
    expect(readFileSync('src/lib/imageResolver.ts', 'utf8')).not.toMatch(/import\.meta\.glob/);
    const images = readFileSync('src/lib/images.ts', 'utf8');
    expect(images).toMatch(/import\.meta\.glob/);
    expect(images).toContain("'/src/assets/uploads/**/*.{jpg,png,webp}'");
  });
});
