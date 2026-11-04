import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectForm } from '../../../src/admin/components/ProjectForm';
import { ConflictError, GitHubApiError, NetworkError, PermissionError, RateLimitError } from '../../../src/admin/lib/errors';
import { project } from './fakeClient';
import { previewPane, stubObjectUrls } from '../fixtures';
import { ProjectCard } from '../../../src/components/ProjectCard';
import type { SaveExtras } from '../../../src/admin/components/formKit';
import type { ProcessedImage } from '../../../src/admin/lib/imageProcessing';
import type { Project } from '../../../src/content/schema';

const existing = [project('taken', { title: 'Taken Project' })];

function setup(props: Partial<Parameters<typeof ProjectForm>[0]> = {}) {
  const onSave = vi.fn(async () => {});
  const onCancel = vi.fn();
  const onReload = vi.fn();
  render(<ProjectForm mode="create" existing={existing} onSave={onSave} onCancel={onCancel} onReload={onReload} {...props} />);
  return { onSave, onCancel, onReload };
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/^Title/), 'Gestión de Inventario');
  await userEvent.type(screen.getByLabelText(/^Summary/), 'An inventory app');
  await userEvent.type(screen.getByLabelText(/^Date/), '2026-10');
}

describe('ProjectForm (create)', () => {
  it('auto-derives the slug from the title until edited', async () => {
    setup();
    const slug = screen.getByLabelText(/^Slug/);
    await userEvent.type(screen.getByLabelText(/^Title/), 'Gestión de Inventario');
    expect(slug).toHaveValue('gestion-de-inventario');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'custom');
    await userEvent.type(screen.getByLabelText(/^Title/), ' 2');
    expect(slug).toHaveValue('custom');
  });

  it('submits the normalized payload (empty strings omitted, tags parsed)', async () => {
    const { onSave } = setup();
    await fillValid();
    await userEvent.type(screen.getByLabelText(/^Tags/), 'React, TypeScript, react, ');
    await userEvent.click(screen.getByLabelText(/Featured/));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      id: 'gestion-de-inventario', title: 'Gestión de Inventario', summary: 'An inventory app', description: '',
      tags: ['React', 'TypeScript'], featured: true, date: '2026-10',
    });
  });

  it('shows field errors, sets aria attributes, focuses the first invalid field and does not save', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Title/), 'X');
    await userEvent.type(screen.getByLabelText(/^Image$/), 'https://x.com/a.png');
    await userEvent.type(screen.getByLabelText(/^Repo URL/), 'http://github.com/x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    const summary = screen.getByLabelText(/^Summary/);
    expect(summary).toHaveAttribute('aria-invalid', 'true');
    expect(summary).toHaveFocus();
    expect(document.getElementById(summary.getAttribute('aria-describedby')!)).toHaveTextContent('Required');
    expect(screen.getByText('Required when an image is set')).toBeInTheDocument();
    expect(screen.getByText('Must start with https://')).toBeInTheDocument();
  });

  it('blocks a duplicate slug', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Taken');
    await userEvent.type(screen.getByLabelText(/^Summary/), 'S');
    await userEvent.type(screen.getByLabelText(/^Date/), '2026-10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("This slug is already used by 'Taken Project'")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables Save while saving and ignores a second click', async () => {
    let resolve!: () => void;
    const onSave = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    setup({ onSave });
    await fillValid();
    const btn = screen.getByRole('button', { name: 'Save' });
    // Two clicks in the same tick, before React re-renders the disabled button: only the re-entry guard stops the second.
    act(() => {
      btn.click();
      btn.click();
    });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('conflict shows the blocking banner, keeps Save disabled, Reload calls onReload', async () => {
    const onSave = vi.fn(async () => { throw new ConflictError('409'); });
    const { onReload } = setup({ onSave });
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Content changed elsewhere — reload to get the latest version. Your unsaved changes will be lost.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new RateLimitError('x', new Date(2026, 0, 1, 10, 0)), "GitHub's rate limit was reached. Try again after 10:00."],
    [new PermissionError('x'), 'This token can no longer write to the repository.'],
    [new NetworkError('x'), "Couldn't save. Check your connection and try again."],
    [new GitHubApiError(422), 'GitHub rejected the save (HTTP 422). Nothing was published.'],
  ])('%s keeps form data and re-enables Save', async (err, message) => {
    const onSave = vi.fn(async () => { throw err; });
    setup({ onSave });
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Gestión de Inventario');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('ProjectForm (edit)', () => {
  it('prefills, keeps the slug read-only and submits', async () => {
    const initial = project('taken', { title: 'Taken Project', tags: ['A', 'B'], image: '/images/x.png', imageAlt: 'Alt', featured: true });
    const onSave = vi.fn(async () => {});
    render(<ProjectForm mode="edit" initial={initial} existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} />);
    expect(screen.getByLabelText(/^Slug/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Tags/, { selector: 'input' })).toHaveValue('A, B');
    await userEvent.clear(screen.getByLabelText(/^Title/));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Renamed');
    expect(screen.getByLabelText(/^Slug/)).toHaveValue('taken');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'taken', title: 'Renamed', imageAlt: 'Alt' }));
  });
});

