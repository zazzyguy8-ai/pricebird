import Link from 'next/link';
import { Footer, Nav } from '@/components/chrome';
import { PLANS } from '@/lib/billing/plans';

/**
 * The landing page, written for one person: somebody who sells second-hand
 * and already knows listing is the boring part. It does not explain AI, it
 * shows the output, because the output is the argument.
 */

const PROBLEMS = [
  {
    title: 'eBay cuts your title at 80 characters',
    body: 'Usually mid-word, usually taking the size with it. Pricebird writes a title per marketplace and enforces each limit before you paste, so nothing gets chopped.',
  },
  {
    title: 'The flaw you forgot becomes a refund',
    body: 'Buyers forgive wear they were told about and open a case over wear they discover. Every scuff, bobble and missing button in the photo goes in the description.',
  },
  {
    title: 'Guessing the price costs more than the fee',
    body: 'You get a range: what it sells for this week, what it sells for with patience, and the reasoning in plain words so you can overrule it.',
  },
];

const STEPS = [
  { n: 1, title: 'Photograph the item', body: 'One photo is enough. Add the label and any damage and the listing gets sharper.' },
  { n: 2, title: 'Pick the marketplace', body: 'eBay, Vinted, Depop, Facebook, Poshmark, Mercari or Etsy. Each gets its own title and voice.' },
  { n: 3, title: 'Copy and paste', body: 'Title, description, keywords, price. Around twenty seconds from photo to listed.' },
];

/**
 * The three ways in.
 *
 * A landing page that only shows one photo becoming one listing sells a
 * novelty. The two that make it a subscription - the pile, and the four
 * hundred listings already sitting there not selling - were invisible here,
 * which meant the strongest argument for paying was one nobody read.
 */
/**
 * The same jacket, listed twice.
 *
 * Every other section describes the product; this one shows it, which is the
 * only argument that survives a reader deciding in four seconds - and it was
 * the thing this page did not have.
 *
 * Every number on screen is counted from the strings below rather than
 * written into the prose. The first draft had them typed by hand and they
 * disagreed with each other within one screen - the meter said 26, the note
 * said thirty-one, the headline said forty-nine and the real difference was
 * forty-three. A page arguing that details cost you money cannot get its own
 * arithmetic wrong.
 *
 * Both are worked examples rather than a customer's result, and the page says
 * so underneath. This audience checks.
 */
const EBAY_TITLE_MAX = 80;

const BEFORE = {
  title: 'Mens vintage jacket size L',
  body: 'Good condition, worn a few times. Any questions just ask! Thanks for looking :)',
  notes: [
    'No brand, no colour, no material - none of the words a buyer actually types.',
    '"Good condition" tells a buyer nothing, and the case they open later is about the thing you did not name.',
    'Priced by what it feels like it is worth.',
  ],
};

const AFTER = {
  title: "Levi's Sherpa Trucker Jacket Mens L Brown Corduroy Collar Denim Lined",
  body: 'Brown corduroy collar, sherpa lining, four front pockets. Red tab and the Levi\'s patch '
    + 'are both readable. Small pale mark on the left cuff, photographed. Pit to pit 54cm, '
    + 'length 66cm. Worn, not faded.',
  notes: [
    'Brand, model, size, colour and material all reach the search index.',
    'The mark on the cuff is named before a buyer finds it, which is the difference between a sale and a case.',
    '$58 to $85, with the reasoning written out so you can overrule it.',
  ],
};

const GAINED = AFTER.title.length - BEFORE.title.length;

const MODES = [
  {
    href: '/app',
    eyebrow: 'One item',
    title: 'Photograph it',
    body: 'One photo, and you get a title per marketplace, a description, the search keywords and '
      + 'a price range. About twenty seconds.',
  },
  {
    href: '/bulk',
    eyebrow: 'The whole pile',
    title: 'Twenty at once',
    body: 'Empty the bag onto the bed, photograph everything, drop the lot in. Out comes a CSV '
      + 'your marketplace can bulk upload.',
  },
  {
    href: '/relist',
    eyebrow: 'What you already listed',
    title: 'Fix what is not selling',
    body: 'Paste a listing that has been sitting there. You get the reason first - the title '
      + 'wasting forty of its eighty characters, the condition nobody stated - then the rewrite.',
  },
];

