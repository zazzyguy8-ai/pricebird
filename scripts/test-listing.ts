/**
 * Offline tests for the part that costs money when it is wrong.
 *
 * No key, no network: a stub transport stands in for the API, so these run in
 * CI and on a laptop with an empty .env. What they check is the wiring and the
 * refusals - that a photo actually reaches the model as an image block, that a
 * truncated response is reported as a budget problem rather than a schema one,
 * and that no platform limit is ever trusted to the prompt.
 */
import assert from 'node:assert/strict';
import { generateListing, ListingFailure } from '../src/lib/listing/generate';
import { LISTING_SYSTEM } from '../src/lib/listing/prompts';
import { CACHE_MINIMUM_TOKENS, requireModel } from '../src/lib/models';
import { fitTitle, PLATFORM_SPECS, PLATFORMS } from '../src/lib/listing/platforms';
import { renderFor, ListingSchema, type Listing } from '../src/lib/listing/schema';
import { DEFAULT_PROFILE, SellerProfileSchema, profileRules, readProfile } from '../src/lib/listing/profile';
import { listingsToCsv } from '../src/lib/listing/csv';

const GOOD_LISTING: Listing = {
  item: {
    what: "men's canvas work jacket",
    brand: 'Carhartt',
    brand_confidence: 'visible',
    model: 'Detroit',
    colour: 'brown',
    material: 'cotton duck canvas',
    motif: 'embroidered chest logo',
    size_on_label: 'L',
    condition: 'good',
    condition_evidence: ['fading at the cuffs', 'paint mark on the left sleeve'],
    flaws: ['small paint mark on left sleeve'],
    features: ['corduroy collar', 'blanket lining'],
    era_or_style: '90s workwear',
  },
  title: 'Carhartt Detroit Jacket Brown Canvas Mens L',
  description: {
    short: 'Carhartt Detroit jacket, brown duck canvas, corduroy collar.\nSize L on the label.\nFading at the cuffs and a small paint mark on the left sleeve, both photographed.',
    long: 'Carhartt WIP Detroit jacket in brown duck canvas with the corduroy collar and blanket lining. Size L on the label. Front hand-warmer pockets, chest pocket, all zips and snaps working. Worn: fading at the cuffs and elbows, one small paint mark on the left sleeve, both shown in the photos. No rips, no repairs.',
  },
  bullets: ['Corduroy collar', 'Blanket lined'],
  keywords: ['carhartt', 'detroit jacket', 'workwear', 'duck canvas'],
  platforms: [
    { platform: 'ebay', title: 'Carhartt WIP Detroit Jacket Brown Duck Canvas Corduroy Collar Mens Size L', hashtags: [] },
    { platform: 'depop', title: 'Vintage Carhartt Detroit jacket brown workwear L', hashtags: ['carhartt', 'workwear', 'vintage', 'y2k', 'jacket', 'mens'] },
  ],
  price: {
    currency: 'GBP', low: 78, suggested: 95, high: 120,
    basis: 'Typical resale band for a worn Detroit jacket with visible fading.',
    confidence: 'medium',
  },
  ask_the_seller: ['Pit to pit measurement'],
  photo_tips: ['Shoot the label flat'],
  diagnosis: [],
};

/** Builds a fake API response containing a forced tool call. */
function stubResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function toolMessage(input: unknown, stopReason = 'tool_use') {
  return {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
    content: [{ type: 'tool_use', id: 'tu_1', name: 'submit_listing', input }],
    stop_reason: stopReason,
    usage: { input_tokens: 900, output_tokens: 700 },
  };
}

const PHOTO = { media_type: 'image/jpeg' as const, data: 'A'.repeat(400) };

