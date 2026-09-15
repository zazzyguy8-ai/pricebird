/**
 * The four numbers that decide what to do tomorrow.
 *
 * A video either brings people who make a listing or it does not, and the
 * people who make one either come back for a fifth or they do not. Those two
 * facts tell you whether to change the hook or change the product - and
 * without them a launch is a week of guessing at which half is broken.
 *
 * Written as log lines rather than rows in a table, for three reasons. There
 * is no new endpoint to secure and no page that has to be kept private. There
 * is no third-party script, so nothing about a visitor leaves this server and
 * the cookie banner this product does not need stays unnecessary. And the
 * operator already reads these logs.
 *
 * Nothing here identifies a person. The account id is the one already in the
 * server log beside every other line; there is no address, no fingerprint, no
 * path a visitor took. Counting is the whole job.
 *
 * Read them in the hosting dashboard by filtering on the prefix:
 *
 *   [funnel] first-listing   somebody made their first one
 *   [funnel] free-spent      somebody used the last of the free five
 *   [funnel] bulk-run        somebody used bulk, and how many items
 *   [funnel] relist-run      somebody rewrote something already live
 *   [funnel] checkout-open   somebody reached Stripe
 *   [funnel] subscribed      somebody paid
 */

export type FunnelEvent =
  | 'first-listing'
  | 'free-spent'
  | 'bulk-run'
  | 'relist-run'
  | 'checkout-open'
  | 'subscribed';

export function track(event: FunnelEvent, detail?: string): void {
  // Never allowed to break the thing it is measuring.
  try {
    console.info(`[funnel] ${event}${detail ? ` ${detail}` : ''}`);
  } catch {
    /* a log line is not worth a failed request */
  }
}
