import Link from 'next/link';
import { BirdMark, Footer, Nav } from '@/components/chrome';

/**
 * A 404 that is still the product.
 *
 * The default Next.js 404 is a black page with a number on it: no brand, no
 * navigation, no way back. On a domain that is about to be the destination of
 * every video and every link we post, that page is a dead end shown to
 * somebody who was already interested enough to type the address.
 *
 * So it names the four places worth going and gets out of the way.
 */

const PLACES = [
  { href: '/app', title: 'Make a listing', body: 'One photo in, a priced listing out. Five free, no account.' },
  { href: '/bulk', title: 'Bulk mode', body: 'Twenty photos at once, exported as a CSV.' },
  { href: '/pricing', title: 'Pricing', body: 'What Pro costs and what it removes.' },
  { href: '/signin', title: 'Sign in', body: 'A six-digit code by email. No password to forget.' },
];

export default function NotFound() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero">
          <div className="shell stack" style={{ gap: 28, maxWidth: 720 }}>
            <div className="stack" style={{ gap: 16 }}>
              <BirdMark size={56} />
              <span className="pill">404</span>
              <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)' }}>
                This page flew off.
              </h1>
              <p className="lede">
                The address does not match anything on Pricebird. Usually that is a typo in the
                URL or a link that pointed at a page we renamed. Here is everything there is:
              </p>
            </div>

            <div className="grid-2" style={{ gap: 14 }}>
              {PLACES.map((place) => (
                <Link key={place.href} href={place.href} className="card card-tight" style={{ display: 'block' }}>
                  <strong>{place.title}</strong>
                  <p className="small dim" style={{ marginTop: 6 }}>{place.body}</p>
                </Link>
              ))}
            </div>

            <div>
              <Link href="/" className="btn btn-primary">Back to the start</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
