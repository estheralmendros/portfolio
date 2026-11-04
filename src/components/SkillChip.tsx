import type { Skill } from '../content/schema';
import { initials } from '../lib/initials';

export function SkillChip({ skill, icon }: { skill: Skill; icon: { path: string; title: string } | null | undefined }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      {icon ? (
        <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="shrink-0">
          <path d={icon.path} fill="currentColor" />
        </svg>
      ) : (
        <span aria-hidden="true" className="flex h-[18px] min-w-[18px] items-center justify-center rounded bg-fg px-0.5 text-[10px] font-bold text-bg">
          {initials(skill.name)}
        </span>
      )}
      <span className="font-medium">{skill.name}</span>
      {skill.years !== undefined && <span className="text-muted">{skill.years} {skill.years === 1 ? 'yr' : 'yrs'}</span>}
    </li>
  );
}
