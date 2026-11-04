// Cross-form behaviour from the code review: aria-required (W8), image-processing busy state (W7),
// the generic "can't save" banner (S2), the skill years input (S4), the base-aware slug hint (W10),
// safe preview links (S7), the preview region (S8a), tab semantics (S8b) and focus inside <details> (S8c).
import type { SubmitEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificationForm } from '../../../src/admin/components/CertificationForm';
import { ExperienceForm } from '../../../src/admin/components/ExperienceForm';
import { FormLayout, SaveBanners, useEntryForm } from '../../../src/admin/components/formKit';
import { ProfileForm } from '../../../src/admin/components/ProfileForm';
import { ProjectForm } from '../../../src/admin/components/ProjectForm';
import { SkillForm } from '../../../src/admin/components/SkillForm';
import type { ProcessedImage } from '../../../src/admin/lib/imageProcessing';
import { withBase } from '../../../src/lib/paths';
import { profile } from './fakeClient';
import { stubMatchMedia, stubObjectUrls } from '../fixtures';

const noop = vi.fn(async () => {});
const listProps = { mode: 'create' as const, existing: [], onSave: noop, onCancel: vi.fn(), onReload: vi.fn() };

describe('required fields expose aria-required (review W8)', () => {
  const required = (labels: RegExp[], optional: RegExp[]) => {
    for (const l of labels) expect(screen.getByLabelText(l)).toHaveAttribute('aria-required', 'true');
    for (const l of optional) expect(screen.getByLabelText(l)).not.toHaveAttribute('aria-required');
  };
  it('ProjectForm', () => {
    render(<ProjectForm {...listProps} />);
    required([/^Title/, /^Slug/, /^Summary/, /^Date/], [/^Tags/, /^Repo URL/, /^Description/]);
  });
  it('CertificationForm', () => {
    render(<CertificationForm {...listProps} />);
    required([/^Name/, /^Id/, /^Issuer/, /^Issued/], [/^Expires/, /^Credential URL/]);
  });
  it('SkillForm', () => {
    render(<SkillForm {...listProps} />);
    required([/^Name/, /^Id/, /^Category/], [/^Years/, /^Icon/]);
  });
  it('ProfileForm', () => {
    render(<ProfileForm initial={profile()} onSave={noop} onReload={vi.fn()} />);
    required([/^Name/, /^Title/, /^Bio/, /^Location/, /^Email/, /^LinkedIn URL/, /^GitHub URL/], [/^Current role/]);
  });
  it('ExperienceForm, including the custom End input (not required while Present is checked)', async () => {
    render(<ExperienceForm {...listProps} />);
    required([/^Role/, /^Organization/, /^Id/, /^Start/, /^End/], [/^Location/, /^Tags/]);
    await userEvent.click(screen.getByLabelText('Present'));
    expect(screen.getByLabelText(/^End/)).not.toHaveAttribute('aria-required');
  });
});

