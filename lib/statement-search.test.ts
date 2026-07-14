import { describe, expect, it } from "vitest";
import {
  buildSnippet,
  buildStatementConditions,
  isEmptyQuery,
  parseSearchQuery,
  symbolTermToPgRegex,
} from "./statement-search";

describe("parseSearchQuery", () => {
  it("routes digit-bearing terms to containment, words to FTS", () => {
    const p = parseSearchQuery("implementation of resolution 2735");
    expect(p.symbolTerms).toEqual(["2735"]);
    expect(p.wordQuery).toBe("implementation of resolution");
    expect(p.highlightTerms).toContain("2735");
  });

  it("keeps quoted phrases for websearch, quotes digit-phrases as symbols", () => {
    const p = parseSearchQuery('"climate finance" L.73');
    expect(p.wordQuery).toBe('"climate finance"');
    expect(p.symbolTerms).toEqual(["L.73"]);
  });

  it("drops parenthesized adoption years (official cite decoration)", () => {
    expect(parseSearchQuery("resolution 2735 (2024)").symbolTerms).toEqual([
      "2735",
    ]);
    expect(parseSearchQuery("2735(2024)").symbolTerms).toEqual(["2735"]);
  });

  it("flags empty queries", () => {
    expect(isEmptyQuery(parseSearchQuery("  "))).toBe(true);
    expect(isEmptyQuery(parseSearchQuery("(2024)"))).toBe(true);
    expect(isEmptyQuery(parseSearchQuery("L.73"))).toBe(false);
  });
});

describe("symbolTermToPgRegex", () => {
  it("word-anchors alphanumeric edges and escapes metacharacters", () => {
    // "2735" must not match "12735"; "L.73" must still match "A/80/L.73"
    // ("/" is a non-word char, so \m matches after it).
    expect(symbolTermToPgRegex("2735")).toBe("\\m2735\\M");
    expect(symbolTermToPgRegex("L.73")).toBe("\\mL\\.73\\M");
    expect(symbolTermToPgRegex("S/2026/243")).toBe("\\mS/2026/243\\M");
  });
});

describe("buildStatementConditions", () => {
  it("combines FTS and containment for mixed queries (AND)", () => {
    const built = buildStatementConditions(
      parseSearchQuery("ceasefire L.73"),
      "en",
    );
    expect(built?.conditions).toEqual([
      "s.tsv @@ websearch_to_tsquery(?::regconfig, ?)",
      "s.text ~* ?",
    ]);
    expect(built?.args).toEqual(["english", "ceasefire", "\\mL\\.73\\M"]);
  });

  it("routes every term to containment for Chinese (no segmentation)", () => {
    const built = buildStatementConditions(parseSearchQuery("停火 决议"), "zh");
    expect(built?.conditions).toEqual(["s.text ~* ?", "s.text ~* ?"]);
  });

  it("returns null for unsearchable queries", () => {
    expect(buildStatementConditions(parseSearchQuery(""), "en")).toBeNull();
  });
});

describe("buildSnippet", () => {
  const text =
    "I now give the floor to the representative of Brazil to introduce " +
    "draft resolution A/80/L.73, as contained in the report before the " +
    "Assembly, and invite members to take note of its provisions in full.";

  it("windows around the first match and marks occurrences", () => {
    const s = buildSnippet(text, ["L.73"], 80);
    const marked = s.parts.filter((p) => p.mark).map((p) => p.text);
    expect(marked).toEqual(["L.73"]);
    expect(s.parts.map((p) => p.text).join("")).toContain("A/80/L.73");
  });

  it("does not mark digit terms inside larger numbers", () => {
    const s = buildSnippet("see 12735 and 2735 here", ["2735"], 100);
    const marked = s.parts.filter((p) => p.mark).map((p) => p.text);
    expect(marked).toEqual(["2735"]);
  });

  it("falls back to the text head when nothing matches", () => {
    const s = buildSnippet(text, ["nonexistent"], 50);
    expect(s.parts[0].mark).toBe(false);
    expect(s.leading).toBe(false);
    expect(s.trailing).toBe(true);
  });
});
