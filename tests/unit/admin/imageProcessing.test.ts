import { describe, expect, it, vi } from 'vitest';
import {
  BADGE_SVG_SIDE, MAX_IMAGE_BYTES, MAX_INPUT_BYTES, MAX_SIDE,
  acceptedTypes, blobToBase64, checkTypedImageRef, computeSvgTargetSize, computeTargetSize, finalizeUpload, processImage,
  type ImageCodec, type PendingUpload,
} from '../../../src/admin/lib/imageProcessing';
import { ImageError } from '../../../src/admin/lib/errors';
import {
  IMAGE_INPUT_TOO_LARGE, IMAGE_OUTPUT_TOO_LARGE, IMAGE_TYPE, IMAGE_TYPE_BADGE, IMAGE_UNREADABLE, SVG_UNREADABLE, UPLOAD_PATH_TYPED,
} from '../../../src/admin/messages';
import { UPLOAD_PATH_RE } from '../../../src/lib/uploads';

const file = (type: string, size = 10, name = 'x') => new File([new Uint8Array(size)], name, { type });
const source = { close: vi.fn() } as unknown as CanvasImageSource;

function codec(opts: {
  size?: [number, number];
  svgSize?: [number, number];
  outType?: string;
  outBytes?: number;
  decodeError?: unknown;
  svgError?: unknown;
  encodeError?: unknown;
} = {}) {
  const c = {
    decode: vi.fn(async () => {
      if (opts.decodeError) throw opts.decodeError;
      const [width, height] = opts.size ?? [4000, 3000];
      return { width, height, source };
    }),
    decodeSvg: vi.fn(async () => {
      if (opts.svgError) throw opts.svgError;
      const [width, height] = opts.svgSize ?? [100, 50];
      return { width, height, source };
    }),
    encode: vi.fn(async (_src: CanvasImageSource, _w: number, _h: number, type: string) => {
      if (opts.encodeError) throw opts.encodeError;
      return new Blob([new Uint8Array(opts.outBytes ?? 100)], { type: opts.outType ?? type });
    }),
  };
  return c satisfies ImageCodec;
}

async function imageError(p: Promise<unknown>): Promise<string> {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(ImageError);
  return (err as Error).message;
}

describe('constants', () => {
  it('match the PRD', () => {
    expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_INPUT_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_SIDE).toBe(1600);
    expect(BADGE_SVG_SIDE).toBe(320);
  });
  it('messages are the PRD copy', () => {
    expect(IMAGE_TYPE).toBe('Use a JPG, PNG or WebP image');
    expect(IMAGE_INPUT_TOO_LARGE).toBe('Image is too large to process');
    expect(IMAGE_OUTPUT_TOO_LARGE).toBe('Image is still larger than 2 MB after resizing. Use a smaller image.');
    expect(SVG_UNREADABLE).toBe("Couldn't read this SVG. Use a PNG instead.");
    expect(UPLOAD_PATH_TYPED).toBe("Upload paths can't be typed; use Upload image");
  });
});

describe('acceptedTypes', () => {
  it('raster only for project and profile; badges also accept SVG', () => {
    expect(acceptedTypes('project')).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(acceptedTypes('profile')).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(acceptedTypes('badge')).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
  });
});

describe('computeTargetSize', () => {
  it.each([
    [[4000, 3000, 1600], { width: 1600, height: 1200 }],
    [[3000, 4000, 1600], { width: 1200, height: 1600 }],
    [[800, 600, 1600], { width: 800, height: 600 }],
    [[1600, 1600, 1600], { width: 1600, height: 1600 }],
    [[3001, 1000, 1600], { width: 1600, height: 533 }],
    [[10000, 1, 1600], { width: 1600, height: 1 }],
    [[1000, 500, 400], { width: 400, height: 200 }],
  ] as const)('%j → %j (never upscales)', ([w, h, max], expected) => expect(computeTargetSize(w, h, max)).toEqual(expected));
  it('defaults max to MAX_SIDE', () => expect(computeTargetSize(3200, 1600)).toEqual({ width: 1600, height: 800 }));
});

describe('computeSvgTargetSize', () => {
  it.each([
    [[100, 50], { width: 320, height: 160 }],
    [[1000, 2000], { width: 160, height: 320 }],
    [[320, 320], { width: 320, height: 320 }],
    [[0, 0], { width: 320, height: 320 }],
    [[0, 50], { width: 320, height: 320 }],
    [[1000, 1], { width: 320, height: 1 }],
  ] as const)('%j → %j (longest side = 320, vectors may upscale)', ([w, h], expected) => expect(computeSvgTargetSize(w, h)).toEqual(expected));
  it('accepts a custom side', () => expect(computeSvgTargetSize(10, 20, 100)).toEqual({ width: 50, height: 100 }));
});