async function wiring(): Promise<void> {
  let seen: Record<string, unknown> | null = null;

  const listing = await generateListing(
    { photos: [PHOTO], platforms: ['ebay', 'depop'], currency: 'GBP', notes: 'Bought in Berlin.' },
    {
      apiKey: 'sk-ant-test',
      fetch: async (_url, init) => {
        seen = JSON.parse(String((init as RequestInit).body));
        return stubResponse(toolMessage(GOOD_LISTING));
      },
    },
  );

  assert.ok(seen, 'the transport was never called');
  const request = seen as Record<string, any>;

  const content = request.messages[0].content as Array<Record<string, any>>;
  const image = content.find((block) => block.type === 'image');
  assert.ok(image, 'no image block reached the API - the photo was dropped somewhere');
  assert.equal(image.source.type, 'base64');
  assert.equal(image.source.media_type, 'image/jpeg');

  const prompt = content.find((block) => block.type === 'text');
  assert.ok(prompt, 'no prompt block reached the API');
  const text = prompt.text as string;
  assert.match(text, /GBP/, 'the currency never made it into the prompt');
  assert.match(text, /Bought in Berlin/, "the seller's notes were dropped");
  assert.match(text, /80 characters/, 'the eBay title limit was not stated to the model');

  assert.equal(request.tool_choice.name, 'submit_listing', 'the tool call was not forced');
  assert.equal(listing.item.brand, 'Carhartt');
  console.log('  ✓ photo, currency, notes and platform limits all reach the API');
}

async function budgetFailure(): Promise<void> {
  await assert.rejects(
    generateListing({ photos: [PHOTO], platforms: ['ebay'], currency: 'USD' }, {
      apiKey: 'sk-ant-test',
      fetch: async () => stubResponse(toolMessage({}, 'max_tokens')),
    }),
    /output budget problem/,
    'a truncated response must be reported as a budget problem, not a schema failure',
  );
  console.log('  ✓ a cut-off response names the real cause');
}

async function refusal(): Promise<void> {
  await assert.rejects(
    generateListing({ photos: [PHOTO], platforms: ['ebay'], currency: 'USD' }, {
      apiKey: 'sk-ant-test',
      fetch: async () => stubResponse({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
        content: [], stop_reason: 'refusal', usage: { input_tokens: 900, output_tokens: 3 },
      }),
    }),
    /declined to describe this photo/,
    'a refusal must be explained in terms the seller can act on',
  );
  console.log('  ✓ a refusal is explained, not swallowed');
}

