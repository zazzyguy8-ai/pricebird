'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PLATFORM_SPECS, PLATFORMS, type Platform } from '@/lib/listing/platforms';
import { DEFAULT_PROFILE, type SellerProfile } from '@/lib/listing/profile';
import type { Listing } from '@/lib/listing/schema';
import type { Quota } from '@/lib/quota';
import { CURRENCIES, Pending, QuotaBar, Result, useRevealOnChange } from '@/components/studio';

/**
 * The listings you already have, and why they are sitting there.
 *
 * Writing a listing is a problem you have once per item. Having four hundred
 * live listings that nobody is buying is a problem you have every day, and it
 * is the one worth paying to fix - the seller already did the photographing,
 * the sourcing and the posting, and the money is stuck behind a title that
 * wastes sixty of its eighty characters.
 *
 * No photo is required, deliberately. A seller with a backlog has the words
 * to hand long before they have the item back out of the box.
 */
/**
 * The same honesty rule as the listing wait, with a different job described.
 *
 * Here the model is reading the seller's own words rather than a photo, and
 * the first thing it does is decide what is wrong with them - so that is what
 * the lines say. None of them claims a step is finished, because there is no
 * progress to report.
 */
const RELIST_STAGES: [number, string][] = [
  [0, 'Reading what you wrote.'],
  [3, 'Counting what the title is not using.'],
  [7, 'Looking for the facts a buyer needs and cannot find.'],
  [12, 'Working out which fault costs you the most.'],
  [17, 'Rewriting it, for each marketplace.'],
  [23, 'Pricing it for what you described, not for what you asked.'],
  [32, 'Longer than usual, but still going.'],
];

export function Relist({ quota: initialQuota, signedIn }: { quota: Quota; signedIn: boolean }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['ebay']);
  const [currency, setCurrency] = useState('USD');
  const [active, setActive] = useState<Platform>('ebay');
  const [profile, setProfile] = useState<SellerProfile>(DEFAULT_PROFILE);
  const [listing, setListing] = useState<Listing | null>(null);
  const [quota, setQuota] = useState(initialQuota);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  // Same reason as the listing page: on a phone the answer is below the fold.
  const output = useRevealOnChange(busy || Boolean(listing));

  const ready = title.trim().length >= 3 && description.trim().length >= 20;

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => {
      const next = current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform];
      return next.length === 0 ? current : next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setNeedsUpgrade(false);

    try {
      const response = await fetch('/api/listing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photos: [],
          platforms,
          currency,
          existing: { title: title.trim(), description: description.trim() },
        }),
      });
      // Text first, then parse. A server that fell over answers with an HTML
      // page, and response.json() on that throws a parse error that reads as a
      // dropped connection - a network story for a 500 with a cause in the log.
      const raw = await response.text();
      let payload: {
        error?: string; upgrade?: boolean; quota?: Quota; listing?: Listing; profile?: SellerProfile;
      } | null = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        setError(payload?.error
          ?? `The server answered ${response.status} instead of a rewrite. If this keeps happening, `
            + 'open /api/health - it names whatever is not configured.');
        setNeedsUpgrade(Boolean(payload?.upgrade));
        if (payload?.quota) setQuota(payload.quota);
        return;
      }

      if (!payload?.listing) {
        setError('The server accepted the listing but sent back no rewrite. Try again.');
        return;
      }

      setListing(payload.listing);
      if (payload.profile) setProfile(payload.profile);
      if (payload.quota) setQuota(payload.quota);
      setActive(platforms[0]);
    } catch {
      setError('The connection dropped before the rewrite came back. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio">
      <div className="stack" style={{ gap: 18 }}>
        <div className="field">
          <label className="field-label" htmlFor="old-title">Your current title</label>
          <input
            id="old-title"
            type="text"
            maxLength={200}
            placeholder="Paste it exactly as it is live"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="old-description">Your current description</label>
          <textarea
            id="old-description"
            value={description}
            maxLength={6000}
            rows={8}
            placeholder="Paste the whole thing, warts and all. The mistakes are the useful part."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="field">
          <span className="field-label">Rewrite it for</span>
          <div className="choices">
            {PLATFORMS.map((platform) => (
              <button
                key={platform}
                type="button"
                className="choice"
                aria-pressed={platforms.includes(platform)}
                onClick={() => togglePlatform(platform)}
              >
                {PLATFORM_SPECS[platform].label}
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ width: 120 }}>
          <label className="field-label" htmlFor="relist-currency">Currency</label>
          <select id="relist-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>

        <button type="button" className="btn btn-primary btn-block" disabled={!ready || busy} onClick={submit}>
          {busy ? <><span className="spinner" /> Reading your listing…</> : 'Tell me why it is not selling'}
        </button>

        {error && (
          <div className="error stack" style={{ gap: 10 }}>
            <span>{error}</span>
            {needsUpgrade && <Link href="/pricing" className="btn btn-primary">Go Pro — unlimited rewrites</Link>}
          </div>
        )}

        <QuotaBar quota={quota} signedIn={signedIn} />
      </div>

      <div ref={output}>
        {busy && !listing && (
          <Pending
            platforms={platforms.length}
            stages={RELIST_STAGES}
            note="Nothing is changed on the marketplace — you copy what you want."
          />
        )}
        {!busy && !listing && (
          <div className="card stack" style={{ gap: 10 }}>
            <h3>What comes back</h3>
            <p className="dim small">
              First, what is actually wrong with the listing — named, and with what each fault costs
              you. Then the rewrite: a title per marketplace, a description, and a price range for
              the item as you described it, not a defence of the price you set.
            </p>
            <p className="faint small">
              No photo needed. If your description says it, the rewrite keeps it; if nobody said it,
              nothing gets invented.
            </p>
          </div>
        )}
        {listing && (
          <div className="stack" style={{ gap: 14 }}>
            {listing.diagnosis.length > 0 && (
              <div className="card stack" style={{ gap: 10 }}>
                <span className="out-label">Why it was not selling</span>
                <ol className="stack" style={{ gap: 8, paddingLeft: 18, margin: 0 }}>
                  {listing.diagnosis.map((fault) => <li key={fault} className="small">{fault}</li>)}
                </ol>
              </div>
            )}
            <Result
              listing={listing}
              platforms={platforms}
              profile={profile}
              active={platforms.includes(active) ? active : platforms[0]}
              onSelect={setActive}
            />
          </div>
        )}
      </div>
    </div>
  );
}
