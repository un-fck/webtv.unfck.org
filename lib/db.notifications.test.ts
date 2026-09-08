import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client, type Pool as PgPool } from "pg";

const state = vi.hoisted(() => ({ url: "", pools: [] as PgPool[] }));
vi.mock("./load-env", () => ({}));
vi.mock("pg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pg")>();
  return {
    ...actual,
    Pool: class extends actual.Pool {
      constructor() {
        if (!state.url)
          throw new Error("Missing isolated notification test database");
        super({ connectionString: state.url, ssl: false });
        state.pools.push(this);
      }
    },
  };
});
import { claimTranscriptNotification, getRetranscriptionRequester } from "./db";

// Opt-in real PostgreSQL tests. Creates and drops only its own uniquely named
// database on a local disposable server; never reads DATABASE_URL or .env.
const baseUrl = process.env.TEST_NOTIFICATION_DB_URL;
describe.skipIf(!baseUrl)("notification claims (PostgreSQL)", () => {
  let admin: Client;
  let db: Client;
  const name = `notification_test_${randomUUID().replaceAll("-", "")}`;
  const user = "00000000-0000-0000-0000-000000000001";
  const other = "00000000-0000-0000-0000-000000000002";
  beforeAll(async () => {
    const url = new URL(baseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error(
        "Notification tests require a disposable local PostgreSQL server",
      );
    }
    admin = new Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    url.pathname = `/${name}`;
    state.url = url.toString();
    db = new Client({ connectionString: state.url });
    await db.connect();
    await db.query(`CREATE SCHEMA webtv;
      CREATE TABLE webtv.users (id uuid PRIMARY KEY, email text NOT NULL);
      CREATE TABLE webtv.transcripts (
        transcript_id text PRIMARY KEY, kaltura_id text NOT NULL,
        language_code text NOT NULL, created_by uuid REFERENCES webtv.users,
        transcription_status text NOT NULL DEFAULT 'completed', suppressed_at timestamptz
      );
      CREATE TABLE webtv.sent_transcript_notifications (
        user_id uuid REFERENCES webtv.users, transcript_id text REFERENCES webtv.transcripts,
        sent_at timestamptz DEFAULT now(), PRIMARY KEY(user_id, transcript_id)
      );`);
    await db.query(
      readFileSync(
        new URL(
          "../sql/migrations/028_retranscription_notifications.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  });
  beforeEach(async () => {
    await db.query(
      "TRUNCATE webtv.sent_transcript_notifications, webtv.transcripts, webtv.users",
    );
    await db.query(
      "INSERT INTO webtv.users VALUES ($1, 'requester@example.test'), ($2, 'subscriber@example.test')",
      [user, other],
    );
    await db.query(
      `INSERT INTO webtv.transcripts (transcript_id, kaltura_id, language_code, created_by, is_retranscription)
      VALUES ('old', 'meeting', 'en', NULL, false), ('new', 'meeting', 'en', $1, true),
             ('fr', 'meeting', 'fr', NULL, false), ('unrelated', 'another', 'en', NULL, false)`,
      [user],
    );
  });
  afterAll(async () => {
    await Promise.all(state.pools.map((pool) => pool.end()));
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  });

  it("counts historical ledger entries across transcript versions", async () => {
    await db.query(
      "INSERT INTO webtv.sent_transcript_notifications (user_id, transcript_id) VALUES ($1, 'old')",
      [other],
    );
    expect(await claimTranscriptNotification(other, "new")).toBe(false);
    expect(await claimTranscriptNotification(other, "fr")).toBe(true);
    expect(await claimTranscriptNotification(other, "unrelated")).toBe(true);
  });
  it("serializes concurrent versions and repeated instant/cron claims", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        claimTranscriptNotification(other, i % 2 ? "old" : "new"),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      (await db.query("SELECT * FROM webtv.sent_transcript_notifications"))
        .rowCount,
    ).toBe(1);
  });
  it("allows the replacement requester one additional notification", async () => {
    expect(await claimTranscriptNotification(user, "old")).toBe(true);
    const results = await Promise.all([
      claimTranscriptNotification(user, "new"),
      claimTranscriptNotification(user, "new"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await getRetranscriptionRequester("new")).toEqual({
      user_id: user,
      email: "requester@example.test",
    });
    expect(await getRetranscriptionRequester("old")).toBeNull();
  });
  it("does not let a late original email follow a replacement notification", async () => {
    expect(await claimTranscriptNotification(user, "new")).toBe(true);
    expect(await claimTranscriptNotification(user, "old")).toBe(false);
  });
  it("does not treat an ordinary creator as a replacement requester", async () => {
    await db.query(
      "UPDATE webtv.transcripts SET is_retranscription = false WHERE transcript_id = 'new'",
    );
    expect(await claimTranscriptNotification(user, "old")).toBe(true);
    expect(await claimTranscriptNotification(user, "new")).toBe(false);
    expect(await getRetranscriptionRequester("new")).toBeNull();
  });
  it("rejects missing, unfinished, and suppressed transcripts", async () => {
    await db.query(
      "UPDATE webtv.transcripts SET transcription_status='error' WHERE transcript_id='old'",
    );
    await db.query(
      "UPDATE webtv.transcripts SET suppressed_at=now() WHERE transcript_id='new'",
    );
    expect(await claimTranscriptNotification(user, "missing")).toBe(false);
    expect(await claimTranscriptNotification(user, "old")).toBe(false);
    expect(await claimTranscriptNotification(user, "new")).toBe(false);
  });
});
