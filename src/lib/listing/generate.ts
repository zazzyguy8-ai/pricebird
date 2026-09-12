import Anthropic from '@anthropic-ai/sdk';
import { ZodError } from 'zod';
import { requireModel, supportsEffort } from '@/lib/models';
import { readSecret } from '@/lib/secrets';
import { PLATFORMS, type Platform } from './platforms';
import { ListingSchema, type Listing } from './schema';
import { LISTING_SYSTEM, listingPrompt } from './prompts';

/** Formats Claude accepts as image input. Anything else is rejected at the
 *  door with a message a phone user can act on, not a 400 from the API. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Per-image ceiling. The API's own limit is 5MB of base64; browsers hand us
 *  8MB HEIC-converted JPEGs all day, so the client downscales and this is the
 *  backstop. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 4;

export interface Photo {
  media_type: (typeof ACCEPTED_IMAGE_TYPES)[number];
  /** base64, without the data: URL prefix. */
  data: string;
}

export interface GenerateInput {
  photos: Photo[];
  platforms: Platform[];
  currency: string;
  notes?: string | null;
}

/**
 * Output budget for one listing.
 *
 * A listing is seven titles, a description, bullets, keywords and a price
 * block - around 1200 tokens of JSON when the item is complicated (a camera
 * with accessories) and the model lists every feature. 4000 leaves room for
 * that plus the tool-call scaffolding, and cut-off output is reported as the
 * budget problem it is rather than as a schema failure.
 */
const MAX_TOKENS = 4000;

