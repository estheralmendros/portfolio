import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { TimelineItem } from '../../../src/components/TimelineItem';
import userEvent from '@testing-library/user-event';
import { ExperienceForm } from '../../../src/admin/components/ExperienceForm';
import { experience } from './fakeClient';
import { previewPane } from '../fixtures';

const existing = [experience('engineer-acme', { role: 'Engineer', org: 'Acme' })];

function setup(props: Partial<Parameters<typeof ExperienceForm>[0]> = {}) {
  const onSave = vi.fn(async () => {});
  const onDirtyChange = vi.fn();
  render(<ExperienceForm mode="create" existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} onDirtyChange={onDirtyChange} {...props} />);
  return { onSave, onDirtyChange };
}

async function fill(role = 'Software Engineer', org = 'Example Co') {
  await userEvent.type(screen.getByLabelText(/^Role/), role);
  await userEvent.type(screen.getByLabelText(/^Organization/), org);
  await userEvent.type(screen.getByLabelText(/^Start/), '2022-01');
}

describe('ExperienceForm', () => {
  it('has Type radios (Work default), month inputs, Present checkbox, highlights textarea and tags', () => {
    setup();
    expect(screen.getByRole('radio', { name: 'Work' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Education' })).not.toBeChecked();
    expect(screen.getByLabelText(/^Start/)).toHaveAttribute('type', 'month');
    expect(screen.getByLabelText(/^End/)).toHaveAttribute('type', 'month');
    expect(screen.getByRole('checkbox', { name: 'Present' })).not.toBeChecked();
    expect(screen.getByLabelText(/^Highlights/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/^Tags/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Location/)).toBeInTheDocument();
  });

  it('id auto-derives from role + org', async () => {
    setup();
    await fill();
    expect(screen.getByLabelText(/^Id/)).toHaveValue('software-engineer-example-co');
  });

  it('Present writes end: null and disables End; highlights one per line, tags comma-separated', async () => {
    const { onSave } = setup();
    await fill();
    await userEvent.type(screen.getByLabelText(/^End/), '2023-01');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    expect(screen.getByLabelText(/^End/)).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Education' }));
    await userEvent.type(screen.getByLabelText(/^Location/), 'Remote');
    await userEvent.type(screen.getByLabelText(/^Highlights/), 'Led the team{Enter}{Enter}  Shipped v2  ');
    await userEvent.type(screen.getByLabelText(/^Tags/), 'TypeScript, React');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      id: 'software-engineer-example-co', type: 'education', role: 'Software Engineer', org: 'Example Co', start: '2022-01',
      end: null, location: 'Remote', highlights: ['Led the team', 'Shipped v2'], tags: ['TypeScript', 'React'],
    });
  });

  it('unchecked Present requires an End date', async () => {
    const { onSave } = setup();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText(/^End/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^End/)).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('End before Start is an error; End ≥ Start saves', async () => {
    const { onSave } = setup();
    await fill();
    await userEvent.type(screen.getByLabelText(/^End/), '2021-12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Must be on or after the start date')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText(/^End/));
    await userEvent.type(screen.getByLabelText(/^End/), '2022-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ start: '2022-01', end: '2022-01', highlights: [], tags: [] }));
  });

  it('more than 8 highlights is an error on Highlights', async () => {
    const { onSave } = setup();
    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    await userEvent.type(screen.getByLabelText(/^Highlights/), Array.from({ length: 9 }, (_, i) => `H${i}`).join('{Enter}'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Use at most 8 highlights')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a highlight over 200 characters is shown on Highlights (review R6)', async () => {
    const { onSave } = setup();
    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    await userEvent.click(screen.getByLabelText(/^Highlights/));
    await userEvent.paste(`ok\n${'x'.repeat(201)}`);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText(/^Highlights/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Highlights/)).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('duplicate id', async () => {
    const { onSave } = setup();
    await fill('Engineer', 'Acme');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("This id is already used by 'Engineer @ Acme'")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('edit: prefills Present from end: null, id read-only; unchecking Present enables End', async () => {
    const initial = experience('engineer-acme', { role: 'Engineer', org: 'Acme', highlights: ['A', 'B'], tags: ['X'] });
    const onSave = vi.fn(async () => {});
    render(<ExperienceForm mode="edit" initial={initial} existing={existing} onSave={onSave} onCancel={vi.fn()} onReload={vi.fn()} />);
    expect(screen.getByLabelText(/^Id/)).toHaveAttribute('readonly');
    expect(screen.getByRole('checkbox', { name: 'Present' })).toBeChecked();
    expect(screen.getByLabelText(/^End/)).toBeDisabled();
    expect(screen.getByLabelText(/^Highlights/)).toHaveValue('A\nB');
    expect(screen.getByLabelText(/^Tags/)).toHaveValue('X');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    expect(screen.getByLabelText(/^End/)).toBeEnabled();
    await userEvent.type(screen.getByLabelText(/^End/), '2024-05');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ ...initial, end: '2024-05' });
  });

  it('reports dirty', async () => {
    const { onDirtyChange } = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe('ExperienceForm (preview, prd2 Feature 5)', () => {

  it('renders TimelineItem with the same markup as the public timeline', async () => {
    setup();
    await fill();
    await userEvent.click(screen.getByLabelText('Present'));
    await userEvent.type(screen.getByLabelText(/^Highlights/), 'Built things');
    await waitFor(() => expect(within(previewPane()).getByText('Built things')).toBeInTheDocument());
    const entry = experience('software-engineer-example-co', { role: 'Software Engineer', org: 'Example Co', start: '2022-01', end: null, highlights: ['Built things'] });
    const expected = render(<ol className="ml-4"><TimelineItem entry={entry} /></ol>).container.innerHTML;
    expect(previewPane().innerHTML).toBe(expected);
    expect(within(previewPane()).getByText('Jan 2022 – Present')).toBeInTheDocument();
  });

  it('invalid: placeholders, no crash, "Fix errors to save"', async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/^Organization/), 'Acme');
    await waitFor(() => expect(within(previewPane()).getByText(/— Acme/)).toBeInTheDocument());
    expect(screen.getByText('Fix errors to save')).toBeInTheDocument();
    expect(screen.queryByText('Preview unavailable')).toBeNull();
    expect(previewPane()).not.toHaveTextContent('undefined');
  });
});
