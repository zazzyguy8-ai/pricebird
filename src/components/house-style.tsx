'use client';

import { useState } from 'react';
import {
  DEFAULT_PROFILE, TONES, TONE_LABELS, type SellerProfile, type Tone,
} from '@/lib/listing/profile';

/**
 * Where the tool stops being generic.
 *
 * Everything here is something a seller would otherwise retype on every
 * single item, or worse, forget on the one that gets the dispute. Set once,
 * applied to every listing after it - single and bulk, every marketplace, and
 * the CSV export too.
 */

function List({ label, hint, values, max, onChange }: {
  label: string;
  hint: string;
  values: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  // Always one empty row at the end, so adding another needs no button and
  // removing one is just clearing the field.
  const rows = [...values, ''].slice(0, max);

  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <p className="small faint" style={{ marginTop: -4 }}>{hint}</p>
      <div className="stack" style={{ gap: 6 }}>
        {rows.map((value, index) => (
          <input
            key={index}
            type="text"
            value={value}
            maxLength={120}
            placeholder={index === 0 ? 'Leave empty for none' : ''}
            onChange={(event) => {
              const next = [...rows];
              next[index] = event.target.value;
              onChange(next.map((v) => v.trim()).filter(Boolean));
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function HouseStyle({ initial }: { initial: SellerProfile }) {
  const [profile, setProfile] = useState<SellerProfile>(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SellerProfile>(key: K, value: SellerProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setState('idle');
  }

  async function save() {
    setState('saving');
    setError(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      });
      // Read the body only after the status is checked: an error page is not
      // JSON, and parsing it first turns a clear failure into "unexpected
      // token <", which describes nothing.
      if (!response.ok) {
        const message = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(message?.error ?? `That could not be saved (${response.status}).`);
      }
      setState('saved');
    } catch (problem) {
      setState('idle');
      setError(problem instanceof Error ? problem.message : 'That could not be saved.');
    }
  }

  return (
    <div className="card stack" style={{ gap: 18 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h3>Your house style</h3>
        <p className="dim small">
          Set this once and every listing comes back in your words, with your terms on the end.
          It applies to bulk mode and the CSV export too.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="tone">How you write</label>
        <select id="tone" value={profile.tone} onChange={(e) => set('tone', e.target.value as Tone)}>
          {TONES.map((tone) => <option key={tone} value={tone}>{TONE_LABELS[tone]}</option>)}
        </select>
      </div>

      <div className="grid-2" style={{ gap: 14 }}>
        <div className="field">
          <label className="field-label" htmlFor="units">Measurements in</label>
          <select id="units" value={profile.units} onChange={(e) => set('units', e.target.value as 'cm' | 'in')}>
            <option value="cm">Centimetres</option>
            <option value="in">Inches</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ships">Ships from</label>
          <input
            id="ships"
            type="text"
            maxLength={60}
            placeholder="e.g. Slovakia"
            value={profile.ships_from ?? ''}
            onChange={(e) => set('ships_from', e.target.value || null)}
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="shop">Shop name</label>
        <p className="small faint" style={{ marginTop: -4 }}>
          Used only where a listing reads as coming from a person — Etsy and Depop.
        </p>
        <input
          id="shop"
          type="text"
          maxLength={60}
          value={profile.shop_name ?? ''}
          onChange={(e) => set('shop_name', e.target.value || null)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="postage">Your postage line</label>
        <p className="small faint" style={{ marginTop: -4 }}>
          Added to the end of every description exactly as you write it — never reworded, and
          never cut off by a character limit.
        </p>
        <input
          id="postage"
          type="text"
          maxLength={200}
          placeholder="Posted within 2 working days, tracked."
          value={profile.postage_line ?? ''}
          onChange={(e) => set('postage_line', e.target.value || null)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="returns">Your returns line</label>
        <input
          id="returns"
          type="text"
          maxLength={200}
          placeholder="Returns accepted within 14 days."
          value={profile.returns_line ?? ''}
          onChange={(e) => set('returns_line', e.target.value || null)}
        />
      </div>

      <List
        label="Always true of your items"
        hint="Worked in where it fits, skipped where it would read as padding. Up to three."
        values={profile.always_mention}
        max={3}
        onChange={(next) => set('always_mention', next)}
      />

      <List
        label="Words you never use"
        hint="On top of the filler already banned for everyone. Near-synonyms are banned with them."
        values={profile.never_say}
        max={8}
        onChange={(next) => set('never_say', next)}
      />

      {error && <p className="error">{error}</p>}

      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save house style'}
        </button>
        {state === 'saved' && <span className="small accent">Saved. It applies to your next listing.</span>}
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => { setProfile(DEFAULT_PROFILE); setState('idle'); }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
