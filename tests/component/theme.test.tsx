import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initThemeToggle, labelFor, resolveTheme, THEME_KEY } from '../../src/scripts/themeToggle';

const themeInit = readFileSync(path.resolve(process.cwd(), 'public/theme-init.js'), 'utf8');

type Listener = (e: { matches: boolean }) => void;
function mockMatchMedia(dark: boolean) {
  const listeners: Listener[] = [];
  const mql = {
    matches: dark,
    addEventListener: (_: string, l: Listener) => listeners.push(l),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
  return {
    change(next: boolean) {
      mql.matches = next;
      listeners.forEach((l) => l({ matches: next }));
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '<button type="button" data-theme-toggle aria-label="Switch to dark theme"></button>';
});
afterEach(() => vi.restoreAllMocks());

describe('resolveTheme / labelFor', () => {
  it('prefers a valid stored value, else the OS', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('purple', true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });
  it('labels the action', () => {
    expect(labelFor('light')).toBe('Switch to dark theme');
    expect(labelFor('dark')).toBe('Switch to light theme');
  });
  it('uses the namespaced key', () => expect(THEME_KEY).toBe('portfolio.theme'));
});

describe('public/theme-init.js', () => {
  it('follows the OS when nothing is stored', () => {
    mockMatchMedia(true);
    new Function(themeInit)();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('uses the stored preference', () => {
    mockMatchMedia(true);
    localStorage.setItem('portfolio.theme', 'light');
    new Function(themeInit)();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('survives a throwing localStorage', () => {
    mockMatchMedia(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    new Function(themeInit)();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('initThemeToggle', () => {
  it('sets the label, flips the theme and persists it', () => {
    mockMatchMedia(false);
    initThemeToggle(document, window);
    const btn = document.querySelector('button')!;
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(btn.getAttribute('aria-label')).toBe('Switch to dark theme');
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    btn.click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('portfolio.theme')).toBe('dark');
    expect(btn.getAttribute('aria-label')).toBe('Switch to light theme');
  });
  it('follows live OS changes only without a stored preference', () => {
    const mm = mockMatchMedia(false);
    initThemeToggle(document, window);
    mm.change(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    document.querySelector('button')!.click(); // stores light
    mm.change(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('keeps working for the page lifetime when storage throws', () => {
    mockMatchMedia(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    initThemeToggle(document, window);
    const btn = document.querySelector('button')!;
    btn.click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    btn.click();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
