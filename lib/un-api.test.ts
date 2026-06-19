import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  extractMetadataFromTitle,
  cleanTitle,
  calculateStatus,
  decodeEventCode,
  videoToRecord,
  type Video,
} from "@/lib/un-api";

interface VideoFixture {
  id: string;
  title: string;
  category: string;
  date: string;
  duration: string;
  scheduledTime: string | null;
  expected: {
    eventCode: string | null;
    eventType: string | null;
    body: string | null;
    sessionNumber: string | null;
    cleanTitle: string;
    pvSymbol: string | null;
    statusWhenFinished: "finished" | "live" | "scheduled";
  };
}

const fixtures: VideoFixture[] = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "videos.sample.json"), "utf8"),
);

describe("title metadata extraction (real UN video titles)", () => {
  it("has a diverse sample", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    const bodies = new Set(fixtures.map((f) => f.expected.body));
    // Several distinct bodies + the no-body (event) case.
    expect(bodies.size).toBeGreaterThanOrEqual(8);
  });

  it.each(fixtures)("reproduces stored metadata for $title", (fx) => {
    const meta = extractMetadataFromTitle(fx.title, fx.category);
    expect(meta).toEqual({
      eventCode: fx.expected.eventCode,
      eventType: fx.expected.eventType,
      body: fx.expected.body,
      sessionNumber: fx.expected.sessionNumber,
    });
    expect(cleanTitle(fx.title, meta)).toBe(fx.expected.cleanTitle);
  });
});

describe("videoToRecord (real rows)", () => {
  function toVideo(fx: VideoFixture): Video {
    return {
      id: fx.id,
      url: `https://webtv.un.org/en/asset/${fx.id}`,
      title: fx.title,
      cleanTitle: fx.expected.cleanTitle,
      category: fx.category,
      duration: fx.duration,
      date: fx.date,
      scheduledTime: fx.scheduledTime,
      status: "finished",
      eventCode: fx.expected.eventCode,
      eventType: fx.expected.eventType,
      body: fx.expected.body,
      sessionNumber: fx.expected.sessionNumber,
      pvSymbol: fx.expected.pvSymbol,
      pvPart: null,
      pvAvailable: false,
      slug: "",
      hasTranscript: false,
      hasTranscriptInLocale: false,
      removed: false,
      i18n: {},
    };
  }

  it.each(fixtures)("derives pv_symbol, kaltura_id, duration for $id", (fx) => {
    const rec = videoToRecord(toVideo(fx));
    expect(rec.pv_symbol).toBe(fx.expected.pvSymbol);
    expect(rec.asset_id).toBe(fx.id);
    expect(rec.kaltura_id).toMatch(/^1_[a-z0-9]+$/i);
    // Duration "HH:MM:SS" → seconds.
    if (fx.duration.includes(":")) {
      const [h, m, s] = fx.duration.split(":").map(Number);
      expect(rec.duration).toBe(h * 3600 + m * 60 + s);
    }
  });
});

describe("calculateStatus", () => {
  it("is 'finished' with no scheduled time", () => {
    expect(calculateStatus(null, "01:00:00")).toBe("finished");
  });

  it("is 'scheduled' before start and 'finished' well after end", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const longAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    expect(calculateStatus(future, "01:00:00")).toBe("scheduled");
    expect(calculateStatus(longAgo, "01:00:00")).toBe("finished");
  });

  it("is 'live' while within the meeting window", () => {
    const startedAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    expect(calculateStatus(startedAgo, "02:00:00")).toBe("live");
  });
});

describe("decodeEventCode", () => {
  it("maps known prefixes and falls back for unknown", () => {
    expect(decodeEventCode("GO16")).toBe("Global Occasion");
    expect(decodeEventCode("EM07")).toBe("Event - Ministerial");
    expect(decodeEventCode("ZZ99")).toBe("Event ZZ99");
  });
});