describe('ProjectForm (v2)', () => {
  it('reports dirty while the values differ from the loaded ones, and clean again on unmount', async () => {
    const onDirtyChange = vi.fn();
    const { unmount } = render(
      <ProjectForm mode="edit" initial={existing[0]} existing={existing} onSave={vi.fn()} onCancel={vi.fn()} onReload={vi.fn()} onDirtyChange={onDirtyChange} />,
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.type(screen.getByLabelText(/^Summary/), '!');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.type(screen.getByLabelText(/^Summary/), '{Backspace}');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.type(screen.getByLabelText(/^Summary/), '!');
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('a typed upload path is blocked with no save (Feature 3 step 5b)', async () => {
    const { onSave } = setup();
    await fillValid();
    await userEvent.type(screen.getByLabelText(/^Image$/), 'src/assets/uploads/projects/nope-a1b2c3.webp');
    await userEvent.type(screen.getByLabelText(/^Image alt/), 'Alt');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("Upload paths can't be typed; use Upload image")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Image$/)).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an upload path kept unchanged as loaded saves normally', async () => {
    const initial = project('taken', { title: 'Taken Project', image: 'src/assets/uploads/projects/taken-a1b2c3.webp', imageAlt: 'Alt' });
    const onSave = vi.fn(async () => {});
    render(<ProjectForm mode="edit" initial={initial} existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ image: 'src/assets/uploads/projects/taken-a1b2c3.webp' }));
  });

  it('a tag that is too long is shown on the Tags field (review R6)', async () => {
    const { onSave } = setup();
    await fillValid();
    await userEvent.type(screen.getByLabelText(/^Tags/), `ok, ${'x'.repeat(31)}`);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText(/^Tags/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Tags/)).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('ProjectForm (image upload, prd2 Feature 3)', () => {
  const blobUrls: string[] = [];
  beforeEach(() => {
    blobUrls.length = 0;
    stubObjectUrls(() => {
      const u = `blob:http://localhost/p-${blobUrls.length + 1}`;
      blobUrls.push(u);
      return u;
    });
  });

  const processImage = vi.fn(async (): Promise<ProcessedImage> => ({
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), ext: 'jpg', width: 800, height: 450,
  }));
  const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const pick = () => userEvent.upload(fileInput(), new File([new Uint8Array(5)], 'shot.jpg', { type: 'image/jpeg' }));
  const UPLOAD_RE = /^src\/assets\/uploads\/projects\/my-app-[0-9a-f]{6}\.jpg$/;

  it('upload before the title: no path stored; empty title blocks the save and keeps the image; final save commits the path', async () => {
    const { onSave } = setup({ processImage });
    await pick();
    expect(screen.getByLabelText(/^Image$/)).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Image$/)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('New image selected — saved with this entry')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Title/), 'My App');
    await userEvent.type(screen.getByLabelText(/^Summary/), 'S');
    await userEvent.type(screen.getByLabelText(/^Date/), '2026-10');
    await userEvent.type(screen.getByLabelText(/^Image alt/), 'Screenshot');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [saved, extras] = onSave.mock.calls[0]! as unknown as [Project, SaveExtras];
    expect(saved.image).toMatch(UPLOAD_RE);
    expect(saved.imageAlt).toBe('Screenshot');
    expect(extras).toEqual({ files: [{ path: saved.image, content: 'AQID', encoding: 'base64' }], attachments: ['image'] });
  });

  it('changing the title after selecting the image uses the final slug', async () => {
    const { onSave } = setup({ processImage });
    await userEvent.type(screen.getByLabelText(/^Title/), 'First Name');
    await pick();
    await userEvent.clear(screen.getByLabelText(/^Title/));
    await userEvent.type(screen.getByLabelText(/^Title/), 'My App');
    await userEvent.type(screen.getByLabelText(/^Summary/), 'S');
    await userEvent.type(screen.getByLabelText(/^Date/), '2026-10');
    await userEvent.type(screen.getByLabelText(/^Image alt/), 'Alt');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((onSave.mock.calls[0] as unknown as [Project])[0].image).toMatch(UPLOAD_RE);
  });

  it('a pending upload requires the alt text (the schema sees the image)', async () => {
    const { onSave } = setup({ processImage });
    await fillValid();
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Required when an image is set')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('edit: the locked id names the file; replacing a loaded upload path is allowed', async () => {
    const initial = project('taken', { title: 'Taken Project', image: 'src/assets/uploads/projects/taken-a1b2c3.webp', imageAlt: 'Alt' });
    const onSave = vi.fn(async () => {});
    render(<ProjectForm mode="edit" initial={initial} existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} processImage={processImage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [saved, extras] = onSave.mock.calls[0]! as unknown as [Project, SaveExtras];
    expect(saved.image).toMatch(/^src\/assets\/uploads\/projects\/taken-[0-9a-f]{6}\.jpg$/);
    expect(extras.attachments).toEqual(['image']);
  });

  it('Remove clears the image and its alt text (R14)', async () => {
    const initial = project('taken', { title: 'Taken Project', image: '/images/x.png', imageAlt: 'Alt' });
    const onSave = vi.fn(async () => {});
    render(<ProjectForm mode="edit" initial={initial} existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByLabelText(/^Image alt/)).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.not.objectContaining({ image: expect.anything() }));
    expect(onSave.mock.calls[0]).toHaveLength(1);
  });

  it('a pending upload alone makes the form dirty', async () => {
    const onDirtyChange = vi.fn();
    setup({ processImage, onDirtyChange });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await pick();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('a conflict during an image save adds "(Your selected image was not uploaded.)"', async () => {
    const onSave = vi.fn(async () => { throw new ConflictError('x'); });
    setup({ onSave, processImage });
    await fillValid();
    await userEvent.type(screen.getByLabelText(/^Image alt/), 'Alt');
    await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Content changed elsewhere — reload to get the latest version. Your unsaved changes will be lost. (Your selected image was not uploaded.)',
    );
  });
});

