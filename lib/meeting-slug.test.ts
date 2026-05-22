import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  slugFromSymbol,
  symbolFromSlug,
  meetingSlugFromVideo,
} from "@/lib/meeting-slug";

// Representative symbol→slug pairs covering every organ pattern (from the
// module's own doc examples). Doubles as exact-slug spot checks for patterns
// the real corpus doesn't cover (ES, HRC, GA committees).
const SYMBOL_SLUG: Array<[string, string]> = [
  ["S/PV.9748", "sc/9748"],
  ["A/79/PV.21", "ga/79/21"],
  ["A/ES-11/PV.23", "ga/es11/23"],
  ["A/C.1/79/PV.7", "ga/c1/79/7"],
  ["A/C.3/79/SR.5", "ga/c3/79/5"],
  ["A/HRC/58/SR.59", "hrc/58/59"],
  ["E/2024/SR.10", "ecosoc/2024/10"],
];

describe("slugFromSymbol", () => {
  it.each(SYMBOL_SLUG)("%s → %s", (symbol, slug) => {
    expect(slugFromSymbol(symbol)).toBe(slug);
  });

  it("returns null for unrecognised symbols", () => {
    expect(slugFromSymbol("not-a-symbol")).toBeNull();
    expect(slugFromSymbol("S/2024/123")).toBeNull(); // resolution, not a PV
  });
});

describe("symbol ↔ slug round-trip", () => {
  // The original symbol must reappear as either the pv or sr reconstruction.
  function roundTrips(symbol: string): boolean {
    const slug = slugFromSymbol(symbol);
    if (!slug) return false;
    const back = symbolFromSlug(slug);
    if (!back) return false;
    return back.pvSymbol === symbol || back.srSymbol === symbol;
  }

  it.each(SYMBOL_SLUG.map(([s]) => s))("round-trips %s", (symbol) => {
    expect(roundTrips(symbol)).toBe(true);
  });

  it("round-trips every real symbol in the eval corpus", () => {
    const sessions: Array<{ symbol: string }> = JSON.parse(
      readFileSync(
        join(__dirname, "..", "eval", "corpus", "sessions.json"),
        "utf8",
      ),
    );
    const symbols = [...new Set(sessions.map((s) => s.symbol))];
    expect(symbols.length).toBeGreaterThan(5);
    for (const symbol of symbols) {
      expect({ symbol, ok: roundTrips(symbol) }).toEqual({ symbol, ok: true });
    }
  });

  it("reconstructs both PV and SR for committees 2-6 / HRC / ECOSOC", () => {
    expect(symbolFromSlug("ga/c3/79/5")).toEqual({
      pvSymbol: "A/C.3/79/PV.5",
      srSymbol: "A/C.3/79/SR.5",
    });
    // 1st Committee is verbatim-only (no SR)
    expect(symbolFromSlug("ga/c1/79/7")).toEqual({ pvSymbol: "A/C.1/79/PV.7" });
  });
});

describe("meetingSlugFromVideo", () => {
  it("prefers the pv_symbol slug", () => {
    expect(
      meetingSlugFromVideo({
        pv_symbol: "S/PV.9748",
        part_number: null,
        asset_id: "k1q/k1qabc",
      }),
    ).toBe("sc/9748");
  });

  it("appends -part-N only when part > 1", () => {
    const base = {
      pv_symbol: "A/79/PV.21",
      asset_id: "k1q/k1qabc",
    };
    expect(meetingSlugFromVideo({ ...base, part_number: "1" })).toBe(
      "ga/79/21",
    );
    expect(meetingSlugFromVideo({ ...base, part_number: "2" })).toBe(
      "ga/79/21-part-2",
    );
  });

  it("falls back to the asset_id when there is no symbol", () => {
    expect(
      meetingSlugFromVideo({
        pv_symbol: null,
        part_number: null,
        asset_id: "k1q/k1qabc",
      }),
    ).toBe("meeting/k1q/k1qabc");
  });
});
