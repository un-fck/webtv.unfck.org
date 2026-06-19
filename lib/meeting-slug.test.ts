import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { slugFromSymbol, symbolFromSlug } from "@/lib/meeting-slug";

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
  ["CAT/C/SR.2264", "cat/2264"],
  ["CERD/C/SR.3225", "cerd/3225"],
  ["CCPR/C/SR.4100", "ccpr/4100"],
  ["E/C.12/SR.100", "cescr/100"],
  ["CAT/OP/SR.200", "spt/200"],
  ["BRIEFING/SG/2026-06-19", "briefing/sg/2026-06-19"],
  ["BRIEFING/PGA/2026-05-18", "briefing/pga/2026-05-18"],
  ["BRIEFING/GENEVA/2026-06-16", "briefing/geneva/2026-06-16"],
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
      pvPart: 1,
    });
    // 1st Committee is verbatim-only (no SR)
    expect(symbolFromSlug("ga/c1/79/7")).toEqual({
      pvSymbol: "A/C.1/79/PV.7",
      pvPart: 1,
    });
  });
});

describe("symbolFromSlug trailing /N part suffix", () => {
  it("treats unsuffixed slugs as part 1", () => {
    expect(symbolFromSlug("sc/10175")?.pvPart).toBe(1);
    expect(symbolFromSlug("ga/79/21")?.pvPart).toBe(1);
    expect(symbolFromSlug("hrc/58/59")?.pvPart).toBe(1);
  });

  it("reads the trailing /N as pvPart", () => {
    expect(symbolFromSlug("sc/10175/2")).toEqual({
      pvSymbol: "S/PV.10175",
      pvPart: 2,
    });
    expect(symbolFromSlug("ga/79/21/3")?.pvPart).toBe(3);
    expect(symbolFromSlug("ga/c3/79/5/2")).toEqual({
      pvSymbol: "A/C.3/79/PV.5",
      srSymbol: "A/C.3/79/SR.5",
      pvPart: 2,
    });
    expect(symbolFromSlug("ecosoc/2024/10/4")?.pvPart).toBe(4);
    expect(symbolFromSlug("cat/2264/2")).toEqual({
      pvSymbol: "CAT/C/SR.2264",
      pvPart: 2,
    });
    expect(symbolFromSlug("briefing/sg/2026-06-19/2")).toEqual({
      pvSymbol: "BRIEFING/SG/2026-06-19",
      pvPart: 2,
    });
  });

  it("does not consume the meeting number itself as a part", () => {
    // /sc/10175 is meeting 10175, NOT prefix=sc + part=10175. The canonical
    // segment-count guard prevents that misread.
    expect(symbolFromSlug("sc/10175")).toEqual({
      pvSymbol: "S/PV.10175",
      pvPart: 1,
    });
  });

  it("returns null for non-citation grammars", () => {
    expect(symbolFromSlug("asset/k1o/k1o43lgs4z")).toBeNull();
    expect(symbolFromSlug("meeting/k1o/k1o43lgs4z")).toBeNull();
    expect(symbolFromSlug("garbage")).toBeNull();
  });
});
