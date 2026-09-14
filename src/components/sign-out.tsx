'use client';

import { useState } from 'react';

/**
 * Signing out is the one irreversible thing on this page.
 *
 * The session cookie is the only thing holding an account together in this
 * browser. Getting back in needs an emailed code, which needs an email on the
 * account and a mail service that is sending - and when either is missing,
 * "Sign out" is a button that deletes a paying customer's access with no
 * warning and no way back. That is not a theoretical risk: it is the exact
 * position somebody is in the first time they try it.
 *
 * So the button asks, but only when there is genuinely something to lose.
 * A confirmation nobody needs is a confirmation nobody reads.
 */
export function SignOutButton({ warning }: { warning?: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  }

  if (!warning) {
    return (
      <button type="button" className="btn-quiet" onClick={signOut}>
        Sign out
      </button>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="btn-quiet" onClick={() => setConfirming(true)}>
        Sign out
      </button>
    );
  }

  return (
    <div className="card stack" style={{ gap: 10, maxWidth: 360 }}>
      <span className="pill pill-warn">Read this first</span>
      <p className="small">{warning}</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
          Stay signed in
        </button>
        <button type="button" className="btn-quiet" disabled={busy} onClick={signOut}>
          {busy ? 'Signing out…' : 'Sign out anyway'}
        </button>
      </div>
    </div>
  );
}