const HONESTY = [
  ['It will not invent a size.', 'If the label is not readable in the photo, the size comes back empty and you get asked for it. A made-up size is a return.'],
  ['It will not pretend to check sold listings.', 'The price is an estimate from the photo and typical resale bands, and it says so. Anything else would be a lie with a number on it.'],
  ['It will not keep your photos.', 'The image is read and dropped. Only the text of the listing is stored, so you can reopen it on your laptop.'],
];

const FAQ = [
  ['Do I need an account to try it?', 'No. Five listings, no email, no card. The account only appears if you want your listings on another device or you go Pro.'],
  ['Which marketplaces does it write for?', 'eBay, Vinted, Depop, Facebook Marketplace, Poshmark, Mercari and Etsy. Each has its own title limit, tone and hashtag rules, and each gets its own version.'],
  ['Does it post the listing for me?', 'No, and that is deliberate. You copy and paste. Nothing gets published in your name by a machine that has never seen the item in person.'],
  ['What if the description is wrong?', 'Edit it. It is text in a box. The point is starting from something 90% right instead of an empty field at eleven at night.'],
  ['I already have listings that are not selling. Can it help those?', 'That is what Fix a listing is for. Paste the title and description of something already live and it names what is wrong - a title using half its characters, a condition nobody stated, no measurements on something where fit decides the sale - and then rewrites it. No photo needed.'],
  ['Will it sound like me or like a robot?', 'Set your house style once and every listing after it uses your tone, your postage line and your returns line. Those two lines are added word for word and never reworded - a paraphrased returns policy is a promise you did not make.'],
  ['Can I cancel?', 'One click in the billing portal, and it keeps working until the period you paid for ends.'],
];