async function apiErrorsStayBackstage(): Promise<void> {
  const cases: Array<[number, string, RegExp]> = [
    [401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011Ceyca"}', /key it uses was rejected/],
    [429, '{"type":"error","error":{"type":"rate_limit_error","message":"rate limited"}}', /Wait half a minute/],
    [529, '{"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}', /busy right now/],
  ];

  for (const [status, body, expected] of cases) {
    const failure = await generateListing(
      { photos: [PHOTO], platforms: ['ebay'], currency: 'USD' },
      {
        apiKey: 'sk-ant-test',
        fetch: async () => new Response(body, { status, headers: { 'content-type': 'application/json' } }),
      },
    ).then(() => null, (error: unknown) => error);

    assert.ok(failure instanceof ListingFailure, `a ${status} did not produce a ListingFailure`);
    assert.match(failure.message, expected);

    // The whole point: the seller never sees the API's own words.
    for (const leak of ['x-api-key', 'request_id', 'authentication_error', 'sk-ant']) {
      assert.ok(!failure.message.includes(leak), `"${leak}" leaked into the message a customer reads`);
    }
    // And the operator keeps everything.
    assert.ok(failure.operator.length > 0, 'nothing was left for the log');
  }
  console.log('  ✓ an API failure reaches the seller in their words and the log in full');
}

async function inputGuards(): Promise<void> {
  const call = (input: Parameters<typeof generateListing>[0]) =>
    generateListing(input, { apiKey: 'sk-ant-test', fetch: async () => stubResponse(toolMessage(GOOD_LISTING)) });

  await assert.rejects(call({ photos: [], platforms: ['ebay'], currency: 'USD' }), /No photo/);
  await assert.rejects(
    call({ photos: Array(5).fill(PHOTO), platforms: ['ebay'], currency: 'USD' }),
    /more than the 4/,
  );
  await assert.rejects(
    call({ photos: [{ media_type: 'image/heic' as never, data: PHOTO.data }], platforms: ['ebay'], currency: 'USD' }),
    /not a format this reads/,
  );
  await assert.rejects(
    call({ photos: [{ media_type: 'image/jpeg', data: 'A'.repeat(8 * 1024 * 1024) }], platforms: ['ebay'], currency: 'USD' }),
    /The limit is 5MB/,
  );
  console.log('  ✓ bad input is refused before an API call is paid for');
}

function schemaRejectsInvention(): void {
  // The model is allowed to say it does not know. It is not allowed to return
  // a shape the app would then render as fact.
  const withoutEvidence = { ...GOOD_LISTING, item: { ...GOOD_LISTING.item, condition_evidence: [] } };
  assert.throws(() => ListingSchema.parse(withoutEvidence), /at least 1/i,
    'a condition grade with no evidence behind it must not parse');

  // The motif is what buyers type - "floral embroidered hoodie", not "hoodie".
  // It was missed when the prompt only encouraged it, so the contract requires
  // the field to be present; null is the answer for a genuinely plain item.
  const { motif: _dropped, ...withoutMotif } = GOOD_LISTING.item;
  assert.throws(
    () => ListingSchema.parse({ ...GOOD_LISTING, item: withoutMotif }),
    /motif/i,
    'a listing with no motif decision at all must not parse',
  );
  const plain = ListingSchema.parse({ ...GOOD_LISTING, item: { ...GOOD_LISTING.item, motif: null } });
  assert.equal(plain.item.motif, null, 'a plain item must be allowed to say so');

  const unknownSize = ListingSchema.parse({ ...GOOD_LISTING, item: { ...GOOD_LISTING.item, size_on_label: null } });
  assert.equal(unknownSize.item.size_on_label, null, 'an unreadable size must be allowed to stay empty');
  console.log('  ✓ the schema allows "unknown" and refuses an ungrounded grade');
}

function descriptionLength(): void {
  // A Vinted buyer scrolling a grid gives a listing two seconds; an eBay buyer
  // arrived from a search and the text is also the index. One middle-length
  // blob served to both is what makes a listing read as machine-written.
  const vinted = renderFor(GOOD_LISTING, 'vinted');
  const ebay = renderFor(GOOD_LISTING, 'ebay');

  assert.ok(vinted.description.includes('Size L on the label'), 'the short text did not reach Vinted');
  assert.ok(!vinted.description.includes('blanket lining'), 'Vinted was served the long description');
  assert.ok(vinted.description.length < ebay.description.length, 'short must be shorter than long');

  assert.ok(ebay.description.includes('blanket lining'), 'eBay was served the short description');

  // Bullets are a spec sheet. They belong with the long text, not under three
  // readable lines on a phone.
  assert.ok(ebay.description.includes('• Corduroy collar'), 'the long description lost its bullets');
  assert.ok(!vinted.description.includes('•'), 'bullets were appended to a phone-browsed listing');

  // The schema, not the prompt, is what keeps short short.
  assert.throws(
    () => ListingSchema.parse({
      ...GOOD_LISTING,
      description: { ...GOOD_LISTING.description, short: 'x'.repeat(401) },
    }),
    /400/,
    'a 401-character "short" description must not parse',
  );
  console.log('  ✓ each marketplace gets the description length it is actually read at');
}

function platformLimits(): void {
  const long = 'Carhartt WIP Detroit Jacket Brown Duck Canvas Corduroy Collar Blanket Lined Mens Size Large Vintage';
  const overlong: Listing = { ...GOOD_LISTING, platforms: [{ platform: 'ebay', title: long, hashtags: [] }] };

  const ebay = renderFor(overlong, 'ebay');
  assert.ok(ebay.title.length <= 80, `eBay title was ${ebay.title.length} characters`);
  assert.ok(!ebay.title.endsWith(' '), 'a trailing space would be pasted into the title field');
  assert.ok(long.startsWith(ebay.title), 'truncation must not rewrite the words');
  assert.ok(ebay.overflow, 'the seller is not being told their title was cut');

  // A word boundary, not a mid-word chop.
  assert.equal(fitTitle('Nike Air Max 90 White Leather', 18), 'Nike Air Max 90');
  assert.equal(fitTitle('Supercalifragilistic', 8), 'Supercal', 'a single over-long word still has to yield something');

  // Hashtags belong on Depop and nowhere near eBay.
  assert.equal(renderFor(GOOD_LISTING, 'ebay').hashtags.length, 0);
  const depop = renderFor(GOOD_LISTING, 'depop');
  assert.equal(depop.hashtags.length, PLATFORM_SPECS.depop.hashtags, 'Depop caps hashtags at 5');
  assert.ok(depop.hashtags.every((tag) => tag.startsWith('#')));

  // A platform the model skipped still has to produce pasteable copy.
  const missing = renderFor(GOOD_LISTING, 'mercari');
  assert.ok(missing.title.length > 0, 'a platform with no generated title must fall back, not blank');
  console.log('  ✓ every platform limit is enforced in code, not asked for in a prompt');
}

function csvSurvivesRealContent(): void {
  // Every one of these breaks a CSV built by joining on commas, and every one
  // occurs constantly in real listings.
  const nasty: Listing = {
    ...GOOD_LISTING,
    title: 'Jacket, brown, size L',
    // renderFor takes the per-platform title, so that is the one that has to
    // survive the escaping - overriding only the generic title tests nothing.
    platforms: [{ platform: 'ebay', title: 'Jacket, brown, size L', hashtags: [] }],
    description: {
      short: 'Line one\nLine two with a "quote"',
      long: 'Chest measures 24" flat.\r\nSleeve 25".',
    },
    item: { ...GOOD_LISTING.item, flaws: ['scuff, small', 'mark on the "left" cuff'] },
  };

  const csv = listingsToCsv([{ listing: nasty, platform: 'ebay' }]);
  const [header] = csv.split('\r\n');
  assert.ok(header.startsWith('\uFEFF'), 'no BOM - Excel will mangle accented characters');
  assert.ok(header.includes('title_length'), 'the header lost a column');

  // A quoted field may contain commas and newlines; the row count must not
  // grow because a description had a line break in it.
  assert.ok(csv.includes('"Jacket, brown, size L"'), 'a comma in the title was not quoted');
  assert.ok(csv.includes('24"" flat'), 'a measurement quote in the long description was not escaped');

  // The short description goes to the phone-browsed marketplaces, so its own
  // quotes and newlines have to survive too - they travel in a different cell.
  const short = listingsToCsv([{ listing: nasty, platform: 'vinted' }]);
  assert.ok(short.includes('""quote""'), 'an embedded quote in the short description was not doubled');

  // The row count is what a naive implementation gets wrong: descriptions
  // contain line breaks, and unquoted they turn two listings into six rows
  // that a bulk uploader then rejects. Counting has to respect quoting too -
  // a CRLF inside a quoted field is content, not a record boundary, which is
  // exactly what RFC 4180 says and what Excel expects.
  const records = (csvText: string): number => {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < csvText.length; i += 1) {
      if (csvText[i] === '"') inQuotes = !inQuotes;
      else if (!inQuotes && csvText[i] === '\r' && csvText[i + 1] === '\n') count += 1;
    }
    return count;
  };

  const twoRows = listingsToCsv([
    { listing: nasty, platform: 'ebay' },
    { listing: nasty, platform: 'vinted' },
  ]);
  assert.equal(records(twoRows), 3, 'two listings must be a header and two records');
  assert.ok(
    twoRows.includes('flat.\r\nSleeve'),
    'a line break inside a description must be preserved, not stripped',
  );
  console.log('  ✓ the export survives commas, quotes and newlines in real listings');
}

