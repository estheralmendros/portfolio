import type { Skill, SkillCategory } from '../content/schema';
import { SkillChip } from './SkillChip';

const GROUPS: { category: SkillCategory; label: string }[] = [
  { category: 'languages', label: 'Languages' },
  { category: 'frameworks', label: 'Frameworks' },
  { category: 'cloud', label: 'Cloud' },
  { category: 'tools', label: 'Tools' },
];

export function SkillsSection({ skills, icons }: { skills: Skill[]; icons: Record<string, { path: string; title: string } | null> }) {
  if (skills.length === 0) return null;
  return (
    <section id="stack" aria-labelledby="stack-heading" className="site-section scroll-mt-24">
      <h2 id="stack-heading" className="section-title">
        Stack
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {GROUPS.map(({ category, label }) => {
          const group = skills.filter((s) => s.category === category);
          if (group.length === 0) return null;
          return (
            <div key={category} className="glass lift p-6">
              <h3 className="group-title mb-4">{label}</h3>
              <ul className="flex flex-wrap gap-2">
                {group.map((s) => (
                  <SkillChip key={s.id} skill={s} icon={icons[s.id]} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
