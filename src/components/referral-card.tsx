'use client';

import { useState } from 'react';

/**
 * The share surface.
 *
 * One field, one button. A referral scheme that needs explaining does not get
 * used, so the terms are one sentence above the link and the link is already
 * complete - nobody has to assemble a URL from a code.
 */
export function ReferralCard({ link, code, invited, bonus }: {
  link: string;
  code: string;
  invited: number;
  bonus: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="spread">
        <span className="out-label">Give a month, get a month</span>
        {invited > 0 && <span className="pill pill-accent">{invited} invited</span>}
      </div>

      <p className="dim small">
        Your friend&apos;s first month is free. When they subscribe you get one back — as $7 off
        your next invoice, or 30 free listings if you are not paying yet.
      </p>

      <div className="out-field">
        <div className="out-head">
          <span className="out-label">Your link · {code}</span>
          <button type="button" className="btn-quiet" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="out-body mono" style={{ fontSize: 14, wordBreak: 'break-all' }}>{link}</div>
      </div>

      {bonus > 0 && (
        <p className="note small">
          {bonus} bonus listings earned from referrals, on top of your plan.
        </p>
      )}
    </div>
  );
}
