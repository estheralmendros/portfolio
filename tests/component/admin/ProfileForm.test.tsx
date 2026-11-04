import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from '../../../src/admin/components/ProfileForm';
import { ConflictError } from '../../../src/admin/lib/errors';
import { profile } from './fakeClient';
import { previewPane, stubObjectUrls } from '../fixtures';
import type { Profile } from '../../../src/content/schema';
import type { SaveExtras } from '../../../src/admin/components/formKit';
import type { ProcessedImage } from '../../../src/admin/lib/imageProcessing';
import { HeroSection } from '../../../src/components/HeroSection';
import { ContactSection } from '../../../src/components/ContactSection';

function setup(props: Partial<Parameters<typeof ProfileForm>[0]> = {}) {
  const onSave = vi.fn(async (_p: Profile) => {});
  const onReload = vi.fn();
  const onDirtyChange = vi.fn();
  render(<ProfileForm initial={profile()} onSave={onSave} onReload={onReload} onDirtyChange={onDirtyChange} {...props} />);
  return { onSave, onReload, onDirtyChange };
}

describe('ProfileForm', () => {
  it('prefills every PRD field; Availability is a select with the three labels', () => {
    setup({ initial: profile({ photo: '/images/me.jpg', cvUrl: '/docs/cv.pdf' }) });
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Engineer');
    expect(screen.getByLabelText(/^Bio/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/^Photo/)).toHaveValue('/images/me.jpg');
    expect(screen.getByLabelText(/^Location/)).toHaveValue('London');
    const availability = screen.getByLabelText(/^Availability/) as HTMLSelectElement;
    expect(Array.from(availability.options).map((o) => o.textContent)).toEqual(['Open to opportunities', 'Not looking', 'Available for freelance']);
    expect(availability).toHaveValue('open');
    expect(screen.getByLabelText(/^Email/)).toHaveValue('ada@example.com');
    expect(screen.getByLabelText(/^LinkedIn URL/)).toHaveValue('https://www.linkedin.com/in/ada');
    expect(screen.getByLabelText(/^GitHub URL/)).toHaveValue('https://github.com/ada');
    expect(screen.getByLabelText(/^CV/)).toHaveValue('/docs/cv.pdf');
  });

  it('submits the nested profile; empty photo/CV are omitted', async () => {
    const { onSave } = setup({ initial: profile({ photo: '/images/me.jpg' }) });
    await userEvent.clear(screen.getByLabelText(/^Photo/));
    await userEvent.selectOptions(screen.getByLabelText(/^Availability/), 'freelance');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ ...profile(), availability: 'freelance' });
    expect(Object.keys(onSave.mock.calls[0]![0])).toEqual(['name', 'title', 'bio', 'location', 'availability', 'socials']);
  });

  it('keeps the schema key order with photo and cvUrl', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Photo/), 'https://example.com/me.jpg');
    await userEvent.type(screen.getByLabelText(/^CV/), '/uploads/cv.pdf?v=a1b2c3');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(Object.keys(onSave.mock.calls[0]![0])).toEqual(['name', 'title', 'bio', 'photo', 'location', 'availability', 'socials', 'cvUrl']);
  });

  it('nested and CV errors are shown on their fields; first invalid field focused; no save', async () => {
    const { onSave } = setup();
    await userEvent.clear(screen.getByLabelText(/^Title/));
    await userEvent.clear(screen.getByLabelText(/^Email/));
    await userEvent.type(screen.getByLabelText(/^Email/), 'not-an-email');
    await userEvent.clear(screen.getByLabelText(/^GitHub URL/));
    await userEvent.type(screen.getByLabelText(/^GitHub URL/), 'http://github.com/ada');
    await userEvent.type(screen.getByLabelText(/^CV/), '/images/photo.png');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Title/)).toHaveFocus();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^GitHub URL/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use an https:// URL or a /path to a PDF')).toBeInTheDocument();
  });

  it('prefills Current role / Current company and saves currentJob right after availability', async () => {
    const { onSave } = setup({ initial: profile({ availability: 'not-looking', currentJob: { role: 'Engineer', company: 'Acme' } }) });
    expect(screen.getByLabelText(/^Current role/)).toHaveValue('Engineer');
    expect(screen.getByLabelText(/^Current company/)).toHaveValue('Acme');
    await userEvent.clear(screen.getByLabelText(/^Current company/));
    await userEvent.type(screen.getByLabelText(/^Current company/), 'Globex');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = onSave.mock.calls[0]![0];
    expect(saved.currentJob).toEqual({ role: 'Engineer', company: 'Globex' });
    expect(Object.keys(saved)).toEqual(['name', 'title', 'bio', 'location', 'availability', 'currentJob', 'socials']);
  });

  it('both current job fields empty omit currentJob; only one filled marks the other Required', async () => {
    const { onSave } = setup({ initial: profile({ currentJob: { role: 'Engineer', company: 'Acme' } }) });
    await userEvent.clear(screen.getByLabelText(/^Current company/));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Current company/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Current company/)).toHaveFocus();
    await userEvent.clear(screen.getByLabelText(/^Current role/));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(profile());
  });

  it('the preview shows "<role> @ <company>" when Not looking', async () => {
    setup({ initial: profile({ availability: 'not-looking' }) });
    await userEvent.type(screen.getByLabelText(/^Current role/), 'Engineer');
    await userEvent.type(screen.getByLabelText(/^Current company/), 'Acme');
    expect(await screen.findByText('Engineer @ Acme')).toBeInTheDocument();
  });

  it('a typed upload path in Photo is blocked; the loaded upload path saves', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Photo/), 'src/assets/uploads/profile/profile-a1b2c3.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("Upload paths can't be typed; use Upload image")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an upload photo path kept as loaded saves', async () => {
    const initial = profile({ photo: 'src/assets/uploads/profile/profile-a1b2c3.jpg' });
    const { onSave } = setup({ initial });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(initial);
  });

  it('conflict shows the banner with Reload', async () => {
    const onSave = vi.fn(async () => { throw new ConflictError('409'); });
    const { onReload } = setup({ onSave });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Content changed elsewhere/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalled();
  });

  it('after a successful save the form is usable again (no navigation away)', async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('has no Cancel button and reports dirty', async () => {
    const { onDirtyChange } = setup();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await userEvent.type(screen.getByLabelText(/^Bio/), '!');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe('ProfileForm (photo + CV uploads, prd2 Features 3 and 4)', () => {
  beforeEach(() => {
    stubObjectUrls(() => 'blob:http://localhost/photo');
  });
  const processImage = vi.fn(async (): Promise<ProcessedImage> => ({
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), ext: 'webp', width: 400, height: 400,
  }));
  const photoInput = () => document.querySelector<HTMLInputElement>('input[name="photo-file"]')!;
  const cvInput = () => document.querySelector<HTMLInputElement>('input[name="cvUrl-file"]')!;
  const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'cv.pdf', { type: 'application/pdf' });
  type Call = [Profile, SaveExtras?];

  it('a photo upload commits src/assets/uploads/profile/profile-<id>.<ext> with (+image)', async () => {
    const { onSave } = setup({ processImage });
    await userEvent.upload(photoInput(), new File(['x'], 'me.webp', { type: 'image/webp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [saved, extras] = onSave.mock.calls[0] as unknown as Call;
    expect(saved.photo).toMatch(/^src\/assets\/uploads\/profile\/profile-[0-9a-f]{6}\.webp$/);
    expect(extras).toEqual({ files: [{ path: saved.photo, content: 'AQID', encoding: 'base64' }], attachments: ['image'] });
    expect(Object.keys(saved)).toEqual(['name', 'title', 'bio', 'photo', 'location', 'availability', 'socials']);
  });

  it('a CV upload commits public/uploads/cv.pdf and cvUrl /uploads/cv.pdf?v=<id> with (+cv)', async () => {
    const { onSave } = setup();
    await userEvent.upload(cvInput(), pdf());
    await screen.findByText(/new, saved with this profile/);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [saved, extras] = onSave.mock.calls[0] as unknown as Call;
    expect(saved.cvUrl).toMatch(/^\/uploads\/cv\.pdf\?v=[0-9a-f]{6}$/);
    expect(extras).toEqual({ files: [{ path: 'public/uploads/cv.pdf', content: 'JVBERi0x', encoding: 'base64' }], attachments: ['cv'] });
  });

  it('photo and CV together: one save with both files and both attachments', async () => {
    const { onSave } = setup({ processImage });
    await userEvent.upload(photoInput(), new File(['x'], 'me.webp', { type: 'image/webp' }));
    await userEvent.upload(cvInput(), pdf());
    await screen.findByText(/new, saved with this profile/);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [, extras] = onSave.mock.calls[0] as unknown as Call;
    expect(extras!.files.map((f) => f.path)).toEqual([expect.stringMatching(/^src\/assets\/uploads\/profile\//), 'public/uploads/cv.pdf']);
    expect(extras!.attachments).toEqual(['image', 'cv']);
  });

  it('Remove CV of the uploaded file: cvUrl removed and the file deleted, (-cv)', async () => {
    const { onSave } = setup({ initial: profile({ cvUrl: '/uploads/cv.pdf?v=a1b2c3' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [saved, extras] = onSave.mock.calls[0] as unknown as Call;
    expect(saved).toEqual(profile());
    expect(extras).toEqual({ files: [{ path: 'public/uploads/cv.pdf', delete: true }], attachments: ['-cv'] });
  });

  it('Remove CV of an external URL or another /path: only the field is removed (no files)', async () => {
    for (const cvUrl of ['https://example.com/cv.pdf', '/docs/cv.pdf']) {
      const { onSave } = setup({ initial: profile({ cvUrl }) });
      await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSave.mock.calls[0]).toEqual([profile()]);
      cleanup();
    }
  });

  it('Undo before Save restores the CV', async () => {
    const initial = profile({ cvUrl: '/uploads/cv.pdf?v=a1b2c3' });
    const { onSave } = setup({ initial });
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0]).toEqual([initial]);
  });

  it('a pending CV removal or upload makes the form dirty (R13)', async () => {
    const { onDirtyChange } = setup({ initial: profile({ cvUrl: '/uploads/cv.pdf?v=a1b2c3' }) });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.upload(cvInput(), pdf());
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  it('a conflict with a selected photo adds "(Your selected image was not uploaded.)"', async () => {
    const onSave = vi.fn(async () => { throw new ConflictError('x'); });
    setup({ onSave, processImage });
    await userEvent.upload(photoInput(), new File(['x'], 'me.webp', { type: 'image/webp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('(Your selected image was not uploaded.)');
  });
});

describe('ProfileForm (preview, prd2 Feature 5)', () => {

  it('renders HeroSection + ContactSection with the same markup as the public site', async () => {
    setup();
    await userEvent.clear(screen.getByLabelText(/^Title/));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Architect');
    await waitFor(() => expect(within(previewPane()).getByText(/Architect · London/)).toBeInTheDocument());
    const p = { ...profile(), title: 'Architect' };
    const expected = render(<><HeroSection profile={p} /><ContactSection socials={p.socials} /></>).container.innerHTML;
    expect(previewPane().innerHTML).toBe(expected);
  });

  it('the photo shows with the profile name as alt; an invalid form shows placeholders and "Fix errors to save"', async () => {
    setup({ initial: profile({ photo: '/images/me.jpg' }) });
    expect(within(previewPane()).getByRole('img', { name: 'Ada Lovelace' })).toHaveAttribute('src', '/portfolio/images/me.jpg');
    await userEvent.clear(screen.getByLabelText(/^Name/));
    await waitFor(() => expect(within(previewPane()).getByRole('heading', { level: 1 })).toHaveTextContent('—'));
    expect(screen.getByText('Fix errors to save')).toBeInTheDocument();
  });

  it('an invalid LinkedIn/GitHub URL shows no link for it in the preview until a valid https:// URL is entered (A1-31)', async () => {
    setup();
    const socialLinks = (label: string) =>
      Array.from(previewPane().querySelectorAll('a')).filter((a) => a.textContent?.includes(label));
    expect(socialLinks('LinkedIn')).toHaveLength(2);

    await userEvent.clear(screen.getByLabelText(/^LinkedIn URL/));
    await userEvent.type(screen.getByLabelText(/^LinkedIn URL/), 'javascript:alert(1)');
    await userEvent.clear(screen.getByLabelText(/^GitHub URL/));
    await waitFor(() => expect(screen.getByText('Fix errors to save')).toBeInTheDocument());
    await waitFor(() => expect(socialLinks('LinkedIn')).toEqual([]));
    expect(socialLinks('GitHub')).toEqual([]);
    expect(previewPane().querySelectorAll('a:not([href]), a[href=""]')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText(/^LinkedIn URL/));
    await userEvent.type(screen.getByLabelText(/^LinkedIn URL/), 'https://www.linkedin.com/in/ada2');
    await waitFor(() => expect(socialLinks('LinkedIn')).toHaveLength(2));
    for (const a of socialLinks('LinkedIn')) expect(a).toHaveAttribute('href', 'https://www.linkedin.com/in/ada2');
    expect(socialLinks('GitHub')).toEqual([]);
  });
});
