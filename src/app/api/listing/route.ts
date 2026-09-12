import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountForRequest, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { quotaFor } from '@/lib/quota';
import { generateListing, ListingFailure, ACCEPTED_IMAGE_TYPES, MAX_IMAGES } from '@/lib/listing/generate';
import { PLATFORMS, type Platform } from '@/lib/listing/platforms';

export const runtime = 'nodejs';
/** Vision plus a full listing runs 10-25s; the platform default would cut it. */
export const maxDuration = 60;

const BodySchema = z.object({
  photos: z.array(z.object({
    media_type: z.enum(ACCEPTED_IMAGE_TYPES),
    data: z.string().min(100),
  })).min(1).max(MAX_IMAGES),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  currency: z.string().length(3).default('USD'),
  notes: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  // Identifying the account touches SESSION_SECRET and the database, and both
  // throw when they are misconfigured. Left uncaught that became a bare 500
  // with an HTML body, so the browser reported a dropped connection and the
  // real cause - a short secret, an unreachable database - stayed in the logs.
  // These messages are written for a human to act on, so they are passed
  // through rather than replaced with something vaguer.
  let account: Awaited<ReturnType<typeof accountForRequest>>['account'];
  let setCookie: string | null;
  let quota: Awaited<ReturnType<typeof quotaFor>>;
  try {
    ({ account, setCookie } = await accountForRequest());
    quota = await quotaFor(account);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The app is not configured.';
    console.error(`[listing] ${message}`);
    return NextResponse.json(
      { error: `This install is not finished: ${message}` },
      { status: 503 },
    );
  }

  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message, quota, upgrade: account.plan === 'free' }, { status: 402 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'That request was not a photo set this can read.' }, { status: 400 });
  }

  let listing;
  try {
    listing = await generateListing({
      photos: body.photos,
      platforms: body.platforms as Platform[],
      currency: body.currency.toUpperCase(),
      notes: body.notes ?? null,
    });
  } catch (error) {
    if (error instanceof ListingFailure) {
      // The detail goes to the log, where the operator looks; the seller gets
      // the sentence written for them.
      console.error(`[listing] ${error.operator}`);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // Everything else here is a rejected upload or a missing setting, and
    // those messages are already written for a person to act on.
    const message = error instanceof Error ? error.message : 'The listing could not be generated.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const store = await getStore();
  const saved = await store.saveListing(account.id, body.platforms[0] as Platform, listing);
  const after = await quotaFor(account);

  const response = NextResponse.json({ id: saved.id, listing, quota: after });
  if (setCookie) response.cookies.set(SESSION_COOKIE, setCookie, sessionCookieOptions);
  return response;
}
