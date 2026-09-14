/**
 * The rule that no secret ever reaches a customer's screen.
 *
 * Written after it did. Somebody signed in, the Resend key in the hosting
 * dashboard had picked up an invisible character on paste, fetch refused to
 * build the request, and the exception it threw quoted the whole header -
 * "Bearer re_..." - which the route handed straight to the browser. The key
 * was rendered in the sign-in form, in a screenshot, and in a chat log.
 *
 * Nothing about that was Resend's fault or fetch's. The route chose to print
 * a message written by somebody else's library. These tests encode the rule
 * that replaced that choice: error text crossing the boundary to a customer
 * goes through redact() first, and secrets are never the same string as the
 * sentence a person reads.
 */
import assert from 'node:assert/strict';
import { MailFailure, forgetMailVerdict, mailConfigProblems, sendMail, verifyMail } from '../src/lib/mail';
import { SECRET_NAMES, describeSecret, isHeaderSafe, readSecret, redact } from '../src/lib/secrets';

/**
 * The fixtures are assembled from pieces rather than written out.
 *
 * Not decoration: written as literals, the first push of this file was
 * refused by GitHub's push protection, which recognised the shapes as a live
 * Stripe key. That scanner is the same protection standing between a real key
 * and a public repository, so the answer is to stop tripping it, never to
 * click the link that turns it off. Splitting the prefix from the body keeps
 * every test below exercising a realistic shape without any line in this file
 * reading as a credential.
 */
const FAKE = {
  ANTHROPIC_API_KEY: ['sk', 'ant', 'api03', 'NOTREAL0123456789abcdefghijklmnop'].join('-'),
  STRIPE_SECRET_KEY: ['sk', 'live', 'NOTREAL0123456789abcdefghij'].join('_'),
  STRIPE_WEBHOOK_SECRET: ['whsec', 'NOTREAL0123456789abcdefghij'].join('_'),
  RESEND_API_KEY: ['re', 'NOTREAL0123456789abcdefghij'].join('_'),
  SESSION_SECRET: 'NOTREALSESSIONSECRET0123456789abcdef',
  DATABASE_URL: 'postgresql://user:NOTREALPASSWORD@db.example.com:5432/postgres',
};

/**
 * Runs something with the environment temporarily replaced.
 *
 * The await matters. Written as a plain try/finally around `return run()`,
 * the finally fires the moment an async callback yields its first promise,
 * so the environment is restored while the code under test is still running
 * and every later read sees nothing. That cost an hour of blaming the code
 * for a fault in the harness - so the promise is awaited inside the guard.
 */
