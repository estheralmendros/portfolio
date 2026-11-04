import { vi } from 'vitest';
import type { FileChange, GitHubClient, VerifyResult, WorkflowRun } from '../../../src/admin/lib/githubClient';
import type { Certification, Experience, Profile, Project, Skill } from '../../../src/content/schema';

export const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, title: `Title ${id}`, summary: `Summary ${id}`, description: '', tags: [], featured: false, date: '2024-01', ...extra,
});
export const skill = (id: string, extra: Partial<Skill> = {}): Skill => ({ id, name: `Skill ${id}`, category: 'languages', ...extra });
export const certification = (id: string, extra: Partial<Certification> = {}): Certification => ({
  id, name: `Cert ${id}`, issuer: 'Issuer', issued: '2024-01', ...extra,
});
export const experience = (id: string, extra: Partial<Experience> = {}): Experience => ({
  id, type: 'work', role: `Role ${id}`, org: `Org ${id}`, start: '2022-01', end: null, highlights: [], tags: [], ...extra,
});
export const profile = (extra: Partial<Profile> = {}): Profile => ({
  name: 'Ada Lovelace',
  title: 'Engineer',
  bio: 'Bio text.',
  location: 'London',
  availability: 'open',
  socials: { email: 'ada@example.com', linkedin: 'https://www.linkedin.com/in/ada', github: 'https://github.com/ada' },
  ...extra,
});

const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

/**
 * In-memory GitHubClient. `files` maps repo paths to their JSON data; each file has its own SHA
 * (`<name>-sha-1`, then `+` per write). Projects keep the MVP default (`sha-1`).
 */
export function fakeClient(
  opts: {
    verify?: VerifyResult;
    projects?: Project[];
    sha?: string;
    skills?: Skill[];
    certifications?: Certification[];
    experience?: Experience[];
    profile?: Profile;
    runs?: (WorkflowRun | null)[];
  } = {},
) {
  const files = new Map<string, { content: string; sha: string }>([
    ['content/projects.json', { content: json(opts.projects ?? [project('a'), project('b')]), sha: opts.sha ?? 'sha-1' }],
    ['content/skills.json', { content: json(opts.skills ?? [skill('ts', { name: 'TypeScript' }), skill('react', { name: 'React', category: 'data' })]), sha: 'skills-sha-1' }],
    ['content/certifications.json', { content: json(opts.certifications ?? [certification('c1'), certification('c2')]), sha: 'certifications-sha-1' }],
    ['content/experience.json', { content: json(opts.experience ?? [experience('e1'), experience('e2')]), sha: 'experience-sha-1' }],
    ['content/profile.json', { content: json(opts.profile ?? profile()), sha: 'profile-sha-1' }],
  ]);
  let commits = 0;
  const runs = opts.runs ?? [null];
  let runCalls = 0;
  const client = {
    verifyToken: vi.fn(async (): Promise<VerifyResult> => opts.verify ?? { ok: true, login: 'estheralmendros' }),
    getFile: vi.fn(async (path: string) => {
      const f = files.get(path);
      if (!f) throw new Error(`no file ${path}`);
      return { ...f };
    }),
    putFile: vi.fn(async (args: { path: string; content: string; sha: string; message: string }) => {
      const prev = files.get(args.path);
      const sha = `${prev?.sha ?? 'new'}+`;
      files.set(args.path, { content: args.content, sha });
      commits += 1;
      return { sha, commitSha: commits === 1 ? 'commit' : `commit-${commits}` };
    }),
    commitFiles: vi.fn(async (args: { files: FileChange[]; message: string; expectedShas: Record<string, string> }) => {
      commits += 1;
      const blobShas: Record<string, string> = {};
      for (const f of args.files) {
        if ('delete' in f) files.delete(f.path);
        else {
          const sha = `${files.get(f.path)?.sha ?? 'new'}+`;
          files.set(f.path, { content: f.content, sha });
          blobShas[f.path] = sha;
        }
      }
      return { commitSha: `commit-${commits}`, blobShas };
    }),
    getWorkflowRunForCommit: vi.fn(async (_sha: string): Promise<WorkflowRun | null> => {
      const run = runs[Math.min(runCalls, runs.length - 1)] ?? null;
      runCalls += 1;
      return run;
    }),
  };
  return client as typeof client & GitHubClient;
}

export const run = (status: WorkflowRun['status'], conclusion: string | null = null): WorkflowRun => ({
  id: 1, status, conclusion, html_url: 'https://github.com/estheralmendros/portfolio/actions/runs/1', run_started_at: null,
});
