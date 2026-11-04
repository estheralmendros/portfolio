// Build-only, glob-backed image resolver used by the Astro pages. Never import from the admin or unit tests:
// importing this module eagerly loads every upload under src/assets/uploads. Use ./imageResolver instead.
import type { ImageMetadata } from 'astro';
import { createImageResolver } from './imageResolver';

export type { ImageResolver, RasterMap, ResolvedImage } from './imageResolver';

type Rasters = Record<string, { default: ImageMetadata }>;

const uploads: Rasters = import.meta.glob('/src/assets/uploads/**/*.{jpg,png,webp}', { eager: true });
// '@extra-uploads' (astro.config.ts) is tests/fixtures/uploads in fixture builds, else src/assets/uploads again.
// Its files are re-keyed under /src/assets/uploads/, so fixture content uses ordinary upload paths.
const extra: Rasters = import.meta.glob('@extra-uploads/**/*.{jpg,png,webp}', { eager: true });
const EXTRA_PREFIX = /^.*?\/(?:tests\/fixtures|src\/assets)\/uploads\//;

export const resolveImage = createImageResolver({
  ...Object.fromEntries(Object.entries(extra).map(([key, mod]) => [key.replace(EXTRA_PREFIX, '/src/assets/uploads/'), mod])),
  ...uploads,
});
