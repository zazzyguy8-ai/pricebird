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