describe('image processing disables Save and the URL input (review W7)', () => {
  let release: () => void = () => {};
  const processImage = vi.fn(
    () =>
      new Promise<ProcessedImage>((resolve) => {
        release = () => resolve({ blob: new Blob([new Uint8Array(1)], { type: 'image/png' }), ext: 'png', width: 1, height: 1 });
      }),
  );
  beforeEach(() => {
    stubObjectUrls();
  });

  it.each([
    ['ProjectForm', 'image', /^Image$/, () => render(<ProjectForm {...listProps} processImage={processImage} />)],
    ['CertificationForm', 'badge', /^Badge/, () => render(<CertificationForm {...listProps} processImage={processImage} />)],
    ['ProfileForm', 'photo', /^Photo/, () => render(<ProfileForm initial={profile()} onSave={noop} onReload={vi.fn()} processImage={processImage} />)],
  ] as const)('%s', async (_name, field, urlLabel, mount) => {
    mount();
    const input = document.querySelector<HTMLInputElement>(`input[name="${field}-file"]`)!;
    await userEvent.upload(input, new File(['x'], 'a.png', { type: 'image/png' }));
    expect(screen.getByText('Processing image…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText(urlLabel)).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByLabelText(urlLabel)).toBeEnabled();
  });
});

describe('useEntryForm: a failed validation without a focusable field shows a banner (review S2)', () => {
  function Harness({ onSave }: { onSave: () => Promise<void> }) {
    const form = useEntryForm({ initialValues: () => ({ x: '' }), order: ['x'] as const });
    const onSubmit = (e: SubmitEvent<HTMLFormElement>) =>
      form.submit(e, () => ({ errors: { unknownPath: 'Something is off' } as never, data: null }), onSave);
    return (
      <>
        <SaveBanners conflict={form.conflict} saveError={form.saveError} formError={form.formError} onReload={vi.fn()} />
        <form ref={form.formRef} onSubmit={onSubmit} noValidate>
          <input name="x" aria-label="x" />
          <button type="submit">Save</button>
        </form>
      </>
    );
  }
  it('shows "Fix errors to save" with the first message, and does not save', async () => {
    const onSave = vi.fn(async () => {});
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Fix errors to save: Something is off');
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('SkillForm years (review S4)', () => {
  it('is a numeric text input, so "1e" is reported instead of silently omitted', async () => {
    const onSave = vi.fn(async () => {});
    render(<SkillForm {...listProps} onSave={onSave} />);
    const years = screen.getByLabelText(/^Years/);
    expect(years).toHaveAttribute('type', 'text');
    expect(years).toHaveAttribute('inputmode', 'numeric');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Rust');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'tools');
    await userEvent.type(years, '1e');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a whole number')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('ProjectForm slug hint (review W10)', () => {
  it('uses the base path from withBase', () => {
    render(<ProjectForm {...listProps} />);
    expect(screen.getByText(`Used in the URL: ${withBase('/projects/<slug>/')}`)).toBeInTheDocument();
  });
});

describe('ProfileForm preview links (review S7)', () => {
  it('a non-https social link never reaches the preview', async () => {
    render(<ProfileForm initial={profile()} onSave={noop} onReload={vi.fn()} />);
    const linkedin = screen.getByLabelText(/^LinkedIn URL/);
    await userEvent.clear(linkedin);
    await userEvent.type(linkedin, 'javascript:alert(1)');
    const pane = screen.getByRole('region', { name: 'Preview' });
    // The pane is inert, so query the DOM rather than the accessibility tree.
    // A malformed URL renders no link at all (prd2 5.7, validation A1-31), and nothing carries a javascript: href.
    const links = () => Array.from(pane.querySelectorAll('a')).filter((x) => x.textContent?.includes('LinkedIn'));
    await waitFor(() => expect(links()).toEqual([]));
    for (const a of pane.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').not.toMatch(/javascript/i);
  });
});

describe('preview pane and layout semantics (review S8a/S8b)', () => {
  it('the inert preview is a labelled region', () => {
    render(<ProjectForm {...listProps} />);
    const region = screen.getByRole('region', { name: 'Preview' });
    expect(region).toHaveAttribute('inert');
  });

  it('from 1024 px (matchMedia matches) there are no tab roles', () => {
    stubMatchMedia((q) => ({
      matches: q.includes('1024'), media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    render(<FormLayout aside={<p>the preview</p>}>the form</FormLayout>);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tabpanel', { hidden: true })).toHaveLength(0);
    expect(screen.getByText('the form')).toBeVisible();
    expect(screen.getByText('the preview')).toBeVisible();
  });
});

describe('focusFirstError opens a collapsed <details> (review S8c)', () => {
  it('a typed upload path in the collapsed image section is focused and its section opened', async () => {
    stubObjectUrls();
    // The upload path value keeps the URL section collapsed on mount; it is not the loaded value, so it is an error.
    render(<ProfileForm initial={profile({ photo: 'src/assets/uploads/profile/profile-abcdef.jpg' })} onSave={noop} onReload={vi.fn()} />);
    const details = screen.getByText('or use a URL / path').closest('details')!;
    expect(details.open).toBe(false);
    const photo = screen.getByLabelText(/^Photo/);
    details.open = true;
    await userEvent.clear(photo);
    await userEvent.type(photo, 'src/assets/uploads/profile/profile-123456.jpg');
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(details.open).toBe(true);
    expect(photo).toHaveFocus();
  });
});