async function withEnv<T>(env: Record<string, string | undefined>, run: () => T | Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function everySecretIsRemoved(): Promise<void> {
  await withEnv(FAKE, () => {
    for (const name of SECRET_NAMES) {
      const value = process.env[name]!;
      const leaked = `Headers.append: "Bearer ${value}" is an invalid header value.`;
      const cleaned = redact(leaked);
      assert.ok(!cleaned.includes(value), `${name} survived redact()`);
      assert.ok(cleaned.includes('[redacted]'), `${name} was removed without leaving a marker`);
    }
  });
}

async function theUntrimmedFormIsRemovedToo(): Promise<void> {
  // The exact shape of the live incident: the dashboard kept a newline, so
  // the stored value and the value used in the request were different strings.
  const raw = `${FAKE.RESEND_API_KEY}\n`;
  await withEnv({ RESEND_API_KEY: raw }, () => {
    assert.ok(!redact(`sent with ${raw}`).includes(FAKE.RESEND_API_KEY));
    assert.ok(!redact(`sent with ${FAKE.RESEND_API_KEY}`).includes(FAKE.RESEND_API_KEY));
  });
}

async function ordinaryMessagesSurvive(): Promise<void> {
  await withEnv(FAKE, () => {
    const message = 'Resend refused the send (422): the from address is not verified.';
    assert.equal(redact(message), message);
  });
  // A secret too short to be worth protecting must not eat real words.
  await withEnv({ SESSION_SECRET: 'short' }, () => {
    assert.equal(redact('this is a short sentence'), 'this is a short sentence');
  });
}

async function aMailFailureNeverCarriesTheKeyToTheReader(): Promise<void> {
  await withEnv(FAKE, () => {
    const failure = new MailFailure(
      'The code could not be sent.',
      `Headers.append: "Bearer ${FAKE.RESEND_API_KEY}" is an invalid header value.`,
    );
    // Both halves. The operator half is logged, and logs get pasted into chats.
    assert.ok(!failure.message.includes(FAKE.RESEND_API_KEY));
    assert.ok(!failure.operator.includes(FAKE.RESEND_API_KEY));
    assert.ok(!failure.message.includes(FAKE.RESEND_API_KEY.slice(0, 8)));
    assert.ok(failure.operator.includes('[redacted]'));
  });
}

async function anIllegalKeyIsRefusedBeforeItIsEverPutInAHeader(): Promise<void> {
  assert.equal(isHeaderSafe(`${FAKE.RESEND_API_KEY} `), false, 'a trailing space must be caught');
  assert.equal(isHeaderSafe(`${FAKE.RESEND_API_KEY}\n`), false, 'a newline must be caught');
  assert.equal(isHeaderSafe(`${FAKE.RESEND_API_KEY}\u00a0`), false, 'a non-breaking space must be caught');
  assert.equal(isHeaderSafe(`re_\u00a0${FAKE.RESEND_API_KEY}`), false, 'one in the middle must be caught too');
  assert.equal(isHeaderSafe(FAKE.RESEND_API_KEY), true, 'a clean key must pass');

  // A trailing newline is not an error at all: readSecret removes it, so the
  // send simply works. That is the whole point of reading secrets forgivingly.
  await withEnv({ RESEND_API_KEY: `${FAKE.RESEND_API_KEY}\n`, MAIL_FROM: 'hi@pricebird.org' }, () => {
    assert.equal(readSecret('RESEND_API_KEY'), FAKE.RESEND_API_KEY);
    assert.deepEqual(mailConfigProblems(), []);
  });

  // A character in the middle cannot be trimmed away, so it has to be named by
  // health rather than discovered by a customer. Two kinds, and they are not
  // the same thing: a non-breaking space is illegal in a header and makes
  // fetch throw before any request exists, while a plain space is perfectly
  // legal in a header and simply means the paste took half the key. Both are
  // broken, both must be named, and neither message may quote the value.
  const gaps = [['\u00a0', /cannot be sent in an HTTP header/], [' ', /truncated on paste/]] as const;
  for (const [gap, expected] of gaps) {
    const illegal = `${FAKE.RESEND_API_KEY.slice(0, 10)}${gap}${FAKE.RESEND_API_KEY.slice(10)}`;
    await withEnv({ RESEND_API_KEY: illegal, MAIL_FROM: 'hi@pricebird.org' }, () => {
      const problems = mailConfigProblems();
      assert.equal(problems.length, 1, `expected one problem for gap ${JSON.stringify(gap)}`);
      assert.match(problems[0], expected);
      assert.ok(!problems[0].includes(illegal.slice(0, 10)), 'health must not quote the key either');
    });
  }
}

/**
 * The same status code, two different faults.
 *
 * Resend answers 403 both for a key it will not accept and for a domain that
 * was never verified. Reporting "credentials" for both cost an afternoon of
 * replacing a key that was fine, while the real answer sat in the response
 * body. The body decides which sentence is shown.
 */
async function aRejectionNamesTheRightFault(): Promise<void> {
  const cases: [string, string, RegExp][] = [
    ['an unverified domain', '{"message":"The pricebird.org domain is not verified."}', /sending domain is not verified/],
    ['a bad key', '{"message":"API key is invalid"}', /rejected our credentials/],
  ];

  for (const [name, body, expected] of cases) {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response(body, { status: 403 })) as typeof fetch;
    try {
      await withEnv(
        { RESEND_API_KEY: FAKE.RESEND_API_KEY, MAIL_FROM: 'hello@pricebird.org', NODE_ENV: 'production' },
        async () => {
          await assert.rejects(
            sendMail({ to: 'someone@example.com', subject: 'x', text: 'y' }),
            (error: unknown) => {
              assert.ok(error instanceof MailFailure, name);
              assert.match(error.message, expected, name);
              return true;
            },
          );
        },
      );
    } finally {
      globalThis.fetch = real;
    }
  }
}

