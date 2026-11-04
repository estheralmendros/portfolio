import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApp, type PollDeploy } from '../../../src/admin/AdminApp';
import { AuthError, ConflictError, GitHubApiError, PermissionError } from '../../../src/admin/lib/errors';
import { fakeClient, project, run, skill } from './fakeClient';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '#');
});
afterEach(() => vi.restoreAllMocks());

function setup(client = fakeClient(), pollDeploy?: PollDeploy) {
  let onAuthError: (() => void) | undefined;
  const createClient = vi.fn((opts: { token: string; onAuthError?: () => void }) => {
    onAuthError = opts.onAuthError;
    return client;
  });
  const utils = render(<AdminApp createClient={createClient} pollDeploy={pollDeploy} />);
  return { client, utils, authError: () => onAuthError?.() };
}

async function login(waitText = 'Title a') {
  await userEvent.type(await screen.findByLabelText('GitHub fine-grained token'), 'github_pat_ok');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText(waitText);
}

const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name });
const lastPut = (client: ReturnType<typeof fakeClient>) => client.putFile.mock.calls.at(-1)![0];
const paths = (client: ReturnType<typeof fakeClient>) => client.getFile.mock.calls.map((c) => c[0]);

describe('AdminApp navigation', () => {
  it('shows the five tabs after login (Projects current) and none on the login screen', async () => {
    setup();
    await screen.findByLabelText('GitHub fine-grained token');
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    await login();
    expect(tab('Projects')).toHaveAttribute('aria-current', 'page');
    expect(tab('Profile')).toBeInTheDocument();
  });

  it('each tab loads its own file once, on first visit', async () => {
    const { client } = setup();
    await login();
    expect(paths(client)).toEqual(['content/projects.json']);
    await userEvent.click(tab('Skills'));
    expect(await screen.findByRole('heading', { name: 'Languages' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/skills');
    await userEvent.click(tab('Certifications'));
    expect(await screen.findByText('Cert c1')).toBeInTheDocument();
    await userEvent.click(tab('Experience'));
    expect(await screen.findByText('Role e1 @ Org e1')).toBeInTheDocument();
    await userEvent.click(tab('Profile'));
    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Ada Lovelace');
    await userEvent.click(tab('Skills'));
    await screen.findByRole('heading', { name: 'Languages' });
    expect(paths(client)).toEqual([
      'content/projects.json', 'content/skills.json', 'content/certifications.json', 'content/experience.json', 'content/profile.json',
    ]);
  });

  it('an unknown route after a silent re-verify goes to #/projects', async () => {
    sessionStorage.setItem('portfolio.admin.token', 'github_pat_old');
    window.history.replaceState(null, '', '#/nowhere');
    setup();
    expect(await screen.findByText('Title a')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/projects');
  });

  it('a silent re-verify continues to a section route', async () => {
    sessionStorage.setItem('portfolio.admin.token', 'github_pat_old');
    window.history.replaceState(null, '', '#/experience/e2');
    setup();
    expect(await screen.findByRole('heading', { name: 'Edit experience' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Role/)).toHaveValue('Role e2');
  });

  it('an unknown id shows "<Thing> not found" with a back link', async () => {
    setup();
    await login();
    window.location.hash = '#/certifications/missing';
    expect(await screen.findByText('Certification not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to certifications/ })).toHaveAttribute('href', '#/certifications');
  });
});

describe('AdminApp section CRUD (one commit each, per-file SHA)', () => {
  it('skills: create inserts at the top of its category with the add message', async () => {
    const client = fakeClient({ skills: [skill('ts', { name: 'TypeScript' }), skill('react', { name: 'React', category: 'data' }), skill('js', { name: 'JavaScript' })] });
    setup(client);
    await login();
    await userEvent.click(tab('Skills'));
    await userEvent.click(await screen.findByRole('button', { name: '+ New skill' }));
    expect(window.location.hash).toBe('#/skills/new');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Vue');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'data');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved. The site will update after the next deploy (a few minutes).')).toBeInTheDocument();
    const put = lastPut(client);
    expect(put).toMatchObject({ path: 'content/skills.json', sha: 'skills-sha-1', message: 'content(skills): add "Vue"' });
    expect(JSON.parse(put.content).map((s: { id: string }) => s.id)).toEqual(['ts', 'vue', 'react', 'js']);
    expect(window.location.hash).toBe('#/skills');
  });

  it('skills: duplicate name is blocked with no request', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Skills'));
    await userEvent.click(await screen.findByRole('button', { name: '+ New skill' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'typescript');
    await userEvent.clear(screen.getByLabelText(/^Id/));
    await userEvent.type(screen.getByLabelText(/^Id/), 'ts2');
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'languages');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText("A skill named 'TypeScript' already exists")).toBeInTheDocument();
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it('certifications: edit commits an update; the next save uses the new SHA of that file only', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Certifications'));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Cert c1' }));
    await userEvent.clear(screen.getByLabelText(/^Issuer/));
    await userEvent.type(screen.getByLabelText(/^Issuer/), 'New Issuer');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Saved\./);
    expect(lastPut(client)).toMatchObject({ path: 'content/certifications.json', sha: 'certifications-sha-1', message: 'content(certifications): update "Cert c1"' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete Cert c2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete certification' }));
    await waitFor(() => expect(client.putFile).toHaveBeenCalledTimes(2));
    expect(lastPut(client)).toMatchObject({ sha: 'certifications-sha-1+', message: 'content(certifications): delete "Cert c2"' });
    await userEvent.click(tab('Projects'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Title a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(client.putFile).toHaveBeenCalledTimes(3));
    expect(lastPut(client)).toMatchObject({ path: 'content/projects.json', sha: 'sha-1' });
  });

  it('experience: create prepends with the "<role> @ <org>" label; delete confirms first', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Experience'));
    await userEvent.click(await screen.findByRole('button', { name: '+ New experience' }));
    await userEvent.type(screen.getByLabelText(/^Role/), 'Engineer');
    await userEvent.type(screen.getByLabelText(/^Organization/), 'Acme');
    await userEvent.type(screen.getByLabelText(/^Start/), '2023-02');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Saved\./);
    const put = lastPut(client);
    expect(put.message).toBe('content(experience): add "Engineer @ Acme"');
    expect(JSON.parse(put.content)[0]).toMatchObject({ id: 'engineer-acme', end: null });
    await userEvent.click(screen.getByRole('button', { name: 'Delete Role e1 @ Org e1' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent("Delete 'Role e1 @ Org e1'? This commits to main and removes it from the live site.");
    await userEvent.click(screen.getByRole('button', { name: 'Delete experience' }));
    await waitFor(() => expect(lastPut(client).message).toBe('content(experience): delete "Role e1 @ Org e1"'));
  });

  it('profile: saves "content(profile): update profile" and stays on the form with the new SHA', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Profile'));
    const title = await screen.findByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, 'Staff Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
    expect(lastPut(client)).toMatchObject({ path: 'content/profile.json', sha: 'profile-sha-1', message: 'content(profile): update profile' });
    expect(JSON.parse(lastPut(client).content).title).toBe('Staff Engineer');
    expect(window.location.hash).toBe('#/profile');
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Staff Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(client.putFile).toHaveBeenCalledTimes(2));
    expect(lastPut(client).sha).toBe('profile-sha-1+');
  });
});

describe('AdminApp reorder', () => {
  it('Save order commits once with "content(<collection>): reorder"', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(screen.getByRole('button', { name: "Move 'Title a' down" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await screen.findByText(/Saved\./);
    expect(client.putFile).toHaveBeenCalledOnce();
    expect(lastPut(client).message).toBe('content(projects): reorder');
    expect(JSON.parse(lastPut(client).content).map((p: { id: string }) => p.id)).toEqual(['b', 'a']);
    expect(screen.queryByText('Order changed —')).toBeNull();
    expect(screen.getByRole('button', { name: '+ New project' })).toBeEnabled();
  });

  it('skills reorder stays within the category', async () => {
    const { client } = setup(fakeClient({ skills: [skill('a', { name: 'A' }), skill('x', { name: 'X', category: 'tools' }), skill('b', { name: 'B' })] }));
    await login();
    await userEvent.click(tab('Skills'));
    await userEvent.click(await screen.findByRole('button', { name: "Move 'B' up" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await screen.findByText(/Saved\./);
    expect(lastPut(client).message).toBe('content(skills): reorder');
    expect(JSON.parse(lastPut(client).content).map((s: { id: string }) => s.id)).toEqual(['b', 'x', 'a']);
  });

  it('a conflict on Save order shows the banner; Reload refetches and drops the pending order', async () => {
    const { client } = setup();
    await login();
    client.putFile.mockRejectedValueOnce(new ConflictError('409'));
    await userEvent.click(screen.getByRole('button', { name: "Move 'Title a' down" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(await screen.findByText(/Content changed elsewhere/)).toBeInTheDocument();
    expect(screen.getByText('Order changed —')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(client.getFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Order changed —')).toBeNull());
  });
});

describe('AdminApp errors: one sampled error per section screen', () => {
  it('403 on a skills delete shows the no-longer-write message', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Skills'));
    client.putFile.mockRejectedValueOnce(new PermissionError('403'));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete React' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This token can no longer write to the repository.');
  });

  it('GitHubApiError on an experience reorder shows its message', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Experience'));
    client.putFile.mockRejectedValueOnce(new GitHubApiError(422));
    await userEvent.click(await screen.findByRole('button', { name: "Move 'Role e1 @ Org e1' down" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub rejected the save (HTTP 422). Nothing was published.');
  });

  it('a 401 on the profile save forces logout', async () => {
    const { client, authError } = setup();
    await login();
    await userEvent.click(tab('Profile'));
    await screen.findByLabelText(/^Title/);
    client.putFile.mockImplementationOnce(async () => {
      authError();
      throw new AuthError('401');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session expired or the token was revoked. Log in again.');
  });

  it('a profile conflict Reload refetches the profile', async () => {
    const { client } = setup();
    await login();
    await userEvent.click(tab('Profile'));
    await screen.findByLabelText(/^Title/);
    client.putFile.mockRejectedValueOnce(new ConflictError('409'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Content changed elsewhere/);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(paths(client).filter((p) => p === 'content/profile.json')).toHaveLength(2));
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('a load error on a tab offers Retry', async () => {
    const client = fakeClient();
    setup(client);
    await login();
    client.getFile.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await userEvent.click(tab('Certifications'));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load certifications. Check your connection and try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Cert c1')).toBeInTheDocument();
  });
});

describe('AdminApp dirty-form guard (review R13)', () => {
  it('a dirty form asks before switching tabs; cancel keeps the form and the hash', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await login();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Title a' }));
    await userEvent.type(screen.getByLabelText(/^Summary/), '!');
    await userEvent.click(tab('Skills'));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?');
    expect(window.location.hash).toBe('#/projects/a');
    expect(screen.getByLabelText(/^Summary/)).toHaveValue('Summary a!');
    confirm.mockReturnValue(true);
    await userEvent.click(tab('Skills'));
    expect(await screen.findByRole('heading', { name: 'Languages' })).toBeInTheDocument();
  });

  it('a clean form switches without asking; after a save no question either', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await login();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Title a' }));
    await userEvent.click(tab('Experience'));
    expect(await screen.findByText('Role e1 @ Org e1')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a pending reorder counts as dirty', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await login();
    await userEvent.click(screen.getByRole('button', { name: "Move 'Title a' down" }));
    await userEvent.click(tab('Profile'));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText('Order changed —')).toBeInTheDocument();
  });
});

describe('AdminApp deploy status', () => {
  it('after a save the header badge polls the commit: Deploying… then Live', async () => {
    const client = fakeClient({ runs: [run('completed', 'success')] });
    setup(client);
    await login();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Title b' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    const banner = await screen.findByRole('banner');
    expect(await within(banner).findByText('Live')).toBeInTheDocument();
    expect(client.getWorkflowRunForCommit).toHaveBeenCalledWith('commit');
  });

  it('a new commit aborts the previous poll; logout and unmount abort too', async () => {
    const calls: { commitSha: string; signal?: AbortSignal }[] = [];
    const pollDeploy: PollDeploy = (opts) => {
      calls.push(opts);
      opts.onUpdate({ kind: 'deploying' });
    };
    const { utils } = setup(fakeClient({ projects: ['a', 'b', 'c', 'd'].map((id) => project(id)) }), pollDeploy);
    await login();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Title b' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(within(screen.getByRole('banner')).getByText('Deploying…')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Title a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((c) => c.commitSha)).toEqual(['commit', 'commit-2']);
    expect(calls[0]!.signal!.aborted).toBe(true);
    expect(calls[1]!.signal!.aborted).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(calls[1]!.signal!.aborted).toBe(true);
    await login('Title c');
    await userEvent.click(screen.getByRole('button', { name: "Move 'Title c' down" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(within(screen.getByRole('banner')).queryByText('Deploying…')).toBeInTheDocument();
    utils.unmount();
    expect(calls[2]!.signal!.aborted).toBe(true);
  });

  it('the badge is reset on logout', async () => {
    const pollDeploy: PollDeploy = (opts) => opts.onUpdate({ kind: 'live' });
    setup(fakeClient(), pollDeploy);
    await login();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Title b' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(await within(screen.getByRole('banner')).findByText('Live')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await login();
    expect(within(screen.getByRole('banner')).queryByText('Live')).toBeNull();
  });
});
