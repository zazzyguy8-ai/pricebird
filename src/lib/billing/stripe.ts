import Stripe from 'stripe';
import { getStore, type Account } from '@/lib/db';
import { PRICE_ENV, planFromStatus, type Interval } from './plans';
import { REFERRAL_COUPON_ID, REWARD_BONUS_LISTINGS, REWARD_CREDIT_CENTS } from '@/lib/referrals';
import { redact } from '@/lib/secrets';
import { track } from '@/lib/funnel';

/**
 * Stripe, and the rule that a plan is only ever written from a verified
 * webhook.
 *
 * The shortcut is to mark the account paid when the browser lands on the
 * success URL. That URL is a GET the visitor controls - they can bookmark it,
 * share it, or open it without paying. Checkout completion is a hint; the
 * webhook is the fact. Nothing in this file upgrades an account except
 * handleWebhook(), and that refuses to run on an unverified payload.
 */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function billingConfigProblems(): string[] {
  const problems: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) problems.push('STRIPE_SECRET_KEY is not set - checkout cannot be created.');
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    problems.push(
      'STRIPE_WEBHOOK_SECRET is not set - webhooks cannot be verified, so no payment would ever '
      + 'upgrade an account. Customers would be charged and stay on the free plan.',
    );
  }
  if (!process.env.APP_URL) problems.push('APP_URL is not set - checkout has nowhere to return the customer to.');
  // Monthly is the product; yearly is an option a launch can open without.
  // Blocking the whole checkout because the annual price has not been created
  // yet would stop someone selling on day one for no reason.
  if (!process.env[PRICE_ENV.monthly]) {
    problems.push(`${PRICE_ENV.monthly} is not set - the monthly plan cannot be sold, which is the product.`);
  }
  return problems;
}

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  return new Stripe(key);
}

function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error('APP_URL is not set.');
  return url.replace(/\/$/, '');
}

/**
 * Starts a checkout for one account.
 *
 * The account id travels in client_reference_id and in the subscription's
 * metadata, so the webhook can identify the account from a checkout event or
 * from a later subscription event that has no session attached to it.
 */
export async function createCheckout(account: Account, interval: Interval): Promise<string> {
  const priceId = process.env[PRICE_ENV[interval]];
  if (!priceId) {
    throw new Error(
      interval === 'yearly'
        ? 'The yearly plan is not on sale yet. Create the price in Stripe and set STRIPE_PRICE_YEARLY.'
        : `${PRICE_ENV[interval]} is not set.`,
    );
  }

  const referred = Boolean(account.referred_by && !account.referral_rewarded_at);

  try {
    return await openCheckout(account, priceId, referred);
  } catch (error) {
    // A coupon that was deleted, expired, or never created must not stand
    // between somebody and paying us. Losing the discount is a support
    // conversation; losing the sale is not recoverable, and the person who
    // sees the failure has no idea a coupon was involved.
    if (referred && isCouponProblem(error)) {
      console.error(`[stripe] referral coupon unusable, selling without it: ${describe(error)}`);
      return openCheckout(account, priceId, false);
    }
    throw error;
  }
}

function describe(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error));
}

/** Stripe reports a bad coupon as a resource problem on the discounts field
 *  rather than with a dedicated code, so the check is deliberately broad -
 *  the fallback is harmless either way. */
function isCouponProblem(error: unknown): boolean {
  const message = describe(error).toLowerCase();
  return message.includes('coupon') || message.includes('discount');
}

/**
 * The parameters for one checkout session, built as a value so they can be
 * tested without a Stripe key.
 *
 * This exists because of the bug it now prevents. The session carried
 * `customer_creation: 'always'`, which is only legal in `payment` mode -
 * subscriptions always create a customer, so Stripe rejects the parameter
 * outright. Nothing caught it: the code type-checked, the build passed, and
 * the failure appeared on the pricing page of a live site as
 * "`customer_creation` can only be used in `payment` mode."
 *
 * A wrong combination of valid fields is invisible to TypeScript. Pulling the
 * object out of the API call is what makes those combinations assertable.
 */
export function checkoutParams(
  account: Account,
  priceId: string,
  withReferral: boolean,
  baseUrl: string,
): Stripe.Checkout.SessionCreateParams {
  const root = baseUrl.replace(/\/$/, '');

  return {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: account.id,

    // A known customer is reused so the subscription lands on the same Stripe
    // record; otherwise Stripe collects the address itself. In subscription
    // mode a customer is always created, so there is nothing to ask for.
    ...(account.stripe_customer_id
      ? { customer: account.stripe_customer_id }
      : account.email
        ? { customer_email: account.email }
        : {}),

    // The account id travels on the subscription too, so a later
    // subscription event that carries no session can still be attributed.
    subscription_data: { metadata: { account_id: account.id } },

    // A referred friend's first month is free. Stripe rejects a session that
    // carries both a discount and the promotion-code box, so it is one or the
    // other - and an automatic discount beats asking someone to find a code.
    ...(withReferral
      ? { discounts: [{ coupon: REFERRAL_COUPON_ID }] }
      : { allow_promotion_codes: true }),

    success_url: `${root}/app?welcome=1`,
    cancel_url: `${root}/pricing?cancelled=1`,
  };
}

