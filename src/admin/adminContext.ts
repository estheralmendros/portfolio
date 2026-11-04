import { createContext, useContext } from 'react';

/**
 * commitSha of the most recent successful save in this tab (prd2 Feature 5.4). The preview uses it
 * as `resolvePreviewImage(ref, { commitRef })`; undefined until the first save (then `main` is used).
 */
export const LastCommitContext = createContext<string | undefined>(undefined);
export const useLastCommitSha = (): string | undefined => useContext(LastCommitContext);
