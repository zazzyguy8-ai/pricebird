import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav } from '@/components/chrome';
import { PortalButton, UpgradeButton } from '@/components/upgrade-button';
import { SignOutButton } from '@/components/sign-out';
import { currentAccount } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { PLATFORM_SPECS } from '@/lib/listing/platforms';
import { quotaFor } from '@/lib/quota';
import { ReferralCard } from '@/components/referral-card';
import { HouseStyle } from '@/components/house-style';
import { readProfile } from '@/lib/listing/profile';
import { verifyMail } from '@/lib/mail';
import { referralLink } from '@/lib/referrals';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Your plan, your house style and the listings you have made.',
};
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const account = await currentAccount();

  if (!account) {
    return (
      <>
        <Nav />
        <main className="shell" style={{ paddingBlock: 56 }}>
          <div className="card stack" style={{ gap: 14, maxWidth: 460 }}>
            <h1 style={{ fontSize: 24 }}>No account in this browser yet</h1>
            <p className="dim small">
              One appears the first time you write a listing. If you already have one on another
              device, sign in with the email on it.
            </p>
            <div className="row">
              <Link href="/app" className="btn btn-primary">Write a listing</Link>
              <Link href="/signin" className="btn btn-ghost">Sign in</Link>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const quota = await quotaFor(account);
  const store = await getStore();
  const recent = await store.recentListings(account.id, 12);
  const invited = await store.countReferrals(account.id);
  const appUrl = process.env.APP_URL ?? 'https://pricebird.org';

  // Whether this person could actually get back in, asked before they are
  // offered the button that puts them out. Two ways to be locked out and they
  // need different sentences: no email on the account is permanent and theirs
  // to fix; a mail service that is not sending is temporary and ours.
  const mail = await verifyMail();
  const signOutWarning = !account.email
    ? 'There is no email on this account, so there is no way to sign back in. Everything - your '
      + `listings${account.plan === 'pro' ? ' and your Pro subscription' : ''} - lives in this browser only. `
      + 'Attach an email first and this becomes safe.'
    : !mail.canSend
      ? 'Sign-in codes are not sending right now, so you would not be able to get back in until '
        + 'that is fixed. Nothing is wrong with your account - wait, or sign out from a device you '
        + 'do not need.'
      : null;

  return (
    <>
      <Nav cta="Write a listing" current="/account" />
      <main className="shell" style={{ paddingBlock: 40 }}>
        <div className="stack" style={{ gap: 22 }}>
          <div className="spread">
            <h1 style={{ fontSize: 28 }}>Account</h1>
            <SignOutButton warning={signOutWarning} />
          </div>

          <div className="grid-2">
            <div className="card stack" style={{ gap: 12 }}>
              <div className="spread">
                <span className="out-label">Plan</span>
                <span className={`pill${account.plan === 'pro' ? ' pill-accent' : ''}`}>
                  {account.plan === 'pro' ? 'Pro' : 'Free'}
                </span>
              </div>
              <p className="dim small">
                {account.plan === 'pro'
                  ? `${quota.used} listings this month.${account.current_period_end ? ` Renews ${new Date(account.current_period_end).toLocaleDateString()}.` : ''}`
                  : `${quota.remaining} of ${quota.limit} free listings left.`}
              </p>
              {account.subscription_status === 'past_due' && (
                <p className="note note-warn small">
                  Your last payment failed and Stripe is retrying. Nothing is locked yet — update
                  the card in the billing portal before the retries run out.
                </p>
              )}
              {account.plan === 'pro'
                ? <PortalButton />
                : <UpgradeButton interval="monthly">Go Pro — $7/month</UpgradeButton>}
            </div>

            <div className="card stack" style={{ gap: 12 }}>
              <span className="out-label">Email</span>
              {account.email
                ? <p style={{ fontSize: 16 }}>{account.email}</p>
                : (
                  <>
                    <p className="dim small">
                      No email on this account. Everything lives in this browser — clear your
                      cookies and it is gone.
                    </p>
                    <Link href="/signin" className="btn btn-ghost">Attach an email</Link>
                  </>
                )}
            </div>
          </div>

          <ReferralCard
            link={referralLink(appUrl, account.referral_code)}
            code={account.referral_code}
            invited={invited}
            bonus={account.bonus_listings}
          />

          <div className="stack" style={{ gap: 12 }}>
            <span className="eyebrow">Recent listings</span>
            {recent.length === 0
              ? <p className="dim small">Nothing yet. <Link href="/app" className="accent">Write one.</Link></p>
              : (
                <div className="stack" style={{ gap: 8 }}>
                  {recent.map((row) => (
                    <div key={row.id} className="card card-tight spread">
                      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{row.listing.title}</span>
                        <span className="small faint">
                          {PLATFORM_SPECS[row.platform]?.label ?? row.platform} ·{' '}
                          {row.listing.price.currency} {row.listing.price.suggested} ·{' '}
                          {new Date(row.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <HouseStyle initial={readProfile(account.seller_profile)} />
        </div>
      </main>
      <Footer />
    </>
  );
}
