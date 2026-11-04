import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unmount first (cleanup may still call stubbed globals such as URL.revokeObjectURL), then restore every vi.stubGlobal.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
