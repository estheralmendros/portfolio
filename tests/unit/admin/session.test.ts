import { describe, expect, it } from 'vitest';
import { TOKEN_KEY, clearToken, getToken, setToken } from '../../../src/admin/lib/session';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

describe('session', () => {
  it('uses the namespaced key', () => expect(TOKEN_KEY).toBe('portfolio.admin.token'));
  it('stores, reads and clears the token', () => {
    const s = new FakeStorage();
    expect(getToken(s)).toBeNull();
    setToken('github_pat_x', s);
    expect(s.getItem('portfolio.admin.token')).toBe('github_pat_x');
    expect(getToken(s)).toBe('github_pat_x');
    clearToken(s);
    expect(getToken(s)).toBeNull();
  });
  it('survives a throwing storage', () => {
    const s = new FakeStorage();
    s.getItem = () => { throw new Error('blocked'); };
    s.setItem = () => { throw new Error('blocked'); };
    expect(getToken(s)).toBeNull();
    expect(() => setToken('x', s)).not.toThrow();
    expect(() => clearToken(s)).not.toThrow();
  });
});
