import { describe, it, expect } from "vitest";
import {
  extractKalturaId,
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