/**
 * The house style, which is the whole argument for a subscription.
 *
 * Anyone can paste a photo into a chat window and get a listing. What they
 * cannot get is the same listing in their words, with their postage terms on
 * the end, forty times running without retyping any of it. So these are the
 * properties that have to hold every time - especially the last one, which is
 * the one a character limit would quietly break.
 */
function theHouseStyleSurvivesEveryLimit(): void {
  const profile = SellerProfileSchema.parse({
    postage_line: 'Posted within 2 working days, tracked, from Slovakia.',
    returns_line: 'Returns accepted within 14 days, buyer pays postage.',
    tone: 'minimal',
    never_say: ['vintage'],
  });

  // The seller's own words, verbatim and complete, on every marketplace -
  // including the ones with the tightest description limits.
  for (const platform of PLATFORMS) {
    const rendered = renderFor(GOOD_LISTING, platform, profile);
    assert.ok(
      rendered.description.includes(profile.postage_line!),
      `${platform}: the postage line was altered or cut`,
    );
    assert.ok(
      rendered.description.includes(profile.returns_line!),
      `${platform}: the returns line was altered or cut`,
    );
    assert.ok(
      rendered.description.length <= PLATFORM_SPECS[platform].descriptionMax,
      `${platform}: the description still has to fit`,
    );
  }

  // And when something genuinely has to give, it is the generated prose and
  // never the seller's own words. Built past the schema's own cap on purpose:
  // the limits are generous enough that this does not happen today, which is
  // exactly why it needs a test rather than a hope.
  const windy: Listing = {
    ...GOOD_LISTING,
    description: { short: 'x'.repeat(PLATFORM_SPECS.depop.descriptionMax + 200), long: 'y'.repeat(900) },
  };
  const squeezed = renderFor(windy, 'depop', profile);
  assert.ok(squeezed.description.includes(profile.postage_line!), 'the promise outranks the prose');
  assert.ok(squeezed.description.includes(profile.returns_line!), 'both promises outrank the prose');
  assert.ok(squeezed.description.includes('…'), 'a truncated body must say so');
  assert.ok(
    squeezed.description.length <= PLATFORM_SPECS.depop.descriptionMax,
    'reserving room for the tail must not push the whole thing over the limit',
  );

  // No profile set is the same text as before this feature existed.
  const plain = renderFor(GOOD_LISTING, 'ebay');
  assert.equal(plain.description, renderFor(GOOD_LISTING, 'ebay', DEFAULT_PROFILE).description);
  assert.ok(!plain.description.endsWith('\n'), 'an empty tail must not leave a dangling blank line');

  console.log('  ✓ the seller\'s own lines are never reworded and never cut off');
}

