/**
 * The checkout session, asserted without a Stripe key.
 *
 * Written after a live failure: the session carried `customer_creation`,
 * which is only legal in `payment` mode, and Stripe refused every checkout on
 * the pricing page of a running site. TypeScript could not see it - every
 * field was valid on its own, and it was the combination that was illegal.
 *
 * So the rules below are Stripe's documented constraints, encoded. They are
 * cheap to run and they are the only thing standing between a wrong parameter
 * and a pricing page that cannot sell.
 */
import assert from 'node:assert/strict';
import { checkoutParams } from '../src/lib/billing/stripe';
import { REFERRAL_COUPON_ID } from '../src/lib/referrals';
import type { Account } from '../src/lib/db';

const BASE: Account = {
  id: 'acc_1',
  email: null,
  plan: 'free',
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: null,
  current_period_end: null,
  created_at: new Date().toISOString(),
  referral_code: 'AB3K9X',
  referred_by: null,
  referral_rewarded_at: null,
  bonus_listings: 0,
  seller_profile: null,
};

const URL = 'https://pricebird.org';

function subscriptionModeRules(): void {
  const params = checkoutParams(BASE, 'price_123', false, URL) as Record<string, unknown>;

  assert.equal(params.mode, 'subscription');

  // The bug this file exists for. Stripe: "`customer_creation` can only be
  // used in `payment` mode." A subscription always creates a customer.
  assert.ok(
    !('customer_creation' in params),
    'customer_creation is illegal in subscription mode and breaks every checkout',
  );

  // Same class: these two are documented as mutually exclusive.
  assert.ok(
    !(params.discounts && params.allow_promotion_codes),
    'a session may carry a discount or the promotion-code box, never both',
  );

  assert.equal(params.client_reference_id, BASE.id, 'the webhook identifies the account by this');
  console.log('  ✓ the session obeys the rules of subscription mode');
}

function identity(): void {
  // A returning customer is reused rather than duplicated.
  const known = checkoutParams(
    { ...BASE, stripe_customer_id: 'cus_9' }, 'price_123', false, URL,
  ) as Record<string, unknown>;
  assert.equal(known.customer, 'cus_9');
  assert.ok(!('customer_email' in known), 'a known customer must not also be given an email');

  // Somebody who has an email but no Stripe record yet.
  const byEmail = checkoutParams(
    { ...BASE, email: 'a@b.com' }, 'price_123', false, URL,
  ) as Record<string, unknown>;
  assert.equal(byEmail.customer_email, 'a@b.com');
  assert.ok(!('customer' in byEmail));

  // And the common case: no email at all, because the free tier needs none.
  const anonymous = checkoutParams(BASE, 'price_123', false, URL) as Record<string, unknown>;
  assert.ok(!('customer' in anonymous) && !('customer_email' in anonymous),
    'an anonymous account must let Stripe collect the address');

  // The account id must also ride on the subscription: a later subscription
  // event carries no session, and without this it cannot be attributed.
  const meta = (anonymous.subscription_data as { metadata: Record<string, string> }).metadata;
  assert.equal(meta.account_id, BASE.id);
  console.log('  ✓ the customer is identified without ever being duplicated');
}

function referral(): void {
  const referred = checkoutParams(BASE, 'price_123', true, URL) as Record<string, unknown>;
  assert.deepEqual(referred.discounts, [{ coupon: REFERRAL_COUPON_ID }]);
  assert.ok(!('allow_promotion_codes' in referred), 'the promo box must drop out when a coupon applies');

  const normal = checkoutParams(BASE, 'price_123', false, URL) as Record<string, unknown>;
  assert.equal(normal.allow_promotion_codes, true);
  assert.ok(!('discounts' in normal));
  console.log('  ✓ the referral discount and the promo box never appear together');
}

function returnUrls(): void {
  for (const base of [URL, `${URL}/`]) {
    const params = checkoutParams(BASE, 'price_123', false, base) as Record<string, string>;
    // A trailing slash in APP_URL is the classic way to end up with a double
    // slash that some browsers and every analytics tool treat as another page.
    assert.equal(params.success_url, 'https://pricebird.org/app?welcome=1');
    assert.equal(params.cancel_url, 'https://pricebird.org/pricing?cancelled=1');
  }

  // Stripe requires absolute URLs, and a relative one fails at session
  // creation - which is to say, on the pricing page.
  const params = checkoutParams(BASE, 'price_123', false, URL) as Record<string, string>;
  assert.ok(params.success_url.startsWith('https://'), 'the return URL must be absolute');
  console.log('  ✓ the return URLs are absolute and survive a trailing slash');
}

console.log('billing');
subscriptionModeRules();
identity();
referral();
returnUrls();
console.log('all billing tests passed\n');
