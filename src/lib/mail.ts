import { isHeaderSafe, readSecret, redact } from '@/lib/secrets';

/**
 * Outbound email: one message, the sign-in code.
 *
 * Resend over fetch rather than a client library - one endpoint does not earn
 * a dependency. When no key is configured the code is written to the server
 * log instead, which is what makes `npm run dev` work on a laptop with no
 * accounts set up anywhere. That fallback refuses to run in production,
 * because a sign-in code printed to a log nobody reads is an account nobody
 * can get into.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * A send that failed, split in two.
 *
 * `message` is what the person signing in is allowed to read; `operator` is
 * the whole truth for the server log. They are separate fields because they
 * were once the same string, and that string contained the API key: fetch
 * refused a header, put the rejected value into the exception, and the route
 * passed it to the browser. Splitting the type makes leaking it require
 * choosing the wrong field rather than forgetting to think about it.
 */
export class MailFailure extends Error {
  readonly operator: string;

  constructor(message: string, operator: string) {
    super(message);
    this.name = 'MailFailure';
    this.operator = redact(operator);
  }
}

export function mailConfigProblems(): string[] {
  const problems: string[] = [];
  const key = readSecret('RESEND_API_KEY');
  if (!key) {
    problems.push('RESEND_API_KEY is not set - sign-in codes cannot be emailed.');
  } else if (!isHeaderSafe(key)) {
    problems.push(
      'RESEND_API_KEY contains a character that cannot be sent in an HTTP header - usually a line '
      + 'break or a non-breaking space picked up on paste. Delete it and paste it again.',
    );
  } else if (key.includes(' ')) {
    // A plain space is legal in a header, so isHeaderSafe cannot object to it,
    // but no Resend key contains one: it means half the key was selected.
    problems.push('RESEND_API_KEY contains a space, so it was probably truncated on paste. Paste it again.');
  }
  if (!readSecret('MAIL_FROM')) problems.push('MAIL_FROM is not set - Resend rejects a send with no verified sender.');
  return problems;
}

