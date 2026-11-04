import { describe, expect, it } from 'vitest';
import { hasDetailPage } from '../../src/lib/projects';

describe('hasDetailPage', () => {
  it('true for a non-empty description', () => expect(hasDetailPage({ description: '## Why' })).toBe(true));
  it.each(['', '   ', '\n\t'])('false for blank description %j', (description) => expect(hasDetailPage({ description })).toBe(false));
});