const LISTING_TOOL: Anthropic.Tool = {
  name: 'submit_listing',
  description: 'Submit the finished marketplace listing.',
  input_schema: {
    type: 'object',
    required: ['item', 'title', 'description', 'bullets', 'keywords', 'platforms', 'price', 'ask_the_seller', 'photo_tips'],
    properties: {
      item: {
        type: 'object',
        required: ['what', 'brand', 'brand_confidence', 'model', 'colour', 'material', 'size_on_label', 'condition', 'condition_evidence', 'flaws', 'features', 'era_or_style'],
        properties: {
          what: { type: 'string', description: 'The item in buyer words, e.g. "women\'s quilted winter coat"' },
          brand: { type: ['string', 'null'] },
          brand_confidence: {
            type: 'string', enum: ['visible', 'likely', 'unknown'],
            description: '"visible" only when a logo or label is legible in a photo.',
          },
          model: { type: ['string', 'null'] },
          colour: { type: 'string' },
          material: { type: ['string', 'null'], description: 'Only from a care label or unmistakable texture.' },
          size_on_label: { type: ['string', 'null'], description: 'Null unless the label is readable in a photo.' },
          condition: { type: 'string', enum: ['new_with_tags', 'new_without_tags', 'excellent', 'good', 'fair', 'for_parts'] },
          condition_evidence: {
            type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' },
            description: 'What in the photos supports that grade.',
          },
          flaws: { type: 'array', maxItems: 6, items: { type: 'string' } },
          features: { type: 'array', maxItems: 8, items: { type: 'string' } },
          era_or_style: { type: ['string', 'null'], description: 'e.g. "90s workwear", "y2k", null when not distinctive.' },
        },
      },
      title: { type: 'string', description: 'Platform-neutral title, under 80 characters.' },
      description: { type: 'string', description: 'Plain text, under 900 characters, no markdown.' },
      bullets: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string' } },
      keywords: { type: 'array', minItems: 3, maxItems: 15, items: { type: 'string' } },
      platforms: {
        type: 'array', minItems: 1,
        items: {
          type: 'object',
          required: ['platform', 'title', 'hashtags'],
          properties: {
            platform: { type: 'string', enum: [...PLATFORMS] },
            title: { type: 'string' },
            hashtags: { type: 'array', maxItems: 13, items: { type: 'string' } },
          },
        },
      },
      price: {
        type: 'object',
        required: ['currency', 'low', 'suggested', 'high', 'basis', 'confidence'],
        properties: {
          currency: { type: 'string', description: 'ISO 4217, e.g. GBP' },
          low: { type: 'number', description: 'Price it sells at within days.' },
          suggested: { type: 'number', description: 'The number to list at.' },
          high: { type: 'number', description: 'Achievable with patience and good photos.' },
          basis: { type: 'string', description: 'Why this range. Never claim to have looked up sold listings.' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
      ask_the_seller: { type: 'array', maxItems: 5, items: { type: 'string' } },
      photo_tips: { type: 'array', maxItems: 3, items: { type: 'string' } },
    },
  },
};

/**
 * A failure with two audiences.
 *
 * The seller gets `message` - one sentence, no vocabulary they did not ask
 * for. The log gets `operator`, which is whatever the API actually said.
 *
 * This exists because a rejected API key surfaced on a customer's phone as
 * `401 {"type":"error","error":{"type":"authentication_error","message":
 * "invalid x-api-key"},"request_id":"req_011Ceyca..."}`. Every word of that is
 * useful to the person running the service and none of it to the person trying
 * to sell a jumper, who reasonably concludes the product is broken.
 */
export class ListingFailure extends Error {
  constructor(message: string, readonly status: number, readonly operator: string) {
    super(message);
    this.name = 'ListingFailure';
  }
}

/**
 * Turns an API error into the two messages.
 *
 * The split is by whose problem it is: a rejected key or a bad request is ours
 * and says so without blaming the seller, a rate limit or an overload is
 * temporary and says to try again, and anything unrecognised stays vague to
 * the seller and verbatim in the log.
 */
function translate(error: unknown): ListingFailure {
  const status = (error as { status?: number }).status;
  const detail = error instanceof Error ? error.message : String(error);

  if (status === 401 || status === 403) {
    return new ListingFailure(
      'Pricebird could not reach its AI - the key it uses was rejected. That is a problem on our '
      + 'side, not yours, and nothing was charged against your free listings.',
      503,
      `Anthropic rejected the API key (${status}): ${detail}`,
    );
  }
  // 402 is billing_error - a real, separate thing from a rejected key, and the
  // only one of these the operator fixes with a card rather than a config
  // change. Worth its own branch so it is never misdiagnosed as a bad key.
  if (status === 402) {
    return new ListingFailure(
      'Pricebird is temporarily out of credit with its AI provider. That is on us - nothing was '
      + 'charged against your free listings. Try again shortly.',
      503,
      `Anthropic billing error (402) - the account is out of credit: ${detail}`,
    );
  }
  if (status === 429) {
    return new ListingFailure(
      'Too many listings going through at once. Wait half a minute and press the button again.',
      429,
      `Rate limited by Anthropic: ${detail}`,
    );
  }
  if (status === 529 || status === 503 || (status ?? 0) >= 500) {
    return new ListingFailure(
      'Claude is busy right now. Try again in a minute - your photo is still here.',
      503,
      `Anthropic unavailable (${status}): ${detail}`,
    );
  }
  if (status === 400) {
    return new ListingFailure(
      'That photo was refused by the model. If it is very large or an unusual format, try a normal '
      + 'photo from your camera roll.',
      400,
      `Anthropic rejected the request (400): ${detail}`,
    );
  }
  return new ListingFailure(
    'The listing could not be written. Try again - if it keeps failing, the photo may be the problem.',
    502,
    `Unrecognised failure from Anthropic: ${detail}`,
  );
}

export interface GenerateOptions {
  apiKey?: string;
  /** Injectable transport, so the wiring can be tested without a key and
   *  without a network call. */
  fetch?: typeof fetch;
}

function validate(input: GenerateInput): void {
  if (input.photos.length === 0) throw new Error('No photo was uploaded.');
  if (input.photos.length > MAX_IMAGES) {
    throw new Error(`${input.photos.length} photos is more than the ${MAX_IMAGES} this reads at once.`);
  }
  for (const photo of input.photos) {
    if (!ACCEPTED_IMAGE_TYPES.includes(photo.media_type)) {
      throw new Error(`${photo.media_type} is not a format this reads. Use JPEG, PNG, WebP or GIF.`);
    }
    // base64 is 4 characters per 3 bytes; compare on decoded size so the
    // message matches what the user sees in their photo library.
    const bytes = Math.floor((photo.data.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) {
      throw new Error(`A photo is ${(bytes / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB per photo.`);
    }
  }
  if (input.platforms.length === 0) throw new Error('No marketplace was selected.');
}

/**
 * Pulls the listing out of a forced tool call.
 *
 * The three stop reasons are separated because they need different fixes and
 * a single "the model failed" message sends the operator looking in the wrong
 * place: max_tokens is a budget we control, refusal is content we sent, and a
 * missing block is a schema mismatch.
 */
function toolResult(message: Anthropic.Message): unknown {
  if (message.stop_reason === 'max_tokens') {
    throw new Error(
      `The listing was cut off: generation hit max_tokens after ${message.usage.output_tokens} output `
      + 'tokens, before the tool input was complete. This is an output budget problem, not a schema one.',
    );
  }
  if (message.stop_reason === 'refusal') {
    throw new Error(
      'The model declined to describe this photo. If it shows a person, a document or anything '
      + 'other than an item for sale, that is why - photograph the item on its own.',
    );
  }
  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_listing',
  );
  if (!block) {
    throw new Error(
      `No submit_listing call in the response (stop_reason: ${message.stop_reason ?? 'unknown'}). `
      + `Blocks received: ${message.content.map((b) => b.type).join(', ') || '(none)'}.`,
    );
  }
  return block.input;
}

function parse(raw: unknown): Listing {
  try {
    return ListingSchema.parse(raw);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const faults = error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`The listing came back in a shape this cannot use:\n${faults}`);
  }
}

/**
 * One photo set in, one finished listing out.
 *
 * The model is forced through a tool call, so the response is structurally
 * valid before zod ever sees it; zod then enforces the parts a JSON Schema
 * cannot (string lengths, the currency being three letters).
 */
export async function generateListing(input: GenerateInput, options: GenerateOptions = {}): Promise<Listing> {
  validate(input);

  const apiKey = options.apiKey ?? readSecret('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');

  // Resolved before the call so a bad VISION_MODEL fails as configuration
  // rather than as a 404 the user sees as "something went wrong".
  const model = requireModel();
  const client = new Anthropic({ apiKey, ...(options.fetch ? { fetch: options.fetch } : {}) });

  const content: Anthropic.ContentBlockParam[] = [
    ...input.photos.map((photo): Anthropic.ContentBlockParam => ({
      type: 'image',
      source: { type: 'base64', media_type: photo.media_type, data: photo.data },
    })),
    {
      type: 'text',
      text: listingPrompt({
        platforms: input.platforms,
        currency: input.currency,
        notes: input.notes?.trim() || null,
        photoCount: input.photos.length,
      }),
    },
  ];

  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      // Perception plus short copy: extra deliberation buys nothing here and
      // every added second is felt, because the user is watching a spinner.
      ...(supportsEffort(model) ? ({ output_config: { effort: 'low' } } as unknown as Record<string, unknown>) : {}),
      system: LISTING_SYSTEM,
      tools: [LISTING_TOOL],
      tool_choice: { type: 'tool', name: 'submit_listing' },
      messages: [{ role: 'user', content }],
    });
  } catch (error) {
    // Transport and HTTP failures only. A response that arrives and is then
    // unusable - cut off, refused, malformed - is handled below, where the
    // messages already speak to the seller.
    throw translate(error);
  }

  return parse(toolResult(message));
}
