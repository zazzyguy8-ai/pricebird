import Link from 'next/link';
import { Footer, Nav } from '@/components/chrome';
import { PLANS } from '@/lib/billing/plans';

/**
 * The landing page, written for one person: somebody who sources second-hand
 * and already knows listing is the boring part.
 *
 * It used to run to nine sections and six hundred words - three problem cards
 * with a paragraph each, three steps, three refusals, seven FAQ answers - and
 * the first person outside this repo to read it said nobody would. They were
 * right. None of it was wrong, it was just more argument than anyone spends on
 * a seven dollar tool they have not tried.
 *
 * So the page now makes one argument, the only one that survives a reader
 * deciding in four seconds: here is what most of us write, here is what comes
 * back, count the difference. Everything that explained rather than showed is
 * gone. The answers people genuinely need are still here, collapsed, because
 * hiding a question is not the same as deleting it.
 */

const EBAY_TITLE_MAX = 80;

const BEFORE = {
  title: 'Mens vintage jacket size L',
  body: 'Good condition, worn a few times. Any questions just ask! Thanks for looking :)',
  note: 'No brand, no colour, no material — none of the words a buyer types.',
};

const AFTER = {
  title: "Levi's Sherpa Trucker Jacket Mens L Brown Corduroy Collar Denim Lined",
  body: 'Brown corduroy collar, sherpa lining, four front pockets. Small pale mark on the left '
    + 'cuff, photographed. Pit to pit 54cm, length 66cm. Worn, not faded.',
  note: 'The mark is named before a buyer finds it. That is a sale instead of a case.',
};

const GAINED = AFTER.title.length - BEFORE.title.length;

const MODES = [
  { href: '/app', title: 'One item', body: 'A photo. Twenty seconds.' },
  { href: '/bulk', title: 'Twenty at once', body: 'Empty the bag in. Get a CSV out.' },
  { href: '/relist', title: 'Ones already listed', body: 'Paste what is not selling. Get the reason.' },
];

const REFUSES = [
  'It will not invent a size.',
  'It will not pretend it checked sold listings.',
  'It will not keep your photos.',
];

const FAQ = [
  ['Do I need an account to try it?', 'No. Five listings, no email, no card.'],
  ['Does it post the listing for me?', 'No. You copy and paste. Nothing gets published in your name by a machine that has never seen the item.'],
  ['Will it sound like me?', 'Set your postage line, your returns line and the words you refuse to use once. Every listing after that carries them, word for word.'],
  ['Can I cancel?', 'One click, and it keeps working until the period you paid for ends.'],
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
                  Photograph what you sourced. Get the price, the title, the description and the
                  keywords &mdash; sized for the marketplace you list on.
                </p>
                <div className="row">
                  <Link href="/app" className="btn btn-primary">Price something free</Link>
                  <Link href="/pricing" className="btn btn-ghost">See pricing</Link>
                </div>
                <p className="small faint">No card, no email until you want one.</p>
              </div>

              <ExampleCard />
            </div>
          </div>
        </section>

        <section className="section-tight">
          <div className="reveal shell stack" style={{ gap: 12 }}>
            <span className="eyebrow">Writes for</span>
            <div className="chip-list">
              {['eBay', 'Vinted', 'Depop', 'Facebook Marketplace', 'Poshmark', 'Mercari', 'Etsy'].map((p) => (
                <span key={p} className="chip">{p}</span>
              ))}
            </div>
          </div>
        </section>

        {/* The one argument the page makes. Everything that used to explain it
            in prose has been cut, because this shows it in four seconds. */}
        <section>
          <div className="reveal shell stack" style={{ gap: 24 }}>
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
                  {BEFORE.title.length} of {EBAY_TITLE_MAX} characters &mdash; {EBAY_TITLE_MAX - BEFORE.title.length} wasted
                </span>
                <p className="compare-body">{BEFORE.body}</p>
                <span className="compare-note">{BEFORE.note}</span>
              </div>

              <div className="compare-pane is-after">
                <span className="compare-label">What comes back</span>
                <div className="compare-title">{AFTER.title}</div>
                <div className="compare-meter">
                  <i style={{ width: `${Math.round((AFTER.title.length / EBAY_TITLE_MAX) * 100)}%` }} />
                </div>
                <span className="compare-note">
                  {AFTER.title.length} of {EBAY_TITLE_MAX} characters
                </span>
                <p className="compare-body">{AFTER.body}</p>
                <span className="compare-note">{AFTER.note}</span>
              </div>
            </div>

            <p className="small faint">Worked examples, not a customer&apos;s result.</p>
          </div>
        </section>

        <section style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}>
          <div className="reveal shell">
            <div className="grid-2" style={{ gap: 40, alignItems: 'center' }}>
              <div className="stack" style={{ gap: 18 }}>
                <span className="eyebrow">Or the whole pile</span>
                <h2>Twenty items. One go.</h2>
                <p className="lede">
                  In a chat window that is twenty prompts, twenty waits and twenty copies. Here it
                  is one drag and a cup of tea.
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
                  ['Levi’s 501, mid wash, W32 L34', '£28', 'reading'],
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

        <section className="section-tight">
          <div className="reveal shell stack" style={{ gap: 18 }}>
            <div className="grid-3">
              {MODES.map((mode) => (
                <Link key={mode.href} href={mode.href} className="card card-tight stack" style={{ gap: 6 }}>
                  <h3 style={{ fontSize: 18 }}>{mode.title}</h3>
                  <p className="dim small">{mode.body}</p>
                </Link>
              ))}
            </div>
            {/* Three refusals, one line each. They used to be three cards with a
                paragraph apiece, which is a lot of room to spend on things the
                product does not do. */}
            <ul className="stack small dim" style={{ gap: 6, margin: 0, paddingLeft: 17 }}>
              {REFUSES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </section>

        <section style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}>
          <div className="reveal shell stack" style={{ gap: 20, alignItems: 'center', textAlign: 'center' }}>
            <h2>{PLANS.pro.priceLabel.replace(' / month', '')} a month. One extra sale covers the year.</h2>
            <p className="lede" style={{ maxWidth: 520 }}>
              Five free to decide. Then unlimited, every marketplace, cancel in a click.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link href="/app" className="btn btn-primary">Start with 5 free</Link>
              <Link href="/pricing" className="btn btn-ghost">Full pricing</Link>
            </div>
          </div>
        </section>

        {/* Collapsed, because a wall of answers to questions nobody asked yet is
            the single biggest block of text a landing page can carry. Hiding a
            question is not the same as deleting it. */}
        <section className="section-tight">
          <div className="reveal shell" style={{ maxWidth: 720 }}>
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p className="dim small">{a}</p>
              </details>
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
        before you list.
      </p>
    </div>
  );
}
