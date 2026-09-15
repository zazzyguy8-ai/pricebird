'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PLATFORM_SPECS, PLATFORMS, type Platform } from '@/lib/listing/platforms';
import { CONDITION_LABELS, renderFor, type Listing } from '@/lib/listing/schema';
import { DEFAULT_PROFILE, type SellerProfile } from '@/lib/listing/profile';
import { CURRENCIES, guessCurrency } from '@/lib/listing/currency';
import { PostageNudge } from '@/components/postage-nudge';
import { OutOfFree } from '@/components/out-of-free';
import type { Quota } from '@/lib/quota';

/**
 * The whole product surface.
 *
 * Two rules shaped it. First, the seller is standing over a pile of clothes
 * holding a phone, so every control is reachable with a thumb and nothing is
 * required except a photo. Second, the output is only useful if it reaches the
 * marketplace, so every field the seller pastes has its own copy button and
 * its own character count - a title that copies clean is the product.
 */


/** Longest edge after downscaling. Detail beyond this changes nothing the
 *  model can use and costs upload seconds on a phone connection. */
const MAX_EDGE = 1400;
const MAX_PHOTOS = 4;

interface Shot {
  id: string;
  preview: string;
  media_type: 'image/jpeg';
  data: string;
}

/** Downscales in the browser: a 12MP phone photo becomes ~250KB before it
 *  ever leaves the device, which is the difference between a listing in
 *  twenty seconds and one in ninety on mobile data. */
async function toShot(file: File): Promise<Shot> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser will not let the photo be resized.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return {
    id: crypto.randomUUID(),
    preview: dataUrl,
    media_type: 'image/jpeg',
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
  };
}


/**
 * Takes the reader to the part of the page that just changed.
 *
 * On a phone the form and the result are stacked, not side by side, so
 * pressing the button scrolls nothing and shows nothing: the wait, the
 * listing and any error all appear below the fold, and the page looks like it
 * ignored the tap. Every visitor arriving from a video is on a phone.
 *
 * It only moves the page when the target is actually out of view, so on a
 * desktop - where the result is already sitting beside the form - nothing
 * jumps. And it asks for a smooth scroll, which the reduced-motion rule in
 * globals.css turns into an instant one for anyone who set that.
 */
export function useRevealOnChange(active: boolean): React.RefObject<HTMLDivElement | null> {
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const node = target.current;
    if (!node) return;

    const box = node.getBoundingClientRect();
    const alreadyVisible = box.top >= 0 && box.top < window.innerHeight * 0.6;
    if (alreadyVisible) return;

    // An explicit behavior overrides the CSS scroll-behavior rule, so the
    // reduced-motion preference has to be read here rather than assumed to
    // have been handled by the stylesheet. It was not.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  }, [active]);

  return target;
}

