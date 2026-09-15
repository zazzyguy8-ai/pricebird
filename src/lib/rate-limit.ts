import { getStore } from '@/lib/db';

/**
 * Abuse control, and the specific hole it closes.
 *
 * A free account is a signed cookie, which is exactly right for the product -
 * nobody should have to sign up to try it - and exactly wrong as a spending
 * limit. Clearing cookies buys another five listings, and every listing is
 * about two cents of somebody else's money. That does not matter with ten
 * visitors and matters a great deal with ten thousand arriving from a video.
 *
 * So the free tier is bounded twice: per account, which is the product rule,
 * and per address, which is the money rule. Paying customers skip the second
 * one entirely - they have a card on file, which is a far better identity
 * than an IP, and a shared office or a phone network must never make a
 * customer look like an abuser.
 */

export const LIMITS = {
  /** Anonymous listings from one address per day. Generous for a real
   *  person - the whole free tier is five - and cheap to hit for a script. */
  anonymousListings: { limit: 25, windowSeconds: 60 * 60 * 24 },
  /** Sign-in codes to one address per hour: enough for a person who mistypes
   *  their email twice, not enough to use us as a mail bomb. */
  codesPerEmail: { limit: 4, windowSeconds: 60 * 60 },
  /** And per IP, which is what stops the same abuse spread over addresses. */
  codesPerIp: { limit: 12, windowSeconds: 60 * 60 },
  /**
   * Guesses at a code, per address.
   *
   * The stored record already locks after five wrong attempts, which bounds
   * brute force against any one code. What it does not bound is the traffic:
   * without this, /api/auth/verify will read the database for every guess
   * from anywhere, for any address, forever. That is not a way into an
   * account - it is a way to spend the database on somebody's script.
   *
   * Thirty an hour is far above a person mistyping a six-digit code and far
   * below anything automated.
   */
  codeGuessesPerIp: { limit: 30, windowSeconds: 60 * 60 },
} as const;

/**
 * The client address, as far as it can be known.
 *
 * Render terminates TLS and sets x-forwarded-for, whose first entry is the
 * client. The header is forgeable by anyone talking to the origin directly,
 * so this is a cost control and not a security boundary - which is all it is
 * being asked to be.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export interface LimitCheck {
  ok: boolean;
  /** Seconds until the bucket rolls over, for a Retry-After header. */
  retryAfter: number;
  message: string;
}

export async function checkLimit(
  bucket: keyof typeof LIMITS,
  identity: string,
  humanMessage: string,
): Promise<LimitCheck> {
  const { limit, windowSeconds } = LIMITS[bucket];
  const store = await getStore();
  const verdict = await store.hitRateLimit(`${bucket}:${identity}`, limit, windowSeconds);

  const retryAfter = Math.max(1, Math.ceil((new Date(verdict.resetAt).getTime() - Date.now()) / 1000));
  return { ok: verdict.allowed, retryAfter, message: humanMessage };
}

/**
 * Undoes one counted hit.
 *
 * The limiter has to count before the work, because counting after it is a
 * race. But a request that was counted and then failed for a reason that is
 * ours - a rejected sender, a database that blinked - must not spend the
 * person's budget. So the hit is returned, and the limit keeps meaning what
 * it says: how many codes were actually sent.
 */
export async function releaseLimit(bucket: keyof typeof LIMITS, identity: string): Promise<void> {
  const store = await getStore();
  await store.releaseRateLimit(`${bucket}:${identity}`);
}
