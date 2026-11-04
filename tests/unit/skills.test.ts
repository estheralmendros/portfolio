import { describe, expect, it } from 'vitest';
import { SkillCategorySchema } from '../../src/content/schema';
import { SKILL_GROUPS } from '../../src/lib/skills';

describe('SKILL_GROUPS', () => {
  it('lists every category once, in schema (public display) order, with its label', () => {
    expect(SKILL_GROUPS.map((g) => g.category)).toEqual(SkillCategorySchema.options);
    expect(SKILL_GROUPS.map((g) => g.label)).toEqual(['Languages', 'Data, IoT & AI', 'DevOps & Cloud', 'Dev tools']);
  });
});
