// Skill categories in public display order, with their labels: shared by the public Stack section and the admin list/form.
import { SkillCategorySchema, type SkillCategory } from '../content/schema';

export const SKILL_CATEGORY_LABELS = { languages: 'Languages', data: 'Data, IoT & AI', devops: 'DevOps & Cloud', tools: 'Dev tools' } as const satisfies Record<SkillCategory, string>;

export const SKILL_GROUPS: readonly { category: SkillCategory; label: string }[] = SkillCategorySchema.options.map((category) => ({
  category,
  label: SKILL_CATEGORY_LABELS[category],
}));
