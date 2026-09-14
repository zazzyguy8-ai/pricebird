import { z } from 'zod';

/**
 * The seller's house style, remembered.
 *
 * This is the line between a subscription and a chat window. Anyone can paste
 * a photo into a chat and get a listing; what they cannot do is have it come
 * back in their words, with their postage terms, their returns line and the
 * phrases they refuse to use - forty times in a row, without typing any of it
 * again. A tool that forgets who you are between items is a tool you re-brief
 * every item, and re-briefing is the work.
 *
 * Two kinds of setting, and they are handled very differently:
 *
 *   Guidance - tone, banned phrases, units - is written into the prompt. The
 *   model can interpret it, because interpretation is what it is for.
 *
 *   Commitments - the postage line, the returns line - are appended verbatim
 *   after generation and never shown to the model at all. A promise to a
 *   buyer must appear exactly as the seller wrote it. A paraphrased returns
 *   policy is a legal document the seller never agreed to.
 */

export const TONES = ['plain', 'warm', 'minimal'] as const;
export type Tone = (typeof TONES)[number];

export const TONE_LABELS: Record<Tone, string> = {
  plain: 'Plain — facts, no decoration',
  warm: 'Warm — friendly, still honest',
  minimal: 'Minimal — as few words as the facts allow',
};

export const SellerProfileSchema = z.object({
  /** Shown on Etsy and Depop, where listings read as coming from a person. */
  shop_name: z.string().trim().max(60).nullable().default(null),
  units: z.enum(['cm', 'in']).default('cm'),
  /** A fact about the item's location, not a promise, so the model may use it. */
  ships_from: z.string().trim().max(60).nullable().default(null),
  /** Verbatim. Never paraphrased, never shortened, never cut off. */
  postage_line: z.string().trim().max(200).nullable().default(null),
  returns_line: z.string().trim().max(200).nullable().default(null),
  /** Short facts true of everything this seller lists. */
  always_mention: z.array(z.string().trim().min(2).max(120)).max(3).default([]),
  /** Their own banned phrases, on top of the ones banned for everybody. */
  never_say: z.array(z.string().trim().min(2).max(60)).max(8).default([]),
  tone: z.enum(TONES).default('plain'),
});

export type SellerProfile = z.infer<typeof SellerProfileSchema>;

export const DEFAULT_PROFILE: SellerProfile = SellerProfileSchema.parse({});

/**
 * Reads a profile from whatever the database happens to hold.
 *
 * Every field has a default and the whole thing falls back to defaults, so a
 * column that is null, a row written by an older version, or a value somebody
 * edited by hand can never stop a listing being generated. A house style is a
 * convenience; failing a paid request over one would be absurd.
 */
export function readProfile(raw: unknown): SellerProfile {
  const parsed = SellerProfileSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_PROFILE;
}

/** True when nothing has been set, so the UI can say so plainly. */
export function isDefaultProfile(profile: SellerProfile): boolean {
  return JSON.stringify(profile) === JSON.stringify(DEFAULT_PROFILE);
}

/**
 * The part of the profile the model is allowed to see.
 *
 * Guidance only. The postage and returns lines are deliberately absent: they
 * are appended afterwards, word for word.
 */
export function profileRules(profile: SellerProfile): string {
  const rules: string[] = [];

  if (profile.tone === 'warm') {
    rules.push(
      'Voice: warm and human - this seller talks to buyers like people. Still no filler, '
      + 'no sales language, and no claim that is not a fact. Warmth is in the rhythm, not in adjectives.',
    );
  } else if (profile.tone === 'minimal') {
    rules.push(
      'Voice: as short as the facts allow. This seller writes two or three lines and stops. '
      + 'If a sentence is not carrying a fact a buyer needs, delete it.',
    );
  } else {
    rules.push('Voice: plain and factual. One fact per line, no decoration.');
  }

  rules.push(`Any measurement you write goes in ${profile.units === 'cm' ? 'centimetres' : 'inches'}.`);

  if (profile.ships_from) {
    rules.push(
      `The item is in ${profile.ships_from}. Mention this only where a buyer would care about it, `
      + 'and never as a selling point.',
    );
  }

  if (profile.shop_name) {
    rules.push(
      `The shop is called ${profile.shop_name}. Use the name only on marketplaces whose voice is `
      + 'personal, and never more than once.',
    );
  }

  if (profile.always_mention.length > 0) {
    rules.push(
      'These are true of everything this seller lists. Work them in where they fit naturally, '
      + `in your own words, and skip any that would read as padding on this item:\n${
        profile.always_mention.map((line) => `  - ${line}`).join('\n')}`,
    );
  }

  if (profile.never_say.length > 0) {
    rules.push(
      `This seller will not use these words or phrases. Never write them, and do not reach for a `
      + `near-synonym that means the same thing:\n${profile.never_say.map((p) => `  - "${p}"`).join('\n')}`,
    );
  }

  return `The seller's house style, which applies to every listing they make:\n\n${
    rules.map((rule) => `- ${rule}`).join('\n\n')}`;
}

/**
 * The lines appended to every description, exactly as written.
 *
 * Returned separately from the body so the renderer can reserve room for them
 * before it truncates. A postage line cut in half by a character limit is
 * worse than no postage line: the buyer reads a promise that stops mid-word.
 */
export function profileTail(profile: SellerProfile): string {
  return [profile.postage_line, profile.returns_line]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))
    .join('\n');
}
