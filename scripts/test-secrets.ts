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
import { MailFailure, mailConfigProblems, sendMail } from '../src/lib/mail';
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

function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function everySecretIsRemoved(): void {
  withEnv(FAKE, () => {
    for (const name of SECRET_NAMES) {
      const value = process.env[name]!;
      const leaked = `Headers.append: "Bearer ${value}" is an invalid header value.`;
      const cleaned = redact(leaked);
      assert.ok(!cleaned.includes(value), `${name} survived redact()`);
      assert.ok(cleaned.includes('[redacted]'), `${name} was removed without leaving a marker`);
    }
  });
}

function theUntrimmedFormIsRemovedToo(): void {
  // The exact shape of the live incident: the dashboard kept a newline, so
  // the stored value and the value used in the request were different strings.
  const raw = `${FAKE.RESEND_API_KEY}\n`;
  withEnv({ RESEND_API_KEY: raw }, () => {
    assert.ok(!redact(`sent with ${raw}`).includes(FAKE.RESEND_API_KEY));
    assert.ok(!redact(`sent with ${FAKE.RESEND_API_KEY}`).includes(FAKE.RESEND_API_KEY));
  });
}

function ordinaryMessagesSurvive(): void {
  withEnv(FAKE, () => {
    const message = 'Resend refused the send (422): the from address is not verified.';
    assert.equal(redact(message), message);
  });
  // A secret too short to be worth protecting must not eat real words.
  withEnv({ SESSION_SECRET: 'short' }, () => {
    assert.equal(redact('this is a short sentence'), 'this is a short sentence');
  });
}

function aMailFailureNeverCarriesTheKeyToTheReader(): void {
  withEnv(FAKE, () => {
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

function anIllegalKeyIsRefusedBeforeItIsEverPutInAHeader(): void {
  assert.equal(isHeaderSafe(`${FAKE.RESEND_API_KEY} `), false, 'a trailing space must be caught');
  assert.equal(isHeaderSafe(`${FAKE.RESEND_API_KEY}\n`), false, 'a newline must be caught');
  assert.equal(isHeaderSafe(`${FAKE.RESEND_API_KEY}\u00a0`), false, 'a non-breaking space must be caught');
  assert.equal(isHeaderSafe(`re_\u00a0${FAKE.RESEND_API_KEY}`), false, 'one in the middle must be caught too');
  assert.equal(isHeaderSafe(FAKE.RESEND_API_KEY), true, 'a clean key must pass');

  // A trailing newline is not an error at all: readSecret removes it, so the
  // send simply works. That is the whole point of reading secrets forgivingly.
  withEnv({ RESEND_API_KEY: `${FAKE.RESEND_API_KEY}\n`, MAIL_FROM: 'hi@pricebird.org' }, () => {
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
    withEnv({ RESEND_API_KEY: illegal, MAIL_FROM: 'hi@pricebird.org' }, () => {
      const problems = mailConfigProblems();
      assert.equal(problems.length, 1, `expected one problem for gap ${JSON.stringify(gap)}`);
      assert.match(problems[0], expected);
      assert.ok(!problems[0].includes(illegal.slice(0, 10)), 'health must not quote the key either');
    });
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

function describeSecretDescribesWithoutRevealing(): void {
  withEnv({ RESEND_API_KEY: `"${FAKE.RESEND_API_KEY}" ` }, () => {
    const shape = describeSecret('RESEND_API_KEY', 're_');
    assert.equal(shape.present, true);
    assert.equal(shape.length, FAKE.RESEND_API_KEY.length);
    assert.equal(shape.problems.length, 2);
    for (const problem of shape.problems) {
      assert.ok(!problem.includes(FAKE.RESEND_API_KEY.slice(3)), 'a problem quoted the key');
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
    ['a secret is described by its shape, never by its contents', describeSecretDescribesWithoutRevealing],
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
