import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Certification, Experience, Profile, Project, Skill } from '../content/schema';
import { LastCommitContext } from './adminContext';
import { AdminHeader } from './components/AdminHeader';
import { CertificationForm } from './components/CertificationForm';
import { CertificationsList } from './components/CertificationsList';
import { listErrorMessage, type ListHandlers, type ListState } from './components/CollectionList';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ExperienceForm } from './components/ExperienceForm';
import { ExperienceList } from './components/ExperienceList';
import { LoginScreen } from './components/LoginScreen';
import { ProfileForm } from './components/ProfileForm';
import { ProjectForm } from './components/ProjectForm';
import { ProjectsList } from './components/ProjectsList';
import { SkillForm } from './components/SkillForm';
import { SkillsList } from './components/SkillsList';
import { StatusBanner } from './components/StatusBanner';
import {
  addEntry, commitMessage, insertSkill, loadCollection, removeEntry, saveCollectionWithFiles, updateEntry, type CollectionData,
  type CollectionName,
} from './lib/contentStore';
import { pollDeployStatus, type DeployState } from './lib/deployStatus';
import { AuthError, ConflictError, toAppError } from './lib/errors';
import { createGitHubClient, type GitHubClient, type VerifyResult } from './lib/githubClient';
import { clearToken, getToken, setToken } from './lib/session';
import type { SaveExtras } from './components/formKit';
import type { ProcessFn } from './components/ImageField';
import { REVERIFY_NETWORK, SESSION_EXPIRED, saveFailureMessage, savedMessage, verifyMessage } from './messages';
import { SECTION_META, capitalize, entryLabel, type SectionEntries } from './sections';
import { sectionOf, useBeforeUnload, useHashRoute, type ListSection, type NavSection, type Route } from './useHashRoute';

export type CreateClient = (opts: { token: string; onAuthError?: () => void }) => GitHubClient;
export type PollDeploy = typeof pollDeployStatus;

type Phase =
  | { name: 'login'; message: string | null; busy: boolean }
  | { name: 'checking' }
  | { name: 'verify-error'; message: string }
  | { name: 'ready'; login: string };

type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T; sha: string } | { status: 'error'; error: Error };
/** One entry per content file; each tab loads its file on first visit and keeps its own SHA. */
type Store = { [K in CollectionName]?: Loadable<CollectionData<K>> };
type Status = { section: NavSection; kind: 'success' | 'error'; text: string; conflict?: boolean };
type PendingDelete = { [S in ListSection]: { section: S; entry: SectionEntries[S] } }[ListSection];

const defaultCreateClient: CreateClient = (opts) => createGitHubClient(opts);