function theProfileNeverBreaksAListing(): void {
  // Anything at all can be in that column: null from a fresh account, a row
  // written before this feature shipped, a value someone edited by hand. None
  // of it may cost somebody a listing they are paying for.
  for (const junk of [null, undefined, {}, [], 'nonsense', 42, { tone: 'shouty' }, { never_say: 'no' }]) {
    const profile = readProfile(junk);
    assert.equal(typeof profile.tone, 'string');
    assert.ok(Array.isArray(profile.never_say));
    assert.doesNotThrow(() => renderFor(GOOD_LISTING, 'depop', profile));
  }

  // Guidance reaches the model; commitments deliberately do not. A promise to
  // a buyer must not be paraphrased, so it is never shown to something that
  // could paraphrase it.
  const profile = SellerProfileSchema.parse({
    postage_line: 'Posted within 2 working days.',
    returns_line: 'No returns, sorry.',
    never_say: ['bundle'],
    ships_from: 'Slovakia',
    units: 'in',
  });
  const rules = profileRules(profile);
  assert.ok(rules.includes('bundle'), 'a banned phrase must reach the model');
  assert.ok(rules.includes('Slovakia'), 'where it ships from is a fact, and useful');
  assert.ok(rules.includes('inches'), 'the unit choice must reach the model');
  assert.ok(!rules.includes('Posted within'), 'the postage line must never be paraphrasable');
  assert.ok(!rules.includes('No returns'), 'the returns line must never be paraphrasable');

  console.log('  ✓ a broken profile costs nothing, and promises are never paraphrased');
}

