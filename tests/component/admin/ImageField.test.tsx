import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ImageField } from '../../../src/admin/components/ImageField';
import { LastCommitContext } from '../../../src/admin/adminContext';
import { ImageError } from '../../../src/admin/lib/errors';
import type { ImageKind, PendingUpload, ProcessedImage } from '../../../src/admin/lib/imageProcessing';
import { stubObjectUrls } from '../fixtures';

let urls = 0;
const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  urls = 0;
  created.length = 0;
  revoked.length = 0;
  stubObjectUrls(() => {
    urls += 1;
    const u = `blob:http://localhost/img-${urls}`;
    created.push(u);
    return u;
  }).revokeObjectURL.mockImplementation((u: string) => {
    revoked.push(u);
  });
});
afterEach(() => vi.restoreAllMocks());

const processed = (ext: ProcessedImage['ext'] = 'jpg', width = 1600, height = 1067, bytes = 412 * 1024): ProcessedImage => ({
  blob: new Blob([new Uint8Array(bytes)], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }),
  ext,
  width,
  height,
});

function Harness({
  kind = 'project', initialValue = '', process, onRemove, error, commitSha,
}: {
  kind?: ImageKind;
  initialValue?: string;
  process?: (file: File, kind: ImageKind) => Promise<ProcessedImage>;
  onRemove?: () => void;
  error?: string;
  commitSha?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  return (
    <LastCommitContext.Provider value={commitSha}>
      <ImageField
        name="image"
        label="Image"
        kind={kind}
        alt="Alt text"
        value={value}
        onValueChange={setValue}
        pending={pending}
        onPendingChange={setPending}
        onRemove={onRemove}
        error={error}
        process={process}
      />
      <output data-testid="state">{JSON.stringify({ value, pending: pending ? { shortId: pending.shortId, objectUrl: pending.objectUrl, ext: pending.image.ext } : null })}</output>
    </LastCommitContext.Provider>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent!) as { value: string; pending: { shortId: string; objectUrl: string; ext: string } | null };
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const jpg = () => new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' });

describe('ImageField', () => {
  it('has Upload image, a file input with accept per kind, and a collapsible "or use a URL / path" input', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(fileInput()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(screen.getByText('or use a URL / path').tagName).toBe('SUMMARY');
    expect(screen.getByLabelText(/^Image$/)).toHaveAttribute('name', 'image');
  });

  it('badges also accept SVG', () => {
    render(<Harness kind="badge" />);
    expect(fileInput()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/svg+xml');
  });

  it('selecting a file stores a PendingUpload (value unchanged), shows the status and a blob: thumbnail', async () => {
    const process = vi.fn(async () => processed());
    render(<Harness initialValue="/images/old.png" process={process} />);
    await userEvent.upload(fileInput(), jpg());
    expect(process).toHaveBeenCalledWith(expect.any(File), 'project');
    const s = state();
    expect(s.value).toBe('/images/old.png');
    expect(s.pending).toEqual({ shortId: expect.stringMatching(/^[0-9a-f]{6}$/), objectUrl: 'blob:http://localhost/img-1', ext: 'jpg' });
    expect(screen.getByText('New image selected — saved with this entry')).toBeInTheDocument();
    expect(screen.getByText('Resized to 1600×1067 (412 KB) — appears on the site after deploy')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Alt text' })).toHaveAttribute('src', 'blob:http://localhost/img-1');
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });

  it('works before any other field is filled (no path is built at selection)', async () => {
    render(<Harness process={async () => processed('webp')} />);
    await userEvent.upload(fileInput(), jpg());
    expect(state().value).toBe('');
    expect(state().pending?.ext).toBe('webp');
  });

  it('replacing revokes the previous object URL; unmount revokes the current one', async () => {
    const { unmount } = render(<Harness process={async () => processed()} />);
    await userEvent.upload(fileInput(), jpg());
    await userEvent.upload(fileInput(), jpg());
    expect(created).toEqual(['blob:http://localhost/img-1', 'blob:http://localhost/img-2']);
    expect(revoked).toEqual(['blob:http://localhost/img-1']);
    unmount();
    expect(revoked).toEqual(['blob:http://localhost/img-1', 'blob:http://localhost/img-2']);
  });

  it.each([
    ["Use a JPG, PNG or WebP image"],
    ['Image is too large to process'],
    ['Image is still larger than 2 MB after resizing. Use a smaller image.'],
  ])('a rejected file shows "%s" and does not change the field', async (message) => {
    render(<Harness initialValue="/images/old.png" process={async () => { throw new ImageError(message); }} />);
    await userEvent.upload(fileInput(), jpg());
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(state()).toEqual({ value: '/images/old.png', pending: null });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('an unexpected processing error shows the generic unreadable message', async () => {
    render(<Harness process={async () => { throw new Error('boom'); }} />);
    await userEvent.upload(fileInput(), jpg());
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read this image. Use a different file.");
  });

  it('a failed second selection keeps the first pending upload', async () => {
    let n = 0;
    render(<Harness process={async () => { n += 1; if (n === 2) throw new ImageError('Image is too large to process'); return processed(); }} />);
    await userEvent.upload(fileInput(), jpg());
    await userEvent.upload(fileInput(), jpg());
    expect(state().pending?.objectUrl).toBe('blob:http://localhost/img-1');
    expect(revoked).toEqual([]);
  });

  it('typing a URL/path clears a pending upload (R14) and revokes its object URL', async () => {
    render(<Harness process={async () => processed()} />);
    await userEvent.upload(fileInput(), jpg());
    await userEvent.type(screen.getByLabelText(/^Image$/), '/x.png');
    expect(state()).toEqual({ value: '/x.png', pending: null });
    expect(revoked).toEqual(['blob:http://localhost/img-1']);
    expect(screen.queryByText('New image selected — saved with this entry')).toBeNull();
  });

  it('Remove clears the pending upload and the value and calls onRemove (R14)', async () => {
    const onRemove = vi.fn();
    render(<Harness initialValue="/images/old.png" process={async () => processed()} onRemove={onRemove} />);
    await userEvent.upload(fileInput(), jpg());
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(state()).toEqual({ value: '', pending: null });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual(['blob:http://localhost/img-1']);
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeInTheDocument();
  });

  it('thumbnail of a loaded value: upload path → raw URL at the last commit, /path → based, https as-is', () => {
    const { unmount } = render(<Harness initialValue="src/assets/uploads/projects/x-a1b2c3.webp" commitSha="abc123" />);
    expect(screen.getByRole('img', { name: 'Alt text' })).toHaveAttribute(
      'src', 'https://raw.githubusercontent.com/estheralmendros/portfolio/abc123/src/assets/uploads/projects/x-a1b2c3.webp',
    );
    unmount();
    render(<Harness initialValue="/images/me.png" />);
    expect(screen.getByRole('img', { name: 'Alt text' })).toHaveAttribute('src', '/portfolio/images/me.png');
  });

  it('shows the validation error and opens the URL/path section', () => {
    render(<Harness error="Use https:// URL or /path" />);
    const input = screen.getByLabelText(/^Image$/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.closest('details')).toHaveAttribute('open');
    expect(screen.getByText('Use https:// URL or /path')).toBeInTheDocument();
  });

  it('a typed (non-upload) value starts with the URL/path section open; an upload path or empty value starts closed', () => {
    const { unmount } = render(<Harness initialValue="https://x.com/a.png" />);
    expect(screen.getByLabelText(/^Image$/).closest('details')).toHaveAttribute('open');
    unmount();
    render(<Harness initialValue="src/assets/uploads/projects/x-a1b2c3.webp" />);
    expect(screen.getByLabelText(/^Image$/).closest('details')).not.toHaveAttribute('open');
  });

  it('disables the buttons while processing', async () => {
    let resolve!: (p: ProcessedImage) => void;
    render(<Harness process={() => new Promise((r) => { resolve = r; })} />);
    await userEvent.upload(fileInput(), jpg());
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeDisabled();
    expect(screen.getByText('Processing image…')).toBeInTheDocument();
    await act(async () => resolve(processed()));
    expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled();
  });
});
