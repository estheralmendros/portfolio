import { describe, expect, it } from 'vitest';
import { bytesToBase64, decodeUtf8Base64, encodeUtf8Base64 } from '../../../src/admin/lib/base64';

describe('base64', () => {
  it('round-trips UTF-8', () => {
    const text = '{"title":"Gestión de Inventario ✓ 日本"}\n';
    expect(decodeUtf8Base64(encodeUtf8Base64(text))).toBe(text);
  });
  it('matches the standard encoding', () => expect(encodeUtf8Base64('Gestión')).toBe(Buffer.from('Gestión', 'utf8').toString('base64')));
  it('tolerates newlines as GitHub returns them', () => {
    const b64 = Buffer.from('a'.repeat(100), 'utf8').toString('base64');
    const wrapped = b64.replace(/(.{60})/g, '$1\n');
    expect(decodeUtf8Base64(wrapped)).toBe('a'.repeat(100));
  });
});

describe('bytesToBase64', () => {
  it('encodes binary bytes (incl. > 32 KiB) like Buffer', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 37) % 256);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });
});
