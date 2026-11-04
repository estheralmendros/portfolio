export type Theme = 'light' | 'dark';
export const THEME_KEY = 'portfolio.theme';

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function labelFor(theme: Theme): string {
  return theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}

function readStored(win: Window): string | null {
  try {
    return win.localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function writeStored(win: Window, theme: Theme): void {
  try {
    win.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
}

/** Wires every [data-theme-toggle] button and follows OS changes while no preference is stored. */
export function initThemeToggle(doc: Document, win: Window): void {
  const root = doc.documentElement;
  const mql = win.matchMedia('(prefers-color-scheme: dark)');
  let chosen = false;
  let theme = resolveTheme(readStored(win), mql.matches);

  const apply = (next: Theme) => {
    theme = next;
    root.setAttribute('data-theme', next);
    doc.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((btn) => btn.setAttribute('aria-label', labelFor(next)));
  };
  apply(theme);

  doc.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((btn) =>
    btn.addEventListener('click', () => {
      chosen = true;
      const next: Theme = theme === 'dark' ? 'light' : 'dark';
      writeStored(win, next);
      apply(next);
    }),
  );

  mql.addEventListener('change', (e: { matches: boolean }) => {
    const stored = readStored(win);
    if (chosen || stored === 'light' || stored === 'dark') return;
    apply(e.matches ? 'dark' : 'light');
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.querySelector('[data-theme-toggle]') && !import.meta.env?.VITEST) {
  initThemeToggle(document, window);
}