export function AdminApp({
  createClient = defaultCreateClient,
  pollDeploy = pollDeployStatus,
  processImage,
}: {
  createClient?: CreateClient;
  pollDeploy?: PollDeploy;
  /** Injectable image processing for component tests (jsdom has no canvas); the forms default to the browser one. */
  processImage?: ProcessFn;
}) {
  const dirtyRef = useRef(false);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
    setDirtyState(d);
  }, []);
  const [route, navigate] = useHashRoute({ isDirty: () => dirtyRef.current });
  useBeforeUnload(dirty);

  const [phase, setPhase] = useState<Phase>(() => (getToken() ? { name: 'checking' } : { name: 'login', message: null, busy: false }));
  const [store, setStore] = useState<Store>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deploy, setDeploy] = useState<DeployState>({ kind: 'idle' });
  const [lastCommitSha, setLastCommitSha] = useState<string | undefined>(undefined);
  const clientRef = useRef<GitHubClient | null>(null);
  const requested = useRef<Route>(route);
  const loadsStarted = useRef(new Set<CollectionName>());
  const session = useRef(0);
  const deployCtl = useRef<AbortController | null>(null);

  const stopDeploy = useCallback(() => {
    deployCtl.current?.abort();
    deployCtl.current = null;
  }, []);
  useEffect(() => stopDeploy, [stopDeploy]);

  const logout = useCallback(
    (message: string | null = null) => {
      clearToken();
      clientRef.current = null;
      session.current += 1;
      loadsStarted.current.clear();
      stopDeploy();
      setDeploy({ kind: 'idle' });
      setLastCommitSha(undefined);
      setStore({});
      setStatus(null);
      setPendingDelete(null);
      setPhase({ name: 'login', message, busy: false });
    },
    [stopDeploy],
  );

  const makeClient = useCallback(
    (token: string) => createClient({ token, onAuthError: () => logout(SESSION_EXPIRED) }),
    [createClient, logout],
  );

  const load = useCallback(async (name: CollectionName) => {
    const client = clientRef.current;
    if (!client) return;
    const mine = session.current;
    loadsStarted.current.add(name);
    setStore((s) => ({ ...s, [name]: { status: 'loading' } }));
    try {
      const loaded = await loadCollection(client, name);
      if (mine === session.current) setStore((s) => ({ ...s, [name]: { status: 'ready', data: loaded.data, sha: loaded.sha } }));
    } catch (e) {
      const err = toAppError(e);
      if (mine === session.current && !(err instanceof AuthError)) setStore((s) => ({ ...s, [name]: { status: 'error', error: err } }));
    }
  }, []);

  // Lazy per-tab load: the first visit of a section loads its file.
  const current = sectionOf(route);
  useEffect(() => {
    if (phase.name !== 'ready' || !current || loadsStarted.current.has(current)) return;
    void load(current);
  }, [phase.name, current, load]);

  const onVerified = useCallback(
    (result: VerifyResult, silent: boolean, token: string) => {
      if (result.ok) {
        setToken(token);
        setPhase({ name: 'ready', login: result.login });
        const target: Route = requested.current.name === 'login' || !silent ? { name: 'list', section: 'projects' } : requested.current;
        navigate(target);
        return;
      }
      if (silent && (result.reason === 'network' || result.reason === 'rate-limited')) {
        setPhase({ name: 'verify-error', message: result.reason === 'network' ? REVERIFY_NETWORK : verifyMessage(result) });
        return;
      }
      clientRef.current = null;
      if (silent) clearToken();
      setPhase({ name: 'login', message: silent && result.reason === 'invalid-token' ? SESSION_EXPIRED : verifyMessage(result), busy: false });
    },
    [navigate],
  );

  const silentVerify = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setPhase({ name: 'login', message: null, busy: false });
      return;
    }
    setPhase({ name: 'checking' });
    clientRef.current = makeClient(token);
    onVerified(await clientRef.current.verifyToken(), true, token);
  }, [makeClient, onVerified]);

  // Silent re-verify of a stored token on load (the initial phase is already 'checking').
  const mountVerifyStarted = useRef(false);
  useEffect(() => {
    const token = getToken();
    if (!token || mountVerifyStarted.current) return;
    mountVerifyStarted.current = true;
    const client = makeClient(token);
    clientRef.current = client;
    void client.verifyToken().then((result) => onVerified(result, true, token));
  }, [makeClient, onVerified]);

  const login = async (raw: string) => {
    const token = raw.trim();
    setPhase({ name: 'login', message: null, busy: true });
    clientRef.current = makeClient(token);
    onVerified(await clientRef.current.verifyToken(), false, token);
  };

  /** Deploy polling is owned here: a new commit aborts the previous poll; logout/unmount stop it. */
  const startDeploy = (client: GitHubClient, commitSha: string) => {
    stopDeploy();
    const ctl = new AbortController();
    deployCtl.current = ctl;
    pollDeploy({
      client,
      commitSha,
      signal: ctl.signal,
      onUpdate: (s) => {
        if (!ctl.signal.aborted) setDeploy(s);
      },
    });
  };

  /**
   * The single save path: one commit for one content file, guarded by the SHA this tab loaded (or last saved).
   * With extra files (uploads, CV delete) the JSON and the files go in one Git Data commit (prd2 Feature 3.6).
   */
  const commit = async <K extends CollectionName>(name: K, data: CollectionData<K>, message: string, extras?: SaveExtras) => {
    const client = clientRef.current;
    const entry = store[name];
    if (!client || entry?.status !== 'ready') throw new Error('Not ready');
    const res = await saveCollectionWithFiles(client, name, data, entry.sha, message, extras?.files ?? []);
    setStore((s) => ({ ...s, [name]: { status: 'ready', data, sha: res.sha } }));
    setLastCommitSha(res.commitSha);
    startDeploy(client, res.commitSha);
    setStatus({ section: name, kind: 'success', text: savedMessage(extras?.attachments) });
  };

  const reportError = (section: NavSection, e: unknown) => {
    const err = toAppError(e);
    const text = saveFailureMessage(err);
    if (text !== null) setStatus({ section, kind: 'error', text, conflict: err instanceof ConflictError });
  };

  const reload = async (section: NavSection) => {
    setStatus(null);
    if (section !== 'profile') navigate({ name: 'list', section });
    await load(section);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    const { section, entry } = pendingDelete;
    const loaded = store[section];
    if (loaded?.status !== 'ready') return;
    setDeleting(true);
    try {
      const next = removeEntry(loaded.data as { id: string }[], entry.id);
      await commit(section, next as CollectionData<typeof section>, commitMessage(section, 'delete', entryLabel(section, entry)));
    } catch (e) {
      reportError(section, e);
    } finally {
      setPendingDelete(null);
      setDeleting(false);
    }
  };

  if (phase.name === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <p className="text-lg">Checking your session…</p>
      </div>
    );
  }
  if (phase.name === 'verify-error') {
    return (
      <>
        <AdminHeader />
        <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
          <h1 className="text-2xl font-bold">Session check failed</h1>
          <StatusBanner kind="error">{phase.message}</StatusBanner>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" onClick={() => void silentVerify()}>
              Retry
            </button>
            <button type="button" className="btn-secondary" onClick={() => logout()}>
              Log out
            </button>
          </div>
        </main>
      </>
    );
  }
  if (phase.name === 'login') {
    return (
      <>
        <AdminHeader />
        <LoginScreen onSubmit={(t) => void login(t)} busy={phase.busy} message={phase.message} />
      </>
    );
  }

  const statusBanner = (section: NavSection) =>
    status && status.section === section ? (
      <StatusBanner
        kind={status.kind}
        action={
          status.conflict ? (
            <button type="button" className="btn-primary" onClick={() => void reload(section)}>
              Reload
            </button>
          ) : undefined
        }
      >
        {status.text}
      </StatusBanner>
    ) : null;

  const listHandlers = <S extends ListSection>(section: S): ListHandlers<SectionEntries[S]> => ({
    onRetry: () => void load(section),
    onNew: () => {
      setStatus(null);
      navigate({ name: 'new', section });
    },
    onEdit: (id) => {
      setStatus(null);
      navigate({ name: 'edit', section, id });
    },
    onDelete: (entry) => {
      setStatus(null);
      setPendingDelete({ section, entry } as PendingDelete);
    },
    onSaveOrder: async (ordered) => {
      setStatus(null);
      try {
        await commit(section, ordered as CollectionData<S>, commitMessage(section, 'reorder'));
      } catch (e) {
        reportError(section, e);
        throw e;
      }
    },
    onPendingChange: setDirty,
  });

  const listFor = (section: ListSection): ReactNode => {
    const state = (store[section] ?? { status: 'loading' }) as ListState<never>;
    switch (section) {
      case 'projects':
        return <ProjectsList state={state as ListState<Project>} {...listHandlers('projects')} />;
      case 'skills':
        return <SkillsList state={state as ListState<Skill>} {...listHandlers('skills')} />;
      case 'certifications':
        return <CertificationsList state={state as ListState<Certification>} {...listHandlers('certifications')} />;
      case 'experience':
        return <ExperienceList state={state as ListState<Experience>} {...listHandlers('experience')} />;
    }
  };

  const formFor = (section: ListSection, mode: 'create' | 'edit', id: string | undefined, data: { id: string }[]): ReactNode => {
    const props = {
      key: mode === 'edit' ? `edit-${id}` : 'new',
      mode,
      onCancel: () => navigate({ name: 'list', section }),
      onReload: () => void reload(section),
      onDirtyChange: setDirty,
    };
    const find = <T extends { id: string }>(list: T[]) => (mode === 'edit' ? list.find((x) => x.id === id) : undefined);
    const save = async <S extends ListSection>(s: S, list: SectionEntries[S][], entry: SectionEntries[S], extras?: SaveExtras) => {
      const next =
        mode === 'edit' ? updateEntry(list, entry.id, entry) : s === 'skills' ? insertSkill(list as Skill[], entry as Skill) : addEntry(list, entry);
      const message = commitMessage(s, mode === 'edit' ? 'update' : 'add', entryLabel(s, entry), extras?.attachments);
      await commit(s, next as CollectionData<S>, message, extras);
      navigate({ name: 'list', section: s });
    };
    switch (section) {
      case 'projects': {
        const list = data as Project[];
        return <ProjectForm {...props} initial={find(list)} existing={list} processImage={processImage} onSave={(e, x) => save('projects', list, e, x)} />;
      }
      case 'skills': {
        const list = data as Skill[];
        return <SkillForm {...props} initial={find(list)} existing={list} onSave={(e) => save('skills', list, e)} />;
      }
      case 'certifications': {
        const list = data as Certification[];
        return <CertificationForm {...props} initial={find(list)} existing={list} processImage={processImage} onSave={(e, x) => save('certifications', list, e, x)} />;
      }
      case 'experience': {
        const list = data as Experience[];
        return <ExperienceForm {...props} initial={find(list)} existing={list} onSave={(e) => save('experience', list, e)} />;
      }
    }
  };

  let heading: string;
  let body: ReactNode;
  if (route.name === 'profile') {
    heading = 'Profile';
    const profile = store.profile;
    body = (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Profile</h1>
        {statusBanner('profile')}
        {!profile || profile.status === 'loading' ? (
          <p role="status">Loading profile…</p>
        ) : profile.status === 'error' ? (
          <StatusBanner
            kind="error"
            action={
              <button type="button" className="btn-secondary" onClick={() => void load('profile')}>
                Retry
              </button>
            }
          >
            {listErrorMessage(profile.error, 'content/profile.json', 'the profile')}
          </StatusBanner>
        ) : (
          <ProfileForm
            key={profile.sha}
            initial={profile.data}
            onDirtyChange={setDirty}
            onReload={() => void reload('profile')}
            processImage={processImage}
            onSave={(p: Profile, x?: SaveExtras) => commit('profile', p, commitMessage('profile', 'update', undefined, x?.attachments), x)}
          />
        )}
      </div>
    );
  } else if (route.name === 'list' || route.name === 'login') {
    const section = route.name === 'list' ? route.section : 'projects';
    heading = SECTION_META[section].title;
    body = (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{heading}</h1>
        {statusBanner(section)}
        {listFor(section)}
      </div>
    );
  } else {
    const { section } = route;
    const meta = SECTION_META[section];
    const isEdit = route.name === 'edit';
    heading = `${isEdit ? 'Edit' : 'New'} ${meta.singular}`;
    const loaded = store[section];
    if (loaded?.status !== 'ready') {
      body = listFor(section);
    } else if (isEdit && !(loaded.data as { id: string }[]).some((x) => x.id === route.id)) {
      body = (
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">{capitalize(meta.singular)} not found</h1>
          <a href={`#/${section}`} className="link w-fit">
            ← Back to {meta.plural}
          </a>
        </div>
      );
    } else {
      body = (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-4">
            <a href={`#/${section}`} className="link">
              ← {meta.title}
            </a>
            <h1 className="text-2xl font-bold">{heading}</h1>
          </div>
          {formFor(section, isEdit ? 'edit' : 'create', isEdit ? route.id : undefined, loaded.data as { id: string }[])}
        </div>
      );
    }
  }

  const deleteMeta = pendingDelete ? { label: entryLabel(pendingDelete.section, pendingDelete.entry as never), noun: SECTION_META[pendingDelete.section].singular } : null;

  return (
    <LastCommitContext.Provider value={lastCommitSha}>
      <AdminHeader
        section={heading}
        login={phase.login}
        onLogout={() => logout()}
        deploy={deploy}
        nav={{
          current,
          onNavigate: (r) => {
            if (navigate(r, { guard: true })) setStatus(null);
          },
        }}
      />
      {/* Forms get the wider column for the side-by-side preview (prd2 Feature 5.1). */}
      <main className={`mx-auto px-4 py-8 ${route.name === 'list' || route.name === 'login' ? 'max-w-4xl' : 'max-w-6xl'}`}>{body}</main>
      {pendingDelete && deleteMeta && (
        <ConfirmDialog
          title={`Delete '${deleteMeta.label}'?`}
          message={`Delete '${deleteMeta.label}'? This commits to main and removes it from the live site.`}
          confirmLabel={`Delete ${deleteMeta.noun}`}
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </LastCommitContext.Provider>
  );
}
