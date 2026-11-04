import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApp } from '../../../src/admin/AdminApp';
import { AuthError } from '../../../src/admin/lib/errors';
import { fakeClient, project } from './fakeClient';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

function setup(client = fakeClient()) {
  let onAuthError: (() => void) | undefined;
  const createClient = vi.fn((opts: { token: string; onAuthError?: () => void }) => {
    onAuthError = opts.onAuthError;
    return client;
  });
  render(<AdminApp createClient={createClient} />);
  return { client, createClient, authError: () => onAuthError?.() };
}

async function login(token = 'github_pat_ok') {
  await userEvent.type(await screen.findByLabelText('GitHub fine-grained token'), token);
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('AdminApp auth', () => {
  it('shows login, verifies, stores the token only in sessionStorage and lists projects', async () => {
    const { client } = setup();
    await login();
    expect(await screen.findByText('Title a')).toBeInTheDocument();
    expect(client.verifyToken).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('portfolio.admin.token')).toBe('github_pat_ok');
    expect(localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(window.location.hash).toBe('#/projects');
    expect(window.location.href).not.toContain('github_pat_ok');
  });

  it('shows the verify-table message on failure and does not store the token', async () => {
    setup(fakeClient({ verify: { ok: false, reason: 'wrong-user', login: 'mallory' } }));
    await login();
    expect(await screen.findByRole('alert')).toHaveTextContent('This token belongs to @mallory. Only @estheralmendros can use this admin.');
    expect(sessionStorage.getItem('portfolio.admin.token')).toBeNull();
  });

  it('401 during login shows invalid-token, not session-expired', async () => {
    setup(fakeClient({ verify: { ok: false, reason: 'invalid-token' } }));
    await login();
    expect(await screen.findByRole('alert')).toHaveTextContent("GitHub rejected this token. Check it was copied fully and hasn't expired.");
  });

  it('silent re-verify: 401 → login with the session-expired message', async () => {
    sessionStorage.setItem('portfolio.admin.token', 'github_pat_old');
    setup(fakeClient({ verify: { ok: false, reason: 'invalid-token' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session expired or the token was revoked. Log in again.');
    expect(sessionStorage.getItem('portfolio.admin.token')).toBeNull();
  });

  it('silent re-verify: network keeps the token and offers Retry and Log out', async () => {
    sessionStorage.setItem('portfolio.admin.token', 'github_pat_old');
    const client = fakeClient();
    client.verifyToken.mockResolvedValueOnce({ ok: false, reason: 'network' });
    setup(client);
    expect(await screen.findByText("Couldn't reach GitHub. Check your connection.")).toBeInTheDocument();
    expect(sessionStorage.getItem('portfolio.admin.token')).toBe('github_pat_old');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Title a')).toBeInTheDocument();
  });

  it('silent re-verify: rate-limited keeps the token', async () => {
    sessionStorage.setItem('portfolio.admin.token', 'github_pat_old');
    setup(fakeClient({ verify: { ok: false, reason: 'rate-limited' } }));
    expect(await screen.findByText("GitHub's rate limit was reached. Try again in a few minutes.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(sessionStorage.getItem('portfolio.admin.token')).toBe('github_pat_old');
  });

  it('silent re-verify shows a checking state and continues to the requested route', async () => {
    sessionStorage.setItem('portfolio.admin.token', 'github_pat_old');
    window.location.hash = '#/projects/new';
    setup();
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeInTheDocument();
  });

  it('Log out clears the token and returns to login', async () => {
    setup();
    await login();
    await screen.findByText('Title a');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByLabelText('GitHub fine-grained token')).toBeInTheDocument();
    expect(sessionStorage.getItem('portfolio.admin.token')).toBeNull();
  });

  it('a 401 after login forces logout with the session-expired message', async () => {
    const client = fakeClient();
    const { authError } = setup(client);
    await login();
    await screen.findByText('Title a');
    client.putFile.mockImplementationOnce(async () => {
      authError();
      throw new AuthError('401');
    });
    const row = screen.getAllByRole('listitem')[0]!;
    await userEvent.click(within(row).getByRole('button', { name: /Delete/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session expired or the token was revoked. Log in again.');
    expect(sessionStorage.getItem('portfolio.admin.token')).toBeNull();
  });
});

describe('AdminApp projects', () => {
  it('create commits once with the add message, the new project first, and shows Saved', async () => {
    const { client } = setup();
    await login();
    await screen.findByText('Title a');
    await userEvent.click(screen.getByRole('button', { name: '+ New project' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'New One');
    await userEvent.type(screen.getByLabelText(/^Summary/), 'S');
    await userEvent.type(screen.getByLabelText(/^Date/), '2026-10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved. The site will update after the next deploy (a few minutes).')).toBeInTheDocument();
    expect(client.putFile).toHaveBeenCalledOnce();
    const args = client.putFile.mock.calls[0]![0];
    expect(args.message).toBe('content(projects): add "New One"');
    expect(args.sha).toBe('sha-1');
    expect(JSON.parse(args.content)[0].id).toBe('new-one');
    expect(args.content.endsWith('}\n]\n')).toBe(true);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('New One');
  });

  it('edit commits an update message; uses the new sha next time', async () => {
    const { client } = setup();
    await login();
    await screen.findByText('Title a');
    await userEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: /Edit/ }));
    const title = screen.getByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, 'Changed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Saved\./);
    expect(client.putFile.mock.calls[0]![0].message).toBe('content(projects): update "Changed"');
    await userEvent.click(within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: /Delete/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(client.putFile).toHaveBeenCalledTimes(2));
    expect(client.putFile.mock.calls[1]![0]).toMatchObject({ message: 'content(projects): delete "Title b"', sha: 'sha-1+' });
  });

  it('unknown id shows Project not found with a back link', async () => {
    setup();
    await login();
    await screen.findByText('Title a');
    window.location.hash = '#/projects/missing';
    expect(await screen.findByText('Project not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to projects/ })).toHaveAttribute('href', '#/projects');
  });

  it('conflict Reload refetches and returns to the list', async () => {
    const client = fakeClient({ projects: [project('a')] });
    setup(client);
    await login();
    await screen.findByText('Title a');
    client.putFile.mockRejectedValueOnce(new (await import('../../../src/admin/lib/errors')).ConflictError('409'));
    await userEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: /Edit/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Content changed elsewhere/);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(window.location.hash).toBe('#/projects'));
    expect(client.getFile).toHaveBeenCalledTimes(2);
  });
});
