// Build-only, glob-backed image resolver used by the Astro pages. Never import from the admin or unit tests:
// importing this module eagerly loads every upload under src/assets/uploads. Use ./imageResolver instead.
import type { ImageMetadata } from 'astro';
import { createImageResolver } from './imageResolver';

export type { ImageResolver, RasterMap, ResolvedImage } from './imageResolver';

export const resolveImage = createImageResolver(
  import.meta.glob<{ default: ImageMetadata }>('/src/assets/uploads/**/*.{jpg,png,webp}', { eager: true }),
);
