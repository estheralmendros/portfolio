import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificationForm } from '../../../src/admin/components/CertificationForm';
import { NetworkError } from '../../../src/admin/lib/errors';
import { certification } from './fakeClient';
import { previewPane, stubObjectUrls } from '../fixtures';
import type { SaveExtras } from '../../../src/admin/components/formKit';
import type { ImageKind, ProcessedImage } from '../../../src/admin/lib/imageProcessing';
import type { Certification } from '../../../src/content/schema';
import { CertificationCard } from '../../../src/components/CertificationCard';
import { currentYearMonth } from '../../../src/lib/dates';

const existing = [certification('aws-saa', { name: 'AWS SAA' })];

function setup(props: Partial<Parameters<typeof CertificationForm>[0]> = {}) {
  const onSave = vi.fn(async () => {});
  const onDirtyChange = vi.fn();
  render(<CertificationForm mode="create" existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} onDirtyChange={onDirtyChange} {...props} />);
  return { onSave, onDirtyChange };
}

async function fillRequired(name = 'CKA Kubernetes') {
  await userEvent.type(screen.getByLabelText(/^Name/), name);
  await userEvent.type(screen.getByLabelText(/^Issuer/), 'CNCF');
  await userEvent.type(screen.getByLabelText(/^Issued/), '2025-04');
}

describe('CertificationForm', () => {
  it('has the PRD fields; Issued/Expires are month inputs', () => {
    setup();
    for (const l of [/^Name/, /^Id/, /^Issuer/, /^Credential ID/, /^Credential URL/, /^Badge/]) expect(screen.getByLabelText(l)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Issued/)).toHaveAttribute('type', 'month');
    expect(screen.getByLabelText(/^Expires/)).toHaveAttribute('type', 'month');
  });

  it('id auto-derives from the name; minimal valid entry omits empty optionals', async () => {
    const { onSave } = setup();
    await fillRequired();
    expect(screen.getByLabelText(/^Id/)).toHaveValue('cka-kubernetes');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ id: 'cka-kubernetes', name: 'CKA Kubernetes', issuer: 'CNCF', issued: '2025-04' });
  });

  it('full entry', async () => {
    const { onSave } = setup();
    await fillRequired();
    await userEvent.type(screen.getByLabelText(/^Expires/), '2028-04');
    await userEvent.type(screen.getByLabelText(/^Credential ID/), 'ABC-1');
    await userEvent.type(screen.getByLabelText(/^Credential URL/), 'https://cncf.io/v/abc');
    await userEvent.type(screen.getByLabelText(/^Badge/), '/images/cka.png');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      id: 'cka-kubernetes', name: 'CKA Kubernetes', issuer: 'CNCF', issued: '2025-04', expires: '2028-04',
      credentialId: 'ABC-1', credentialUrl: 'https://cncf.io/v/abc', badge: '/images/cka.png',
    });
  });

  it('expires before issued, http URL and a typed upload path are field errors', async () => {
    const { onSave } = setup();
    await fillRequired();
    await userEvent.type(screen.getByLabelText(/^Expires/), '2024-01');
    await userEvent.type(screen.getByLabelText(/^Credential URL/), 'http://x.com');
    await userEvent.type(screen.getByLabelText(/^Badge/), 'src/assets/uploads/certifications/x-a1b2c3.png');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Must be on or after the issue date')).toBeInTheDocument();
    expect(screen.getByText('Must start with https://')).toBeInTheDocument();
    expect(screen.getByText("Upload paths can't be typed; use Upload image")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Expires/)).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('required fields', async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    for (const l of [/^Name/, /^Id/, /^Issuer/, /^Issued/]) expect(screen.getByLabelText(l)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('duplicate id', async () => {
    const { onSave } = setup();
    await fillRequired('AWS SAA');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("This id is already used by 'AWS SAA'")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('edit: id locked; an upload badge path kept as loaded saves', async () => {
    const initial = certification('aws-saa', { name: 'AWS SAA', badge: 'src/assets/uploads/certifications/aws-saa-a1b2c3.png' });
    const onSave = vi.fn(async () => {});
    render(<CertificationForm mode="edit" initial={initial} existing={[initial]} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} />);
    expect(screen.getByLabelText(/^Id/)).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(initial);
  });

  it('network error keeps the data', async () => {
    const onSave = vi.fn(async () => { throw new NetworkError('x'); });
    setup({ onSave });
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save. Check your connection and try again.");
    expect(screen.getByLabelText(/^Name/)).toHaveValue('CKA Kubernetes');
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('reports dirty', async () => {
    const { onDirtyChange } = setup();
    await userEvent.type(screen.getByLabelText(/^Issuer/), 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe('CertificationForm (badge upload + preview)', () => {
  beforeEach(() => {
    stubObjectUrls(() => 'blob:http://localhost/badge');
  });
  const processImage = vi.fn(async (_f: File, _k: ImageKind): Promise<ProcessedImage> => ({
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), ext: 'png', width: 320, height: 320,
  }));
  const badgeInput = () => document.querySelector<HTMLInputElement>('input[name="badge-file"]')!;

  it('the badge input accepts SVG; an upload commits certifications/<final id>-<hex>.png with (+image)', async () => {
    const { onSave } = setup({ processImage });
    expect(badgeInput().accept).toContain('image/svg+xml');
    await userEvent.upload(badgeInput(), new File(['<svg/>'], 'b.svg', { type: 'image/svg+xml' }));
    expect(processImage).toHaveBeenCalledWith(expect.any(File), 'badge');
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [saved, extras] = onSave.mock.calls[0] as unknown as [Certification, SaveExtras];
    expect(saved.badge).toMatch(/^src\/assets\/uploads\/certifications\/cka-kubernetes-[0-9a-f]{6}\.png$/);
    expect(extras).toEqual({ files: [{ path: saved.badge, content: 'AQID', encoding: 'base64' }], attachments: ['image'] });
  });

  it('upload with an empty name: the name/id errors block the save and the pending badge is kept', async () => {
    const { onSave } = setup({ processImage });
    await userEvent.upload(badgeInput(), new File(['x'], 'b.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
    expect(screen.getByText('New image selected — saved with this entry')).toBeInTheDocument();
  });

  it('preview renders CertificationCard with the same markup; badge alt "<name> badge"', async () => {
    setup({ initial: certification('aws-saa', { name: 'AWS SAA', badge: '/images/aws.png' }), mode: 'edit' });
    const expected = render(
      <CertificationCard certification={certification('aws-saa', { name: 'AWS SAA', badge: '/images/aws.png' })} badge={{ src: '/portfolio/images/aws.png' }} now={currentYearMonth()} />,
    ).container.innerHTML;
    expect(previewPane().innerHTML).toBe(expected);
    expect(within(previewPane()).getByRole('img', { name: 'AWS SAA badge' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Issuer/), ' Inc');
    await waitFor(() => expect(within(previewPane()).getByText('Issuer Inc')).toBeInTheDocument());
  });

  it('invalid: placeholders and "Fix errors to save"', async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/^Issuer/), 'CNCF');
    await waitFor(() => expect(within(previewPane()).getByText('CNCF')).toBeInTheDocument());
    expect(within(previewPane()).getByRole('heading', { level: 3 })).toHaveTextContent('—');
    expect(screen.getByText('Fix errors to save')).toBeInTheDocument();
  });
});
