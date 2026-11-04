// Pure: no module-level side effects, imports only ./schema (never @content or load.ts).
import {
  CertificationsFileSchema,
  ExperienceFileSchema,
  ProfileSchema,
  ProjectsFileSchema,
  SkillsFileSchema,
  type SiteContent,
} from './schema';

export interface ContentIssue {
  file: string;
  path: string;
  message: string;
}

export class ContentValidationError extends Error {
  issues: ContentIssue[];
  constructor(issues: ContentIssue[]) {
    super(`Invalid content:\n${issues.map((i) => `  ${i.file} › ${i.path}: ${i.message}`).join('\n')}`);
    this.name = 'ContentValidationError';
    this.issues = issues;
  }
}

/** `[1].date`, `socials.email`, `(root)` for the file itself. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '(root)';
  return path
    .map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : `${i === 0 ? '' : '.'}${String(seg)}`))
    .join('');
}

const FILES = {
  profile: ProfileSchema,
  projects: ProjectsFileSchema,
  skills: SkillsFileSchema,
  certifications: CertificationsFileSchema,
  experience: ExperienceFileSchema,
} as const;

export function parseContent(raw: Record<keyof SiteContent, unknown>): SiteContent {
  const issues: ContentIssue[] = [];
  const out: Partial<Record<keyof SiteContent, unknown>> = {};
  for (const name of Object.keys(FILES) as (keyof SiteContent)[]) {
    const result = FILES[name].safeParse(raw[name]);
    if (result.success) {
      out[name] = result.data;
    } else {
      for (const issue of result.error.issues) {
        issues.push({ file: `content/${name}.json`, path: formatIssuePath(issue.path), message: issue.message });
      }
    }
  }
  if (issues.length > 0) throw new ContentValidationError(issues);
  return out as SiteContent;
}
