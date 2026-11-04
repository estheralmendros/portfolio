// DOM wiring of the public project filter (src/scripts/projectFilter.ts) over the real ProjectsSection markup.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from './fixtures';
import { ProjectsSection } from '../../src/components/ProjectsSection';
import { initProjectFilter } from '../../src/scripts/projectFilter';

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const chip = (tag: string) => q<HTMLButtonElement>(`[data-project-filter] button[data-tag="${tag}"]`);
const visibleTitles = () =>
  [...document.querySelectorAll<HTMLElement>('[data-project-card]')].filter((c) => !c.hidden).map((c) => c.querySelector('h4')!.textContent);
const status = () => q('[data-project-filter-status]').textContent;
const group = (g: string) => q(`[data-project-group="${g}"]`);

beforeEach(() => {
  document.body.innerHTML = `<main>${renderToStaticMarkup(<ProjectsSection projects={fixture.projects} images={{}} />)}</main>`;
});

describe('initProjectFilter', () => {
  it('reveals the chip group', () => {
    expect(q('[data-project-filter]').hidden).toBe(true);
    initProjectFilter(document);
    expect(q('[data-project-filter]').hidden).toBe(false);
    expect(status()).toBe('');
  });

  it('filters case-insensitively, updates aria-pressed and the live region', () => {
    initProjectFilter(document);
    chip('astro').click();
    expect(visibleTitles()).toEqual(['Fixture Alpha']);
    expect(chip('astro').getAttribute('aria-pressed')).toBe('true');
    expect(chip('').getAttribute('aria-pressed')).toBe('false');
    expect(chip('react').getAttribute('aria-pressed')).toBe('false');
    expect(status()).toBe('Showing 1 of 3 projects');
  });

  it('hides a group whose cards are all hidden, and shows it again', () => {
    initProjectFilter(document);
    chip('react').click();
    expect(group('more').hidden).toBe(true);
    expect(group('featured').hidden).toBe(false);
    chip('').click();
    expect(group('more').hidden).toBe(false);
    expect(visibleTitles()).toHaveLength(3);
    expect(status()).toBe('Showing 3 of 3 projects');
    expect(chip('').getAttribute('aria-pressed')).toBe('true');
  });

  it('a tag containing | filters correctly', () => {
    initProjectFilter(document);
    chip('c|d').click();
    expect(visibleTitles()).toEqual(['Fixture Admin Dashboard']);
  });

  it('clicking the active chip resets to All', () => {
    initProjectFilter(document);
    chip('testing').click();
    chip('testing').click();
    expect(visibleTitles()).toHaveLength(3);
    expect(chip('').getAttribute('aria-pressed')).toBe('true');
    expect(chip('testing').getAttribute('aria-pressed')).toBe('false');
  });

  it('a card whose data-tags fails to parse stays visible under every filter', () => {
    const gamma = [...document.querySelectorAll('[data-project-card]')].find((c) => c.textContent!.includes('Fixture Gamma'))!;
    gamma.setAttribute('data-tags', 'react|astro');
    initProjectFilter(document);
    for (const tag of ['astro', 'react', 'c|d', 'testing']) {
      chip(tag).click();
      expect(visibleTitles()).toContain('Fixture Gamma');
      expect(group('more').hidden).toBe(false);
    }
    gamma.removeAttribute('data-tags');
    chip('astro').click();
    chip('react').click();
    expect(visibleTitles()).toContain('Fixture Gamma');
  });

  it('does nothing without a filter group', () => {
    document.body.innerHTML = '<p>No projects</p>';
    expect(() => initProjectFilter(document)).not.toThrow();
  });
});
