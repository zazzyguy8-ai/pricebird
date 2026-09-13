import { NextResponse, type NextRequest } from 'next/server';
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, normalizeReferralCode } from '@/lib/referrals';

/**
 * Catches ?r=CODE anywhere on the way in.
 *
 * The code has to survive the gap between clicking a friend's link and
 * actually making a listing, which may be days and is usually at least one
 * page. A cookie set here does that; reading the query string at signup time
 * would lose every referral where the person looked around first.
 */
export function middleware(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('r');
  if (!raw) return NextResponse.next();

  const code = normalizeReferralCode(raw);
  const response = NextResponse.next();
  if (code) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      maxAge: 60 * 60 * 24 * REFERRAL_COOKIE_DAYS,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
  return response;
}

export const config = { matcher: ['/', '/app', '/bulk', '/pricing'] };
