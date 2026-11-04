import { expect, it } from 'vitest';
import { visibleSections } from '../../src/lib/sections';

const lists = { projects: [1], skills: [1], certifications: [1], experience: [1] };

it('lists every section in order when all have content', () =>
  expect(visibleSections(lists).map((s) => s.id)).toEqual(['about', 'projects', 'stack', 'certifications', 'journey', 'contact']));

it('omits sections whose list is empty', () =>
  expect(visibleSections({ ...lists, projects: [], certifications: [] }).map((s) => s.label)).toEqual(['About', 'Stack', 'Journey', 'Contact']));
