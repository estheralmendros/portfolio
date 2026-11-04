// Regenerates the binary e2e image fixtures (run: `node tests/fixtures/images/generate.ts`).
// Kept small on purpose: large inputs (oversized output, >20 MB) are generated in memory by the e2e tests.
import path from 'node:path';
import sharp from 'sharp';

const dir = path.dirname(new URL(import.meta.url).pathname);

// 2000×1500 JPEG (resized to 1600×1200 by the admin). A smooth gradient keeps the file tiny.
const gradient = (width: number, height: number) => {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      data[i] = Math.round((x / width) * 255);
      data[i + 1] = Math.round((y / height) * 255);
      data[i + 2] = 128;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } });
};

await gradient(2000, 1500).jpeg({ quality: 60 }).toFile(path.join(dir, 'photo.jpg'));
// 2400×600 PNG (resized to 1600×400), flat colour.
await sharp({ create: { width: 2400, height: 600, channels: 3, background: { r: 40, g: 90, b: 160 } } })
  .png()
  .toFile(path.join(dir, 'wide.png'));
