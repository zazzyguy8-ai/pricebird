/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pg'],

  /**
   * One canonical address, always the apex.
   *
   * Both pricebird.org and www.pricebird.org resolve to the same service, and
   * left alone that is two addresses for one site: search engines split the
   * ranking between them, and a customer who lands on the www one goes through
   * checkout against a return URL that does not match APP_URL.
   *
   * Matching on the host rather than the literal domain means this also does
   * the right thing on the onrender.com URL, where there is no www to redirect.
   */
  /**
   * Headers every response carries.
   *
   * Deliberately not a full content-security-policy: getting script-src right
   * with Next's inline bootstrap needs per-request nonces, and a CSP that
   * breaks the app is worse than none. These four are the ones with real value
   * and no risk.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Clickjacking: the app has a billing portal button and a sign-in
          // form, which is exactly what an invisible iframe is pointed at.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // Referrers: a listing URL should never travel to a marketplace in
          // a Referer header when somebody clicks through.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nothing here uses a camera, a microphone or a location, so no
          // embedded content should be able to ask on our behalf.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.(?<apex>.*)' }],
        destination: 'https://:apex/:path*',
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