/**
 * Relist mode, whose whole value depends on one restraint.
 *
 * A seller pasting a listing with no photo is handing over the only facts
 * that exist. Everything they wrote is true - they own the item - and
 * anything they left out is not ours to supply. A rewrite that quietly adds
 * "100% cotton" because the item looks like cotton produces a return, and the
 * seller will never know which of their four hundred rewrites did it.
 */
async function relistAsksRatherThanInvents(): Promise<void> {
  let seen: Record<string, unknown> | null = null;

  const existing = {
    title: 'Nice jacket',
    description: 'Good condition, worn a few times. Any questions just ask!',
  };

  await generateListing(
    { photos: [], platforms: ['ebay'], currency: 'GBP', existing },
    {
      apiKey: 'sk-ant-test',
      fetch: async (_url, init) => {
        seen = JSON.parse(String((init as RequestInit).body));
        return stubResponse(toolMessage(GOOD_LISTING));
      },
    },
  );

  assert.ok(seen, 'the transport was never called');
  const request = seen as Record<string, any>;
  const content = request.messages[0].content as Array<Record<string, any>>;

  assert.ok(!content.some((block) => block.type === 'image'), 'no photo was sent, so none may appear');

  const textBlock = content.find((block) => block.type === 'text');
  assert.ok(textBlock, 'no prompt block reached the API');
  const text = textBlock.text as string;
  assert.match(text, /Nice jacket/, "the seller's title never reached the model");
  assert.match(text, /Any questions just ask/, "the seller's description never reached the model");
  assert.match(text, /There are no photos/, 'the model was not told it is working from text alone');
  assert.match(text, /add a fact nobody stated/, 'the restraint that makes this safe was not stated');
  assert.match(text, /diagnosis first/, 'the diagnosis must drive the rewrite, not decorate it');
  assert.match(text, /80 characters/, 'the eBay limit still has to reach the model');

  // Photos are a check on the words when they exist, never a contradiction.
  const withPhoto: Record<string, any>[] = [];
  await generateListing(
    { photos: [PHOTO], platforms: ['vinted'], currency: 'EUR', existing },
    {
      apiKey: 'sk-ant-test',
      fetch: async (_url, init) => {
        withPhoto.push(...JSON.parse(String((init as RequestInit).body)).messages[0].content);
        return stubResponse(toolMessage(GOOD_LISTING));
      },
    },
  );
  assert.ok(withPhoto.some((block) => block.type === 'image'), 'a photo sent with a relist must be used');
  const mixedBlock = withPhoto.find((block) => block.type === 'text');
  assert.ok(mixedBlock, 'no prompt block reached the API');
  const mixed = mixedBlock.text as string;
  assert.match(mixed, /is 1 photo/, 'the model must be told how many photos it has');
  assert.match(mixed, /never to contradict a fact only they can know/, 'the seller still owns the item');

  // Without either input there is nothing to work from, and that is a clear
  // refusal rather than a request sent off to be charged for.
  await assert.rejects(
    generateListing({ photos: [], platforms: ['ebay'], currency: 'GBP' }, { apiKey: 'sk-ant-test' }),
    /No photo was uploaded/,
  );

  console.log('  ✓ a rewrite works from what the seller wrote and adds nothing they did not');
}

function diagnosisIsOptionalEverywhereElse(): void {
  // Listings saved before relist existed, and every listing written from a
  // photo, have no diagnosis. Neither may fail to parse.
  const { diagnosis: _omitted, ...withoutDiagnosis } = GOOD_LISTING;
  const parsed = ListingSchema.parse(withoutDiagnosis);
  assert.deepEqual(parsed.diagnosis, [], 'a missing diagnosis must default, not throw');

  console.log('  ✓ a listing with no diagnosis still parses');
}

/**
 * The cache breakpoint, asserted.
 *
 * A breakpoint that silently stops matching costs about a quarter of the
 * inference bill and reports nothing at all - no error, no warning, just a
 * larger invoice at the end of the month. The shape is cheap to check here
 * and impossible to notice in production.
 */
