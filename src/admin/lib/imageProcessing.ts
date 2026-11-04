// Client-side image handling for uploads (prd2 Feature 3): type/size rules, resize, SVG → PNG rasterization,
// and the save-time upload path. The browser specifics live behind ImageCodec so the rules are unit-testable.
import { buildUploadPath, type UploadCollection, type UploadExt } from '../../lib/uploads';
import {
  IMAGE_INPUT_TOO_LARGE, IMAGE_OUTPUT_TOO_LARGE, IMAGE_TYPE, IMAGE_TYPE_BADGE, IMAGE_UNREADABLE, SVG_UNREADABLE, UPLOAD_PATH_TYPED,
} from '../messages';
import { bytesToBase64 } from './base64';
import { ImageError } from './errors';
import type { FileChange } from './githubClient';

export type ImageKind = 'project' | 'profile' | 'badge';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_SIDE = 1600;
export const BADGE_SVG_SIDE = 320;

const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SVG_TYPE = 'image/svg+xml';
const LOSSY_QUALITY = 0.85;
const EXT_BY_TYPE: Record<string, UploadExt> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function acceptedTypes(kind: ImageKind): string[] {
  return kind === 'badge' ? [...RASTER_TYPES, SVG_TYPE] : [...RASTER_TYPES];
}

/** Longest side at most `max`; never upscales; each side at least 1 px. */
export function computeTargetSize(w: number, h: number, max: number = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Longest side = `side` (vectors may upscale); no intrinsic size → side × side. */
export function computeSvgTargetSize(w: number, h: number, side: number = BADGE_SVG_SIDE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: side, height: side };
  const scale = side / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export interface ProcessedImage {
  blob: Blob;
  ext: UploadExt; // never 'svg'
  width: number;
  height: number;
}

export interface ImageCodec {
  /** createImageBitmap */
  decode(file: Blob): Promise<{ width: number; height: number; source: CanvasImageSource }>;
  /** <img> via a blob: URL (scripts and external resources stay inert); width/height may be 0. */
  decodeSvg(file: Blob): Promise<{ width: number; height: number; source: CanvasImageSource }>;
  /** Draws to a canvas and calls toBlob; throws on a tainted canvas or a null blob. */
  encode(src: CanvasImageSource, w: number, h: number, type: string, quality?: number): Promise<Blob>;
}

/** Browser codec (canvas). Covered by the Playwright upload tests; unit tests inject a fake. */
export const browserCodec: ImageCodec = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  },
  async decodeSvg(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG failed to load'));
        img.src = url;
      });
      return { width: img.naturalWidth, height: img.naturalHeight, source: img };
    } finally {
      URL.revokeObjectURL(url);
    }
  },
  async encode(src, w, h, type, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    // toBlob throws SecurityError synchronously on a tainted canvas.
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), type, quality);
    });
  },
};

const release = (source: CanvasImageSource) => (source as Partial<ImageBitmap>).close?.();

/** Throws ImageError with the Feature 3 message. SVG (badges only) → PNG. */
export async function processImage(file: File, kind: ImageKind, codec: ImageCodec = browserCodec): Promise<ProcessedImage> {
  if (!acceptedTypes(kind).includes(file.type)) throw new ImageError(kind === 'badge' ? IMAGE_TYPE_BADGE : IMAGE_TYPE);
  if (file.size > MAX_INPUT_BYTES) throw new ImageError(IMAGE_INPUT_TOO_LARGE);
  const isSvg = file.type === SVG_TYPE;
  const unreadable = isSvg ? SVG_UNREADABLE : IMAGE_UNREADABLE;

  let blob: Blob;
  let size: { width: number; height: number };
  try {
    const decoded = isSvg ? await codec.decodeSvg(file) : await codec.decode(file);
    size = isSvg ? computeSvgTargetSize(decoded.width, decoded.height) : computeTargetSize(decoded.width, decoded.height);
    const type = isSvg ? 'image/png' : file.type;
    const quality = type === 'image/png' ? undefined : LOSSY_QUALITY;
    try {
      blob = await codec.encode(decoded.source, size.width, size.height, type, quality);
    } finally {
      release(decoded.source);
    }
  } catch {
    throw new ImageError(unreadable);
  }

  const outType = blob.type || (isSvg ? 'image/png' : file.type);
  const ext = isSvg ? (outType === 'image/png' ? 'png' : undefined) : EXT_BY_TYPE[outType];
  if (!ext) throw new ImageError(unreadable);
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageError(IMAGE_OUTPUT_TOO_LARGE);
  return { blob, ext, width: size.width, height: size.height };
}

/** Form state for a selected file; never written to JSON. */
export interface PendingUpload {
  image: ProcessedImage;
  shortId: string;
  objectUrl: string;
}

/** Called at Save once the final id is known. */
export async function finalizeUpload(
  c: UploadCollection,
  finalId: string,
  pending: PendingUpload,
): Promise<{ path: string; file: FileChange }> {
  const path = buildUploadPath(c, finalId, pending.image.ext, pending.shortId);
  return { path, file: { path, content: await blobToBase64(pending.image.blob), encoding: 'base64' } };
}

/** Hand-typed upload paths are blocked unless the value is the one loaded from the repo (kept unchanged). */
export function checkTypedImageRef(value: string, loadedValue: string | undefined): string | null {
  const v = value.trim();
  return v.startsWith('src/') && v !== loadedValue ? UPLOAD_PATH_TYPED : null;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}
