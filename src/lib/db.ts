import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Listing } from '@/lib/listing/schema';
import type { Platform } from '@/lib/listing/platforms';
import { generateReferralCode } from '@/lib/referrals';

/**
 * Storage, and the one thing it deliberately does not store: the photos.
 *
 * A listing's JSON is kept so the seller can reopen it on their laptop. The
 * image is not: it is sent to the model and dropped. That keeps the storage
 * bill at roughly nothing, removes the whole class of "someone uploaded a
 * photo of their passport" incident, and means a data request has a short
 * answer. The account row and the listing text are all there is.
 */

export type Plan = 'free' | 'pro';

export interface Account {
  id: string;
  email: string | null;
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  /** Stripe's own word for the subscription, kept verbatim for support. */
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
  /** Their own code, handed out. Every account gets one at creation. */
  referral_code: string;
  /** The account whose link brought them here, if any. */
  referred_by: string | null;
  /** Set once, when their subscription paid out the reward. Never re-fires. */
  referral_rewarded_at: string | null;
  /** Free listings earned by referring, on top of the plan's allowance. */
  bonus_listings: number;
}

export interface SavedListing {
  id: string;
  account_id: string;
  created_at: string;
  platform: Platform;
  listing: Listing;
}

export interface LoginCode {
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
}

export interface BillingUpdate {
  plan?: Plan;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
}

export interface RateVerdict {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: string;
}

export interface Store {
  init(): Promise<void>;
  /** Counts one hit against a bucket and says whether it is over. */
  hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateVerdict>;
  /** Which of the tables this app needs are missing from the live database. */
  missingTables(): Promise<string[]>;
  createAccount(email?: string | null, referredBy?: string | null): Promise<Account>;
  findAccountByReferralCode(code: string): Promise<Account | null>;
  countReferrals(accountId: string): Promise<number>;
  markReferralRewarded(accountId: string): Promise<void>;
  /** Moves one account's listings and earned bonus onto another. */
  absorbAccount(fromId: string, intoId: string): Promise<number>;
  addBonusListings(accountId: string, listings: number): Promise<void>;
  getAccount(id: string): Promise<Account | null>;
  findAccountByEmail(email: string): Promise<Account | null>;
  findAccountByCustomer(customerId: string): Promise<Account | null>;
  attachEmail(id: string, email: string): Promise<Account>;
  updateBilling(id: string, update: BillingUpdate): Promise<void>;
  saveListing(accountId: string, platform: Platform, listing: Listing): Promise<SavedListing>;
  recentListings(accountId: string, limit: number): Promise<SavedListing[]>;
  countListings(accountId: string, since?: Date): Promise<number>;
  putLoginCode(code: LoginCode): Promise<void>;
  getLoginCode(email: string): Promise<LoginCode | null>;
  bumpLoginAttempts(email: string): Promise<void>;
  clearLoginCode(email: string): Promise<void>;
}

const nowIso = () => new Date().toISOString();
const normalizeEmail = (email: string) => email.trim().toLowerCase();

