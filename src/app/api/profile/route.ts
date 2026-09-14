import { NextResponse } from 'next/server';
import { accountForRequest, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { readProfile, SellerProfileSchema } from '@/lib/listing/profile';
import { redact } from '@/lib/secrets';

export const runtime = 'nodejs';

/**
 * The seller's house style.
 *
 * Deliberately available to free accounts too. Someone who has spent five
 * minutes telling the tool how they write has decided it is theirs, and that
 * decision is worth more than the five listings it costs to let them make it.
 */
export async function GET() {
  try {
    const { account, setCookie } = await accountForRequest();
    const response = NextResponse.json({ profile: readProfile(account.seller_profile) });
    if (setCookie) response.cookies.set(SESSION_COOKIE, setCookie, sessionCookieOptions);
    return response;
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : 'The profile store is unavailable.');
    console.error(`[profile] ${message}`);
    return NextResponse.json({ error: `Settings are not available: ${message}` }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let account: Awaited<ReturnType<typeof accountForRequest>>['account'];
  let setCookie: string | null;
  try {
    ({ account, setCookie } = await accountForRequest());
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : 'The profile store is unavailable.');
    console.error(`[profile] ${message}`);
    return NextResponse.json({ error: `Settings are not available: ${message}` }, { status: 503 });
  }

  let profile;
  try {
    // Empty strings arrive from an untouched form field and mean "not set",
    // which is null here - otherwise a blank postage line would be appended
    // to every description as an empty paragraph.
    const raw = await request.json() as Record<string, unknown>;
    const blanked = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, typeof value === 'string' && value.trim() === '' ? null : value]),
    );
    profile = SellerProfileSchema.parse(blanked);
  } catch {
    return NextResponse.json({ error: 'Those settings are not in a shape this can save.' }, { status: 400 });
  }

  try {
    const store = await getStore();
    await store.putSellerProfile(account.id, profile);
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : 'The profile could not be saved.');
    console.error(`[profile] ${message}`);
    return NextResponse.json({ error: `That could not be saved: ${message}` }, { status: 503 });
  }

  const response = NextResponse.json({ profile });
  if (setCookie) response.cookies.set(SESSION_COOKIE, setCookie, sessionCookieOptions);
  return response;
}
