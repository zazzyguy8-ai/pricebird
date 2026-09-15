import type { MetadataRoute } from 'next';

/**
 * The five pages worth finding.
 *
 * Listed by hand rather than crawled: this is a small product and a generated
 * sitemap would only ever go out of date in one direction - quietly including
 * something private. The account and sign-in pages are absent for the same
 * reason they are in robots.txt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? 'https://pricebird.org';
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/app`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/relist`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/bulk`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