function blankAccount(email: string | null, referredBy: string | null): Account {
  return {
    id: randomUUID(),
    email,
    plan: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    current_period_end: null,
    created_at: nowIso(),
    referral_code: generateReferralCode(),
    referred_by: referredBy,
    referral_rewarded_at: null,
    bonus_listings: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Local store: a JSON file, for development and the offline tests.
 * ------------------------------------------------------------------ */

interface RateRow { key: string; count: number; reset_at: string }

interface Snapshot {
  accounts: Account[];
  listings: SavedListing[];
  codes: LoginCode[];
  rates?: RateRow[];
}

export class FileStore implements Store {
  private path: string;
  private data: Snapshot = { accounts: [], listings: [], codes: [], rates: [] };

  constructor(path = process.env.PRICEBIRD_DATA_FILE ?? join(process.cwd(), '.data', 'pricebird.json')) {
    this.path = path;
  }

  async init(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.path, 'utf8')) as Snapshot;
    } catch {
      this.data = { accounts: [], listings: [], codes: [], rates: [] };
    }
    this.data.rates ??= [];
  }

  async missingTables(): Promise<string[]> {
    return [];
  }

  async hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateVerdict> {
    const rates = (this.data.rates ??= []);
    const now = Date.now();
    const existing = rates.find((r) => r.key === key);

    if (!existing || new Date(existing.reset_at).getTime() <= now) {
      const row = { key, count: 1, reset_at: new Date(now + windowSeconds * 1000).toISOString() };
      if (existing) Object.assign(existing, row); else rates.push(row);
      await this.flush();
      return { allowed: true, count: 1, limit, resetAt: row.reset_at };
    }

    existing.count += 1;
    await this.flush();
    return { allowed: existing.count <= limit, count: existing.count, limit, resetAt: existing.reset_at };
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.data, null, 2));
  }

  async createAccount(email: string | null = null, referredBy: string | null = null): Promise<Account> {
    const account = blankAccount(email ? normalizeEmail(email) : null, referredBy);
    this.data.accounts.push(account);
    await this.flush();
    return account;
  }

  async findAccountByReferralCode(code: string): Promise<Account | null> {
    return this.data.accounts.find((a) => a.referral_code === code.toUpperCase()) ?? null;
  }

  async countReferrals(accountId: string): Promise<number> {
    return this.data.accounts.filter((a) => a.referred_by === accountId).length;
  }

  async markReferralRewarded(accountId: string): Promise<void> {
    const account = this.data.accounts.find((a) => a.id === accountId);
    if (account) account.referral_rewarded_at = nowIso();
    await this.flush();
  }

  async absorbAccount(fromId: string, intoId: string): Promise<number> {
    if (fromId === intoId) return 0;
    const moved = this.data.listings.filter((l) => l.account_id === fromId);
    for (const listing of moved) listing.account_id = intoId;

    const from = this.data.accounts.find((a) => a.id === fromId);
    const into = this.data.accounts.find((a) => a.id === intoId);
    if (from && into) {
      into.bonus_listings += from.bonus_listings;
      from.bonus_listings = 0;
    }
    this.data.accounts = this.data.accounts.filter((a) => a.id !== fromId);
    await this.flush();
    return moved.length;
  }

  async addBonusListings(accountId: string, listings: number): Promise<void> {
    const account = this.data.accounts.find((a) => a.id === accountId);
    if (account) account.bonus_listings += listings;
    await this.flush();
  }

  async getAccount(id: string): Promise<Account | null> {
    return this.data.accounts.find((a) => a.id === id) ?? null;
  }

  async findAccountByEmail(email: string): Promise<Account | null> {
    const wanted = normalizeEmail(email);
    return this.data.accounts.find((a) => a.email === wanted) ?? null;
  }

  async findAccountByCustomer(customerId: string): Promise<Account | null> {
    return this.data.accounts.find((a) => a.stripe_customer_id === customerId) ?? null;
  }

  async attachEmail(id: string, email: string): Promise<Account> {
    const account = this.data.accounts.find((a) => a.id === id);
    if (!account) throw new Error(`No account ${id}`);
    account.email = normalizeEmail(email);
    await this.flush();
    return account;
  }

  async updateBilling(id: string, update: BillingUpdate): Promise<void> {
    const account = this.data.accounts.find((a) => a.id === id);
    if (!account) throw new Error(`No account ${id}`);
    Object.assign(account, update);
    await this.flush();
  }

  async saveListing(accountId: string, platform: Platform, listing: Listing): Promise<SavedListing> {
    const saved: SavedListing = { id: randomUUID(), account_id: accountId, created_at: nowIso(), platform, listing };
    this.data.listings.push(saved);
    await this.flush();
    return saved;
  }

  async recentListings(accountId: string, limit: number): Promise<SavedListing[]> {
    return this.data.listings
      .filter((l) => l.account_id === accountId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async countListings(accountId: string, since?: Date): Promise<number> {
    return this.data.listings.filter(
      (l) => l.account_id === accountId && (!since || new Date(l.created_at) >= since),
    ).length;
  }

  async putLoginCode(code: LoginCode): Promise<void> {
    const email = normalizeEmail(code.email);
    this.data.codes = this.data.codes.filter((c) => c.email !== email);
    this.data.codes.push({ ...code, email });
    await this.flush();
  }

  async getLoginCode(email: string): Promise<LoginCode | null> {
    return this.data.codes.find((c) => c.email === normalizeEmail(email)) ?? null;
  }

  async bumpLoginAttempts(email: string): Promise<void> {
    const code = this.data.codes.find((c) => c.email === normalizeEmail(email));
    if (code) code.attempts += 1;
    await this.flush();
  }

  async clearLoginCode(email: string): Promise<void> {
    this.data.codes = this.data.codes.filter((c) => c.email !== normalizeEmail(email));
    await this.flush();
  }
}

/* ------------------------------------------------------------------ *
 * Postgres, for anything with a real customer in it.
 * ------------------------------------------------------------------ */

export class PgStore implements Store {
  private pool: import('pg').Pool | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  private async client(): Promise<import('pg').Pool> {
    if (!this.pool) {
      const { Pool } = await import('pg');
      this.pool = new Pool({
        connectionString: this.url,
        // Supabase and Neon both terminate unencrypted connections; the
        // certificate chain is theirs, not ours, so verification is off for
        // the same reason every hosted Postgres client library does it.
        ssl: this.url.includes('localhost') ? undefined : { rejectUnauthorized: false },
        max: 4,
      });
    }
    return this.pool;
  }

  private async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const pool = await this.client();
    try {
      const result = await pool.query(text, values);
      return result.rows as T[];
    } catch (error) {
      // 42P01 is undefined_table, and on a fresh deployment it means one
      // thing: the database is reachable and the schema was never applied.
      // Postgres phrases that as `relation "accounts" does not exist`, which
      // says nothing about what to do next - and this error travels all the
      // way to a user staring at a phone.
      if ((error as { code?: string }).code === '42P01') {
        throw new Error(
          'the database is connected but empty - its tables have never been created. '
          + 'Apply db/schema.sql: run `npm run db:push`, or paste that file into your '
          + "database provider's SQL editor. It is safe to re-run.",
        );
      }
      throw error;
    }
  }

  async init(): Promise<void> {
    await this.query('select 1');
  }

  /**
   * Schema drift, named.
   *
   * db/schema.sql grew tables and columns after the first deploy, and nothing
   * told the operator to apply them. The symptom was a sign-in that failed
   * with a message describing neither cause nor fix. Health can simply ask.
   */
  async missingTables(): Promise<string[]> {
    const required = ['accounts', 'listings', 'login_codes', 'rate_limits'];
    const rows = await this.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)`,
      [required],
    );
    const present = new Set(rows.map((row) => row.table_name));
    const missing = required.filter((table) => !present.has(table));

    // Columns added later are the same class of problem and just as silent.
    // Only worth asking when the table itself is there - otherwise the answer
    // is four more lines all saying what "accounts" already said.
    if (missing.includes('accounts')) return missing;

    const columns = await this.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'accounts'`,
    );
    const have = new Set(columns.map((row) => row.column_name));
    for (const column of ['referral_code', 'referred_by', 'referral_rewarded_at', 'bonus_listings']) {
      if (!have.has(column)) missing.push(`accounts.${column}`);
    }
    return missing;
  }

  /**
   * One statement, so two requests arriving together cannot both read a count
   * of four and both decide they are allowed. The rollover is part of the same
   * upsert for the same reason.
   */
  async hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateVerdict> {
    const [row] = await this.query<{ count: number; reset_at: string }>(
      `insert into rate_limits (key, count, reset_at)
       values ($1, 1, now() + ($2 || ' seconds')::interval)
       on conflict (key) do update set
         count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
         reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
       returning count, reset_at`,
      [key, String(windowSeconds)],
    );
    return {
      allowed: row.count <= limit,
      count: row.count,
      limit,
      resetAt: new Date(row.reset_at).toISOString(),
    };
  }

  async createAccount(email: string | null = null, referredBy: string | null = null): Promise<Account> {
    // The code is generated here rather than defaulted in SQL so the same
    // alphabet rule holds whichever store is running.
    const [row] = await this.query<Account>(
      `insert into accounts (id, email, referral_code, referred_by)
       values ($1, $2, $3, $4) returning *`,
      [randomUUID(), email ? normalizeEmail(email) : null, generateReferralCode(), referredBy],
    );
    return row;
  }

  async findAccountByReferralCode(code: string): Promise<Account | null> {
    const [row] = await this.query<Account>(
      'select * from accounts where referral_code = $1', [code.toUpperCase()],
    );
    return row ?? null;
  }

  async countReferrals(accountId: string): Promise<number> {
    const [row] = await this.query<{ count: string }>(
      'select count(*)::text as count from accounts where referred_by = $1', [accountId],
    );
    return Number(row?.count ?? 0);
  }

  async markReferralRewarded(accountId: string): Promise<void> {
    await this.query('update accounts set referral_rewarded_at = now() where id = $1', [accountId]);
  }

  async absorbAccount(fromId: string, intoId: string): Promise<number> {
    if (fromId === intoId) return 0;

    const [moved] = await this.query<{ count: string }>(
      'with moved as (update listings set account_id = $2 where account_id = $1 returning 1) '
      + 'select count(*)::text as count from moved',
      [fromId, intoId],
    );

    await this.query(
      `update accounts set bonus_listings = bonus_listings
         + coalesce((select bonus_listings from accounts where id = $1), 0)
       where id = $2`,
      [fromId, intoId],
    );

    // Anything still pointing at the absorbed row - a referral it made - is
    // repointed before the row goes, or the delete fails on its own
    // foreign key and the sign-in breaks.
    await this.query('update accounts set referred_by = $2 where referred_by = $1', [fromId, intoId]);
    await this.query('delete from accounts where id = $1', [fromId]);
    return Number(moved?.count ?? 0);
  }

  async addBonusListings(accountId: string, listings: number): Promise<void> {
    await this.query(
      'update accounts set bonus_listings = bonus_listings + $2 where id = $1',
      [accountId, listings],
    );
  }

  async getAccount(id: string): Promise<Account | null> {
    const [row] = await this.query<Account>('select * from accounts where id = $1', [id]);
    return row ?? null;
  }

  async findAccountByEmail(email: string): Promise<Account | null> {
    const [row] = await this.query<Account>('select * from accounts where email = $1', [normalizeEmail(email)]);
    return row ?? null;
  }

  async findAccountByCustomer(customerId: string): Promise<Account | null> {
    const [row] = await this.query<Account>('select * from accounts where stripe_customer_id = $1', [customerId]);
    return row ?? null;
  }

  async attachEmail(id: string, email: string): Promise<Account> {
    const [row] = await this.query<Account>(
      'update accounts set email = $2 where id = $1 returning *',
      [id, normalizeEmail(email)],
    );
    if (!row) throw new Error(`No account ${id}`);
    return row;
  }

  async updateBilling(id: string, update: BillingUpdate): Promise<void> {
    const columns = Object.keys(update);
    if (columns.length === 0) return;
    const sets = columns.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await this.query(`update accounts set ${sets} where id = $1`, [id, ...columns.map((c) => (update as Record<string, unknown>)[c])]);
  }

  async saveListing(accountId: string, platform: Platform, listing: Listing): Promise<SavedListing> {
    const [row] = await this.query<SavedListing>(
      `insert into listings (id, account_id, platform, listing)
       values ($1, $2, $3, $4) returning id, account_id, created_at, platform, listing`,
      [randomUUID(), accountId, platform, JSON.stringify(listing)],
    );
    return row;
  }

  async recentListings(accountId: string, limit: number): Promise<SavedListing[]> {
    return this.query<SavedListing>(
      'select id, account_id, created_at, platform, listing from listings where account_id = $1 order by created_at desc limit $2',
      [accountId, limit],
    );
  }

  async countListings(accountId: string, since?: Date): Promise<number> {
    const [row] = since
      ? await this.query<{ count: string }>(
        'select count(*)::text as count from listings where account_id = $1 and created_at >= $2',
        [accountId, since.toISOString()],
      )
      : await this.query<{ count: string }>(
        'select count(*)::text as count from listings where account_id = $1', [accountId],
      );
    return Number(row?.count ?? 0);
  }

  async putLoginCode(code: LoginCode): Promise<void> {
    await this.query(
      `insert into login_codes (email, code_hash, expires_at, attempts)
       values ($1, $2, $3, 0)
       on conflict (email) do update set code_hash = excluded.code_hash,
         expires_at = excluded.expires_at, attempts = 0`,
      [normalizeEmail(code.email), code.code_hash, code.expires_at],
    );
  }

  async getLoginCode(email: string): Promise<LoginCode | null> {
    const [row] = await this.query<LoginCode>('select * from login_codes where email = $1', [normalizeEmail(email)]);
    return row ?? null;
  }

  async bumpLoginAttempts(email: string): Promise<void> {
    await this.query('update login_codes set attempts = attempts + 1 where email = $1', [normalizeEmail(email)]);
  }

  async clearLoginCode(email: string): Promise<void> {
    await this.query('delete from login_codes where email = $1', [normalizeEmail(email)]);
  }
}

let cached: Store | null = null;

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  const store: Store = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore();
  await store.init();
  cached = store;
  return store;
}

/** Test hook: forget the cached store so a fresh data file is picked up. */
export function resetStore(): void {
  cached = null;
}