export function Studio({ quota: initialQuota, signedIn }: { quota: Quota; signedIn: boolean }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>(['ebay']);
  const [profile, setProfile] = useState<SellerProfile>(DEFAULT_PROFILE);
  // 'USD' for the first paint so the server and the client agree, then the
  // browser's own region once there is a browser to ask.
  const [currency, setCurrency] = useState('USD');
  const [currencyTouched, setCurrencyTouched] = useState(false);
  useEffect(() => {
    if (!currencyTouched) setCurrency(guessCurrency());
  }, [currencyTouched]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [quota, setQuota] = useState(initialQuota);
  const [active, setActive] = useState<Platform>('ebay');
  const [over, setOver] = useState(false);

  // The result column, so a phone is taken to it when something appears there.
  const output = useRevealOnChange(busy || Boolean(listing));
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const all = Array.from(files);
    if (all.length === 0) return;

    const room = MAX_PHOTOS - shots.length;
    const images = all.filter((f) => f.type.startsWith('image/'));

    // Silence is the worst answer to a wrong file. Choosing a PDF used to do
    // nothing at all: no thumbnail, no message, no reason - the seller taps
    // the button, watches nothing happen, and concludes the site is broken.
    if (images.length === 0) {
      setError(
        all.length === 1
          ? `${all[0].name} is not a photo. Use a picture of the item — JPEG, PNG, WebP or GIF.`
          : 'None of those are photos. Use pictures of the item — JPEG, PNG, WebP or GIF.',
      );
      return;
    }
    if (images.length < all.length) {
      const dropped = all.length - images.length;
      setError(dropped === 1
        ? 'One of those was not a photo and was skipped.'
        : `${dropped} of those were not photos and were skipped.`);
    }

    if (room <= 0) {
      setError(`That is already ${MAX_PHOTOS} photos, which is as many as this reads at once.`);
      return;
    }

    const chosen = images.slice(0, room);
    const skipped = images.length - chosen.length;

    try {
      const added = await Promise.all(chosen.map(toShot));
      setShots((current) => [...current, ...added].slice(0, MAX_PHOTOS));
      if (skipped > 0) {
        setError(`Added ${chosen.length}. ${skipped} more would be over the ${MAX_PHOTOS}-photo limit.`);
      }
    } catch {
      // Whatever the browser says here is written for a developer - "The
      // source image could not be decoded" is true and useless. What the
      // person needs is what to do instead.
      setError(
        chosen.length === 1
          ? 'That file could not be opened as a photo. If it came from a message or a screenshot, '
            + 'try taking a picture of the item instead.'
          : 'One of those files could not be opened as a photo. Try adding them one at a time to '
            + 'find which.',
      );
    }
  }, [shots.length]);

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => {
      const next = current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform];
      // Never leave nothing selected: the request would fail and the seller
      // would have to work out why the button stopped doing anything.
      return next.length === 0 ? current : next;
    });
  }

  async function submit() {
    if (shots.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNeedsUpgrade(false);

    try {
      const response = await fetch('/api/listing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photos: shots.map(({ media_type, data }) => ({ media_type, data })),
          platforms,
          currency,
          notes: notes.trim() || null,
        }),
      });
      // Read the body as text first. A server that fell over answers with an
      // HTML error page, and calling response.json() on that throws - which
      // used to land in the catch below and report a dropped connection, a
      // network story for what was actually a 500 with a cause in the logs.
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
          ?? `The server answered ${response.status} instead of a listing. If this keeps happening, `
            + 'open /api/health - it names whatever is not configured.');
        setNeedsUpgrade(Boolean(payload?.upgrade));
        if (payload?.quota) setQuota(payload.quota);
        return;
      }

      if (!payload?.listing) {
        setError('The server accepted the photo but sent back no listing. Try again.');
        return;
      }

      setListing(payload.listing);
      // The server decides what the house style did; the page never re-derives
      // it, so what is copied here is byte-for-byte what the export contains.
      if (payload.profile) setProfile(payload.profile);
      if (payload.quota) setQuota(payload.quota);
      setActive(platforms[0]);
    } catch {
      setError('The connection dropped before the listing came back. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio">
      <div className="stack" style={{ gap: 16 }}>
        <div
          className={`drop${over ? ' over' : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => { event.preventDefault(); setOver(false); void addFiles(event.dataTransfer.files); }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter') fileInput.current?.click(); }}
        >
          <p style={{ fontWeight: 600 }}>{shots.length === 0 ? 'Add a photo of the item' : 'Add another angle'}</p>
          <p className="small faint" style={{ marginTop: 4 }}>
            {shots.length === 0
              ? 'Tap to use the camera, or drop a file. Up to four.'
              : `${shots.length} of ${MAX_PHOTOS}. The label and any damage help most.`}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }}
          />
        </div>

        {shots.length > 0 && (
          <div className="thumbs">
            {shots.map((shot) => (
              <div key={shot.id} className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.preview} alt="" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setShots((current) => current.filter((s) => s.id !== shot.id))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <span className="field-label">Marketplace</span>
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

        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ width: 120 }}>
            <label className="field-label" htmlFor="currency">Currency</label>
            <select
              id="currency"
              value={currency}
              onChange={(event) => { setCurrencyTouched(true); setCurrency(event.target.value); }}
            >
              {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="notes">Anything the photo cannot show (optional)</label>
          <textarea
            id="notes"
            value={notes}
            maxLength={500}
            placeholder="Worn twice. Bought in Berlin 2021. Pit to pit 54cm."
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <button type="button" className="btn btn-primary btn-block" disabled={shots.length === 0 || busy} onClick={submit}>
          {busy ? <><span className="spinner" /> Reading the photo…</> : 'Write the listing'}
        </button>

        {error && (
          needsUpgrade
            ? <OutOfFree reason={error} />
            : <div className="error">{error}</div>
        )}

        <QuotaBar quota={quota} signedIn={signedIn} />
      </div>

      <div ref={output}>
        {busy && !listing && <Pending photo={shots[0]?.preview} platforms={platforms.length} />}
        {!busy && !listing && <Empty />}
        {listing && (
          <div className="stack" style={{ gap: 14 }}>
            {/*
              * The listing first, always.
              *
              * The nudge started life above it and pushed the thing the seller
              * just waited twenty seconds for off the bottom of a phone
              * screen: they tapped the button and got a settings question.
              * It is also the frame every screen recording of this product
              * shows, so above the result it would replace the one moment the
              * whole thing is built around.
              *
              * Under the finished listing is where it was always meant to be,
              * and where its own comment said it was.
              */}
            <Result
              listing={listing}
              platforms={platforms}
              profile={profile}
              active={platforms.includes(active) ? active : platforms[0]}
              onSelect={setActive}
            />
            <PostageNudge profile={profile} onSaved={setProfile} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What the plan is, and for a paying customer, what it bought.
 *
 * The Pro state used to be a count and the word "Pro", which answers a
 * question nobody asked. Somebody who has just paid wants to know what
 * changed - and the honest answer is not "a bigger number". It is the two
 * modes and the house style, which are the whole reason the subscription is
 * worth keeping and which are invisible from this page: a customer who never
 * finds /bulk pays for a month of a tool they are using at a fifth of its
 * value, and then cancels, correctly.
 *
 * So the plan line names them. On the page a seller is on every day, that is
 * the cheapest retention there is.
 */
export function QuotaBar({ quota, signedIn }: { quota: Quota; signedIn: boolean }) {
  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const pro = quota.plan === 'pro';

  return (
    <div className="card card-tight stack" style={{ gap: 8 }}>
      <div className="spread">
        <span className="small dim">
          {pro
            ? `${quota.used} ${quota.used === 1 ? 'listing' : 'listings'} this month · no limit to worry about`
            : `${quota.remaining} of ${quota.limit} free listings left`}
        </span>
        {pro
          ? <span className="pill pill-accent">Pro</span>
          : <Link href="/pricing" className="btn-quiet">Go Pro</Link>}
      </div>

      {!pro && <div className="meter"><i style={{ width: `${pct}%` }} /></div>}

      {pro && (
        <p className="small faint">
          Your subscription also turns on{' '}
          <Link href="/bulk" className="accent">Bulk</Link> — twenty photos at once, exported as a
          CSV — and <Link href="/relist" className="accent">Fix a listing</Link>, which tells you why
          something is not selling. Set your{' '}
          <Link href="/account" className="accent">house style</Link> once and every listing comes
          back in your words, with your postage terms on the end.
        </p>
      )}

      {!signedIn && quota.used > 0 && (
        <p className="small faint">
          Saved to this browser. <Link href="/signin" className="accent">Add an email</Link> to keep them.
        </p>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="card stack" style={{ gap: 10, minHeight: 280, justifyContent: 'center', textAlign: 'center' }}>
      <h3>Nothing read yet</h3>
      <p className="dim" style={{ fontSize: 14.5, maxWidth: 380, marginInline: 'auto' }}>
        Add a photo on the left. One is enough to start — a shot of the label and a shot of any damage
        make the difference between a listing and a good one.
      </p>
    </div>
  );
}

/**
 * Twenty seconds is a long time to look at a spinner.
 *
 * Long enough to wonder whether it broke, and long enough for the page to
 * read as a wrapper around somebody else's API rather than a thing that was
 * built. So the wait shows the seller's own photo - grounding it in their
 * item rather than a generic shape - and says what is being done to it.
 *
 * Every line below is a rule the prompt actually contains, in the order it
 * asks for them, which is why the list is specific enough to be worth
 * reading: "a coloured seam is not a stain" is a real instruction that exists
 * because calling design damage once took real money off a jacket.
 *
 * What it must never do is claim a step finished. There is no progress to
 * report - one request goes out and one response comes back - so nothing here
 * ticks, completes, or fills a bar. It describes the work, honestly, and the
 * last line admits when it is taking longer than it should.
 */
export const LISTING_STAGES: [number, string][] = [
  [0, 'Reading the photo.'],
  [3, 'Looking for a label to read.'],
  [7, 'Checking the marks — a coloured seam is not a stain.'],
  [11, 'Grading the condition, conservatively.'],
  [15, 'Naming what is on it. That is how people search.'],
  [19, 'Sizing each title to its marketplace.'],
  [24, 'Working out what it is worth.'],
  [32, 'Longer than usual, but still going.'],
];

export function Pending({ photo, platforms, stages = LISTING_STAGES, note }: {
  photo?: string;
  platforms: number;
  stages?: [number, string][];
  note?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, []);

  const stage = stages.filter(([at]) => at <= elapsed).at(-1)?.[1] ?? stages[0][1];

  return (
    <div className="card stack" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        {photo && (
          <div className="thumb" style={{ width: 54, height: 54, flex: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" />
          </div>
        )}
        <div className="stack" style={{ gap: 3, minWidth: 0 }}>
          <span className="spinner" style={{ display: 'inline-block' }} aria-hidden="true" />
          <span aria-live="polite" style={{ fontSize: 14.5 }}>{stage}</span>
        </div>
      </div>

      {/* Shaped like what is coming, so the page does not jump when it lands. */}
      <div className="stack" style={{ gap: 10 }}>
        <div className="skeleton" style={{ height: 14, width: '30%' }} />
        <div className="skeleton" style={{ height: 40 }} />
        <div className="skeleton" style={{ height: 14, width: '22%' }} />
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 58, width: '75%' }} />
      </div>

      <p className="small faint">
        {note ?? (platforms > 1
          ? `Writing ${platforms} versions — one per marketplace, each to its own limit.`
          : 'One request, one listing. Nothing is published anywhere.')}
      </p>
    </div>
  );
}

/**
 * Copy, with the one failure it can actually have.
 *
 * The clipboard API is refused outright in a few real situations - an
 * insecure origin, an iframe without permission, an older mobile browser -
 * and the old version swallowed that and silently did nothing, which looks
 * exactly like a broken button. Now it says so and offers the fallback that
 * always works: the text is selected, so the long-press menu can take it.
 */
export function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('done');
        } catch {
          setState('failed');
        }
        setTimeout(() => setState('idle'), 2200);
      }}
    >
      <span aria-live="polite">
        {state === 'done' ? 'Copied' : state === 'failed' ? 'Select it and copy' : label}
      </span>
    </button>
  );
}

export function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="out-field">
      <div className="out-head">
        <span className="out-label">{label}{hint ? ` · ${hint}` : ''}</span>
        <Copy text={value} />
      </div>
      <div className="out-body">{value}</div>
    </div>
  );
}

export function Result({ listing, platforms, profile, active, onSelect }: {
  listing: Listing;
  platforms: Platform[];
  profile: SellerProfile;
  active: Platform;
  onSelect: (platform: Platform) => void;
}) {
  const spec = PLATFORM_SPECS[active];
  const copy = useMemo(() => renderFor(listing, active, profile), [listing, active, profile]);
  const { item, price } = listing;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {platforms.length > 1 && (
        <div className="choices">
          {platforms.map((platform) => (
            <button
              key={platform}
              type="button"
              className="choice"
              aria-pressed={platform === active}
              onClick={() => onSelect(platform)}
            >
              {PLATFORM_SPECS[platform].label}
            </button>
          ))}
        </div>
      )}

      <Field label="Title" value={copy.title} hint={`${copy.title.length}/${spec.titleMax}`} />
      <Field label="Description" value={copy.description} />

      <div className="card stack" style={{ gap: 12 }}>
        <div className="spread">
          <div className="stack" style={{ gap: 2 }}>
            <span className="out-label">Suggested price</span>
            <div className="price-row">
              <span className="price-big">{price.currency} {price.suggested}</span>
              <span className="price-range">{price.low} quick · {price.high} patient</span>
            </div>
          </div>
          <span className={`pill${price.confidence === 'low' ? ' pill-warn' : ''}`}>{price.confidence} confidence</span>
        </div>
        <p className="note small">{price.basis}</p>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <div className="spread">
          <span className="out-label">What it read</span>
          <span className="pill">{CONDITION_LABELS[item.condition]}</span>
        </div>
        <div className="chip-list">
          {item.brand && (
            <span className="chip">
              {item.brand}
              {item.brand_confidence !== 'visible' && <span className="faint"> · {item.brand_confidence}</span>}
            </span>
          )}
          {item.size_on_label && <span className="chip">Size {item.size_on_label}</span>}
          <span className="chip">{item.colour}</span>
          {item.material && <span className="chip">{item.material}</span>}
          {item.motif && <span className="chip">{item.motif}</span>}
          {item.era_or_style && <span className="chip">{item.era_or_style}</span>}
        </div>
        {item.flaws.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="out-label">Flaws it found</span>
            <ul className="dim small" style={{ margin: 0, paddingLeft: 18 }}>
              {item.flaws.map((flaw) => <li key={flaw}>{flaw}</li>)}
            </ul>
          </div>
        )}
      </div>

      {listing.ask_the_seller.length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="out-label">Only you know this — add it before listing</span>
          <ul className="dim small" style={{ margin: 0, paddingLeft: 18 }}>
            {listing.ask_the_seller.map((question) => <li key={question}>{question}</li>)}
          </ul>
        </div>
      )}

      <div className="out-field">
        <div className="out-head">
          <span className="out-label">Search keywords</span>
          <Copy text={listing.keywords.join(', ')} />
        </div>
        <div className="out-body">
          <div className="chip-list">
            {listing.keywords.map((keyword) => <span key={keyword} className="chip">{keyword}</span>)}
          </div>
        </div>
      </div>

      {copy.hashtags.length > 0 && <Field label={`${spec.label} hashtags`} value={copy.hashtags.join(' ')} />}

      {listing.photo_tips.length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="out-label">Better photos, more money</span>
          <ul className="dim small" style={{ margin: 0, paddingLeft: 18 }}>
            {listing.photo_tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
