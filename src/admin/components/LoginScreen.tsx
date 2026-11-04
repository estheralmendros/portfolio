import { useState, type SubmitEvent } from 'react';
import { SITE } from '../../config/site';
import { ACTIONS_PERMISSION } from '../messages';

export function LoginScreen({ onSubmit, busy, message }: { onSubmit: (token: string) => void; busy: boolean; message: string | null }) {
  const [token, setToken] = useState('');
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!busy) onSubmit(token);
  };
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Log in</h1>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label htmlFor="token" className="font-medium">
          GitHub fine-grained token
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="field-input"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-describedby={message ? 'login-error' : undefined}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={busy}>
            {busy ? 'Checking…' : 'Log in'}
          </button>
        </div>
        {message && (
          <p id="login-error" role="alert" className="rounded border-2 border-danger px-3 py-2 font-medium text-danger">
            <span aria-hidden="true">⚠ </span>
            {message}
          </p>
        )}
      </form>
      <section aria-labelledby="howto" className="flex flex-col gap-2 text-sm">
        <h2 id="howto" className="font-semibold">
          How to create a token:
        </h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>GitHub › Settings › Developer settings › Fine-grained tokens › Generate new token</li>
          <li>
            Repository access: only {SITE.owner}/{SITE.repo}
          </li>
          <li>Permissions: Contents → Read and write</li>
          <li>{ACTIONS_PERMISSION}</li>
          <li>Expiration: e.g. 90 days</li>
        </ol>
        <p className="text-muted">The token is kept only in this tab (sessionStorage).</p>
      </section>
    </main>
  );
}
