'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isDefaultProfile, type SellerProfile } from '@/lib/listing/profile';

/**
 * The one setting worth interrupting for, offered where it is obvious.
 *
 * The house style is the whole argument for paying monthly rather than
 * pasting a photo into a chat window, and it lived on /account, which a
 * seller has no reason to open. So the feature that keeps the subscription
 * was invisible to the people it keeps.
 *
 * It appears once, under a finished listing, when the listing is finished -
 * the moment the value is legible, because the seller has the text in front
 * of them and can see exactly where their own line would go. One field, not
 * the whole form: the postage line is the one everybody has and retypes on
 * every single item. The rest is a link.
 *
 * Asked once. Saved, dismissed, or already set, and it never appears again.
 */

const SEEN_KEY = 'pricebird.postage-asked';

/** localStorage throws in a private window and on a blocked origin. A
 *  convenience that can break the page is not a convenience. */
function remember(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* the nudge shows again next time; nothing else is affected */
  }
}

function alreadyAsked(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function PostageNudge({ profile, onSaved }: {
  profile: SellerProfile;
  onSaved: (next: SellerProfile) => void;
}) {
  const [line, setLine] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'gone'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [asked] = useState(alreadyAsked);

  // The saved case is checked FIRST, because saving is exactly what makes the
  // profile stop being the default - so the guard below would have hidden the
  // confirmation the moment it became true, and the card would simply vanish
  // with no sign that anything had been kept.
  if (state === 'saved') {
    return (
      <div className="note small">
        Saved. Every listing from now on ends with that line — single, bulk and the CSV.{' '}
        <Link href="/account" className="accent">Set the rest of your house style</Link>.
      </div>
    );
  }

  // Nothing to offer somebody who has already set a house style.
  if (asked || state === 'gone' || !isDefaultProfile(profile)) return null;

  async function save() {
    const postage_line = line.trim();
    if (!postage_line) return;

    setState('saving');
    setError(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...profile, postage_line }),
      });
      // Status before body: an error page is not JSON, and parsing it first
      // turns a clear failure into "unexpected token <".
      if (!response.ok) {
        const message = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(message?.error ?? `That could not be saved (${response.status}).`);
      }
      const saved = await response.json() as { profile: SellerProfile };
      remember();
      onSaved(saved.profile);
      setState('saved');
    } catch (problem) {
      setState('idle');
      setError(problem instanceof Error ? problem.message : 'That could not be saved.');
    }
  }

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="spread" style={{ alignItems: 'start', gap: 10 }}>
        <strong style={{ fontSize: 15 }}>Add your postage line to every listing?</strong>
        <button
          type="button"
          className="btn-quiet"
          aria-label="Not now"
          onClick={() => { remember(); setState('gone'); }}
        >
          Not now
        </button>
      </div>
      <p className="small dim" style={{ marginTop: -4 }}>
        Written once, added word for word to the end of every description you make after this —
        never reworded, and never cut off by a character limit.
      </p>
      <input
        type="text"
        maxLength={200}
        placeholder="Posted within 2 working days, tracked."
        value={line}
        onChange={(event) => setLine(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void save(); }}
      />
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={state === 'saving' || line.trim().length === 0}
          onClick={save}
        >
          {state === 'saving' ? 'Saving…' : 'Use this every time'}
        </button>
        <Link href="/account" className="small accent">Or set the whole house style</Link>
      </div>
    </div>
  );
}
