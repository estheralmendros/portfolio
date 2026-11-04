import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CvField, type CvChange } from '../../../src/admin/components/CvField';

function Harness({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const [change, setChange] = useState<CvChange>({ kind: 'none' });
  return (
    <>
      <CvField value={value} onValueChange={setValue} change={change} onChange={setChange} />
      <output data-testid="state">
        {JSON.stringify({ value, change: change.kind === 'upload' ? { kind: 'upload', name: change.file.name, shortId: change.shortId } : change })}
      </output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent!) as { value: string; change: { kind: string; name?: string; shortId?: string } };
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const pdf = (name = 'cv.pdf', size = 1.2 * 1024 * 1024, type = 'application/pdf') => {
  const bytes = new Uint8Array(Math.round(size));
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return new File([bytes], name, { type });
};

describe('CvField', () => {
  it('shows the CV path input, Upload CV (PDF), the accept filter and the git-history hint', () => {
    render(<Harness initialValue="/docs/cv.pdf" />);
    expect(screen.getByLabelText(/^CV/)).toHaveValue('/docs/cv.pdf');
    expect(screen.getByRole('button', { name: 'Upload CV (PDF)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove CV' })).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('accept', 'application/pdf,.pdf');
    expect(screen.getByText(/Old CV versions stay in the public repository's git history/)).toBeInTheDocument();
  });

  it('no CV: no Remove CV button', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Remove CV' })).toBeNull();
  });

  it('a valid PDF becomes a pending upload with its name and size', async () => {
    render(<Harness />);
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText('cv.pdf (1.2 MB) — new, saved with this profile')).toBeInTheDocument();
    expect(state().change).toEqual({ kind: 'upload', name: 'cv.pdf', shortId: expect.stringMatching(/^[0-9a-f]{6}$/) });
    expect(state().value).toBe('');
  });

  it('a PDF with an empty MIME type is accepted by its magic bytes (R10)', async () => {
    render(<Harness />);
    await userEvent.upload(fileInput(), pdf('cv.pdf', 1000, ''), { applyAccept: false });
    expect(await screen.findByText(/cv\.pdf \(1 KB\)/)).toBeInTheDocument();
  });

  it.each([
    ['not a PDF', new File(['hello'], 'cv.txt', { type: 'text/plain' })],
    ['over 5 MB', pdf('big.pdf', 5 * 1024 * 1024 + 1)],
    ['bad magic bytes', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], 'fake.pdf', { type: 'application/pdf' })],
  ])('%s is rejected with the CV message and changes nothing', async (_n, file) => {
    render(<Harness initialValue="/docs/cv.pdf" />);
    await userEvent.upload(fileInput(), file, { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('CV must be a PDF of 5 MB or less');
    expect(state()).toEqual({ value: '/docs/cv.pdf', change: { kind: 'none' } });
  });

  it('Remove CV marks the CV for removal; Undo restores the field', async () => {
    render(<Harness initialValue="/uploads/cv.pdf?v=a1b2c3" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    expect(screen.getByText('CV will be removed when you save')).toBeInTheDocument();
    expect(state().change).toEqual({ kind: 'remove' });
    expect(screen.queryByRole('button', { name: 'Remove CV' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(state()).toEqual({ value: '/uploads/cv.pdf?v=a1b2c3', change: { kind: 'none' } });
    expect(screen.queryByText('CV will be removed when you save')).toBeNull();
  });

  it('Upload replaces a pending removal; Remove discards a pending upload (Feature 4.6)', async () => {
    render(<Harness initialValue="/uploads/cv.pdf?v=a1b2c3" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    await userEvent.upload(fileInput(), pdf());
    await screen.findByText(/new, saved with this profile/);
    expect(state().change.kind).toBe('upload');
    expect(screen.queryByText('CV will be removed when you save')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    expect(state().change).toEqual({ kind: 'remove' });
    expect(screen.queryByText(/new, saved with this profile/)).toBeNull();
  });

  it('Remove CV with only a pending upload (no current CV) just discards it', async () => {
    render(<Harness />);
    await userEvent.upload(fileInput(), pdf());
    await screen.findByText(/new, saved with this profile/);
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    expect(state().change).toEqual({ kind: 'none' });
  });

  it('typing a URL/path clears a pending upload or removal', async () => {
    render(<Harness initialValue="/docs/cv.pdf" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove CV' }));
    await userEvent.clear(screen.getByLabelText(/^CV/));
    await userEvent.type(screen.getByLabelText(/^CV/), 'https://x.com/cv.pdf');
    expect(state()).toEqual({ value: 'https://x.com/cv.pdf', change: { kind: 'none' } });
  });

  it('shows a validation error on the input', () => {
    render(<CvField value="/images/x.png" onValueChange={() => {}} change={{ kind: 'none' }} onChange={() => {}} error="Use an https:// URL or a /path to a PDF" />);
    expect(screen.getByLabelText(/^CV/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use an https:// URL or a /path to a PDF')).toBeInTheDocument();
  });
});