async function theExpensiveHalfOfEveryRequestIsCached(): Promise<void> {
  let seen: Record<string, any> | null = null;
  await generateListing(
    { photos: [PHOTO], platforms: ['ebay'], currency: 'GBP' },
    {
      apiKey: 'sk-ant-test',
      fetch: async (_url, init) => {
        seen = JSON.parse(String((init as RequestInit).body));
        return stubResponse(toolMessage(GOOD_LISTING));
      },
    },
  );

  assert.ok(seen, 'the transport was never called');
  const request = seen as Record<string, any>;

  // System must be a block array, not a bare string - a string cannot carry
  // a breakpoint, and swapping it back is a silent 25% price rise.
  assert.ok(Array.isArray(request.system), 'the system prompt must be a block array to be cacheable');
  assert.equal(request.system[0].cache_control?.type, 'ephemeral', 'the breakpoint is missing');

  // Tools render before system, so one breakpoint covers both. The minimum is
  // per model and is NOT monotonic across generations - Sonnet 5 caches from
  // 1,024 tokens and Haiku 4.5 needs 4,096 - so the prefix is checked against
  // the model actually configured rather than against the one it was written
  // for. A marker below the minimum is accepted and silently does nothing.
  const prefix = JSON.stringify(request.tools).length + String(request.system[0].text).length;
  const tokens = prefix / 3.6;
  const model = requireModel();
  const minimum = CACHE_MINIMUM_TOKENS[model as keyof typeof CACHE_MINIMUM_TOKENS];
  assert.ok(
    tokens > minimum * 1.15,
    `the cached prefix is ~${Math.round(tokens)} tokens and ${model} caches from ${minimum} - `
    + 'the breakpoint would be ignored and every request billed in full',
  );

  // And the photo must stay AFTER the breakpoint: it is different every
  // request, and anything after the last breakpoint is not cached anyway.
  const content = request.messages[0].content as Array<Record<string, any>>;
  assert.ok(content.some((b) => b.type === 'image'), 'the photo must still be sent');
  assert.ok(!content.some((b) => b.cache_control), 'nothing per-request may carry a breakpoint');

  console.log('  ✓ the tool schema and system prompt are cached, the photo is not');
}

/**
 * The title rules reach the model, and say the right thing.
 *
 * Added after watching a real listing come back as "Harlem Eagles graphic
 * tee, size M, maroon, good condition" - fifty-seven of a hundred characters,
 * fourteen of them spent on two words nobody has ever typed into a search
 * box, while "eagle crest", "varsity" and "crew neck" were all visible in the
 * photo and all left out. The landing page criticises exactly that phrase.
 * The product was doing it.
 *
 * The exception is tested too, because getting it wrong the other way makes
 * new-with-tags listings worse: on Vinted and Depop people really do search
 * for unworn stock.
 */
function theTitleIsTreatedAsSearch(): void {
  const rules = LISTING_SYSTEM;

  assert.match(rules, /title is a search query/i, 'the title rule is missing');
  assert.match(rules, /good\s*\n?\s*condition/i, 'the rule must name the phrase it is banning');
  assert.match(rules, /new with tags|BNWT/i, 'the tags exception must survive - it is a real search term');
  assert.match(rules, /does not restate the title/i, 'the description must not repeat the title');

  // The rule is worth nothing if it never reaches the request.
  assert.match(rules, /characters of search left on the table/i, 'the unused-characters rule is missing');

  console.log('  ✓ the title is written as search, and the tags exception survives');
}

async function main(): Promise<void> {
  console.log('listing');
  await wiring();
  await budgetFailure();
  await refusal();
  await inputGuards();
  await apiErrorsStayBackstage();
  schemaRejectsInvention();
  platformLimits();
  descriptionLength();
  csvSurvivesRealContent();
  theHouseStyleSurvivesEveryLimit();
  theProfileNeverBreaksAListing();
  await relistAsksRatherThanInvents();
  diagnosisIsOptionalEverywhereElse();
  await theExpensiveHalfOfEveryRequestIsCached();
  theTitleIsTreatedAsSearch();
  console.log('all listing tests passed\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
