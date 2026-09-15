import type { Metadata } from 'next';
import { Footer, Nav } from '@/components/chrome';
import { SignInForm } from '@/components/signin-form';
import { verifyMail } from '@/lib/mail';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/**
 * The form is always here. Always.
 *
 * An earlier version of this page read the mail service and, when it looked
 * unhealthy, replaced the form with an explanation. That was a mistake of a
 * particular kind worth naming, because it is easy to make again: a check
 * that can only ever remove an option is not a safety feature. Trying and
 * failing costs one attempt and produces a real error message. Not being
 * allowed to try costs the account.
 *
 * It removed the option from exactly the person it should have helped - the
 * operator, mid-fix, whose own sign-in still worked - and it did so on the
 * strength of my guess about what the mail service would do, rather than on
 * what it actually did when asked.
 *
 * So the check stays, because saying "codes are not arriving and it is our
 * fault" before somebody waits ten minutes for one is worth a lot. What it no
 * longer does is decide on their behalf.
 */
export default async function SignInPage() {
  const mail = await verifyMail();

  return (
    <>
      <Nav cta="Start free" current="/signin" />
      <main className="shell" style={{ paddingBlock: 56 }}>
        <div className="stack" style={{ gap: 20, maxWidth: 480 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 30 }}>Sign in</h2>
            <p className="dim">
              No password. Put in your email, get a code. If you have listings in this browser
              already, they come with you.
            </p>
          </div>

          {!mail.canSend && (
            <div className="note note-warn stack" style={{ gap: 8 }}>
              <strong>Codes may not be arriving right now.</strong>
              <span className="small">
                Our email provider is refusing to send and we are fixing it. Nothing is wrong with
                your account, and your listings and subscription are untouched. Try anyway — if
                nothing lands in a minute, this is why, and{' '}
                <a href="mailto:hello@pricebird.org">hello@pricebird.org</a> reaches a person.
              </span>
            </div>
          )}

          {mail.canSend && !mail.ok && (
            <p className="note small">
              Codes are going out from a temporary address while our own domain finishes setting
              up. If yours does not arrive, that is why.
            </p>
          )}

          <SignInForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
