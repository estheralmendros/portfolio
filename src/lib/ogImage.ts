import { SITE } from '../config/site';
import type { ResolvedImage } from './imageResolver';

export interface OgImage {
  url: string;
  width?: number;
  height?: number;
}

/** Absolute og:image from a resolved image (src already includes the base); size only when both are known. */
export function toOgImage(img: ResolvedImage | undefined): OgImage | undefined {
  if (!img) return undefined;
  if (/^https:\/\//i.test(img.src)) return { url: img.src };
  const url = new URL(img.src, SITE.origin).href;
  return img.width != null && img.height != null ? { url, width: img.width, height: img.height } : { url };
}
