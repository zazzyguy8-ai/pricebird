import type { Metadata } from 'next';
import { Nav } from '@/components/chrome';
import { Studio } from '@/components/studio';
import { currentAccount } from '@/lib/auth';
import { PLANS } from '@/lib/billing/plans';
import { quotaFor, type Quota } from '@/lib/quota';

export const metadata: Metadata = {
  title: 'Write a listing',
  description:
    'Photograph what you sourced and get a finished listing back - a title sized for each '
    + 'marketplace, a description that names the flaws, the search keywords and a price range. '
    + 'Five free, no account.',
};
export const dynamic = 'force-dynamic';

/** A visitor with no account yet has spent nothing; the row is created by
 *  their first listing, not by loading the page. */
const UNTOUCHED: Quota = {
  plan: 'free',
  used: 0,
  limit: PLANS.free.limit,
  remaining: PLANS.free.limit,
  window: 'lifetime',
  allowed: true,
  message: '',
};

export default async function AppPage() {
  const account = await currentAccount();
  const quota = account ? await quotaFor(account) : UNTOUCHED;

  return (
    <>
      <Nav cta="Go Pro" ctaHref="/pricing" current="/app" />
      <main className="shell" style={{ paddingBlock: 28 }}>
        <div className="stack" style={{ gap: 20 }}>
          {/* "Write a listing" was a label on a form, not a reason to use one.
              The first line now says what you get, because that is the only
              thing a visitor is deciding about. */}
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ fontSize: 26 }}>One photo. Everything you need to list it.</h1>
            <p className="dim small">
              Price, title, description, keywords. Nothing gets published — you copy what you want.
            </p>
          </div>
          <Studio quota={quota} signedIn={Boolean(account?.email)} />
        </div>
      </main>
    </>
  );
}
