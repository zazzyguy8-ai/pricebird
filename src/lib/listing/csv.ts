import { PLATFORM_SPECS, type Platform } from './platforms';
import { CONDITION_LABELS, renderFor, type Listing } from './schema';

/**
 * A finished batch as a spreadsheet.
 *
 * This is the half of bulk mode that makes it worth paying for. Twenty
 * listings on a screen still have to be copied twenty times; twenty listings
 * in a file are pasted into a bulk uploader once, or worked through on a
 * laptop while the phone stays in the pile of clothes.
 *
 * Escaping is done properly rather than by joining on commas, because the
 * content is exactly what breaks naive CSV: descriptions contain newlines,
 * titles contain commas, and measurements contain quotes (24" chest).
 */

const COLUMNS = [
  'item', 'brand', 'size', 'condition', 'marketplace', 'title', 'title_length',
  'description', 'currency', 'price_low', 'price_suggested', 'price_high',
  'price_confidence', 'keywords', 'flaws', 'ask_the_seller',
] as const;

function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  // Quote whenever the value could otherwise split a row or a column. A lone
  // carriage return does it as surely as a comma does.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function listingsToCsv(rows: Array<{ listing: Listing; platform: Platform }>): string {
  const lines = [COLUMNS.join(',')];

  for (const { listing, platform } of rows) {
    const copy = renderFor(listing, platform);
    const { item, price } = listing;

    lines.push([
      cell(item.what),
      cell(item.brand),
      cell(item.size_on_label),
      cell(CONDITION_LABELS[item.condition]),
      cell(PLATFORM_SPECS[platform].label),
      cell(copy.title),
      cell(copy.title.length),
      cell(copy.description),
      cell(price.currency),
      cell(price.low),
      cell(price.suggested),
      cell(price.high),
      cell(price.confidence),
      cell(listing.keywords.join('; ')),
      cell(item.flaws.join('; ')),
      cell(listing.ask_the_seller.join('; ')),
    ].join(','));
  }

  // CRLF and a byte order mark: without them Excel opens the file with every
  // accented character mangled, and a European seller's first impression of
  // the export is broken text.
  return `﻿${lines.join('\r\n')}\r\n`;
}