export async function sendMail(mail: Mail): Promise<void> {
  // readSecret rather than process.env directly: a key pasted into a hosting
  // dashboard arrives quoted or with a trailing newline often enough that
  // handling it is cheaper than diagnosing it, and a newline here is not a
  // 401 - it is fetch refusing to build the request at all.
  const key = readSecret('RESEND_API_KEY');
  const from = readSecret('MAIL_FROM');

  if (!key || !from) {
    if (process.env.NODE_ENV === 'production') {
      throw new MailFailure(
        'Email is not configured on the server, so the code could not be sent.',
        mailConfigProblems().join(' '),
      );
    }
    console.info(`\n[mail:dev] to=${mail.to}\n[mail:dev] ${mail.subject}\n${mail.text}\n`);
    return;
  }

  const configProblems = mailConfigProblems();
  if (configProblems.length > 0) {
    throw new MailFailure(
      'Email is not configured correctly on the server, so the code could not be sent.',
      configProblems.join(' '),
    );
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
  } catch (error) {
    // Whatever fetch says here is written by somebody else's library and may
    // quote the request - which is why it goes to the log and not the screen.
    throw new MailFailure(
      'The email service could not be reached, so the code could not be sent. Try again in a minute.',
      `fetch to Resend threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);

    // Resend answers 403 for two completely different faults, and saying
    // "credentials" for both sent an afternoon chasing a key that was fine
    // while the real answer - an unverified sending domain - was sitting in
    // the response body all along. Read the body and name the right one.
    const unverified = /not verified|verify.*domain|domain.*verif/i.test(body);
    throw new MailFailure(
      unverified
        ? 'Our sending domain is not verified yet, so the code could not be sent. This is our problem, not yours.'
        : response.status === 401 || response.status === 403
          ? 'The email service rejected our credentials, so the code could not be sent. This is our problem, not yours.'
          : 'The email service refused the message, so the code could not be sent. Try again in a minute.',
      `Resend refused the send (${response.status}): ${body}`,
    );
  }
}

export interface MailVerdict {
  /** Good enough to run a business on: any customer can receive a code. */
  ok: boolean;
  /**
   * Whether a send would actually go through at all.
   *
   * Separate from `ok` because they came apart badly. Resend's shared test
   * address sends perfectly - just only to the account owner - so it is not
   * good enough to launch on and health is right to call it red. But the
   * sign-in page read that red as "sending is broken" and hid the form,
   * locking out the one person it still worked for: the operator, mid-fix.
   *
   * A page that decides whether to offer sign-in must ask this one. Only
   * health asks `ok`.
   */
  canSend: boolean;
  detail: string;
}

/**
 * Asks Resend whether the key actually works.
 *
 * Config checks can only see shape: present, right length, legal characters.
 * All three passed while Resend was rejecting every send, so health reported
 * "configured" about a service that was refusing to work - which is worse
 * than no check at all, because it sends you looking somewhere else.
 *
 * One authenticated GET settles it, and the same response says whether the
 * address in MAIL_FROM belongs to a domain this account has verified. That is
 * the other half: a perfectly valid key still cannot send from a domain
 * somebody forgot to finish setting up.
 */
let cached: { key: string; at: number; verdict: MailVerdict } | null = null;
const CACHE_MS = 30_000;

export function forgetMailVerdict(): void {
  cached = null;
}

export async function verifyMail(timeoutMs = 4000): Promise<MailVerdict> {
  const problems = mailConfigProblems();
  if (problems.length > 0) return { ok: false, canSend: false, detail: problems.join(' ') };

  const key = readSecret('RESEND_API_KEY')!;
  const from = readSecret('MAIL_FROM')!;

  // Health is a public URL, so without this anyone could turn it into a way
  // to hammer Resend with our credentials. Keyed on the key itself, so the
  // answer changes the moment the variable does rather than half a minute
  // later - which matters when somebody is standing at the dashboard fixing
  // exactly this and refreshing to see whether it worked.
  if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return cached.verdict;

  const remember = (verdict: MailVerdict): MailVerdict => {
    cached = { key, at: Date.now(), verdict };
    return verdict;
  };

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Not a failure of configuration, so it must not read like one.
    // Deliberately not remembered: a network blip must not be repeated back
    // for half a minute after it has passed.
    // Unreachable says nothing about whether a send would work; assume it
    // would, because refusing to offer sign-in over a failed status check is
    // a worse error than letting somebody try.
    return { ok: true, canSend: true, detail: 'configured, but Resend could not be reached just now to confirm the key' };
  }

  if (response.status === 401 || response.status === 403) {
    // A key with "Sending access" can send all day and is not allowed to list
    // domains. Asking it to, then reporting the refusal as a rejected key,
    // turned a perfectly working key into "sign-in codes are down" - the
    // check inventing the outage it was built to detect.
    //
    // So a refusal here is inconclusive, not damning. When the body says the
    // key is restricted, that is a healthy key doing what it was scoped to
    // do. When it says anything else it may be genuinely bad, and it is still
    // reported as sendable: only an actual send can settle that, and refusing
    // to let anyone try is the more expensive mistake.
    const body = await response.text().catch(() => '');
    const restricted = /restrict|permission|not allowed|scope|access/i.test(body);
    return remember({
      ok: true,
      canSend: true,
      detail: restricted
        ? 'Resend key present, with sending access only - so the domain cannot be confirmed from '
          + 'here. Check Domains in Resend shows your sending domain as verified.'
        : 'Resend key present, but this key cannot confirm itself from here. If codes are not '
          + 'arriving, check Logs in Resend - a send shows there whether it worked or not.',
    });
  }
  if (!response.ok) {
    return remember({ ok: false, canSend: false, detail: `Resend answered ${response.status} when asked to confirm the key.` });
  }

  // The sender's domain, checked against the ones Resend says are verified.
  const domain = from.includes('@') ? from.split('@').pop()!.replace(/>$/, '').trim().toLowerCase() : '';
  let verified: { name?: string; status?: string }[] = [];
  try {
    const body = await response.json() as { data?: { name?: string; status?: string }[] };
    verified = body.data ?? [];
  } catch {
    return remember({ ok: true, canSend: true, detail: 'Resend accepted the key' });
  }

  // Resend's shared test sender. It works with no DNS at all, which makes it
  // the fastest way to prove the rest of the chain - but it only ever
  // delivers to the address that owns the Resend account, so a customer
  // signing in would silently never receive a code. Green would be a lie.
  if (domain === 'resend.dev') {
    return remember({
      ok: false,
      // It does send - that is the whole reason to reach for it while the
      // real domain is still waiting on DNS. It just does not send to
      // customers, which is why health stays red.
      canSend: true,
      detail: 'MAIL_FROM is Resend\'s shared test address. It does send, but only to your own Resend '
        + 'account address, so no customer can sign in. Verify pricebird.org in Resend and send from it.',
    });
  }

  const match = verified.find((entry) => entry.name?.toLowerCase() === domain);
  if (!match) {
    return remember({
      ok: false,
      canSend: false,
      detail: `Resend accepted the key, but ${domain || 'the MAIL_FROM domain'} is not a domain on this `
        + 'account. Sign-in codes cannot be sent from an address Resend does not own.',
    });
  }
  if (match.status !== 'verified') {
    return remember({
      ok: false,
      canSend: false,
      detail: `Resend accepted the key, but the domain ${domain} is "${match.status}" rather than verified. `
        + 'Finish its DNS records in Resend before any code can be sent.',
    });
  }

  return remember({ ok: true, canSend: true, detail: `Resend accepted the key and ${domain} is verified` });
}
