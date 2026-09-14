import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav } from '@/components/chrome';
import { SignInForm } from '@/components/signin-form';
import { verifyMail } from '@/lib/mail';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/**
 * The page says whether it can do its job before you try.
 *
 * A paying customer who cannot sign in is a refund, so the failure this page
 * can have is the most expensive one in the product - and it used to be
 * invisible: the form looked fine, the button worked, and the reason only
 * appeared after you had typed your address and spent one of four attempts.
 * People do not conclude "their email provider is misconfigured". They
 * conclude the product is broken, and they are not wrong to.
 *
 * So the state of the mail service is read here, on the server, before the
 * form is drawn. The answer is cached for thirty seconds, so this costs a
 * request a minute at worst and tells the truth the rest of the time.
 *
 * It asks canSend, never ok. They are different questions and conflating them
 * caused the exact harm this page exists to prevent: a temporary sending
 * address is red for health - no customer can receive a code - but it sends
 * perfectly to the operator, who is the one person mid-fix who needs to get
 * in. Hiding the form on `ok` locked out the only person it still worked for.
 */
export default async function SignInPage() {
  const mail = await verifyMail();

  return (
    <>
      <Nav cta="Start free" />
      <main className="shell" style={{ paddingBlock: 56 }}>
        <div className="stack" style={{ gap: 20, maxWidth: 480 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 30 }}>Sign in</h2>
            <p className="dim">
              No password. Put in your email, get a code. If you have listings in this browser
              already, they come with you.
            </p>
          </div>

          {!mail.canSend ? (
            <div className="card stack" style={{ gap: 12 }}>
              <span className="pill pill-warn">Sign-in codes are down</span>
              <p>
                Our email is not sending right now, so the code would never arrive. This is a fault
                on our side and it is being fixed — nothing is wrong with your account.
              </p>
              <p className="dim small">
                If you are signed in on another device you are still signed in there, and your
                listings and subscription are untouched. If you are paying and stuck, email{' '}
                <a href="mailto:hello@pricebird.org">hello@pricebird.org</a> and we will sort it
                out by hand.
              </p>
              <div className="row">
                <Link href="/app" className="btn btn-ghost">Write a listing without signing in</Link>
              </div>
            </div>
          ) : (
            <>
              <SignInForm />
              {!mail.ok && (
                <p className="note small">
                  Codes are going out from a temporary address while our own domain finishes
                  setting up. If yours does not arrive, that is why — try again shortly.
                </p>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
