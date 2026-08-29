import { describe, expect, it, vi } from "vitest";

import type { TranscriptLanguageInfo, VideoRecord } from "@/lib/db";
import {
  parseTranscriptIdentifier,
  resolveTranscriptAvailability,
  type AvailabilityDependencies,
} from "@/lib/transcript-availability";
import { TranscriptAvailabilityResponseSchema } from "@/lib/openapi/schemas";

const BASE_URL = "https://transcripts.un.org";

function video(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    asset_id: "k1h/k1hrmtg9f4",
    entry_id: "1_yuo0w3j6",
    kaltura_id: "1_hrmtg9f4",
    title: "Meeting",
    clean_title: "Meeting",
    date: "2026-08-29",
    scheduled_time: new Date("2026-08-29T14:00:00Z"),
    duration: 3600,
    url: "https://webtv.un.org/en/asset/k1h/k1hrmtg9f4",
    body: "Security Council",
    category: "Security Council",
    event_code: null,
    event_type: null,
    session_number: null,
    pv_symbol: "S/PV.10001",
    pv_part: 1,
    pv_available: null,
    pv_checked_at: null,
    removed_at: null,
    last_seen: "2026-08-29",
    created_at: new Date("2026-08-29T14:00:00Z"),
    updated_at: new Date("2026-08-29T14:00:00Z"),
    i18n: {},
    ...overrides,
  };
}

function transcript(
  language_code: string,
  transcription_status: TranscriptLanguageInfo["transcription_status"],
): TranscriptLanguageInfo {
  return {
    language_code,
    transcription_status,
    transcript_id: `${language_code}-${transcription_status}`,
  };
}

function dependencies(
  options: {
    byAsset?: VideoRecord | null;
    byKaltura?: VideoRecord | null;
    byEntry?: VideoRecord[];
    languages?: TranscriptLanguageInfo[];
  } = {},
): AvailabilityDependencies {
  return {
    getVideoByAssetId: vi.fn(async () => options.byAsset ?? null),
    getVideoByKalturaId: vi.fn(async () => options.byKaltura ?? null),
    getVideosByEntryId: vi.fn(async () => options.byEntry ?? []),
    getTranscriptLanguagesByKalturaId: vi.fn(
      async () => options.languages ?? [],
    ),
  };
}

describe("parseTranscriptIdentifier", () => {
  it("accepts each explicit identifier form", () => {
    expect(parseTranscriptIdentifier({ assetId: "k1h/k1hrmtg9f4" })).toEqual({
      type: "assetId",
      value: "k1h/k1hrmtg9f4",
    });
    expect(parseTranscriptIdentifier({ kalturaId: "1_hrmtg9f4" })).toEqual({
      type: "kalturaId",
      value: "1_hrmtg9f4",
    });
    expect(parseTranscriptIdentifier({ entryId: "1_yuo0w3j6" })).toEqual({
      type: "entryId",
      value: "1_yuo0w3j6",
    });
  });

  it("extracts the full asset ID from a localized WebTV URL", () => {
    expect(
      parseTranscriptIdentifier({
        webtvUrl:
          "https://webtv.un.org/fr/asset/k1h/k1hrmtg9f4?utm_source=my-un",
      }),
    ).toEqual({ type: "assetId", value: "k1h/k1hrmtg9f4" });
  });

  it("rejects unsupported hosts, malformed IDs, and multiple identifiers", () => {
    expect(() =>
      parseTranscriptIdentifier({
        webtvUrl: "https://example.com/en/asset/k1h/k1hrmtg9f4",
      }),
    ).toThrow("webtvUrl");
    expect(() => parseTranscriptIdentifier({ kalturaId: "not-an-id" })).toThrow(
      "kalturaId",
    );
    expect(() =>
      parseTranscriptIdentifier({
        assetId: "k1h/k1hrmtg9f4",
        kalturaId: "1_hrmtg9f4",
      }),
    ).toThrow("exactly one");
    expect(() =>
      parseTranscriptIdentifier({
        webtvUrl: "https://webtv.un.org/en/asset/%E0%A4%A",
      }),
    ).toThrow("webtvUrl");
  });
});