export default function Home() {
  return (
    <>
      <Nav />

      <main>
        <section className="hero">
          <div className="shell">
            <div className="grid-2" style={{ gap: 40, alignItems: 'center' }}>
              <div className="stack" style={{ gap: 22 }}>
                <span className="pill pill-accent">5 free · no signup · 20 at a time</span>
                <h1>What&apos;s it worth?<br /><span>Ask the bird.</span></h1>
                <p className="lede">
                  Photograph anything you are selling. Pricebird reads the photo and gives you a
                  price range — plus the title, the description and the search keywords, sized for
                  whichever marketplace you list on.
                </p>
                <div className="row">
                  <Link href="/app" className="btn btn-primary">Price something free</Link>
                  <Link href="/pricing" className="btn btn-ghost">See pricing</Link>
                </div>
                <p className="small faint">About twenty seconds. No card, no email until you want one.</p>
              </div>

              <ExampleCard />
            </div>
          </div>
        </section>

        <section className="section-tight">
          <div className="shell stack" style={{ gap: 12 }}>
            <span className="eyebrow">Writes for</span>
            <div className="chip-list">
              {['eBay', 'Vinted', 'Depop', 'Facebook Marketplace', 'Poshmark', 'Mercari', 'Etsy'].map((p) => (
                <span key={p} className="chip">{p}</span>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell stack" style={{ gap: 28 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 620 }}>
              <span className="eyebrow">Why bother</span>
              <h2>Listing is not the hard part. Listing badly is.</h2>
            </div>
            <div className="grid-3">
              {PROBLEMS.map((p) => (
                <article key={p.title} className="card stack" style={{ gap: 9 }}>
                  <h3>{p.title}</h3>
                  <p className="dim small" style={{ fontSize: 14.5 }}>{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell stack" style={{ gap: 24 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 640 }}>
              <span className="eyebrow">The same jacket, listed twice</span>
              <h2>
                The difference is{' '}
                <span className="marked" style={{ whiteSpace: 'nowrap' }}>{GAINED} characters</span>.
              </h2>
            </div>

            <div className="compare">
              <div className="compare-pane">
                <span className="compare-label">What most of us write</span>
                <div className="compare-title">{BEFORE.title}</div>
                <div className="compare-meter">
                  <i style={{ width: `${Math.round((BEFORE.title.length / EBAY_TITLE_MAX) * 100)}%` }} />
                </div>
                <span className="compare-note">
                  {BEFORE.title.length} of {EBAY_TITLE_MAX} characters used — {EBAY_TITLE_MAX - BEFORE.title.length} wasted
                </span>
                <p className="compare-body">{BEFORE.body}</p>
                <ul className="stack" style={{ gap: 7, margin: 0, paddingLeft: 17 }}>
                  {BEFORE.notes.map((n) => <li key={n} className="compare-note">{n}</li>)}
                </ul>
              </div>

              <div className="compare-pane is-after">
                <span className="compare-label">What comes back</span>
                <div className="compare-title">{AFTER.title}</div>
                <div className="compare-meter">
                  <i style={{ width: `${Math.round((AFTER.title.length / EBAY_TITLE_MAX) * 100)}%` }} />
                </div>
                <span className="compare-note">
                  {AFTER.title.length} of {EBAY_TITLE_MAX} characters used
                </span>
                <p className="compare-body">{AFTER.body}</p>
                <ul className="stack" style={{ gap: 7, margin: 0, paddingLeft: 17 }}>
                  {AFTER.notes.map((n) => <li key={n} className="compare-note">{n}</li>)}
                </ul>
              </div>
            </div>

            <p className="small faint" style={{ maxWidth: 640 }}>
              Both are worked examples rather than a customer&apos;s result. The right-hand one is
              the shape Pricebird returns — a title per marketplace, the flaws named, and a price
              range with its reasoning.
            </p>
          </div>
        </section>

        <section style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}>
          <div className="shell stack" style={{ gap: 28 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 620 }}>
              <span className="eyebrow">How it works</span>
              <h2>Three steps, one of which is taking a photo.</h2>
            </div>
            <div className="grid-3">
              {STEPS.map((s) => (
                <article key={s.n} className="stack" style={{ gap: 10 }}>
                  <span className="step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p className="dim" style={{ fontSize: 14.5 }}>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell stack" style={{ gap: 28 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 620 }}>
              <span className="eyebrow">Three ways in</span>
              <h2>One thing, the whole pile, or the ones already sitting there.</h2>
              <p className="lede">
                And whichever you use, it writes the way you write: set your postage line, your
                returns line and the words you refuse to use once, on{' '}
                <Link href="/account" className="accent">your account</Link>, and every listing
                comes back carrying them.
              </p>
            </div>
            <div className="grid-3">
              {MODES.map((mode) => (
                <Link key={mode.href} href={mode.href} className="card card-tight stack" style={{ gap: 8 }}>
                  <span className="eyebrow">{mode.eyebrow}</span>
                  <h3 style={{ fontSize: 19 }}>{mode.title}</h3>
                  <p className="dim small">{mode.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell">
            <div className="grid-2" style={{ gap: 40, alignItems: 'center' }}>
              <div className="stack" style={{ gap: 18 }}>
                <span className="eyebrow">Or the whole pile</span>
                <h2>Twenty items. One go.</h2>
                <p className="lede">
                  Photograph everything, drop it all in at once, come back to finished listings and
                  a spreadsheet you paste straight into a bulk uploader.
                </p>
                <p className="dim" style={{ fontSize: 15 }}>
                  This is the part you cannot do in a chat window. There, twenty items is twenty
                  prompts, twenty waits and twenty copies. Here it is one drag and a cup of tea.
                </p>
                <div className="row">
                  <Link href="/bulk" className="btn btn-primary">Try the pile</Link>
                </div>
              </div>

              <div className="card stack" style={{ gap: 10 }}>
                <div className="spread">
                  <span className="out-label">Batch · 20 items</span>
                  <span className="pill pill-accent">CSV out</span>
                </div>
                {[
                  ['Carhartt Detroit jacket, brown, L', '£95', 'done'],
                  ['Nike Air Max 90, white, UK 9', '£48', 'done'],
                  ['Zara wool coat, camel, M', '£32', 'done'],
                  ['Levi\u2019s 501, mid wash, W32 L34', '£28', 'reading'],
                ].map(([title, price, state]) => (
                  <div key={title} className="card card-tight spread" style={{ boxShadow: 'none' }}>
                    <span className="small" style={{ minWidth: 0 }}>{title}</span>
                    {state === 'done'
                      ? <span className="small mono accent">{price}</span>
                      : <span className="pill">reading…</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="shell stack" style={{ gap: 26 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 640 }}>
              <span className="eyebrow">The honest part</span>
              <h2>Three things it refuses to do.</h2>
              <p className="lede">
                Every one of them would make the demo look better and the listing worse.
              </p>
            </div>
            <div className="grid-3">
              {HONESTY.map(([title, body]) => (
                <article key={title} className="card stack" style={{ gap: 9 }}>
                  <h3>{title}</h3>
                  <p className="dim" style={{ fontSize: 14.5 }}>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}>
          <div className="shell stack" style={{ gap: 20, alignItems: 'center', textAlign: 'center' }}>
            <span className="eyebrow">Pricing</span>
            <h2>{PLANS.pro.priceLabel.replace(' / month', '')} a month. One extra sale covers the year.</h2>
            <p className="lede" style={{ maxWidth: 560 }}>
              Five listings free to decide. Then unlimited listings, every marketplace, cancel in a click.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link href="/app" className="btn btn-primary">Start with 5 free</Link>
              <Link href="/pricing" className="btn btn-ghost">Full pricing</Link>
            </div>
          </div>
        </section>

        <section>
          <div className="shell" style={{ maxWidth: 760 }}>
            <h2 style={{ marginBottom: 24 }}>Questions</h2>
            {FAQ.map(([q, a]) => (
              <div key={q} className="faq">
                <h3>{q}</h3>
                <p className="dim" style={{ fontSize: 15 }}>{a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* On a phone the only way in is at the top of a long page. This follows
          the reader down it; on a desktop, where the nav never leaves, it is
          not rendered at all. */}
      <div className="sticky-cta">
        <Link href="/app" className="btn btn-primary btn-block">Start free — 5 listings, no signup</Link>
      </div>

      <Footer />
    </>
  );
}

/**
 * A worked example, not a screenshot.
 *
 * Real markup so it stays sharp on every screen and keeps working when the
 * output format changes - and so a visitor on a phone sees the actual product
 * surface rather than a shrunken picture of it.
 */
function ExampleCard() {
  return (
    <div className="card stack" style={{ gap: 14 }}>
      <div className="spread">
        <span className="pill">eBay · 80 char limit</span>
        <span className="pill pill-accent">from 1 photo</span>
      </div>

      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 2, flex: 1 }}>
          <span className="out-label">Suggested price</span>
          <div className="price-row">
            <span className="price-big">£95</span>
            <span className="price-range">£78 quick · £120 patient</span>
          </div>
        </div>
      </div>
      <div className="out-field">
        <div className="out-head">
          <span className="out-label">Title · 74/80</span>
          <span className="btn-quiet" aria-hidden="true">Copy</span>
        </div>
        <div className="out-body">Carhartt WIP Detroit Jacket Brown Corduroy Collar Duck Canvas Mens Size L</div>
      </div>

      <div className="out-field">
        <div className="out-head">
          <span className="out-label">Description</span>
          <span className="btn-quiet" aria-hidden="true">Copy</span>
        </div>
        <div className="out-body" style={{ fontSize: 14.5 }}>
          Carhartt WIP Detroit jacket, brown duck canvas, corduroy collar.{'\n'}
          Size L on the label. Blanket lined, all zips and snaps working.{'\n'}
          Fading at the cuffs and a small paint mark on the left sleeve, both photographed.
        </div>
      </div>


      <p className="note note-warn small">
        Size read off the label in photo 2. Chest measurement not visible — measure pit to pit
        before you list, it is the first thing buyers ask.
      </p>
    </div>
  );
}
