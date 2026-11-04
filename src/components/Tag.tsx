export function Tag({ label }: { label: string }) {
  return <li className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">{label}</li>;
}

export function TagList({ tags, label = 'Tags' }: { tags: readonly string[]; label?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {tags.map((t) => (
        <Tag key={t} label={t} />
      ))}
    </ul>
  );
}
