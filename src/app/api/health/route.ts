import { NextResponse } from 'next/server';
import { billingConfigProblems } from '@/lib/billing/stripe';
import { mailConfigProblems } from '@/lib/mail';
import { getStore } from '@/lib/db';
import { describeSecret } from '@/lib/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is the deployed instance actually wired up?
 *
 * This exists because the failure it catches is invisible: a site that loads,
 * looks finished, takes a payment, and never upgrades the account because the
 * webhook secret was not copied across. Opening one URL is a check you will
 * actually do; running a script against production env vars is one you will
 * not.
 *
 * It reports the NAMES of missing settings and never their values, so it is
 * safe to leave open. Knowing that STRIPE_WEBHOOK_SECRET is unset tells an
 * attacker nothing they could not learn by paying and watching what happens.
 */
export async function GET(request: Request) {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  // The shape of the key, never the key: a rejected key is almost always a
  // paste accident, and "present" alone cannot tell that story.
  const claude = describeSecret('ANTHROPIC_API_KEY', 'sk-ant-');
  checks.push({
    name: 'listings',
    ok: claude.present && claude.problems.length === 0,
    detail: claude.present
      ? claude.problems.length === 0
        ? `Claude key present and well formed (${claude.length} characters)`
        : `Claude key is ${claude.length} characters and ${claude.problems.join('; ')}`
      : 'ANTHROPIC_API_KEY is not set',
  });

  // APP_URL against the address this request actually arrived on.
  //
  // A typo here is invisible everywhere else: the app serves fine, the webhook
  // does not use it, and the only symptom is that a customer who has just paid
  // is returned to a domain that does not exist. That happened with
  // "pricebird.orgr" - one stray letter, after a real card was charged. The
  // request knows the true host, so the mismatch is detectable rather than
  // something to notice by losing a customer.
  const configured = (process.env.APP_URL ?? '').trim();
  const servedHost = request.headers.get('host');
  let appUrlDetail = 'APP_URL is not set - checkout has nowhere to return the customer to';
  let appUrlOk = false;

  if (configured) {
    try {
      const configuredHost = new URL(configured).host;
      if (!servedHost) {
        appUrlOk = true;
        appUrlDetail = `${configured} (no host header to compare against)`;
      } else if (configuredHost === servedHost) {
        appUrlOk = true;
        appUrlDetail = configured;
      } else {
        appUrlDetail = `APP_URL is ${configured}, but this page was served from ${servedHost}. `
          + 'After paying, customers are sent to the APP_URL one - check it for a typo.';
      }
    } catch {
      appUrlDetail = `APP_URL is "${configured}", which is not a valid URL`;
    }
  }

  checks.push({ name: 'return address', ok: appUrlOk, detail: appUrlDetail });

  checks.push({
    name: 'sessions',
    ok: (process.env.SESSION_SECRET ?? '').length >= 32,
    detail: (process.env.SESSION_SECRET ?? '').length >= 32
      ? 'session secret present'
      : 'SESSION_SECRET is missing or under 32 characters',
  });

  const billing = billingConfigProblems();
  checks.push({
    name: 'billing',
    ok: billing.length === 0,
    detail: billing.length === 0 ? 'Stripe configured' : billing.join(' '),
  });

  const mail = mailConfigProblems();
  checks.push({
    name: 'email',
    ok: mail.length === 0,
    detail: mail.length === 0 ? 'Resend configured' : mail.join(' '),
  });

  if (!process.env.DATABASE_URL) {
    checks.push({
      name: 'database',
      ok: false,
      detail: 'DATABASE_URL is not set - accounts are written to a file and will not survive a restart',
    });
  } else {
    try {
      const store = await getStore();
      const missing = await store.missingTables();
      checks.push(missing.length === 0
        ? { name: 'database', ok: true, detail: 'connected, schema up to date' }
        : {
          name: 'database',
          ok: false,
          detail: `connected, but the schema is behind the code - missing ${missing.join(', ')}. `
            + 'Apply db/schema.sql again; it is idempotent and safe on live data.',
        });
    } catch (error) {
      checks.push({
        name: 'database',
        ok: false,
        detail: `could not connect: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  }

  const ok = checks.every((check) => check.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
