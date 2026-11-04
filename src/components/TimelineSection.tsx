import type { Experience } from '../content/schema';
import { TimelineItem } from './TimelineItem';

export function TimelineSection({ experience }: { experience: Experience[] }) {
  if (experience.length === 0) return null;
  return (
    <section id="journey" aria-labelledby="journey-heading" className="scroll-mt-20 py-12">
      <h2 id="journey-heading" className="section-title">
        Journey
      </h2>
      <ol className="mt-8 ml-4">
        {experience.map((e) => (
          <TimelineItem key={e.id} entry={e} />
        ))}
      </ol>
    </section>
  );
}
