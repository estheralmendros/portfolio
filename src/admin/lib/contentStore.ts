import type { z } from 'zod';
import {
  CertificationsFileSchema,
  ExperienceFileSchema,
  ProfileSchema,
  ProjectsFileSchema,
  SkillsFileSchema,
} from '../../content/schema';
import { formatIssuePath } from '../../content/parse';
import { NotFoundError, RemoteContentError, ValidationError } from './errors';
import type { Skill } from '../../content/schema';
import type { FileChange, GitHubClient } from './githubClient';

export const COLLECTIONS = {
  profile: { path: 'content/profile.json', schema: ProfileSchema, label: 'Profile' },
  projects: { path: 'content/projects.json', schema: ProjectsFileSchema, label: 'Projects' },
  skills: { path: 'content/skills.json', schema: SkillsFileSchema, label: 'Skills' },
  certifications: { path: 'content/certifications.json', schema: CertificationsFileSchema, label: 'Certifications' },
  experience: { path: 'content/experience.json', schema: ExperienceFileSchema, label: 'Experience' },
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
export type CollectionData<K extends CollectionName> = z.infer<(typeof COLLECTIONS)[K]['schema']>;
export interface Loaded<T> {
  data: T;
  sha: string;
}

export function serializeCollection(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export async function loadCollection<K extends CollectionName>(client: GitHubClient, name: K): Promise<Loaded<CollectionData<K>>> {
  const { path, schema } = COLLECTIONS[name];
  const { content, sha } = await client.getFile(path);
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RemoteContentError(`${path} is not valid JSON`, [`(root): ${msg}`]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${formatIssuePath(i.path)}: ${i.message}`);
    throw new RemoteContentError(`${path} is invalid`, issues);
  }
  return { data: result.data as CollectionData<K>, sha };
}

/** Validates the whole file; ValidationError (no request) when it would be invalid. */
function serializeValid<K extends CollectionName>(name: K, data: CollectionData<K>): string {
  const { path, schema } = COLLECTIONS[name];
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(`${path} would be invalid`, result.error.issues);
  return serializeCollection(result.data);
}

/** Re-validates the whole file first (ValidationError, no request), then commits it. */
export async function saveCollection<K extends CollectionName>(
  client: GitHubClient,
  name: K,
  data: CollectionData<K>,
  sha: string,
  message: string,
): Promise<{ sha: string; commitSha: string }> {
  const content = serializeValid(name, data);
  return client.putFile({ path: COLLECTIONS[name].path, content, sha, message });
}

/**
 * Validates first. No extra files -> saveCollection (Contents API). Otherwise one commitFiles commit with
 * [json, ...extraFiles], guarded by the loaded SHA of the collection file. Returns the new JSON blob SHA.
 */
export async function saveCollectionWithFiles<K extends CollectionName>(
  client: GitHubClient,
  name: K,
  data: CollectionData<K>,
  sha: string,
  message: string,
  extraFiles: FileChange[],
): Promise<{ sha: string; commitSha: string }> {
  const content = serializeValid(name, data);
  const { path } = COLLECTIONS[name];
  if (extraFiles.length === 0) return client.putFile({ path, content, sha, message });
  const { commitSha, blobShas } = await client.commitFiles({
    files: [{ path, content, encoding: 'utf-8' }, ...extraFiles],
    message,
    expectedShas: { [path]: sha },
  });
  return { sha: blobShas[path] ?? '', commitSha };
}

export type CommitAction = 'add' | 'update' | 'delete' | 'reorder';
export type Attachment = 'image' | 'cv' | '-cv';
const ATTACHMENT_ORDER: readonly Attachment[] = ['image', 'cv', '-cv'];
// GitHub skips workflows when a commit message contains one of these markers (review R1).
const CI_SKIP_RE = /\[(skip ci|ci skip|no ci|skip actions|actions skip)\]/gi;

/** Breaks CI-skip markers so a label can never stop the deploy: '[skip ci]' -> '(skip ci)'. */
function neutralizeCiSkip(label: string): string {
  return label.replace(CI_SKIP_RE, (_m, inner: string) => `(${inner})`);
}

/** `content(<name>): <action><subject><suffix>`; see prd2 "Admin library signatures". */
export function commitMessage(name: CollectionName, action: CommitAction, label?: string, attachments: Attachment[] = []): string {
  const subject = label !== undefined ? ` "${neutralizeCiSkip(label)}"` : name === 'profile' ? ' profile' : '';
  const present = ATTACHMENT_ORDER.filter((a) => attachments.includes(a));
  const suffix = present.length ? ` (${present.map((a) => (a === '-cv' ? '-cv' : `+${a}`)).join(', ')})` : '';
  return `content(${name}): ${action}${subject}${suffix}`;
}

/** Swaps with the nearest neighbour in `dir` satisfying sameGroup (default: any). Always returns a new array. */
export function moveEntry<T extends { id: string }>(
  list: T[],
  id: string,
  dir: 'up' | 'down',
  sameGroup: (a: T, b: T) => boolean = () => true,
): T[] {
  const out = [...list];
  const from = out.findIndex((x) => x.id === id);
  if (from === -1) return out;
  const step = dir === 'up' ? -1 : 1;
  for (let to = from + step; to >= 0 && to < out.length; to += step) {
    if (sameGroup(out[from]!, out[to]!)) {
      [out[from], out[to]] = [out[to]!, out[from]!];
      break;
    }
  }
  return out;
}

/** New skill goes first within its category (before the first same-category skill), else last. */
export function insertSkill(list: Skill[], skill: Skill): Skill[] {
  if (list.some((x) => x.id === skill.id)) throw duplicateId(skill.id);
  const at = list.findIndex((x) => x.category === skill.category);
  return at === -1 ? [...list, skill] : [...list.slice(0, at), skill, ...list.slice(at)];
}

function duplicateId(id: string): ValidationError {
  return new ValidationError(`Id "${id}" already exists`, [{ code: 'custom', path: ['id'], message: `Id "${id}" already exists`, input: id }]);
}

export function addEntry<T extends { id: string }>(list: T[], entry: T): T[] {
  if (list.some((x) => x.id === entry.id)) throw duplicateId(entry.id);
  return [entry, ...list];
}

export function updateEntry<T extends { id: string }>(list: T[], id: string, entry: T): T[] {
  if (entry.id !== id) {
    throw new ValidationError('The id cannot change', [{ code: 'custom', path: ['id'], message: 'The id cannot change', input: entry.id }]);
  }
  const index = list.findIndex((x) => x.id === id);
  if (index === -1) throw new NotFoundError(`No entry with id "${id}"`);
  return list.map((x, i) => (i === index ? entry : x));
}

export function removeEntry<T extends { id: string }>(list: T[], id: string): T[] {
  if (!list.some((x) => x.id === id)) throw new NotFoundError(`No entry with id "${id}"`);
  return list.filter((x) => x.id !== id);
}
