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
