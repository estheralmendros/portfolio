import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApp } from '../../../src/admin/AdminApp';
import { AuthError, ConflictError } from '../../../src/admin/lib/errors';
import { fakeClient, project } from './fakeClient';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

function setup(client = fakeClient()) {
  const authErrors: ((() => void) | undefined)[] = [];
  const createClient = vi.fn((opts: { token: string; onAuthError?: () => void }) => {
    authErrors.push(opts.onAuthError);
    return client;
  });
  const view = render(<AdminApp createClient={createClient} />);
  return { client, createClient, view, authError: () => authErrors.at(-1)?.(), authErrorOf: (i: number) => authErrors[i]?.() };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Opens the first project's edit form and clicks Save; the commit stays in flight until the returned deferred settles. */
async function startEditSave(client: ReturnType<typeof fakeClient>) {
  const pending = deferred<{ sha: string; commitSha: string }>();
  client.putFile.mockImplementationOnce(() => pending.promise);
  await userEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: /Edit/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(client.putFile).toHaveBeenCalledOnce());
  return pending;
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

describe('AdminApp: async results from an old session or a left form', () => {
  it('a save that resolves after logout starts no deploy poll and shows no success in the next session', async () => {
    const client = fakeClient();
    setup(client);
    await login();
    await screen.findByText('Title a');
    const pending = await startEditSave(client);
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await login();
    await screen.findByText('Title a');
    await act(async () => pending.resolve({ sha: 'late-sha', commitSha: 'late-commit' }));
    expect(client.getWorkflowRunForCommit).not.toHaveBeenCalled();
    expect(screen.queryByText(/Saved\./)).not.toBeInTheDocument();
    // The next save still uses the SHA loaded in this session, not the late one.
    await userEvent.click(within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: /Delete/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(client.putFile).toHaveBeenCalledTimes(2));
    expect(client.putFile.mock.calls[1]![0].sha).not.toBe('late-sha');
  });

  it('a delete that fails after logout shows no error in the next session', async () => {
    const client = fakeClient();
    setup(client);
    await login();
    await screen.findByText('Title a');
    const pending = deferred<{ sha: string; commitSha: string }>();
    client.putFile.mockImplementationOnce(() => pending.promise);
    await userEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: /Delete/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(client.putFile).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await login();
    await screen.findByText('Title a');
    await act(async () => pending.reject(new ConflictError('409')));
    expect(screen.queryByText(/Content changed elsewhere/)).not.toBeInTheDocument();
  });

  it('a save that resolves after unmount starts no deploy poll', async () => {
    const client = fakeClient();
    const { view } = setup(client);
    await login();
    await screen.findByText('Title a');
    const pending = await startEditSave(client);
    view.unmount();
    await act(async () => pending.resolve({ sha: 'late-sha', commitSha: 'late-commit' }));
    expect(client.getWorkflowRunForCommit).not.toHaveBeenCalled();
  });

  it("a 401 from the previous session's client does not log out the new session", async () => {
    const { authErrorOf, createClient } = setup();
    await login();
    await screen.findByText('Title a');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await login('github_pat_new');
    await screen.findByText('Title a');
    expect(createClient).toHaveBeenCalledTimes(2);
    act(() => authErrorOf(0));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(sessionStorage.getItem('portfolio.admin.token')).toBe('github_pat_new');
  });

  it('a form save that resolves after the user left the form does not navigate back to the list', async () => {
    const client = fakeClient();
    setup(client);
    await login();
    await screen.findByText('Title a');
    const pending = await startEditSave(client);
    window.location.hash = '#/skills';
    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    await act(async () => pending.resolve({ sha: 'sha-2', commitSha: 'c2' }));
    expect(window.location.hash).toBe('#/skills');
    expect(screen.getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
  });

  it('a form save navigates to the list when the user is still on the form', async () => {
    const client = fakeClient();
    setup(client);
    await login();
    await screen.findByText('Title a');
    const pending = await startEditSave(client);
    await act(async () => pending.resolve({ sha: 'sha-2', commitSha: 'c2' }));
    await waitFor(() => expect(window.location.hash).toBe('#/projects'));
  });

  it('stores the Zod-parsed data that was committed', async () => {
    const client = fakeClient();
    setup(client);
    await login();
    await screen.findByText('Title a');
    await userEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: /Edit/ }));
    const title = screen.getByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, '  Spaced  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Saved\./);
    expect(JSON.parse(client.putFile.mock.calls[0]![0].content)[0].title).toBe('Spaced');
    await userEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: /Edit/ }));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Spaced');
  });
});

describe('AdminApp delete focus (review S8d)', () => {
  it('after a delete the deleted row is gone, so focus goes to "+ New project"', async () => {
    setup();
    await login();
    await screen.findByText('Title a');
    await userEvent.click(within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: /Delete/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(screen.queryByText('Title b')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: '+ New project' })).toHaveFocus());
  });
});
