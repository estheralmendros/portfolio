import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectsList, type ListState } from '../../../src/admin/components/ProjectsList';
import { NetworkError, NotFoundError, RateLimitError, RemoteContentError } from '../../../src/admin/lib/errors';
import { project } from './fakeClient';

const handlers = () => ({ onRetry: vi.fn(), onNew: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onSaveOrder: vi.fn(async () => {}) });

function renderList(state: ListState) {
  const h = handlers();
  render(<ProjectsList state={state} {...h} />);
  return h;
}

describe('ProjectsList', () => {
  it('loading', () => {
    renderList({ status: 'loading' });
    expect(screen.getByText('Loading projects…')).toBeInTheDocument();
  });
  it('empty', async () => {
    const h = renderList({ status: 'ready', data: [], sha: 's' });
    expect(screen.getByText('No projects yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ New project' }));
    expect(h.onNew).toHaveBeenCalled();
  });
  it('rows in array order with title, id, date, featured marker, edit/delete', async () => {
    const h = renderList({ status: 'ready', data: [project('b', { featured: true, date: '2026-11' }), project('a')], sha: 's' });
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Title b');
    expect(rows[0]).toHaveTextContent('b');
    expect(rows[0]).toHaveTextContent('Nov 2026');
    expect(within(rows[0]!).getByText('Featured')).toBeInTheDocument();
    expect(within(rows[1]!).queryByText('Featured')).toBeNull();
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /Edit/ }));
    expect(h.onEdit).toHaveBeenCalledWith('a');
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Delete/ }));
    expect(h.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });
  it('network error with Retry', async () => {
    const h = renderList({ status: 'error', error: new NetworkError('x') });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load projects. Check your connection and try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.onRetry).toHaveBeenCalled();
  });
  it('rate limit with Retry', () => {
    renderList({ status: 'error', error: new RateLimitError('x', new Date(2026, 0, 1, 8, 7)) });
    expect(screen.getByRole('alert')).toHaveTextContent("GitHub's rate limit was reached. Try again after 08:07.");
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
  it('remote file invalid disables editing and lists the first 3 issues', () => {
    renderList({ status: 'error', error: new RemoteContentError('bad', ['[0].date: A', '[1].id: B', '[2].x: C', '[3].y: D']) });
    expect(screen.getByRole('alert')).toHaveTextContent('content/projects.json is invalid: [0].date: A; [1].id: B; [2].x: C');
    expect(screen.queryByText(/\[3\]/)).toBeNull();
    expect(screen.queryByRole('button', { name: '+ New project' })).toBeNull();
  });
  it('rows have ↑/↓; a pending reorder disables New/Edit/Delete and Save order passes the new order', async () => {
    const h = renderList({ status: 'ready', data: [project('a'), project('b')], sha: 's' });
    expect(screen.getByRole('button', { name: "Move 'Title a' up" })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: "Move 'Title a' down" }));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Title b');
    expect(screen.getByRole('button', { name: '+ New project' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Title a' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Title b' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(h.onSaveOrder).toHaveBeenCalledWith([project('b'), project('a')]);
  });
  it('missing file', () => {
    renderList({ status: 'error', error: new NotFoundError('x') });
    expect(screen.getByRole('alert')).toHaveTextContent('content/projects.json was not found on main.');
  });
});
