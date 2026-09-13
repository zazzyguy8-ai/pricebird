import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/chrome';
import { Bulk } from '@/components/bulk';
import { currentAccount } from '@/lib/auth';
import { PLANS } from '@/lib/billing/plans';
import { quotaFor, type Quota } from '@/lib/quota';

export const metadata: Metadata = { title: 'The whole pile' };
export const dynamic = 'force-dynamic';

const UNTOUCHED: Quota = {
  plan: 'free', used: 0, limit: PLANS.free.limit, remaining: PLANS.free.limit,
  window: 'lifetime', allowed: true, message: '',
};

export default async function BulkPage() {
  const account = await currentAccount();
  const quota = account ? await quotaFor(account) : UNTOUCHED;

  return (
    <>
      <Nav cta="Pricing" />
      <main className="shell" style={{ paddingBlock: 28, maxWidth: 720 }}>
        <div className="stack" style={{ gap: 20 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 26 }}>The whole pile</h2>
            <p className="dim small">
              Photograph everything, drop it all in at once, come back to finished listings and a
              spreadsheet. One item at a time is <Link href="/app" className="accent">over here</Link>.
            </p>
          </div>
          <Bulk quota={quota} />
        </div>
      </main>
    </>
  );
}
