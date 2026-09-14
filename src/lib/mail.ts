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
    throw new MailFailure(
      response.status === 401 || response.status === 403
        ? 'The email service rejected our credentials, so the code could not be sent. This is our problem, not yours.'
        : 'The email service refused the message, so the code could not be sent. Try again in a minute.',
      `Resend refused the send (${response.status}): ${body}`,
    );
  }
}

export interface MailVerdict {
  ok: boolean;
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
  if (problems.length > 0) return { ok: false, detail: problems.join(' ') };

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
    return { ok: true, detail: 'configured, but Resend could not be reached just now to confirm the key' };
  }

  if (response.status === 401 || response.status === 403) {
    return remember({
      ok: false,
      detail: 'Resend rejected the key. It was deleted, it was pasted incompletely, or it belongs to '
        + 'a different Resend account. Create a new key with sending access and paste it again.',
    });
  }
  if (!response.ok) {
    return remember({ ok: false, detail: `Resend answered ${response.status} when asked to confirm the key.` });
  }

  // The sender's domain, checked against the ones Resend says are verified.
  const domain = from.includes('@') ? from.split('@').pop()!.replace(/>$/, '').trim().toLowerCase() : '';
  let verified: { name?: string; status?: string }[] = [];
  try {
    const body = await response.json() as { data?: { name?: string; status?: string }[] };
    verified = body.data ?? [];
  } catch {
    return remember({ ok: true, detail: 'Resend accepted the key' });
  }

  const match = verified.find((entry) => entry.name?.toLowerCase() === domain);
  if (!match) {
    return remember({
      ok: false,
      detail: `Resend accepted the key, but ${domain || 'the MAIL_FROM domain'} is not a domain on this `
        + 'account. Sign-in codes cannot be sent from an address Resend does not own.',
    });
  }
  if (match.status !== 'verified') {
    return remember({
      ok: false,
      detail: `Resend accepted the key, but the domain ${domain} is "${match.status}" rather than verified. `
        + 'Finish its DNS records in Resend before any code can be sent.',
    });
  }

  return remember({ ok: true, detail: `Resend accepted the key and ${domain} is verified` });
}
