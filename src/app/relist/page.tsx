import type { Metadata } from 'next';
import { Nav } from '@/components/chrome';
import { Relist } from '@/components/relist';
import { currentAccount } from '@/lib/auth';
import { PLANS } from '@/lib/billing/plans';
import { quotaFor, type Quota } from '@/lib/quota';

export const metadata: Metadata = {
  title: 'Fix a listing that is not selling',
  description:
    'Paste a listing that has been sitting there. Get the reason it is not selling, named, and '
    + 'the rewrite that fixes it.',
};
export const dynamic = 'force-dynamic';

const UNTOUCHED: Quota = {
  plan: 'free',
  used: 0,
  limit: PLANS.free.limit,
  remaining: PLANS.free.limit,
  window: 'lifetime',
  allowed: true,
  message: '',
};

export default async function RelistPage() {
  const account = await currentAccount();
  const quota = account ? await quotaFor(account) : UNTOUCHED;

  return (
    <>
      <Nav cta="Go Pro" ctaHref="/pricing" current="/relist" />
      <main className="shell" style={{ paddingBlock: 28 }}>
        <div className="stack" style={{ gap: 20 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ fontSize: 26 }}>Fix a listing that is not selling</h1>
            <p className="dim small">
              Paste one that has been sitting there. You get the reason first — named, with what it
              costs you — and then the rewrite.
            </p>
          </div>
          <Relist quota={quota} signedIn={Boolean(account?.email)} />
        </div>
      </main>
    </>
  );
}
