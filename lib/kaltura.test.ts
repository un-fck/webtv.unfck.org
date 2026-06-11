import { describe, it, expect } from "vitest";
import {
  extractKalturaId,
  audioFlavorsForLanguage,
  pickReadyAudioFlavor,
  KALTURA_PARTNER_ID,
  KALTURA_WIDGET_ID,
} from "@/lib/kaltura";

describe("extractKalturaId", () => {
  // One real-shaped input per recognised pattern, plus the normalisation rule
  // that every result is `1_<alphanumeric>` or null.
  const cases: Array<[string, string | null]> = [
    ["https://webtv.un.org/en/asset/k1q/k1qduo7w59", "1_qduo7w59"],
    ["k1q/k1qduo7w59", "1_qduo7w59"],
    ["k1w/k1wjnpcfkw", "1_wjnpcfkw"],
    ["something/id/1_abc123/foo", "1_abc123"],
    ["already (1_xyz789) embedded", "1_xyz789"],
    ["1_plainid", "1_plainid"],
    ["k1abc", "1_abc"],
    ["", null],
    ["no-kaltura-here", null],
  ];

  it.each(cases)("maps %s → %s", (input, expected) => {
    expect(extractKalturaId(input)).toBe(expected);
  });

  it("only ever returns a 1_ id or null", () => {
    for (const [input] of cases) {
      const result = extractKalturaId(input);
      expect(result === null || /^1_[a-z0-9]+$/i.test(result)).toBe(true);
    }
  });

  it("exposes the UN Kaltura account constants consistently", () => {
    expect(KALTURA_PARTNER_ID).toBe(2503451);
    expect(KALTURA_WIDGET_ID).toBe("_2503451");
  });
});

// Fixture condensed from a real flavor list (entry 1_5hk8wxgx, the VOD
// recording of COSP19 1st meeting): per-language audio_only flavors in READY
// (2) status, leftover NOT-APPLICABLE (4) interpretation tracks, and
// language-less video/source flavors that must never match.
const AUDIO_TAGS = "ingest,mbr,ipad,ipadnew,web,mobile,audio_only,alt_audio";
const REAL_FLAVORS = [
  { flavorParamsId: 100, language: "English", tags: AUDIO_TAGS, status: 2, isDefault: true },
  { flavorParamsId: 106, language: "Arabic", tags: AUDIO_TAGS, status: 2, isDefault: false },
  { flavorParamsId: 2931871, language: "Interlingua", tags: AUDIO_TAGS, status: 2, isDefault: false },
  // Same language twice: the live-side track lingers as status 4 next to the
  // ready VOD track — selection must never pick the non-ready twin.
  { flavorParamsId: 2732302, language: "Arabic", tags: "mobile,web,mbr,dash,audio_only,alt_audio", status: 4, isDefault: false },
  { flavorParamsId: 14633492, language: "Urdu", tags: AUDIO_TAGS, status: 4, isDefault: false },
  { flavorParamsId: 0, language: "Undefined", tags: "source,web", status: 2, isDefault: false },
  { flavorParamsId: 487051, language: "Undefined", tags: "mobile,web,mbr,dash", status: 2, isDefault: false },
];

describe("audioFlavorsForLanguage", () => {
  it("matches case-insensitively and requires the audio_only tag", () => {
    expect(audioFlavorsForLanguage(REAL_FLAVORS, "english")).toHaveLength(1);
    expect(audioFlavorsForLanguage(REAL_FLAVORS, "English")).toHaveLength(1);
    // "Undefined"-language video/source flavors lack audio_only — no match.
    expect(audioFlavorsForLanguage(REAL_FLAVORS, "undefined")).toHaveLength(0);
  });

  it("returns all tracks for a language, ready or not", () => {
    expect(audioFlavorsForLanguage(REAL_FLAVORS, "arabic")).toHaveLength(2);
  });
});

describe("pickReadyAudioFlavor", () => {
  it("picks the READY track, never its non-ready same-language twin", () => {
    const arabic = audioFlavorsForLanguage(REAL_FLAVORS, "arabic");
    expect(pickReadyAudioFlavor(arabic)?.flavorParamsId).toBe(106);
  });

  it("returns undefined when the only track is not READY", () => {
    const urdu = audioFlavorsForLanguage(REAL_FLAVORS, "urdu");
    expect(pickReadyAudioFlavor(urdu)).toBeUndefined();
  });

  it("returns undefined for a fresh VOD entry with no flavors at all", () => {
    // Observed live: right after the live→VOD flip the new entry has an
    // empty flavor list for ~30+ min while Kaltura assembles the files.
    expect(pickReadyAudioFlavor([])).toBeUndefined();
  });

  it("prefers the default flavor among multiple READY ones", () => {
    const twoReady = [
      { flavorParamsId: 200, language: "English", tags: AUDIO_TAGS, status: 2, isDefault: false },
      { flavorParamsId: 100, language: "English", tags: AUDIO_TAGS, status: 2, isDefault: true },
    ];
    expect(pickReadyAudioFlavor(twoReady)?.flavorParamsId).toBe(100);
  });
});
