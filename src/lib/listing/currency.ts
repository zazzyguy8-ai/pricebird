/**
 * The currency a seller most likely wants, before they touch the control.
 *
 * The default was USD for everybody, which is wrong for almost everybody:
 * this product is used hardest on Vinted and Depop, and those are European.
 * A seller in Bratislava got prices in dollars until they noticed the select
 * and changed it, on every item, or did not notice and listed in the wrong
 * currency.
 *
 * Read from the browser's own region rather than from an IP lookup - no
 * request, no third party, no guessing from a VPN exit node. If the region
 * is one this app does not price in, the answer is USD, which is what it
 * always was.
 */

export const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'PLN', 'CZK', 'SEK'] as const;
export type Currency = (typeof CURRENCIES)[number];

const BY_REGION: Record<string, Currency> = {
  GB: 'GBP',
  US: 'USD',
  CA: 'CAD', AU: 'AUD', NZ: 'AUD',
  PL: 'PLN', CZ: 'CZK', SE: 'SEK',
  // The euro area, written out rather than inferred: a seller in Slovakia and
  // a seller in Portugal both want EUR and neither has a country code that
  // says so.
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR',
  FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR',
  LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
};

/**
 * Never throws and never returns something the select cannot show.
 *
 * Runs on the client only - on the server there is no locale to read, and
 * guessing one would make the first render disagree with the second.
 */
export function guessCurrency(): Currency {
  if (typeof navigator === 'undefined') return 'USD';

  try {
    const tags = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
    for (const tag of tags) {
      const region = new Intl.Locale(tag).maximize().region;
      const match = region && BY_REGION[region];
      if (match) return match;
    }
  } catch {
    /* an unparseable tag is not worth a broken page */
  }
  return 'USD';
}