async function theSendPathRefusesRatherThanThrowingRawText(): Promise<void> {
  await withEnv(
    {
      RESEND_API_KEY: `${FAKE.RESEND_API_KEY.slice(0, 10)}\u00a0${FAKE.RESEND_API_KEY.slice(10)}`,
      MAIL_FROM: 'hi@pricebird.org',
      NODE_ENV: 'production',
    },
    async () => {
      await assert.rejects(
        sendMail({ to: 'someone@example.com', subject: 'x', text: 'y' }),
        (error: unknown) => {
          assert.ok(error instanceof MailFailure);
          assert.ok(!error.message.includes(FAKE.RESEND_API_KEY.slice(0, 10)));
          assert.match(error.message, /could not be sent/);
          return true;
        },
      );
    },
  );
}

async function describeSecretDescribesWithoutRevealing(): Promise<void> {
  await withEnv({ RESEND_API_KEY: `"${FAKE.RESEND_API_KEY}" ` }, () => {
    const shape = describeSecret('RESEND_API_KEY', 're_');
    assert.equal(shape.present, true);
    assert.equal(shape.length, FAKE.RESEND_API_KEY.length);
    assert.equal(shape.problems.length, 2);
    for (const problem of shape.problems) {
      assert.ok(!problem.includes(FAKE.RESEND_API_KEY.slice(3)), 'a problem quoted the key');
    }
  });
}

/**
 * What health is allowed to claim about email.
 *
 * The check used to look only at the environment - present, right length,
 * legal characters - and reported "Resend configured" in bright green while
 * Resend was rejecting every single send. A health check that is confidently
 * wrong is worse than one that does not exist: it sends you looking in the
 * wrong place. So the question is now asked of Resend, and these tests pin
 * down every answer it can give.
 */
async function withResend<T>(
  reply: { status: number; body?: unknown } | 'unreachable',
  run: () => Promise<T>,
): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (reply === 'unreachable') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