describe("resolveTranscriptAvailability", () => {
  it("resolves a redirected player ID without joining through entry_id", async () => {
    const record = video();
    const deps = dependencies({
      byKaltura: record,
      languages: [
        transcript("en", "completed"),
        transcript("fr", "transcribing"),
      ],
    });

    const result = await resolveTranscriptAvailability(
      { kalturaId: "1_hrmtg9f4" },
      { locale: "en", baseUrl: BASE_URL },
      deps,
    );

    expect(deps.getVideoByKalturaId).toHaveBeenCalledWith("1_hrmtg9f4");
    expect(deps.getVideosByEntryId).not.toHaveBeenCalled();
    expect(result).toEqual({
      query: { type: "kalturaId", value: "1_hrmtg9f4" },
      generationUrl: "https://transcripts.un.org/en/sc/10001",
      matches: [
        expect.objectContaining({
          assetId: "k1h/k1hrmtg9f4",
          kalturaId: "1_hrmtg9f4",
          entryId: "1_yuo0w3j6",
          status: "available",
          removed: false,
          pvSymbol: "S/PV.10001",
          pvPart: 1,
          pageUrl: "https://transcripts.un.org/en/sc/10001",
          jsonUrl: "https://transcripts.un.org/en/sc/10001.json",
          generationUrl: "https://transcripts.un.org/en/sc/10001",
          languages: [
            {
              language: "en",
              status: "completed",
              transcriptId: "en-completed",
            },
            {
              language: "fr",
              status: "transcribing",
              transcriptId: "fr-transcribing",
            },
          ],
        }),
      ],
    });
    expect(() =>
      TranscriptAvailabilityResponseSchema.parse(result),
    ).not.toThrow();
  });

  it("returns every video for an ambiguous canonical entry ID", async () => {
    const first = video();
    const second = video({
      asset_id: "k1a/k1aparttwo",
      kaltura_id: "1_parttwo",
      pv_part: 2,
    });
    const deps = dependencies({ byEntry: [second, first] });

    const result = await resolveTranscriptAvailability(
      { entryId: "1_yuo0w3j6" },
      { locale: "fr", baseUrl: BASE_URL },
      deps,
    );

    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((match) => match.pvPart)).toEqual([1, 2]);
    expect(result.generationUrl).toBe("https://transcripts.un.org/fr");
  });

  it("safely falls back from an unknown player ID to entry aliases", async () => {
    const alias = video({ kaltura_id: "1_stablealias" });
    const deps = dependencies({ byEntry: [alias] });
    const result = await resolveTranscriptAvailability(
      { kalturaId: "1_yuo0w3j6" },
      { locale: "en", baseUrl: BASE_URL },
      deps,
    );
    expect(deps.getVideoByKalturaId).toHaveBeenCalledWith("1_yuo0w3j6");
    expect(deps.getVideosByEntryId).toHaveBeenCalledWith("1_yuo0w3j6");
    expect(result.matches[0]?.kalturaId).toBe("1_stablealias");
  });

  it.each([
    ["scheduled", "processing"],
    ["interrupted", "processing"],
    ["error", "unavailable"],
  ] as const)(
    "maps %s transcript state to %s availability",
    async (transcriptionStatus, expectedStatus) => {
      const deps = dependencies({
        byAsset: video(),
        languages: [transcript("en", transcriptionStatus)],
      });
      const result = await resolveTranscriptAvailability(
        { assetId: "k1h/k1hrmtg9f4" },
        { locale: "en", baseUrl: BASE_URL },
        deps,
      );
      expect(result.matches[0]?.status).toBe(expectedStatus);
    },
  );

  it("marks removed videos regardless of transcript rows", async () => {
    const deps = dependencies({
      byAsset: video({ removed_at: new Date("2026-08-30T00:00:00Z") }),
      languages: [transcript("en", "completed")],
    });
    const result = await resolveTranscriptAvailability(
      { assetId: "k1h/k1hrmtg9f4" },
      { locale: "en", baseUrl: BASE_URL },
      deps,
    );
    expect(result.matches[0]).toMatchObject({
      removed: true,
      status: "removed",
      languages: [],
    });
  });

  it("returns a safe generation fallback for valid unresolved input", async () => {
    const result = await resolveTranscriptAvailability(
      { kalturaId: "1_unknown1" },
      { locale: "es", baseUrl: `${BASE_URL}/` },
      dependencies(),
    );
    expect(result).toEqual({
      query: { type: "kalturaId", value: "1_unknown1" },
      generationUrl: "https://transcripts.un.org/es",
      matches: [],
    });
  });
});
