import type { MetadataRoute } from 'next';

/**
 * What a crawler is allowed to spend its time on.
 *
 * Without this file every page is fair game, including the three that are
 * per-person and useless in a search result: an account page that renders
 * somebody's own plan, a sign-in form, and the API. Indexing those wastes the
 * crawl budget of a brand-new domain on pages nobody can search their way
 * into, and puts a sign-in form in front of people looking for a tool.
 *
 * Everything else is open, because the whole point of the pages that argue
 * for this product is that they are found.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'https://pricebird.org';

  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/account', '/signin', '/api/'],
    }],
    sitemap: `${base}/sitemap.xml`,
  };
}