describe('processImage: type and size rules', () => {
  it.each(['project', 'profile'] as const)('%s rejects SVG and other types before decoding', async (kind) => {
    for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', '']) {
      const c = codec();
      expect(await imageError(processImage(file(type), kind, c))).toBe(IMAGE_TYPE);
      expect(c.decode).not.toHaveBeenCalled();
      expect(c.decodeSvg).not.toHaveBeenCalled();
    }
  });

  it('badge rejects non-image types with the "or SVG" message', async () => {
    const c = codec();
    expect(await imageError(processImage(file('image/gif'), 'badge', c))).toBe(IMAGE_TYPE_BADGE);
    expect(IMAGE_TYPE_BADGE).toBe('Use a JPG, PNG, WebP or SVG image');
  });

  it('rejects input over 20 MB before decoding', async () => {
    const c = codec();
    expect(await imageError(processImage(file('image/jpeg', MAX_INPUT_BYTES + 1), 'project', c))).toBe(IMAGE_INPUT_TOO_LARGE);
    expect(c.decode).not.toHaveBeenCalled();
  });

  it('accepts exactly 20 MB', async () => {
    await expect(processImage(file('image/jpeg', MAX_INPUT_BYTES), 'project', codec())).resolves.toBeDefined();
  });

  it('rejects output over 2 MB; exactly 2 MB passes', async () => {
    expect(await imageError(processImage(file('image/png'), 'profile', codec({ outBytes: MAX_IMAGE_BYTES + 1 })))).toBe(IMAGE_OUTPUT_TOO_LARGE);
    await expect(processImage(file('image/png'), 'profile', codec({ outBytes: MAX_IMAGE_BYTES }))).resolves.toBeDefined();
  });

  it('a corrupt raster (decode rejects) gets the unreadable-image message', async () => {
    expect(await imageError(processImage(file('image/jpeg'), 'project', codec({ decodeError: new DOMException('bad', 'InvalidStateError') })))).toBe(IMAGE_UNREADABLE);
  });

  it('an encoder failure (e.g. toBlob → null) gets the unreadable-image message', async () => {
    expect(await imageError(processImage(file('image/jpeg'), 'project', codec({ encodeError: new Error('toBlob returned null') })))).toBe(IMAGE_UNREADABLE);
  });
});

describe('processImage: raster', () => {
  it.each([
    ['image/jpeg', 'jpg', 0.85],
    ['image/webp', 'webp', 0.85],
    ['image/png', 'png', undefined],
  ] as const)('%s: resizes to max 1600 and re-encodes the same format', async (type, ext, quality) => {
    const c = codec({ size: [4000, 3000] });
    const out = await processImage(file(type), 'project', c);
    expect(c.encode).toHaveBeenCalledWith(source, 1600, 1200, type, quality);
    expect(out).toMatchObject({ ext, width: 1600, height: 1200 });
    expect(out.blob.type).toBe(type);
  });

  it('never upscales a small image', async () => {
    const c = codec({ size: [640, 480] });
    expect(await processImage(file('image/jpeg'), 'profile', c)).toMatchObject({ width: 640, height: 480 });
  });

  it('uses the type the encoder actually returned (no WebP encoder → PNG)', async () => {
    const out = await processImage(file('image/webp'), 'project', codec({ outType: 'image/png' }));
    expect(out.ext).toBe('png');
  });

  it('an empty returned type means the requested one', async () => {
    expect((await processImage(file('image/jpeg'), 'project', codec({ outType: '' }))).ext).toBe('jpg');
  });

  it('releases the decoded bitmap', async () => {
    const close = vi.fn();
    const c = codec();
    c.decode.mockResolvedValueOnce({ width: 10, height: 10, source: { close } as unknown as CanvasImageSource });
    await processImage(file('image/png'), 'project', c);
    expect(close).toHaveBeenCalledOnce();
  });

  it('badges accept raster images too', async () => {
    const c = codec({ size: [200, 200] });
    expect(await processImage(file('image/png'), 'badge', c)).toMatchObject({ ext: 'png', width: 200, height: 200 });
    expect(c.decodeSvg).not.toHaveBeenCalled();
  });
});

