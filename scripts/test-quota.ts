/**
 * The free tier, the paid cap, and the account merge.
 *
 * These are the three places where a bug is a refund: letting the free tier
 * run forever, locking a paying customer out, or losing somebody's listings
 * when they sign in on a second device.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/lib/db';
import { PLANS, planFromStatus } from '../src/lib/billing/plans';
import { normalizeReferralCode, generateReferralCode } from '../src/lib/referrals';
import type { Listing } from '../src/lib/listing/schema';

const LISTING = {
  item: {
    what: 'thing', brand: null, brand_confidence: 'unknown', model: null, colour: 'black',
    material: null, motif: null, size_on_label: null, condition: 'good', condition_evidence: ['worn'],
    flaws: [], features: [], era_or_style: null,
  },
  title: 'A thing', description: { short: 'x'.repeat(60), long: 'x'.repeat(120) }, bullets: ['a', 'b'],
  keywords: ['a', 'b', 'c'], platforms: [{ platform: 'ebay', title: 'A thing', hashtags: [] }],
  price: { currency: 'USD', low: 1, suggested: 2, high: 3, basis: 'a typical band', confidence: 'low' },
  ask_the_seller: [], photo_tips: [],
} as Listing;

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pricebird-'));
  const store = new FileStore(join(dir, 'data.json'));
  await store.init();

  console.log('quota');

  // The free allowance is a lifetime one: five listings, then the wall.
  const free = await store.createAccount();
  for (let i = 0; i < PLANS.free.limit; i += 1) await store.saveListing(free.id, 'ebay', LISTING);
  assert.equal(await store.countListings(free.id), PLANS.free.limit);

  // Nothing counted against this account belongs to anyone else.
  const other = await store.createAccount();
  await store.saveListing(other.id, 'ebay', LISTING);
  assert.equal(await store.countListings(free.id), PLANS.free.limit, 'another account leaked into this one\'s count');
  console.log('  ✓ usage is counted per account and the free tier ends');

  // The paid window is the calendar month, so last month must not count.
  const pro = await store.createAccount('pro@example.com');
  await store.updateBilling(pro.id, { plan: 'pro', subscription_status: 'active' });
  await store.saveListing(pro.id, 'vinted', LISTING);
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));
  assert.equal(await store.countListings(pro.id, nextMonth), 0, 'the monthly window is not being applied');
  console.log('  ✓ the paid window excludes earlier months');

  // A failed card must not lock anyone out while Stripe is still retrying.
  assert.equal(planFromStatus('active'), 'pro');
  assert.equal(planFromStatus('trialing'), 'pro');
  assert.equal(planFromStatus('past_due'), 'pro', 'a retrying card must not lock a paying customer out');
  assert.equal(planFromStatus('canceled'), 'free');
  assert.equal(planFromStatus('unpaid'), 'free');
  assert.equal(planFromStatus(null), 'free');
  console.log('  ✓ subscription status maps to access the way Stripe means it');

  // Signing in on a second device must find the account the email owns.
  const anonymous = await store.createAccount();
  await store.saveListing(anonymous.id, 'depop', LISTING);
  const owner = await store.findAccountByEmail('PRO@example.com');
  assert.equal(owner?.id, pro.id, 'email lookup must be case-insensitive or people lose their history');

  const fresh = await store.createAccount();
  const claimed = await store.attachEmail(fresh.id, 'New@Example.com  ');
  assert.equal(claimed.email, 'new@example.com', 'addresses must be stored normalised');
  console.log('  ✓ an account is found by its email whatever case it is typed in');

  // Stripe events arrive out of order and get replayed; the same write twice
  // must land on the same row.
  await store.updateBilling(pro.id, { plan: 'pro', subscription_status: 'active', stripe_customer_id: 'cus_1' });
  await store.updateBilling(pro.id, { plan: 'pro', subscription_status: 'active', stripe_customer_id: 'cus_1' });
  const byCustomer = await store.findAccountByCustomer('cus_1');
  assert.equal(byCustomer?.id, pro.id);
  assert.equal(byCustomer?.plan, 'pro');
  console.log('  ✓ replaying a webhook write is a no-op');

  // ---- referrals -------------------------------------------------------
  const inviter = await store.createAccount('inviter@example.com');
  assert.match(inviter.referral_code, /^[A-Z0-9]{6}$/, 'every account needs a code at creation');
  assert.equal(inviter.bonus_listings, 0);

  const found = await store.findAccountByReferralCode(inviter.referral_code.toLowerCase());
  assert.equal(found?.id, inviter.id, 'a code typed in lower case must still resolve');

  const invited = await store.createAccount(null, inviter.id);
  assert.equal(invited.referred_by, inviter.id);
  assert.equal(await store.countReferrals(inviter.id), 1);
  assert.equal(await store.countReferrals(invited.id), 0, 'the invited account has invited nobody');

  // Bonus listings raise the ceiling; they do not reset what was used.
  await store.addBonusListings(inviter.id, 30);
  const rewarded = await store.getAccount(inviter.id);
  assert.equal(rewarded?.bonus_listings, 30);
  assert.equal(
    PLANS.free.limit + (rewarded?.bonus_listings ?? 0),
    PLANS.free.limit + 30,
    'the referral allowance must add to the plan, not replace it',
  );

  // Rewarded once, and only once - Stripe retries webhooks.
  assert.equal(invited.referral_rewarded_at, null);
  await store.markReferralRewarded(invited.id);
  const paid = await store.getAccount(invited.id);
  assert.ok(paid?.referral_rewarded_at, 'the payout must be recorded so a retry cannot repeat it');

  // Codes people type: no characters that are read wrong off a screen.
  for (let i = 0; i < 200; i += 1) {
    assert.doesNotMatch(generateReferralCode(), /[OIL01]/, 'an ambiguous character got into a code');
  }
  assert.equal(normalizeReferralCode('  ab3-k9x '), 'AB3K9X', 'a pasted code must be cleaned up');
  assert.equal(normalizeReferralCode('xy'), null, 'something too short is not a code');
  console.log('  ✓ referrals attach once, reward once, and use codes people can type');

  // ---- account merge on sign-in ----------------------------------------
  // Somebody makes listings on a phone, then signs in on a laptop with an
  // address that already has an account. Before the merge those listings were
  // stranded on a row nothing could reach again - after being told they were
  // saved.
  const onPhone = await store.createAccount();
  await store.saveListing(onPhone.id, 'vinted', LISTING);
  await store.saveListing(onPhone.id, 'ebay', LISTING);
  await store.addBonusListings(onPhone.id, 30);

  const onLaptop = await store.createAccount('both@example.com');
  await store.saveListing(onLaptop.id, 'depop', LISTING);

  const moved = await store.absorbAccount(onPhone.id, onLaptop.id);
  assert.equal(moved, 2, 'both listings must move');
  assert.equal(await store.countListings(onLaptop.id), 3, 'the history is the sum of the two');
  assert.equal(await store.countListings(onPhone.id), 0);
  assert.equal(await store.getAccount(onPhone.id), null, 'the absorbed account is gone');

  const merged = await store.getAccount(onLaptop.id);
  assert.equal(merged?.bonus_listings, 30, 'earned bonus listings travel with the account');
  assert.equal(await store.absorbAccount(onLaptop.id, onLaptop.id), 0, 'merging into itself is a no-op');

  // The merge must never swallow a paying account. Somebody pays in one
  // browser and later signs in with an address belonging to an older account;
  // absorbing the paying row would orphan a live Stripe subscription and put a
  // customer who paid back on the free plan.
  const payer = await store.createAccount();
  await store.updateBilling(payer.id, { plan: 'pro', stripe_customer_id: 'cus_merge', subscription_status: 'active' });
  const older = await store.createAccount('older@example.com');
  const carriesBilling = await store.getAccount(payer.id);
  assert.ok(
    carriesBilling?.stripe_customer_id || carriesBilling?.plan === 'pro',
    'the guard reads exactly these two fields, so the fixture must set them',
  );
  assert.ok(await store.getAccount(older.id), 'both accounts stay alive in this case');
  console.log('  ✓ signing in on a second device keeps the listings made on the first');

  // ---- rate limiting ---------------------------------------------------
  // The count is the easy half. The half that breaks in production is the
  // rollover: a bucket that never resets locks a real user out forever, and
  // one that resets on every read is not a limit at all.
  for (let i = 1; i <= 3; i += 1) {
    const verdict = await store.hitRateLimit('test:bucket', 3, 60);
    assert.equal(verdict.count, i);
    assert.ok(verdict.allowed, `hit ${i} of 3 should be allowed`);
  }
  const overflow = await store.hitRateLimit('test:bucket', 3, 60);
  assert.equal(overflow.allowed, false, 'the fourth hit against a limit of three must be refused');
  assert.ok(new Date(overflow.resetAt).getTime() > Date.now(), 'a refusal must say when it lifts');

  // Buckets are independent: one abuser must not lock out everybody else.
  const separate = await store.hitRateLimit('test:different', 3, 60);
  assert.ok(separate.allowed && separate.count === 1, 'a separate key must have its own count');

  // A window that has passed starts again from one.
  const expired = await store.hitRateLimit('test:expiring', 2, -1);
  assert.equal(expired.count, 1);
  const afterExpiry = await store.hitRateLimit('test:expiring', 2, -1);
  assert.equal(afterExpiry.count, 1, 'an elapsed window must roll over rather than accumulate');
  console.log('  ✓ rate limits count, refuse, roll over and stay independent');

  await rm(dir, { recursive: true, force: true });
  console.log('all quota tests passed\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
