import { z } from 'zod';
import { UPLOAD_PATH_RE } from '../lib/uploads';

export const SlugSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');
export const HttpsUrlSchema = z.url({ protocol: /^https$/, error: 'Must start with https://' });
/**
 * https URL, a root-relative path into public/ (`//host` is rejected: review suggestion 2),
 * or an uploaded image under src/assets/uploads (v2; never .svg).
 */
export const ImageRefSchema = z.union(
  [
    HttpsUrlSchema,
    z.string().regex(/^\/(?!\/)\S*$/, 'Use https:// URL or /path'),
    z.string().regex(UPLOAD_PATH_RE, 'Use https:// URL or /path'),
  ],
  { error: 'Use https:// URL or /path' },
);
/** Same as prd2's CvUrlSchema, adopted now so v2 needs no content migration. */
export const CvUrlSchema = z.union(
  [HttpsUrlSchema, z.string().regex(/^\/(?!\/)[^\s?#]+\.pdf(\?v=[0-9a-f]{6})?$/, 'Use an https:// URL or a /path to a PDF')],
  { error: 'Use an https:// URL or a /path to a PDF' },
);
const TagsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(12)
  .refine((t) => new Set(t.map((x) => x.toLowerCase())).size === t.length, 'Tags must be unique');
export const AvailabilitySchema = z.enum(['open', 'not-looking', 'freelance']);
export const SkillCategorySchema = z.enum(['languages', 'data', 'devops', 'tools']);

export const ProfileSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  bio: z.string().trim().min(1).max(1000),
  photo: ImageRefSchema.optional(),
  location: z.string().trim().min(1).max(80),
  availability: AvailabilitySchema,
  /** Shown as "<role> @ <company>" instead of "Not looking" when availability is not-looking. */
  currentJob: z.strictObject({ role: z.string().trim().min(1).max(100), company: z.string().trim().min(1).max(80) }).optional(),
  socials: z.strictObject({ email: z.email(), linkedin: HttpsUrlSchema, github: HttpsUrlSchema }),
  cvUrl: CvUrlSchema.optional(),
});

const isObject = (payload: { value: unknown }) => typeof payload.value === 'object' && payload.value !== null;
const isYearMonth = (v: unknown): v is string => YearMonthSchema.safeParse(v).success;
/** `a` is on or after `b`; true (nothing to report here) while either date is itself invalid. */
const notBefore = (a: unknown, b: unknown) => !isYearMonth(a) || !isYearMonth(b) || a >= b;

export const ProjectSchema = z
  .strictObject({
    id: SlugSchema,
    title: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(200),
    description: z.string().max(20000).default(''),
    tags: TagsSchema,
    image: ImageRefSchema.optional(),
    imageAlt: z.string().trim().min(1).max(150).optional(),
    repoUrl: HttpsUrlSchema.optional(),
    demoUrl: HttpsUrlSchema.optional(),
    docUrl: HttpsUrlSchema.optional(),
    featured: z.boolean().default(false),
    date: YearMonthSchema,
  })
  // `when` lets this run alongside field errors, so the form shows every error at once (review suggestion 10).
  .refine((p) => !p.image || !!p.imageAlt, { path: ['imageAlt'], message: 'Required when an image is set', when: isObject });

export const SkillSchema = z.strictObject({
  id: SlugSchema,
  name: z.string().trim().min(1).max(40),
  category: SkillCategorySchema,
  years: z
    .int({ error: 'Use a whole number of years' })
    .min(0, 'Must be between 0 and 50')
    .max(50, 'Must be between 0 and 50')
    .optional(),
  icon: z
    .string()
    // A Simple Icons slug, or `mdi:<kebab-name>` for Material Design Icons (generic shapes Simple Icons lacks).
    .regex(/^(?:[a-z0-9]+|mdi:[a-z0-9]+(?:-[a-z0-9]+)*)$/, 'Use a Simple Icons slug (e.g. typescript) or mdi:<name> (e.g. mdi:database)')
    .optional(),
});

export const CertificationSchema = z
  .strictObject({
    id: SlugSchema,
    name: z.string().trim().min(1).max(120),
    issuer: z.string().trim().min(1).max(80),
    issued: YearMonthSchema,
    expires: YearMonthSchema.optional(),
    credentialId: z.string().trim().min(1).max(100).optional(),
    credentialUrl: HttpsUrlSchema.optional(),
    badge: ImageRefSchema.optional(),
  })
  // `when`: runs alongside field errors (one pass), like ProjectSchema; the guards cover the raw input.
  .refine((c) => c.expires === undefined || notBefore(c.expires, c.issued), {
    path: ['expires'],
    message: 'Must be on or after the issue date',
    when: isObject,
  });

export const ExperienceSchema = z
  .strictObject({
    id: SlugSchema,
    type: z.enum(['work', 'education']),
    role: z.string().trim().min(1).max(100),
    org: z.string().trim().min(1).max(100),
    start: YearMonthSchema,
    end: YearMonthSchema.nullable(),
    location: z.string().trim().min(1).max(80).optional(),
    highlights: z.array(z.string().trim().min(1).max(200)).max(8),
    tags: TagsSchema,
  })
  .refine((e) => e.end === null || notBefore(e.end, e.start), {
    path: ['end'],
    message: 'Must be on or after the start date',
    when: isObject,
  });

const uniqueBy =
  <T>(key: (x: T) => string, label: string, field: 'id' | 'name') =>
  (list: T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    list.forEach((item, i) => {
      const k = key(item);
      if (seen.has(k)) {
        const value = String((item as Record<string, unknown>)[field]);
        ctx.addIssue({ code: 'custom', path: [i, field], message: `${label} "${value}" is duplicated` });
      }
      seen.add(k);
    });
  };

export const ProjectsFileSchema = z.array(ProjectSchema).superRefine(uniqueBy((p) => p.id, 'Slug', 'id'));
export const SkillsFileSchema = z
  .array(SkillSchema)
  .superRefine(uniqueBy((s) => s.name.toLowerCase(), 'Skill', 'name'))
  .superRefine(uniqueBy((s) => s.id, 'Id', 'id'));
export const CertificationsFileSchema = z.array(CertificationSchema).superRefine(uniqueBy((c) => c.id, 'Id', 'id'));
export const ExperienceFileSchema = z.array(ExperienceSchema).superRefine(uniqueBy((e) => e.id, 'Id', 'id'));

export type Profile = z.infer<typeof ProfileSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export interface SiteContent {
  profile: Profile;
  projects: Project[];
  skills: Skill[];
  certifications: Certification[];
  experience: Experience[];
}
