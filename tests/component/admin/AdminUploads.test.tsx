import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApp } from '../../../src/admin/AdminApp';
import { ConflictError } from '../../../src/admin/lib/errors';
import type { ProcessedImage } from '../../../src/admin/lib/imageProcessing';
import { fakeClient, profile } from './fakeClient';

const processImage = vi.fn(async (): Promise<ProcessedImage> => ({
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), ext: 'jpg', width: 1600, height: 900,
}));

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '#');
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

function setup(client = fakeClient()) {
  const pollDeploy = vi.fn();
  render(<AdminApp createClient={() => client} pollDeploy={pollDeploy} processImage={processImage} />);
  return { client, pollDeploy };
}

async function login(waitText = 'Title a') {
  await userEvent.type(await screen.findByLabelText('GitHub fine-grained token'), 'github_pat_ok');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText(waitText);
}
const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name });
const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'cv.pdf', { type: 'application/pdf' });

describe('AdminApp saves with files (one commit)', () => {
  it('a new project with an image: one commitFiles commit with JSON + image, (+image), redeploy copy, polling on its SHA', async () => {
    const { client, pollDeploy } = setup();
    await login();
    await userEvent.click(screen.getByRole('button', { name: '+ New project' }));
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[name="image-file"]')!, new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'My App');
    await userEvent.type(screen.getByLabelText(/^Summary/), 'S');
    await userEvent.type(screen.getByLabelText(/^Date/), '2026-10');
    await userEvent.type(screen.getByLabelText(/^Image alt/), 'Shot');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved. The new image appears on the site after the next deploy (a few minutes).')).toBeInTheDocument();
    expect(client.putFile).not.toHaveBeenCalled();
    expect(client.commitFiles).toHaveBeenCalledTimes(1);
    const args = client.commitFiles.mock.calls[0]![0];
    expect(args.message).toBe('content(projects): add "My App" (+image)');
    expect(args.expectedShas).toEqual({ 'content/projects.json': 'sha-1' });
    const [json, image] = args.files as [{ path: string; content: string }, { path: string; content: string; encoding: string }];
    expect(json.path).toBe('content/projects.json');
    expect(image).toEqual({ path: expect.stringMatching(/^src\/assets\/uploads\/projects\/my-app-[0-9a-f]{6}\.jpg$/), content: 'AQID', encoding: 'base64' });
    expect(JSON.parse(json.content)[0]).toMatchObject({ id: 'my-app', image: image.path, imageAlt: 'Shot' });
    expect(pollDeploy).toHaveBeenLastCalledWith(expect.objectContaining({ commitSha: 'commit-1' }));

    // The next edit previews the upload from the raw repository URL at the commit just made.
    await userEvent.click(screen.getByRole('button', { name: 'Edit My App' }));
    const thumb = await screen.findAllByRole('img', { name: 'Shot' });
    expect(thumb[0]).toHaveAttribute('src', `https://raw.githubusercontent.com/estheralmendros/portfolio/commit-1/${image.path}`);
  });

  it('a project save without files still uses the Contents API with the MVP copy', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Title a' }));
    await userEvent.type(screen.getByLabelText(/^Summary/), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved. The site will update after the next deploy (a few minutes).')).toBeInTheDocument();
    expect(client.commitFiles).not.toHaveBeenCalled();
    expect(client.putFile).toHaveBeenCalledTimes(1);
  });

  it('a conflict during a multi-file save shows the banner with "(Your selected image was not uploaded.)"', async () => {
    const client = fakeClient();
    client.commitFiles.mockRejectedValueOnce(new ConflictError('changed'));
    setup(client);
    await login();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Title a' }));
    await userEvent.type(screen.getByLabelText(/^Image alt/), 'Alt');
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[name="image-file"]')!, new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Content changed elsewhere — reload to get the latest version. Your unsaved changes will be lost. (Your selected image was not uploaded.)',
    );
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('profile: photo + CV in one commit, (+image, +cv)', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Profile'));
    await screen.findByLabelText(/^Name/);
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[name="photo-file"]')!, new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[name="cvUrl-file"]')!, pdf());
    await screen.findByText(/new, saved with this profile/);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved. The new image and CV appear on the site after the next deploy (a few minutes).')).toBeInTheDocument();
    const args = client.commitFiles.mock.calls[0]![0];
    expect(args.message).toBe('content(profile): update profile (+image, +cv)');
    expect(args.files.map((f) => f.path)).toEqual([
      'content/profile.json', expect.stringMatching(/^src\/assets\/uploads\/profile\/profile-[0-9a-f]{6}\.jpg$/), 'public/uploads/cv.pdf',
    ]);
    expect(args.expectedShas).toEqual({ 'content/profile.json': 'profile-sha-1' });
  });

  it('profile: Remove CV of the uploaded file deletes it in the same commit, (-cv) and the CV-removed copy', async () => {
    const { client } = setup(fakeClient({ profile: profile({ cvUrl: '/uploads/cv.pdf?v=a1b2c3' }) }));
    await login();
    await userEvent.click(tab('Profile'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove CV' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('CV removed. The download link disappears after the next deploy.')).toBeInTheDocument();
    const args = client.commitFiles.mock.calls[0]![0];
    expect(args.message).toBe('content(profile): update profile (-cv)');
    expect(args.files[1]).toEqual({ path: 'public/uploads/cv.pdf', delete: true });
    expect(JSON.parse((args.files[0] as { content: string }).content)).not.toHaveProperty('cvUrl');
  });

  it('profile: Remove CV of an external URL only changes profile.json through the Contents API', async () => {
    const { client } = setup(fakeClient({ profile: profile({ cvUrl: 'https://example.com/cv.pdf' }) }));
    await login();
    await userEvent.click(tab('Profile'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove CV' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved. The site will update after the next deploy (a few minutes).')).toBeInTheDocument();
    expect(client.commitFiles).not.toHaveBeenCalled();
    expect(client.putFile.mock.calls[0]![0].message).toBe('content(profile): update profile');
  });

  it('a pending upload counts as dirty for the tab guard (R13)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await login();
    await userEvent.click(screen.getByRole('button', { name: '+ New project' }));
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[name="image-file"]')!, new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await userEvent.click(tab('Skills'));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?');
    expect(window.location.hash).toBe('#/projects/new');
  });
});
