// Vitest stand-in for 'astro:assets' (aliased in vitest.config.ts). Deterministic, no sharp, no files.
import type { ImageMetadata } from 'astro';

interface GetImageOptions {
  src: ImageMetadata | string;
  width?: number;
  format?: string;
}

export async function getImage(options: GetImageOptions): Promise<{ src: string; attributes: { width: number; height: number } }> {
  if (typeof options.src === 'string') throw new Error('astroAssets mock: only ImageMetadata sources are supported');
  const meta = options.src;
  const width = options.width ?? meta.width;
  const height = Math.round((meta.height * width) / meta.width);
  const name = meta.src.split('/').pop() ?? 'image';
  return { src: `/portfolio/_astro/${name}_${width}.${options.format ?? meta.format}`, attributes: { width, height } };
}
