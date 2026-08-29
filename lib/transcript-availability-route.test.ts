import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import type { VideoRecord } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  getVideoByAssetId: vi.fn(),
  getVideoByKalturaId: vi.fn(),
  getVideosByEntryId: vi.fn(),
  getTranscriptLanguagesByKalturaId: vi.fn(),
}));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  ...mocks,
}));

vi.mock("@/lib/get-base-url", () => ({
  getBaseUrl: vi.fn(async () => "https://transcripts.un.org"),
}));

import { GET, OPTIONS } from "@/app/api/transcripts/availability/route";

const record = {
  asset_id: "k1h/k1hrmtg9f4",
  entry_id: "1_yuo0w3j6",
  kaltura_id: "1_hrmtg9f4",
  pv_symbol: null,
  pv_part: null,
  removed_at: null,
} as VideoRecord;

describe("GET /api/transcripts/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVideoByKalturaId.mockResolvedValue(record);
    mocks.getTranscriptLanguagesByKalturaId.mockResolvedValue([]);
  });

  it("is publicly readable and returns lightweight recording availability", async () => {
    const response = await GET(
      new NextRequest(
        "https://transcripts.un.org/api/transcripts/availability?kalturaId=1_hrmtg9f4&locale=fr",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    await expect(response.json()).resolves.toMatchObject({
      generationUrl: "https://transcripts.un.org/fr/asset/k1h/k1hrmtg9f4",
      matches: [
        {
          kalturaId: "1_hrmtg9f4",
          status: "unavailable",
          languages: [],
        },
      ],
    });
  });

  it("returns structured 400 errors with CORS for malformed input", async () => {
    const response = await GET(
      new NextRequest(
        "https://transcripts.un.org/api/transcripts/availability?kalturaId=nope",
      ),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_identifier",
        message: "kalturaId must be a Kaltura ID such as 1_abcdefgh.",
      },
    });
  });

  it("answers CORS preflight", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "GET",
    );
  });

  it("does not misclassify database failures as invalid identifiers", async () => {
    mocks.getVideoByKalturaId.mockRejectedValue(
      new Error("entryId database lookup failed"),
    );
    const response = await GET(
      new NextRequest(
        "https://transcripts.un.org/api/transcripts/availability?kalturaId=1_hrmtg9f4",
      ),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Could not resolve transcript status.",
      },
    });
  });
});
