import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parsePVText } from "@/lib/pv-parser";

const PV_DIR = join(__dirname, "__fixtures__", "pv");

function load(symbol: string, lang: string) {
  const file = symbol.replace(/\//g, "_") + `_${lang}.txt`;
  return parsePVText(readFileSync(join(PV_DIR, file), "utf8"), lang);
}

// Expected structure per captured real document. minTurns is a conservative
// floor (real counts are higher) so the test is robust to minor parser tweaks
// while still catching catastrophic regressions.
const DOCS: Array<{
  symbol: string;
  lang: string;
  body: string;
  minTurns: number;
  isSR?: boolean;
}> = [
  { symbol: "S/PV.10100", lang: "en", body: "Security Council", minTurns: 2 },
  { symbol: "S/PV.10124", lang: "en", body: "Security Council", minTurns: 15 },
  { symbol: "S/PV.10124", lang: "fr", body: "Security Council", minTurns: 10 },
  { symbol: "S/PV.10124", lang: "es", body: "Security Council", minTurns: 10 },
  { symbol: "S/PV.10124", lang: "ru", body: "Security Council", minTurns: 10 },
  { symbol: "S/PV.10124", lang: "zh", body: "Security Council", minTurns: 10 },
  { symbol: "S/PV.10124", lang: "ar", body: "Security Council", minTurns: 5 },
  {
    symbol: "A/C.3/78/SR.5",
    lang: "en",
    body: "General Assembly",
    minTurns: 10,
    isSR: true,
  },
  {
    symbol: "E/2024/SR.5",
    lang: "en",
    body: "Economic and Social Council",
    minTurns: 5,
    isSR: true,
  },
];

describe("parsePVText on real captured PV/SR documents", () => {
  it.each(DOCS)("$symbol ($lang): header + turns", (doc) => {
    const parsed = load(doc.symbol, doc.lang);

    expect(parsed.symbol).toBe(doc.symbol);
    expect(parsed.body).toBe(doc.body);
    expect(parsed.language).toBe(doc.lang);

    expect(parsed.turns.length).toBeGreaterThanOrEqual(doc.minTurns);

    // Every turn must have a non-empty speaker, and where a turn has paragraphs
    // they must be non-empty. (The Arabic RTL handler can emit an occasional
    // empty-bodied turn, so we don't require every turn to have paragraphs.)
    for (const turn of parsed.turns) {
      expect(turn.speaker.trim().length).toBeGreaterThan(0);
      expect(turn.paragraphs.every((p) => p.trim().length > 0)).toBe(true);
    }

    // ...but enough turns must carry real content.
    const withContent = parsed.turns.filter((t) => t.paragraphs.length > 0);
    expect(withContent.length).toBeGreaterThanOrEqual(doc.minTurns);

    // SR documents carry numbered paragraphs; PV documents do not.
    const hasParagraphNumbers = parsed.turns.some(
      (t) => t.paragraphNumber != null,
    );
    expect(hasParagraphNumbers).toBe(Boolean(doc.isSR));
  });

  it("S/PV.10100 (short procedural) has The President speaking first", () => {
    const parsed = load("S/PV.10100", "en");
    expect(parsed.turns[0].speaker).toBe("The President");
  });

  it("S/PV.10124 identifies SC president and members across languages", () => {
    for (const lang of ["en", "fr", "es"]) {
      const parsed = load("S/PV.10124", lang);
      expect(parsed.president).not.toBeNull();
      expect(parsed.members.length).toBeGreaterThan(0);
    }
  });

  it("strips page artifacts: document symbol does not recur inside turn text", () => {
    const parsed = load("S/PV.10124", "en");
    // The running-header symbol ("S/PV.10124") is a page artifact; cleaned turn
    // bodies should not contain it.
    const leaked = parsed.turns.filter((t) =>
      t.paragraphs.some((p) => p.includes("S/PV.10124")),
    );
    expect(leaked).toEqual([]);
  });

  it("captures speaker affiliations in the SR committee record", () => {
    const parsed = load("A/C.3/78/SR.5", "en");
    expect(parsed.turns.some((t) => (t.affiliation ?? "").length > 0)).toBe(
      true,
    );
  });
});
