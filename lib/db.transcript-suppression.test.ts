import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pgMocks = vi.hoisted(() => {
  const query = vi.fn();
  const clientQuery = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query: clientQuery, release }));
  return { query, clientQuery, release, connect };
});

vi.mock("pg", () => ({
  Pool: class MockPool {
    query = pgMocks.query;
    connect = pgMocks.connect;
    on = vi.fn();
  },
}));

import {
  getActiveTranscriptByKalturaId,
  getAllTranscriptedEntries,
  getRecentlyCompletedTranscripts,
  getSitemapMeetingLanguages,
  getTranscriptByIdForDisplay,
  getTranscriptByKalturaId,
  getTranscriptLanguagesByKalturaId,
  scheduleTranscript,
} from "./db";

function sqlFromCall(call: unknown[]): string {
  const query = call[0] as string | { text: string };
  return typeof query === "string" ? query : query.text;
}

describe("transcript soft suppression", () => {
  beforeEach(() => {
    pgMocks.query.mockReset();
    pgMocks.query.mockResolvedValue({ rows: [] });
    pgMocks.clientQuery.mockReset();
    pgMocks.clientQuery.mockResolvedValue({ rows: [] });
    pgMocks.connect.mockClear();
    pgMocks.release.mockClear();
  });

  it("excludes suppressed rows from direct and active display lookups", async () => {
    await getTranscriptByIdForDisplay("suppressed-id");
    await getTranscriptByKalturaId("kaltura-id", "en");
    await getActiveTranscriptByKalturaId("kaltura-id", "en");
    await getTranscriptLanguagesByKalturaId("kaltura-id");

    expect(pgMocks.query).toHaveBeenCalledTimes(4);
    for (const call of pgMocks.query.mock.calls) {
      expect(sqlFromCall(call)).toContain("suppressed_at IS NULL");
    }
  });

  it("excludes suppressed rows from badges, sitemap, and notifications", async () => {
    await getAllTranscriptedEntries();
    await getSitemapMeetingLanguages(["en", "fr"]);
    await getRecentlyCompletedTranscripts(24);

    expect(pgMocks.query).toHaveBeenCalledTimes(3);
    for (const call of pgMocks.query.mock.calls) {
      expect(sqlFromCall(call)).toContain("suppressed_at IS NULL");
    }
  });

  it("allows scheduling a fresh row when the only prior row is suppressed", async () => {
    const result = await scheduleTranscript(
      "asset-id",
      "kaltura-id",
      null,
      null,
      "en",
      "00000000-0000-0000-0000-000000000001",
    );

    const sql = pgMocks.clientQuery.mock.calls.map(sqlFromCall);
    const activeLookup = sql.find((query) =>
      query.includes("SELECT * FROM webtv.transcripts"),
    );
    expect(activeLookup).toContain("suppressed_at IS NULL");
    expect(
      sql.some((query) => query.includes("INSERT INTO webtv.transcripts")),
    ).toBe(true);
    expect(result.stage).toBe("scheduled");
    expect(result.transcriptId).toMatch(/^scheduled-/);
  });
});

describe("legacy-model suppression migration", () => {
  const migration = readFileSync(
    new URL(
      "../sql/migrations/027_suppress_legacy_transcripts.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("gives explicit telemetry and Universal-3 prefixes precedence over the broad AssemblyAI fallback", () => {
    const explicitTelemetry = migration.indexOf("WHEN u.model IS NOT NULL");
    const universal35 = migration.indexOf("assemblyai-universal-3-5-pro-%");
    const universal3 = migration.indexOf("assemblyai-universal-3-pro-%");
    const broadAssemblyai = migration.indexOf(
      "t.transcript_id LIKE 'assemblyai-%'",
    );

    expect(explicitTelemetry).toBeGreaterThan(-1);
    expect(universal35).toBeGreaterThan(explicitTelemetry);
    expect(universal3).toBeGreaterThan(universal35);
    expect(broadAssemblyai).toBeGreaterThan(universal3);
  });

  it("backfills only completed, not-already-suppressed transcript rows", () => {
    expect(migration).toContain("t.transcription_status = 'completed'");
    expect(migration).toContain("AND t.suppressed_at IS NULL");
    expect(migration).toContain("a.transcription_model = 'universal-2'");
    expect(migration).toContain("a.transcription_model LIKE 'gemini%'");
  });
});
