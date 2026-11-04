export function Tag({ label }: { label: string }) {
  return <li className="tag">{label}</li>;
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