describe('processImage: SVG badge → PNG', () => {
  it('loads through decodeSvg and encodes a PNG with longest side 320', async () => {
    const c = codec({ svgSize: [100, 50] });
    const out = await processImage(file('image/svg+xml'), 'badge', c);
    expect(c.decode).not.toHaveBeenCalled();
    expect(c.encode).toHaveBeenCalledWith(source, 320, 160, 'image/png', undefined);
    expect(out).toMatchObject({ ext: 'png', width: 320, height: 160 });
  });

  it('no intrinsic size (0×0) → 320×320', async () => {
    const out = await processImage(file('image/svg+xml'), 'badge', codec({ svgSize: [0, 0] }));
    expect(out).toMatchObject({ width: 320, height: 320, ext: 'png' });
  });

  it('a load failure is rejected with the SVG message', async () => {
    expect(await imageError(processImage(file('image/svg+xml'), 'badge', codec({ svgError: new Error('load') })))).toBe(SVG_UNREADABLE);
  });

  it('a tainted canvas (SecurityError from toBlob) is rejected with the SVG message', async () => {
    const err = new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    expect(await imageError(processImage(file('image/svg+xml'), 'badge', codec({ encodeError: err })))).toBe(SVG_UNREADABLE);
  });

  it('never yields an svg extension, even if the encoder reports something else', async () => {
    expect(await imageError(processImage(file('image/svg+xml'), 'badge', codec({ outType: 'image/svg+xml' })))).toBe(SVG_UNREADABLE);
  });

  it('applies the 2 MB rule to the PNG', async () => {
    expect(await imageError(processImage(file('image/svg+xml'), 'badge', codec({ outBytes: MAX_IMAGE_BYTES + 1 })))).toBe(IMAGE_OUTPUT_TOO_LARGE);
  });
});

describe('finalizeUpload', () => {
  const pending = (ext: 'jpg' | 'png' | 'webp' = 'webp'): PendingUpload => ({
    image: { blob: new Blob([Uint8Array.from([0, 1, 2, 250])], { type: `image/${ext}` }), ext, width: 10, height: 10 },
    shortId: 'a1b2c3',
    objectUrl: 'blob:x',
  });

  it('builds the path from the final id given at save time and a base64 file change', async () => {
    const res = await finalizeUpload('projects', 'my-app', pending());
    expect(res.path).toBe('src/assets/uploads/projects/my-app-a1b2c3.webp');
    expect(res.path).toMatch(UPLOAD_PATH_RE);
    expect(res.file).toEqual({ path: res.path, content: Buffer.from([0, 1, 2, 250]).toString('base64'), encoding: 'base64' });
  });

  it('the same pending upload follows a changed id (no selection-time slug)', async () => {
    const p = pending('png');
    expect((await finalizeUpload('projects', 'first-title', p)).path).toBe('src/assets/uploads/projects/first-title-a1b2c3.png');
    expect((await finalizeUpload('projects', 'final-title', p)).path).toBe('src/assets/uploads/projects/final-title-a1b2c3.png');
  });

  it('uses the collection folder (profile photo, badges)', async () => {
    expect((await finalizeUpload('profile', 'profile', pending('jpg'))).path).toBe('src/assets/uploads/profile/profile-a1b2c3.jpg');
    expect((await finalizeUpload('certifications', 'aws-saa', pending('png'))).path).toBe('src/assets/uploads/certifications/aws-saa-a1b2c3.png');
  });
});

describe('checkTypedImageRef', () => {
  const loaded = 'src/assets/uploads/projects/app-a1b2c3.webp';
  it.each([
    ['src/assets/uploads/projects/nope-a1b2c3.webp', undefined, UPLOAD_PATH_TYPED],
    ['src/assets/uploads/projects/nope-a1b2c3.webp', loaded, UPLOAD_PATH_TYPED],
    ['  src/x', undefined, UPLOAD_PATH_TYPED],
    ['src/', undefined, UPLOAD_PATH_TYPED],
    [loaded, loaded, null],
    [` ${loaded} `, loaded, null],
    ['https://example.com/a.png', undefined, null],
    ['/images/a.png', loaded, null],
    ['', loaded, null],
    ['assets/src/x.png', undefined, null],
  ] as const)('%j (loaded %j) → %j', (value, loadedValue, expected) => expect(checkTypedImageRef(value, loadedValue)).toBe(expected));
});

describe('blobToBase64', () => {
  it('encodes binary blobs', async () => {
    const bytes = Uint8Array.from({ length: 50_000 }, (_, i) => (i * 7) % 256);
    expect(await blobToBase64(new Blob([bytes]))).toBe(Buffer.from(bytes).toString('base64'));
  });
});
