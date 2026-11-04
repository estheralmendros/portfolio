// Presentational chip group for the public project filter (SSR only, no hooks).
// Rendered `hidden`; src/scripts/projectFilter.ts reveals and wires it, so without JS all projects stay visible.

const chip =
  'rounded-full border border-line px-3 py-1 text-sm font-medium text-muted hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent';

export function ProjectFilter({ tags }: { tags: string[] }) {
  if (tags.length < 2) return null;
  return (
    <div role="group" aria-label="Filter projects by technology" hidden data-project-filter className="mt-6 flex flex-wrap gap-2">
      <button type="button" aria-pressed="true" data-tag="" className={chip}>
        All
      </button>
      {tags.map((t) => (
        <button key={t.toLowerCase()} type="button" aria-pressed="false" data-tag={t.toLowerCase()} className={chip}>
          {t}
        </button>
      ))}
    </div>
  );
}
