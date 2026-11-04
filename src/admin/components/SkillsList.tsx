import type { Skill } from '../../content/schema';
import { SKILL_GROUPS } from '../../lib/skills';
import { CollectionList, type ListHandlers, type ListState } from './CollectionList';

const GROUPS = SKILL_GROUPS.map(({ category, label }) => ({ key: category, title: label }));

/** Grouped by category (public order); moves stay within the category (prd2 Feature 2.5). */
export function SkillsList({ state, ...handlers }: ListHandlers<Skill> & { state: ListState<Skill> }) {
  return (
    <CollectionList
      state={state}
      section="skills"
      label={(s) => s.name}
      groups={GROUPS}
      groupOf={(s) => s.category}
      renderItem={(s) => (
        <>
          <span className="font-semibold">{s.name}</span>
          <span className="text-sm text-muted">
            <code>{s.id}</code>
            {s.years !== undefined && ` · ${s.years} yrs`}
          </span>
        </>
      )}
      {...handlers}
    />
  );
}
