'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { PLATFORM_SPECS, PLATFORMS, type Platform } from '@/lib/listing/platforms';
import { listingsToCsv } from '@/lib/listing/csv';
import { renderFor, type Listing } from '@/lib/listing/schema';
import type { Quota } from '@/lib/quota';

/**
 * The pile.
 *
 * One item at a time is a thing a chat window already does. Twenty items in
 * one pass is not: it is twenty prompts, twenty waits and twenty copies, and
 * it is the reason somebody with a floor covered in clothes pays for this.
 *
 * Each item is its own request to the same endpoint the single flow uses.
 * That means a failed item is one failed item rather than a lost batch, the
 * quota is counted the same way it always is, and there is no second code
 * path to keep in step with the first.
 */

const MAX_ITEMS = 20;
const MAX_EDGE = 1400;

/** Two at a time: enough to hide most of the latency, few enough that a phone
 *  on mobile data is not uploading four photos at once. */
const CONCURRENCY = 2;

type Status = 'waiting' | 'reading' | 'done' | 'failed';

interface Row {
  id: string;
  name: string;
  preview: string;
  media_type: 'image/jpeg';
  data: string;
  status: Status;
  listing: Listing | null;
  error: string | null;
}

async function toRow(file: File): Promise<Row> {
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
    name: file.name,
    preview: dataUrl,
    media_type: 'image/jpeg',
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    status: 'waiting',
    listing: null,
    error: null,
  };
}

export function Bulk({ quota: initialQuota }: { quota: Quota }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [platform, setPlatform] = useState<Platform>('vinted');
  const [currency, setCurrency] = useState('EUR');
  const [running, setRunning] = useState(false);
  const [quota, setQuota] = useState(initialQuota);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const chosen = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (chosen.length === 0) return;
    try {
      const added = await Promise.all(chosen.map(toRow));
      setRows((current) => [...current, ...added].slice(0, MAX_ITEMS));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'One of those photos could not be read.');
    }
  }, []);

  const patch = (id: string, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));

  async function runOne(row: Row): Promise<void> {
    patch(row.id, { status: 'reading', error: null });
    try {
      const response = await fetch('/api/listing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photos: [{ media_type: row.media_type, data: row.data }],
          platforms: [platform],
          currency,
        }),
      });

      const raw = await response.text();
      let payload: { error?: string; listing?: Listing; quota?: Quota } | null = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      if (!response.ok || !payload?.listing) {
        patch(row.id, {
          status: 'failed',
          error: payload?.error ?? `The server answered ${response.status}.`,
        });
        if (payload?.quota) setQuota(payload.quota);
        return;
      }

      patch(row.id, { status: 'done', listing: payload.listing });
      if (payload.quota) setQuota(payload.quota);
    } catch {
      patch(row.id, { status: 'failed', error: 'The connection dropped on this one.' });
    }
  }

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);

    // A shared queue rather than fixed slices: a slow item holds up its own
    // worker, not a third of the batch.
    const queue = rows.filter((row) => row.status !== 'done');
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        const row = queue[next];
        next += 1;
        await runOne(row);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
  }

  function download() {
    const finished = rows.filter((row): row is Row & { listing: Listing } => row.listing !== null);
    const csv = listingsToCsv(finished.map(({ listing }) => ({ listing, platform })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pricebird-${platform}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const done = rows.filter((row) => row.status === 'done').length;
  const failed = rows.filter((row) => row.status === 'failed').length;

  return (
    <div className="stack" style={{ gap: 18 }}>
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
        <p style={{ fontWeight: 600 }}>
          {rows.length === 0 ? 'Drop the whole pile in' : `${rows.length} of ${MAX_ITEMS} items`}
        </p>
        <p className="small faint" style={{ marginTop: 4 }}>
          One photo per item, up to {MAX_ITEMS} at once. Select them all at the same time.
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

      <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div className="field grow">
          <span className="field-label">Marketplace</span>
          <div className="choices">
            {PLATFORMS.map((key) => (
              <button
                key={key}
                type="button"
                className="choice"
                aria-pressed={platform === key}
                onClick={() => setPlatform(key)}
                disabled={running}
              >
                {PLATFORM_SPECS[key].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ width: 110 }}>
          <label className="field-label" htmlFor="bulk-currency">Currency</label>
          <select
            id="bulk-currency"
            value={currency}
            disabled={running}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'PLN', 'CZK', 'SEK'].map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={rows.length === 0 || running}
          onClick={run}
        >
          {running
            ? <><span className="spinner" /> Reading {done + 1} of {rows.length}…</>
            : `Write ${rows.length || ''} listing${rows.length === 1 ? '' : 's'}`}
        </button>
        {done > 0 && (
          <button type="button" className="btn btn-ghost" onClick={download}>
            Download {done} as CSV
          </button>
        )}
      </div>

      {error && <p className="error small">{error}</p>}

      {failed > 0 && !running && (
        <p className="note note-warn small">
          {failed} item{failed === 1 ? '' : 's'} failed. Press the button again — the ones that
          worked are kept and only the rest are retried.
        </p>
      )}

      <div className="card card-tight spread">
        <span className="small dim">
          {quota.plan === 'free'
            ? `${quota.remaining} of ${quota.limit} free listings left`
            : `${quota.used} listings this month`}
        </span>
        {quota.plan === 'free' && <Link href="/pricing" className="btn-quiet">Go Pro</Link>}
      </div>

      {rows.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {rows.map((row) => <BulkRow key={row.id} row={row} platform={platform} />)}
        </div>
      )}
    </div>
  );
}

function BulkRow({ row, platform }: { row: Row; platform: Platform }) {
  const [open, setOpen] = useState(false);
  const copy = row.listing ? renderFor(row.listing, platform) : null;

  return (
    <div className="card card-tight stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <div className="thumb" style={{ width: 46, height: 46, flex: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.preview} alt="" />
        </div>

        <div className="grow" style={{ minWidth: 0 }}>
          {copy
            ? <span style={{ fontWeight: 600 }}>{copy.title}</span>
            : <span className="dim small">{row.name}</span>}
          {row.listing && (
            <div className="small faint">
              {row.listing.price.currency} {row.listing.price.suggested}
              {' · '}{row.listing.price.low}–{row.listing.price.high}
            </div>
          )}
          {row.error && <div className="small" style={{ color: 'var(--bad)' }}>{row.error}</div>}
        </div>

        {row.status === 'reading' && <span className="pill">reading…</span>}
        {row.status === 'waiting' && <span className="pill">queued</span>}
        {row.status === 'failed' && <span className="pill pill-warn">failed</span>}
        {row.status === 'done' && (
          <button type="button" className="btn-quiet" onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Open'}
          </button>
        )}
      </div>

      {open && copy && row.listing && (
        <div className="stack" style={{ gap: 8 }}>
          <CopyField label={`Title · ${copy.title.length}/${PLATFORM_SPECS[platform].titleMax}`} value={copy.title} />
          <CopyField label="Description" value={copy.description} />
          {row.listing.ask_the_seller.length > 0 && (
            <p className="note small">Only you know: {row.listing.ask_the_seller.join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="out-field">
      <div className="out-head">
        <span className="out-label">{label}</span>
        <button
          type="button"
          className="btn-quiet"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
              setTimeout(() => setDone(false), 1600);
            } catch {
              setDone(false);
            }
          }}
        >
          {done ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="out-body">{value}</div>
    </div>
  );
}
