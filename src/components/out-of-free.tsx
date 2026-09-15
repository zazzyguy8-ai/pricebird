import Link from 'next/link';

/**
 * The end of the free tier, which is not a fault.
 *
 * It used to be rendered in the red error box on every page that could hit
 * it - the same styling as a rejected photo or a dropped connection. That is
 * the one moment in the product where somebody decides whether to pay, and
 * three pages framed it as something going wrong, each with their own
 * slightly different wording.
 *
 * One component, so the sentence a seller reads at that moment is the same
 * sentence wherever they happen to be standing, and changing it means
 * changing it once.
 */
export function OutOfFree({ reason }: { reason: string }) {
  return (
    <div
      className="card stack"
      style={{ gap: 11, borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))' }}
    >
      <strong style={{ fontSize: 15 }}>That was the last free one.</strong>
      <p className="small dim">{reason}</p>
      <p className="small dim">
        Everything you have made is still here and still yours. Pro is $7 a month for as many as
        you can photograph — plus twenty at once with a CSV to upload them with, and rewriting the
        listings you already have live.
      </p>
      <div className="row" style={{ gap: 9 }}>
        <Link href="/pricing" className="btn btn-primary">See what Pro costs</Link>
        <Link href="/account" className="btn btn-ghost">Your listings</Link>
      </div>
    </div>
  );
}