async function openCheckout(account: Account, priceId: string, withReferral: boolean): Promise<string> {
  const session = await client().checkout.sessions.create(
    checkoutParams(account, priceId, withReferral, appUrl()),
  );

  if (!session.url) throw new Error('Stripe created a checkout session with no URL.');

  // Reaching Stripe is the step before paying, and the gap between this
  // number and the next one is the only way to see a checkout that people
  // start and abandon.
  track('checkout-open', withReferral ? 'with a referral' : undefined);
  return session.url;
}

/** Cancel, change card, download invoices - all Stripe's problem, not ours. */
export async function portalUrl(account: Account): Promise<string> {
  if (!account.stripe_customer_id) throw new Error('This account has never been through checkout.');
  const session = await client().billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: `${appUrl()}/account`,
  });
  return session.url;
}

/** Subscription fields Stripe sends under names that have changed over API
 *  versions; read defensively rather than pinned to one shape. */
function periodEnd(subscription: Stripe.Subscription): string | null {
  const raw = (subscription as unknown as { current_period_end?: number }).current_period_end
    ?? subscription.items?.data?.[0]?.current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000).toISOString() : null;
}

async function applySubscription(subscription: Stripe.Subscription): Promise<string> {
  const store = await getStore();
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const accountId = subscription.metadata?.account_id ?? null;

  const account = (accountId ? await store.getAccount(accountId) : null)
    ?? await store.findAccountByCustomer(customerId);

  if (!account) {
    // Loud, not silent: a paying customer with no account row is a support
    // ticket waiting to happen, and the log line is what makes it findable.
    return `no account for customer ${customerId} (subscription ${subscription.id}) - nothing updated`;
  }

  const plan = planFromStatus(subscription.status);
  await store.updateBilling(account.id, {
    plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    current_period_end: periodEnd(subscription),
  });

  const reward = plan === 'pro' ? await payReferrer(account.id) : null;
  return `account ${account.id} -> ${plan} (${subscription.status})${reward ? `; ${reward}` : ''}`;
}

/**
 * Pays the person whose link brought this subscriber.
 *
 * Only ever on a subscription that reached `pro`, and only once - the reward
 * is for a paying customer, not for a signup, because a signup reward is a
 * spam reward and this will be shared in reseller groups.
 *
 * A paying referrer gets money off their next invoice through Stripe's own
 * customer balance, which needs no coupon and survives a plan change. A
 * referrer who has never paid gets listings, because a credit against an
 * invoice they do not have is nothing at all.
 */
async function payReferrer(subscriberId: string): Promise<string | null> {
  const store = await getStore();
  const subscriber = await store.getAccount(subscriberId);
  if (!subscriber?.referred_by || subscriber.referral_rewarded_at) return null;

  // Self-referral: the cookie can be set from your own link in your own
  // browser, and the account merge on sign-in can make that look legitimate.
  if (subscriber.referred_by === subscriber.id) {
    await store.markReferralRewarded(subscriber.id);
    return 'self-referral ignored';
  }

  const referrer = await store.getAccount(subscriber.referred_by);
  if (!referrer) {
    await store.markReferralRewarded(subscriber.id);
    return 'referrer no longer exists';
  }

  // Marked before the payout, not after: Stripe retries webhooks, and paying
  // the same referrer twice for one friend is the failure that costs money.
  await store.markReferralRewarded(subscriber.id);

  if (referrer.stripe_customer_id) {
    try {
      await client().customers.createBalanceTransaction(referrer.stripe_customer_id, {
        amount: -REWARD_CREDIT_CENTS,
        currency: 'usd',
        description: `Referral reward - ${subscriber.email ?? subscriber.id} subscribed`,
      });
      return `credited referrer ${referrer.id}`;
    } catch (error) {
      // Never fail the webhook over a reward: the subscription itself is
      // already recorded, and a lost credit is a support email, not a
      // customer who paid and got nothing.
      return `referrer credit failed: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  }

  await store.addBonusListings(referrer.id, REWARD_BONUS_LISTINGS);
  return `gave referrer ${referrer.id} ${REWARD_BONUS_LISTINGS} listings`;
}

/**
 * Verifies and applies one webhook.
 *
 * Every branch here is idempotent: Stripe retries, and it delivers events out
 * of order often enough that "created then updated" arriving backwards is a
 * normal Tuesday. Each event writes the full state it carries rather than a
 * delta, so a replay lands on the same row values.
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<string> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set - the payload cannot be verified.');
  if (!signature) throw new Error('No stripe-signature header; refusing to trust the payload.');

  const stripe = client();
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  switch (event.type) {
    case 'checkout.session.completed': {
      track('subscribed');
      const session = event.data.object;
      const accountId = session.client_reference_id;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
      const email = session.customer_details?.email ?? null;

      if (accountId && customerId) {
        const store = await getStore();
        const account = await store.getAccount(accountId);
        if (account) {
          await store.updateBilling(account.id, { stripe_customer_id: customerId });
          // The email is how this account is recovered on another device, so
          // it is attached here rather than waiting for a sign-in - unless it
          // already belongs to an older account, which keeps it.
          if (email && !account.email) {
            const owner = await store.findAccountByEmail(email);
            if (!owner) await store.attachEmail(account.id, email);
          }
        }
      }

      if (typeof session.subscription === 'string') {
        return applySubscription(await stripe.subscriptions.retrieve(session.subscription));
      }
      return `checkout completed for ${accountId ?? 'unknown account'}`;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return applySubscription(event.data.object);

    default:
      return `ignored ${event.type}`;
  }
}