async function healthTellsTheTruthAboutEmail(): Promise<void> {
  const env = { RESEND_API_KEY: FAKE.RESEND_API_KEY, MAIL_FROM: 'codes@pricebird.org' };
  const domains = (status: string) => ({ data: [{ name: 'pricebird.org', status }] });

  // ok and canSend are separate columns on purpose. Conflating them hid the
  // sign-in form from the operator while they were mid-fix on a temporary
  // address that sent perfectly well - the exact lockout the page exists to
  // prevent, caused by the page.
  const cases: [string, { status: number; body?: unknown } | 'unreachable', boolean, boolean, RegExp][] = [
    ['a working key and a verified domain', { status: 200, body: domains('verified') }, true, true, /accepted the key/],
    ['a rejected key', { status: 401 }, false, false, /rejected the key/],
    ['a key from another account', { status: 403 }, false, false, /rejected the key/],
    ['a domain that is not on the account', { status: 200, body: { data: [] } }, false, false, /not a domain on this account/],
    ['a domain still waiting on DNS', { status: 200, body: domains('pending') }, false, false, /rather than verified/],
    ['Resend being down', 'unreachable', true, true, /could not be reached/],
  ];

  for (const [name, reply, ok, canSend, expected] of cases) {
    forgetMailVerdict();
    const verdict = await withEnv(env, () => withResend(reply, () => verifyMail(500)));
    assert.equal(verdict.ok, ok, `${name}: expected ok=${ok}, got ${verdict.ok} - "${verdict.detail}"`);
    assert.equal(verdict.canSend, canSend, `${name}: expected canSend=${canSend} - "${verdict.detail}"`);
    assert.match(verdict.detail, expected, name);
    assert.ok(!verdict.detail.includes(FAKE.RESEND_API_KEY.slice(0, 10)), `${name}: health quoted the key`);
  }


  // The shared test sender deserves its own case: every signal Resend gives
  // is healthy - valid key, successful request - and a customer still never
  // receives a code, because it only delivers to the account's own address.
  forgetMailVerdict();
  const shared = await withEnv(
    { RESEND_API_KEY: FAKE.RESEND_API_KEY, MAIL_FROM: 'Pricebird <onboarding@resend.dev>' },
    () => withResend({ status: 200, body: domains('verified') }, () => verifyMail(500)),
  );
  assert.equal(shared.ok, false, 'the shared test sender must not report green');
  assert.equal(
    shared.canSend,
    true,
    'the shared sender does send - treating it as broken locks out the one person it works for',
  );
  assert.match(shared.detail, /only to your own Resend/);

  // A display name around the address must not confuse the domain check.
  forgetMailVerdict();
  const named = await withEnv(
    { RESEND_API_KEY: FAKE.RESEND_API_KEY, MAIL_FROM: 'Pricebird <hello@pricebird.org>' },
    () => withResend({ status: 200, body: domains('verified') }, () => verifyMail(500)),
  );
  assert.equal(named.ok, true, `a display name broke the domain check: ${named.detail}`);

  // Resend being unreachable is not a misconfiguration, and it must not be
  // remembered either - the next look has to ask again.
  forgetMailVerdict();
  await withEnv(env, async () => {
    await withResend('unreachable', () => verifyMail(500));
    const second = await withResend({ status: 200, body: domains('verified') }, () => verifyMail(500));
    assert.equal(second.ok, true);
    assert.match(second.detail, /accepted the key/, 'a blip was cached and outlived itself');
  });

  // A real answer is cached, because health is a public URL and must not
  // become a way to hammer Resend with our credentials.
  forgetMailVerdict();
  await withEnv(env, async () => {
    await withResend({ status: 200, body: domains('verified') }, () => verifyMail(500));
    let called = false;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 401 }); }) as typeof fetch;
    try {
      const again = await verifyMail(500);
      assert.equal(called, false, 'the cached answer was not used');
      assert.equal(again.ok, true);
    } finally {
      globalThis.fetch = real;
    }
  });
}

async function main(): Promise<void> {
  console.log('\nsecrets');
  const tests: [string, () => void | Promise<void>][] = [
    ['no configured secret survives a leak through redact()', everySecretIsRemoved],
    ['the pasted form and the cleaned form are both removed', theUntrimmedFormIsRemovedToo],
    ['an ordinary error message is left alone', ordinaryMessagesSurvive],
    ['a mail failure keeps the key out of both of its halves', aMailFailureNeverCarriesTheKeyToTheReader],
    ['a key that cannot be a header is caught before the request', anIllegalKeyIsRefusedBeforeItIsEverPutInAHeader],
    ['the send path fails with a sentence, not with library text', theSendPathRefusesRatherThanThrowingRawText],
    ['a 403 names the domain or the key, whichever it actually was', aRejectionNamesTheRightFault],
    ['a secret is described by its shape, never by its contents', describeSecretDescribesWithoutRevealing],
    ['health asks Resend rather than guessing from the environment', healthTellsTheTruthAboutEmail],
  ];

  for (const [name, run] of tests) {
    await run();
    console.log(`  ✓ ${name}`);
  }
  console.log('all secret tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
