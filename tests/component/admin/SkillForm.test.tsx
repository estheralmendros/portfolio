import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { SkillsSection } from '../../../src/components/SkillsSection';
import userEvent from '@testing-library/user-event';
import { SkillForm } from '../../../src/admin/components/SkillForm';
import { ConflictError, PermissionError } from '../../../src/admin/lib/errors';
import { skill } from './fakeClient';

const existing = [skill('typescript', { name: 'TypeScript' }), skill('go', { name: 'Go', category: 'tools' })];

function setup(props: Partial<Parameters<typeof SkillForm>[0]> = {}) {
  const onSave = vi.fn(async () => {});
  const onReload = vi.fn();
  const onDirtyChange = vi.fn();
  render(<SkillForm mode="create" existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={onReload} onDirtyChange={onDirtyChange} {...props} />);
  return { onSave, onReload, onDirtyChange };
}

describe('SkillForm', () => {
  it('has the PRD fields: Name, Id, Category (4 options), Years (number), Icon with hint', () => {
    setup();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Id/)).toBeInTheDocument();
    const category = screen.getByLabelText(/^Category/);
    expect(Array.from((category as HTMLSelectElement).options).filter((o) => o.value).map((o) => o.textContent)).toEqual([
      'Languages', 'Frameworks', 'Cloud', 'Tools',
    ]);
    expect(screen.getByLabelText(/^Years/)).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText(/^Icon/)).toBeInTheDocument();
    expect(screen.getByText('e.g. typescript — see simpleicons.org')).toBeInTheDocument();
  });

  it('id auto-derives from the name until edited and is editable on create', async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Node.js');
    expect(screen.getByLabelText(/^Id/)).toHaveValue('node-js');
    await userEvent.clear(screen.getByLabelText(/^Id/));
    await userEvent.type(screen.getByLabelText(/^Id/), 'nodejs');
    await userEvent.type(screen.getByLabelText(/^Name/), ' 22');
    expect(screen.getByLabelText(/^Id/)).toHaveValue('nodejs');
  });

  it('submits the normalized skill (years as integer, empty optionals omitted)', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Rust');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'languages');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenLastCalledWith({ id: 'rust', name: 'Rust', category: 'languages' });
  });

  it('includes years and icon when given', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Rust');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'tools');
    await userEvent.type(screen.getByLabelText(/^Years/), '3');
    await userEvent.type(screen.getByLabelText(/^Icon/), 'rust');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ id: 'rust', name: 'Rust', category: 'tools', years: 3, icon: 'rust' });
  });

  it('required fields and schema errors block the save and focus the first invalid field', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Icon/), 'Not Valid');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Category/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Icon/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects years that are not a whole number in 0–50', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Rust');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'tools');
    await userEvent.type(screen.getByLabelText(/^Years/), '2.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText(/^Years/)).toHaveAttribute('aria-invalid', 'true');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('duplicate id is a field error, no save', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Typescript!');
    await userEvent.clear(screen.getByLabelText(/^Id/));
    await userEvent.type(screen.getByLabelText(/^Id/), 'typescript');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'languages');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("This id is already used by 'TypeScript'")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('duplicate name (case-insensitive) is a field error, no save', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/^Name/), ' go ');
    await userEvent.clear(screen.getByLabelText(/^Id/));
    await userEvent.type(screen.getByLabelText(/^Id/), 'golang');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'languages');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("A skill named 'Go' already exists")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('edit: prefilled, id read-only, own name is not a duplicate, another name is', async () => {
    const onSave = vi.fn(async () => {});
    render(<SkillForm mode="edit" initial={existing[0]} existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} />);
    expect(screen.getByLabelText(/^Id/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Category/)).toHaveValue('languages');
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'GO');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("A skill named 'Go' already exists")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.clear(name);
    await userEvent.type(name, 'typescript');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ id: 'typescript', name: 'typescript', category: 'languages' });
  });

  it('conflict blocks with Reload; other errors keep the data', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new PermissionError('x')).mockRejectedValueOnce(new ConflictError('409'));
    const { onReload } = setup({ onSave });
    await userEvent.type(screen.getByLabelText(/^Name/), 'Rust');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'tools');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This token can no longer write to the repository.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Content changed elsewhere/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalled();
  });

  it('reports dirty', async () => {
    const { onDirtyChange } = setup();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.type(screen.getByLabelText(/^Name/), 'R');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe('SkillForm (preview, prd2 Feature 5)', () => {
  const previewPane = () => screen.getByLabelText('Preview', { selector: '[inert]' });

  it('create: SkillsSection with the full list, the draft inserted at the top of its category; initials only + note', async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Rust');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'languages');
    await userEvent.type(screen.getByLabelText(/^Icon/), 'rust');
    await waitFor(() => expect(within(previewPane()).getByText('Rust')).toBeInTheDocument());
    const expected = render(
      <SkillsSection skills={[skill('rust', { name: 'Rust', icon: 'rust' }), ...existing]} icons={{}} />,
    ).container.innerHTML;
    expect(previewPane().innerHTML).toBe(expected);
    expect(previewPane().querySelector('svg path')).toBeNull();
    expect(screen.getByText('Icons appear after deploy')).toBeInTheDocument();
  });

  it('edit: the draft replaces its entry in place', async () => {
    setup({ mode: 'edit', initial: existing[1] });
    await userEvent.clear(screen.getByLabelText(/^Name/));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Golang');
    await waitFor(() => expect(within(previewPane()).getByText('Golang')).toBeInTheDocument());
    expect(within(previewPane()).queryByText('Go', { selector: 'span.font-medium' })).toBeNull();
    expect(within(previewPane()).getByText('TypeScript')).toBeInTheDocument();
  });

  it('invalid (no name): placeholder chip and "Fix errors to save"', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'cloud');
    await waitFor(() => expect(within(previewPane()).getByRole('heading', { name: 'Cloud' })).toBeInTheDocument());
    expect(within(previewPane()).getByText('—', { selector: 'span.font-medium' })).toBeInTheDocument();
    expect(screen.getByText('Fix errors to save')).toBeInTheDocument();
  });
});
