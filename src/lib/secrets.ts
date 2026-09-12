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

  return { present: true, length: value.length, problems };
}
