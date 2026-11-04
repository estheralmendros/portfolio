/** 'GitHub Actions' -> 'GA', 'TypeScript' -> 'TS', 'Docker' -> 'Do'. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const word = words[0]!;
  const capitals = word.match(/[A-Z]/g);
  if (capitals && capitals.length >= 2) return capitals.slice(0, 2).join('');
  return word[0]!.toUpperCase() + word.slice(1, 2).toLowerCase();
}
