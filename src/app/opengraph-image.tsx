import { ImageResponse } from 'next/og';

/**
 * The picture that stands in for the whole product on somebody else's page.
 *
 * Every link posted tonight - a Reddit comment, a TikTok bio, a message to a
 * seller - renders as a card built from this file. Without it the card is a
 * blank grey box with a URL in it, which on Reddit is indistinguishable from
 * spam and gets scrolled past. It is the single highest-leverage image in the
 * product and it did not exist.
 *
 * Drawn rather than photographed: no faces, no stock, nothing that has to be
 * re-shot when the app changes. The mark is the same jay as the nav, built
 * from the same primitives, so a person who sees this card and later lands on
 * the site recognises it.
 */

export const alt = 'Pricebird — photograph anything you are selling, get a priced marketplace listing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#07070a',
          padding: 72,
          // A single hairline of brand colour along the top, so the card reads
          // as deliberate at thumbnail size where the text is unreadable.
          borderTop: '10px solid #2563eb',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 24,
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" width={54} height={54}>
              <path d="M13.2 6.6 L12.4 2.2 L15.0 4.9 L16.6 1.6 L17.6 5.9 Z" fill="#ffffff" />
              <path d="M8.4 12.4 L0.9 7.4 L3.4 12.6 L1.6 17.8 Z" fill="#ffffff" />
              <ellipse cx="11.6" cy="14" rx="6.2" ry="5.1" fill="#ffffff" />
              <circle cx="15.7" cy="8.7" r="4" fill="#ffffff" />
              <path d="M19.2 7.5 L23.7 9.1 L19.2 10.7 Z" fill="#ffffff" />
              {/* The wing and the eye are cut back out in the blue of the tile.
                  Without them the silhouette reads as a blob at card size -
                  the eye is what makes a viewer see a bird. */}
              <path d="M9 13.1 Q12.8 14.1 14.8 17.6" stroke="#2563eb" strokeWidth="0.95" fill="none" strokeLinecap="round" />
              <circle cx="16.9" cy="7.8" r="0.92" fill="#2563eb" />
            </svg>
          </div>
          <span style={{ fontSize: 44, color: '#f4f4f8', fontWeight: 700, letterSpacing: -1 }}>
            Pricebird
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ fontSize: 76, color: '#f4f4f8', fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05 }}>
            What&apos;s it worth?
          </span>
          <span style={{ fontSize: 76, color: '#4c8dff', fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05 }}>
            Ask the bird.
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 30, color: '#a2a2b8', maxWidth: 780, lineHeight: 1.35 }}>
            One photo becomes a priced listing — title, description and keywords — sized for eBay,
            Vinted, Depop, Etsy and three more.
          </span>
          <span style={{ fontSize: 28, color: '#6e6e88' }}>pricebird.org</span>
        </div>
      </div>
    ),
    size,
  );
}