describe('ProjectForm (preview, prd2 Feature 5)', () => {

  it('reflects unsaved typing with the same markup as the public ProjectCard', async () => {
    setup();
    await fillValid();
    await userEvent.type(screen.getByLabelText(/^Tags/), 'React');
    await waitFor(() => expect(within(previewPane()).getByText('An inventory app')).toBeInTheDocument());
    const expected = render(
      <ProjectCard project={{ id: 'gestion-de-inventario', title: 'Gestión de Inventario', summary: 'An inventory app', description: '', tags: ['React'], featured: false, date: '2026-10' }} hasDetail={false} />,
    ).container.innerHTML;
    expect(previewPane().innerHTML).toBe(expected);
    expect(screen.queryByText('Fix errors to save')).toBeNull();
  });

  it('renders the detail below the card when the description is non-empty (Markdown)', async () => {
    setup();
    await fillValid();
    await userEvent.type(screen.getByLabelText(/^Description/), 'Some **bold** text');
    await waitFor(() => expect(within(previewPane()).getByText('bold').tagName).toBe('STRONG'));
    expect(within(previewPane()).getByRole('heading', { level: 1, name: 'Gestión de Inventario' })).toBeInTheDocument();
  });

  it('an invalid form still renders, with "—" placeholders and "Fix errors to save"', async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/^Summary/), 'Only a summary');
    await waitFor(() => expect(within(previewPane()).getByText('Only a summary')).toBeInTheDocument());
    expect(within(previewPane()).getByRole('heading', { level: 4 })).toHaveTextContent('—');
    expect(screen.getByText('Fix errors to save')).toBeInTheDocument();
  });

  it('a newly selected image shows in the preview through its blob: URL', async () => {
    stubObjectUrls(() => 'blob:http://localhost/new');
    const processImage = vi.fn(async (): Promise<ProcessedImage> => ({ blob: new Blob([new Uint8Array(1)], { type: 'image/png' }), ext: 'png', width: 1, height: 1 }));
    setup({ processImage });
    await fillValid();
    await userEvent.type(screen.getByLabelText(/^Image alt/), 'Shot');
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(['x'], 'a.png', { type: 'image/png' }));
    await waitFor(() => expect(within(previewPane()).getByRole('img', { name: 'Shot' })).toHaveAttribute('src', 'blob:http://localhost/new'));
  });
});
