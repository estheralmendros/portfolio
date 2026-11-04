import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillsList } from '../../../src/admin/components/SkillsList';
import { CertificationsList } from '../../../src/admin/components/CertificationsList';
import { ExperienceList } from '../../../src/admin/components/ExperienceList';
import { NetworkError, NotFoundError, RemoteContentError } from '../../../src/admin/lib/errors';
import { certification, experience, skill } from './fakeClient';

const handlers = () => ({ onRetry: vi.fn(), onNew: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onSaveOrder: vi.fn(async (_items: { id: string }[]) => {}) });

describe('SkillsList', () => {
  const skills = [
    skill('ts', { name: 'TypeScript', years: 5 }),
    skill('react', { name: 'React', category: 'data', years: 4 }),
    skill('js', { name: 'JavaScript', years: 6 }),
    skill('astro', { name: 'Astro', category: 'data' }),
    skill('docker', { name: 'Docker', category: 'tools' }),
  ];

  it('groups by category in the public order with headings; empty categories hidden', () => {
    render(<SkillsList state={{ status: 'ready', data: skills, sha: 's' }} {...handlers()} />);
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Languages', 'Data, IoT & AI', 'Dev tools']);
    const languages = screen.getByRole('heading', { name: 'Languages' }).parentElement!;
    expect(within(languages).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('TypeScript'), expect.stringContaining('JavaScript'),
    ]);
    expect(within(languages).getAllByRole('listitem')[0]).toHaveTextContent('5 yrs');
  });

  it('↑/↓ limited to the category; moves swap within the category in the flat array', async () => {
    const h = handlers();
    render(<SkillsList state={{ status: 'ready', data: skills, sha: 's' }} {...h} />);
    expect(screen.getByRole('button', { name: "Move 'React' up" })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Move 'JavaScript' down" })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Move 'Docker' up" })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Move 'Docker' down" })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: "Move 'TypeScript' down" }));
    expect(screen.getByText("Moved 'TypeScript' to position 2 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(h.onSaveOrder.mock.calls[0]![0].map((s: { id: string }) => s.id)).toEqual(['js', 'react', 'ts', 'astro', 'docker']);
  });

  it('+ New skill, Edit and Delete', async () => {
    const h = handlers();
    render(<SkillsList state={{ status: 'ready', data: skills, sha: 's' }} {...h} />);
    await userEvent.click(screen.getByRole('button', { name: '+ New skill' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit React' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Docker' }));
    expect(h.onNew).toHaveBeenCalled();
    expect(h.onEdit).toHaveBeenCalledWith('react');
    expect(h.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'docker' }));
  });

  it('loading, empty and error states name the collection', () => {
    const { rerender } = render(<SkillsList state={{ status: 'loading' }} {...handlers()} />);
    expect(screen.getByText('Loading skills…')).toBeInTheDocument();
    rerender(<SkillsList state={{ status: 'ready', data: [], sha: 's' }} {...handlers()} />);
    expect(screen.getByText('No skills yet.')).toBeInTheDocument();
    rerender(<SkillsList state={{ status: 'error', error: new NetworkError('x') }} {...handlers()} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load skills. Check your connection and try again.");
    rerender(<SkillsList state={{ status: 'error', error: new RemoteContentError('bad', ['[0].id: A']) }} {...handlers()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('content/skills.json is invalid: [0].id: A');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('CertificationsList', () => {
  it('rows with name, issuer and dates; reorder; + New certification', async () => {
    const h = handlers();
    const data = [certification('c1', { name: 'One', expires: '2030-01' }), certification('c2', { name: 'Two' })];
    render(<CertificationsList state={{ status: 'ready', data, sha: 's' }} {...h} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('One');
    expect(rows[0]).toHaveTextContent('Issuer · Jan 2024 – Jan 2030');
    expect(rows[1]).toHaveTextContent('Issuer · Jan 2024');
    await userEvent.click(screen.getByRole('button', { name: "Move 'Two' up" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(h.onSaveOrder.mock.calls[0]![0].map((c: { id: string }) => c.id)).toEqual(['c2', 'c1']);
    expect(screen.getByRole('button', { name: '+ New certification' })).toBeInTheDocument();
  });

  it('missing file', () => {
    render(<CertificationsList state={{ status: 'error', error: new NotFoundError('x') }} {...handlers()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('content/certifications.json was not found on main.');
  });
});

describe('ExperienceList', () => {
  it('rows labelled "<role> @ <org>" with type and range; Edit/Delete/Move use that label', async () => {
    const h = handlers();
    const data = [
      experience('e1', { role: 'Engineer', org: 'Acme' }),
      experience('e2', { role: 'BSc', org: 'Uni', type: 'education', start: '2015-09', end: '2019-06' }),
    ];
    render(<ExperienceList state={{ status: 'ready', data, sha: 's' }} {...h} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Engineer @ Acme');
    expect(rows[0]).toHaveTextContent('Work · Jan 2022 – Present');
    expect(rows[1]).toHaveTextContent('Education · Sep 2015 – Jun 2019');
    await userEvent.click(screen.getByRole('button', { name: 'Edit BSc @ Uni' }));
    expect(h.onEdit).toHaveBeenCalledWith('e2');
    expect(screen.getByRole('button', { name: "Move 'Engineer @ Acme' down" })).toBeEnabled();
    expect(screen.getByRole('button', { name: '+ New experience' })).toBeInTheDocument();
  });
});
