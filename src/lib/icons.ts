// Build-only: imports the full simple-icons and Material Design Icons sets. Never import from admin code.
import * as simpleIcons from 'simple-icons';
import * as mdiIcons from '@mdi/js';

interface SimpleIcon {
  slug: string;
  title: string;
  path: string;
}

const MDI_PREFIX = 'mdi:';

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

/** `mdi:language-csharp` -> the `mdiLanguageCsharp` export of @mdi/js, titled "Language Csharp". */
function mdiIcon(name: string): { path: string; title: string } | null {
  const words = name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const path = (mdiIcons as Record<string, unknown>)[`mdi${words.join('')}`];
  return typeof path === 'string' ? { path, title: words.join(' ') } : null;
}

export function getSkillIcon(slug: string | undefined): { path: string; title: string } | null {
  if (!slug) return null;
  if (slug.startsWith(MDI_PREFIX)) {
    const icon = mdiIcon(slug.slice(MDI_PREFIX.length));
    if (!icon) console.warn(`[icons] Unknown Material Design Icon "${slug}"; falling back to initials.`);
    return icon;
  }
  const icon = iconMap().get(slug);
  if (!icon) {
    console.warn(`[icons] Unknown Simple Icons slug "${slug}"; falling back to initials.`);
    return null;
  }
  return { path: icon.path, title: icon.title };
}
