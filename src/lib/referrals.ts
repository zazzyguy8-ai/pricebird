import { randomInt } from 'node:crypto';

/**
 * Give a month, get a month.
 *
 * The asymmetry is deliberate. A friend who arrives through a link gets their
 * first paid month free, which is a real reason to click. The person who sent
 * it gets a month back only when that friend actually subscribes - a reward
 * for a signup would be a reward for spam, and this product will be shared in
 * reseller groups where that distinction matters.
 *
 * A free user gets listings instead of money, because a credit against an
 * invoice they do not have is nothing. It also means sharing is worth
 * something before you have ever paid, which is when most people share.
 */

export const REFERRAL_COOKIE = 'pb_ref';
export const REFERRAL_COOKIE_DAYS = 30;

/** What the referrer gets when their friend subscribes. */
export const REWARD_CREDIT_CENTS = 700;
export const REWARD_BONUS_LISTINGS = 30;

/** Stripe coupon the friend's first month is discounted with. */
export const REFERRAL_COUPON_ID = 'pricebird_referral_first_month';

/**
 * Codes people read off a screen and type into a phone.
 *
 * No 0/O and no 1/I/L: a code that is mistyped is a referral that silently
 * does not register, and nobody reports that as a bug - they just conclude
 * the scheme does not work.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateReferralCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += ALPHABET[randomInt(0, ALPHABET.length)];
  return code;
}

/** Accepts what a person might paste: spaces, lower case, a whole URL's tail. */
export function normalizeReferralCode(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length >= 4 && cleaned.length <= 12 ? cleaned : null;
}

export function referralLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/$/, '')}/?r=${code}`;
}
