/**
 * Reading a secret out of the environment, forgivingly.
 *
 * A key is pasted into a dashboard field by a human, usually from a phone, and
 * two things happen constantly: it arrives wrapped in the quotes it had in a
 * .env file, or with a trailing newline the field kept. Both produce a value
 * that looks correct in the UI and is rejected by the API, and the resulting
 * 401 says nothing about either.
 *
 * Neither is worth an afternoon of debugging, so both are simply handled.
 */
export function readSecret(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;

  let value = raw.trim();
  // A matching pair of surrounding quotes, never a stray one - a quote inside
  // a key would be part of the key.
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    value = value.slice(1, -1).trim();
  }
  return value === '' ? undefined : value;
}

export interface SecretShape {
  present: boolean;
  /** Length after cleaning, so it can be compared with what the provider shows. */
  length: number;
  /** The paste problems, named. Never any part of the value itself. */
  problems: string[];
}

/**
 * Describes a secret without revealing it.
 *
 * Everything here is a property OF the value, never a piece of it: whether it
 * was quoted, whether it carried whitespace, whether it starts the way this
 * provider's keys start, how long it is. That is enough to identify every
 * paste accident and useless to anyone who should not have the key.
 */
export function describeSecret(name: string, expectedPrefix?: string): SecretShape {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return { present: false, length: 0, problems: [`${name} is not set`] };
  }

  const problems: string[] = [];
  if (raw !== raw.trim()) problems.push('has whitespace or a newline around it (now trimmed automatically)');

  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    problems.push('is wrapped in quotes (now stripped automatically)');
  }

  const value = readSecret(name) ?? '';
  if (expectedPrefix && !value.startsWith(expectedPrefix)) {
    problems.push(`does not start with "${expectedPrefix}" - this may be the wrong key, or only part of one`);
  }
  if (value.includes(' ')) problems.push('contains a space inside it, so it was probably truncated on paste');
  if (!isHeaderSafe(value)) {
    problems.push(
      'contains a character that cannot be sent in an HTTP request - usually a line break or a '
      + 'non-breaking space kept by the dashboard field. Delete the value and paste it again',
    );
  }

  return { present: true, length: value.length, problems };
}

/**
 * Every environment variable whose value must never leave the server.
 *
 * Listed in one place because the redaction below is only as good as this
 * list, and a secret added to the app without being added here is a secret
 * that can still reach a customer's screen.
 */
export const SECRET_NAMES = [
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'SESSION_SECRET',
  'DATABASE_URL',
] as const;

/**
 * Removes any configured secret from a piece of text.
 *
 * The last line of defence, and the reason it exists: a Resend key reached a
 * customer's screen because an SDK put the rejected header value into an
 * exception message and the route handed that message to the browser. No
 * amount of care at each individual throw site prevents that - the text comes
 * from someone else's library, and there will be another library. So instead
 * nothing goes out without passing through here.
 *
 * Both the raw and the cleaned form are matched, because a key with a trailing
 * newline is stored one way and sent another.
 */
export function redact(text: string): string {
  let out = text;
  const values = new Set<string>();

  for (const name of SECRET_NAMES) {
    const raw = process.env[name];
    if (raw) {
      values.add(raw);
      values.add(raw.trim());
    }
    const cleaned = readSecret(name);
    if (cleaned) values.add(cleaned);
  }

  // Longest first, so a key is removed before any prefix of it can be.
  for (const value of [...values].sort((a, b) => b.length - a.length)) {
    // Short values are skipped: a six-character secret shares substrings with
    // ordinary English, and redacting those would mangle real error messages
    // while protecting a secret that is too weak to matter anyway.
    if (value.length < 8) continue;
    out = out.split(value).join('[redacted]');
  }
  return out;
}

/**
 * True when a value can be sent as an HTTP header without the runtime
 * refusing it. Anything outside printable ASCII - a newline kept by a
 * dashboard field, a non-breaking space from a phone keyboard - makes
 * fetch throw, and the thrown message quotes the value.
 */
export function isHeaderSafe(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value) && !/\s$/.test(value);
}
