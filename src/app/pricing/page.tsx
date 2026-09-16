import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav } from '@/components/chrome';
import { UpgradeButton } from '@/components/upgrade-button';
import { PLANS, PRICE_ENV } from '@/lib/billing/plans';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Five listings free, no card. Then $7 a month, cancelled in one click from inside the app.',
};
export const dynamic = 'force-dynamic';

/**
 * A page that argues rather than lists.
 *
 * The version this replaces was two columns of ticks, which answers "what do
 * I get" and leaves "why would I pay" to the reader. For a seven dollar
 * subscription the second question is the only one that matters, and its
 * answer is not a feature - it is that one avoided return, or one item found
 * by a buyer who would otherwise have scrolled past, covers a year of it.
 *
 * It also quietly fixed a lie. The old page promised listings "saved and
 * searchable"; they are saved, and there is no search - the account page
 * shows the last twelve. Nothing is worth less than a paid feature that does
 * not exist, and this audience checks.
 */

const WHY = [
  {
    title: 'A return costs more than a year of this',
    body: 'Postage out, postage back, and an item that is second-hand twice. Every scuff in the '
      + 'photo goes in the description, whether you noticed it or not.',
  },
  {
    title: 'Half your title is doing nothing',
    body: 'eBay gives you 80 characters. Most listings use 40. The other 40 are searches you '
      + 'never appear in.',
  },
  {
    title: 'The price is the part you guess at',
    body: 'What it sells for this week, what it sells for with patience, and the reasoning in '
      + 'plain words so you can overrule it. An estimate from a photo, and it says so.',
  },
];

const NOT_PAYING_FOR = [
  'Posting for you. You copy and paste.',
  'Storing your photos. The image is read and dropped.',
  'A contract. One click cancels.',
];

export default function PricingPage() {
  // The annual plan only appears once its price exists in Stripe, so a
  // launch that has only created the monthly one never shows a button that
  // would fail at checkout.
  const yearly = Boolean(process.env[PRICE_ENV.yearly]);

  return (
    <>
      <Nav cta="Start free" current="/pricing" />
      <main>
        <section>
          <div className="shell stack" style={{ gap: 34 }}>
            <div className="stack" style={{ gap: 12, maxWidth: 640 }}>
              <span className="eyebrow">Pricing</span>
              <h1 style={{ fontSize: 'clamp(30px, 6vw, 44px)' }}>Cheaper than one returned parcel.</h1>
              <p className="lede">
                Five listings free, no card, no email. After that seven dollars a month — about
                the fee on one thirty-pound sale — and one click stops it from inside the app.
              </p>
            </div>

            <div className="grid-2">
              <article className="card plan">
                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow">Free</span>
                  <span className="plan-price">$0</span>
                  <p className="dim small">
                    {PLANS.free.limit} listings, then it stops. No card, no email, no trial that
                    quietly becomes a subscription.
                  </p>
                </div>
                <ul>
                  <li>Everything unlocked — all seven marketplaces, bulk, and fixing an old listing</li>
                  <li>Price range, condition grade and the flaws it found</li>
                  <li>Up to four photos per item</li>
                  <li>Your house style, saved and applied to every listing</li>
                </ul>
                <p className="small faint" style={{ marginTop: 4 }}>
                  Five is enough to find out whether it describes <em>your</em> things correctly,
                  and not enough to run a shop on. That is the whole design.
                </p>
                <div className="grow" />
                <Link href="/app" className="btn btn-ghost btn-block">Start writing</Link>
              </article>

              <article className="card plan plan-featured">
                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow accent">Pro</span>
                  <span className="plan-price">
                    $7<span style={{ fontSize: 17, color: 'var(--text-dim)' }}> / month</span>
                  </span>
                  <p className="dim small">
                    {yearly ? 'Or $69 a year — two months off.' : 'Cancel any time, in one click.'}
                  </p>
                </div>
                <ul>
                  <li>Listings without counting them ({PLANS.pro.limit} a month fair use — nobody photographing by hand gets near it)</li>
                  <li>Twenty photos in one go, exported as a CSV for bulk upload</li>
                  <li>Every stale listing you own, rewritten with the reason it was not selling</li>
                  <li>Your last twelve listings kept, so a phone and a laptop show the same work</li>
                  <li>One click cancels, and it runs to the end of the period you paid for</li>
                </ul>
                <p className="small faint" style={{ marginTop: 4 }}>
                  Pro is for the evening you photograph twenty things, not the one where you list a
                  jacket. If you are not having that evening, stay on free.
                </p>
                <div className="grow" />
                <div className="stack" style={{ gap: 9 }}>
                  <UpgradeButton interval="monthly">Go Pro — $7/month</UpgradeButton>
                  {yearly && (
                    <UpgradeButton interval="yearly" className="btn btn-ghost btn-block">Pay yearly — $69</UpgradeButton>
                  )}
                </div>
              </article>
            </div>

            <div className="stack" style={{ gap: 16 }}>
              <h3>What the seven dollars is actually for</h3>
              <div className="grid-3">
                {WHY.map((item) => (
                  <div key={item.title} className="card card-tight stack" style={{ gap: 8 }}>
                    <strong>{item.title}</strong>
                    <p className="small dim">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card stack" style={{ gap: 12 }}>
              <h3 style={{ fontSize: 20 }}>What you are not paying for</h3>
              <ul className="stack" style={{ gap: 8, margin: 0, paddingLeft: 18 }}>
                {NOT_PAYING_FOR.map((line) => <li key={line} className="small dim">{line}</li>)}
              </ul>
            </div>

            <p className="small faint" style={{ maxWidth: 640 }}>
              Payments run through Stripe; no card details ever touch this app. Prices in USD,
              charged in your card&apos;s currency at Stripe&apos;s rate.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
