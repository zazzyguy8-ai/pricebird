import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_COOKIE, accountForRequest, checkCode, claimEmail, issueSession, sessionCookieOptions,
} from '@/lib/auth';
import { checkLimit, clientAddress, releaseLimit } from '@/lib/rate-limit';
import { redact } from '@/lib/secrets';

export const runtime = 'nodejs';

const BodySchema = z.object({ email: z.string().email().max(200), code: z.string().length(6) });

const REASONS: Record<string, string> = {
  none: 'No code was requested for that address, or it has already been used.',
  expired: 'That code has expired. Ask for a new one.',
  wrong: 'That code is not right.',
  locked: 'Too many wrong attempts. Ask for a new code.',
};

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Enter the six-digit code from the email.' }, { status: 400 });
  }

  // The stored record locks after five wrong attempts, so no single code can
  // be ground down. This bounds the traffic instead: without it every guess
  // from anywhere, for any address, costs a database read.
  const address = clientAddress(request);
  let check: Awaited<ReturnType<typeof checkCode>>;
  try {
    const limit = await checkLimit(
      'codeGuessesPerIp',
      address,
      'Too many attempts from this connection. Wait an hour, or ask for a fresh code.',
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: limit.message },
        { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
      );
    }

    check = await checkCode(body.email, body.code);
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : 'The sign-in store is unavailable.');
    console.error(`[auth] ${message}`);
    return NextResponse.json({ error: `Sign-in is not available: ${message}` }, { status: 503 });
  }

  if (!check.ok) return NextResponse.json({ error: REASONS[check.reason] }, { status: 401 });

  // A correct code costs nothing: the hit is handed back, so somebody signing
  // in from an office or a phone network is not billed for their neighbours.
  await releaseLimit('codeGuessesPerIp', address).catch(() => {});

  // The visitor may already be carrying an anonymous account with listings on
  // it; claimEmail decides whether that account gets the email or whether an
  // older account already owns it and the session should move there.
  const { account } = await accountForRequest();
  const signedIn = await claimEmail(account.id, body.email);

  const response = NextResponse.json({ ok: true, plan: signedIn.plan });
  response.cookies.set(SESSION_COOKIE, issueSession(signedIn.id), sessionCookieOptions);
  return response;
}
