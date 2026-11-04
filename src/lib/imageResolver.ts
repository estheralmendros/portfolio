// Pure image resolution: no glob, so unit tests (and types for the admin) never load real uploads (review R2).
// The glob-backed instance used by pages lives in images.ts.
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { withBase } from './paths';
import { isUploadPath, toGlobKey } from './uploads';

export interface ResolvedImage {
  src: string;
  width?: number;
  height?: number;
}

/** Keys are root-absolute: '/src/assets/uploads/…'. */
export type RasterMap = Record<string, { default: ImageMetadata }>;

export type ImageResolver = (ref: string | undefined, opts?: { width?: number }) => Promise<ResolvedImage | undefined>;

const DEFAULT_WIDTH = 1200;

/**
 * https -> as-is; '/x' -> withBase('/x'); upload path -> optimized WebP via astro:assets
 * (width = min(opts.width ?? 1200, source width)); an upload missing from `rasters` throws `Missing image: <ref>`.
 */
export function createImageResolver(rasters: RasterMap): ImageResolver {
  return async (ref, opts) => {
    if (!ref) return undefined;
    if (/^https:\/\//i.test(ref)) return { src: ref };
    if (isUploadPath(ref)) {
      const meta = rasters[toGlobKey(ref)]?.default;
      if (!meta) throw new Error(`Missing image: ${ref}`);
      const img = await getImage({ src: meta, width: Math.min(opts?.width ?? DEFAULT_WIDTH, meta.width), format: 'webp' });
      return { src: img.src, width: Number(img.attributes.width), height: Number(img.attributes.height) };
    }
    return { src: withBase(ref) };
  };
}
