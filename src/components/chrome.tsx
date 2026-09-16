import Link from 'next/link';

/**
 * The bird.
 *
 * A mascot is not decoration here, it is the brand's face - and the point of
 * having one is that it is not the founder's face. Every piece of marketing
 * this product gets is a silent screen recording, so the thing a viewer
 * recognises on the third video has to live inside the app, not in front of a
 * camera.
 *
 * Built from primitives rather than one clever path: it has to stay readable
 * at 22px in a nav bar and at 96px on a landing page, and a silhouette that
 * survives both is worth more than a detailed one that survives neither.
 */
export function BirdMark({ size = 26 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size / 3.2 }}>
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} aria-hidden="true" focusable="false">
        {/* crest: what makes it a jay rather than a generic bird, and what ties
            the mark to the mascot used on social */}
        <path d="M13.2 6.6 L12.4 2.2 L15.0 4.9 L16.6 1.6 L17.6 5.9 Z" fill="currentColor" />
        {/* forked tail: two feathers, so it does not read as a fin at 26px */}
        <path d="M8.4 12.4 L0.9 7.4 L3.4 12.6 L1.6 17.8 Z" fill="currentColor" />
        {/* body */}
        <ellipse cx="11.6" cy="14" rx="6.2" ry="5.1" fill="currentColor" />
        {/* head */}
        <circle cx="15.7" cy="8.7" r="4" fill="currentColor" />
        {/* beak */}
        <path d="M19.2 7.5 L23.7 9.1 L19.2 10.7 Z" fill="currentColor" />
        {/* wing, cut back out of the silhouette rather than drawn on top */}
        <path d="M9 13.1 Q12.8 14.1 14.8 17.6" stroke="var(--accent)" strokeWidth="0.95" fill="none" strokeLinecap="round" />
        {/* eye, punched out of the head so it reads at any size */}
        <circle cx="16.9" cy="7.8" r="0.92" fill="var(--accent)" />
      </svg>
    </span>
  );
}

/**
 * The bar at the top, and the two things it was getting wrong.
 *
 * The button said "Pricing" on three pages and went to /app - a label that
 * describes somewhere it does not take you, which is the one thing a button
 * may never do. It also sat immediately beside the "Pricing" link, so those
 * pages showed the word twice in a row and read as a mistake, which it was.
 *
 * And nothing said where you already were. On a five-item bar that is a small
 * thing; it is also the difference between a site that was assembled and one
 * that was looked at.
 *
 * The destination now travels with the label, and the current page is marked
 * and dropped from the list rather than offered as somewhere to go.
 */
const NAV_LINKS: [string, string][] = [
  ['/relist', 'Fix a listing'],
  ['/bulk', 'Bulk'],
  ['/pricing', 'Pricing'],
  ['/signin', 'Sign in'],
];

export function Nav({ cta = 'Start free', ctaHref = '/app', current }: {
  cta?: string;
  ctaHref?: string;
  /** The path this page is on, so its own link is not offered back to it. */
  current?: string;
}) {
  return (
    <header className="nav">
      <div className="shell nav-inner">
        <Link href="/" className="brand">
          <BirdMark />
          Pricebird
        </Link>
        <nav className="nav-links">
          {NAV_LINKS.filter(([href]) => href !== current && href !== ctaHref).map(([href, label]) => (
            <Link key={href} href={href} className="hide-sm">{label}</Link>
          ))}
          <Link
            href={ctaHref}
            className="btn btn-primary"
            style={{ padding: '11px 16px', fontSize: 14 }}
          >
            {cta}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell spread">
        <span>© {new Date().getFullYear()} Pricebird</span>
        {/* The gap is the tap target, not the text. At 13.5px these links
            were 21px tall on a phone - half the size a thumb needs. */}
        <div className="row" style={{ gap: 18 }}>
          <Link href="/pricing" className="tap">Pricing</Link>
          <Link href="/account" className="tap">Account</Link>
          <Link href="/signin" className="tap">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
