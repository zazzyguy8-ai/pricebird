import { NextResponse } from 'next/server';
import { z } from 'zod';
import { codeExpiry, generateCode, hashCode } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { sendMail } from '@/lib/mail';
import { checkLimit, clientAddress } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const BodySchema = z.object({ email: z.string().email().max(200) });

export async function POST(request: Request) {
  let email: string;
  try {
    email = BodySchema.parse(await request.json()).email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'That is not an email address.' }, { status: 400 });
  }

  // Everything that touches the database, wrapped. Uncaught it becomes a bare
  // 500 with an HTML body, the browser cannot parse it, and the form shows its
  // own fallback - "The code could not be sent." - which is the one sentence
  // that describes neither the cause nor the fix. That is exactly how a
  // missing table looked from the outside.
  const code = generateCode();
  try {
    // Two buckets, because either one alone is easy to walk around: per
    // address stops somebody being mailed a hundred codes, per IP stops the
    // same abuse spread across a hundred addresses. Without these the sign-in
    // form is a free mail bomb pointed at anyone, sent from our own domain.
    for (const [bucket, identity] of [
      ['codesPerEmail', email],
      ['codesPerIp', clientAddress(request)],
    ] as const) {
      const limit = await checkLimit(
        bucket,
        identity,
        'Too many sign-in codes requested. Wait an hour and try again.',
      );
      if (!limit.ok) {
        return NextResponse.json(
          { error: limit.message },
          { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
        );
      }
    }

    const store = await getStore();
    await store.putLoginCode({ email, code_hash: hashCode(email, code), expires_at: codeExpiry(), attempts: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The sign-in store is unavailable.';
    console.error(`[auth] ${message}`);
    return NextResponse.json({ error: `Sign-in is not available: ${message}` }, { status: 503 });
  }

  try {
    await sendMail({
      to: email,
      subject: `${code} is your Pricebird code`,
      text: `Your sign-in code is ${code}.\n\nIt works for ten minutes. If you did not ask for it, ignore this email — nobody can get into your listings without it.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The code could not be sent.' },
      { status: 502 },
    );
  }

  // Always the same answer, whether or not that address has an account. The
  // sign-in form must not become a way to ask who is a customer.
  return NextResponse.json({ sent: true });
}
