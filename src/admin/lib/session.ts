// The token lives only in sessionStorage (never localStorage, cookies or the URL).
export const TOKEN_KEY = 'portfolio.admin.token';

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function getToken(storage: Storage | undefined = defaultStorage()): string | null {
  try {
    return storage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setToken(token: string, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable: token lives in memory only for this page */
  }
}

export function clearToken(storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
