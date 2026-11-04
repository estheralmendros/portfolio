// Build-only: imports the full simple-icons set. Never import from admin code.
import * as simpleIcons from 'simple-icons';

interface SimpleIcon {
  slug: string;
  title: string;
  path: string;
}

let bySlug: Map<string, SimpleIcon> | undefined;

function iconMap(): Map<string, SimpleIcon> {
  if (!bySlug) {
    bySlug = new Map();
    for (const value of Object.values(simpleIcons) as unknown[]) {
      const icon = value as Partial<SimpleIcon> | null;
      if (icon && typeof icon.slug === 'string' && typeof icon.path === 'string' && typeof icon.title === 'string') {
        bySlug.set(icon.slug, icon as SimpleIcon);
      }
    }
  }
  return bySlug;
}

export function getSkillIcon(slug: string | undefined): { path: string; title: string } | null {
  if (!slug) return null;
  const icon = iconMap().get(slug);
  if (!icon) {
    console.warn(`[icons] Unknown Simple Icons slug "${slug}"; falling back to initials.`);
    return null;
  }
  return { path: icon.path, title: icon.title };
}
