import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseMeetingSymbol, getPVDocumentUrl } from "@/lib/pv-documents";

interface VideoFixture {
  title: string;
  category: string;
  date: string;
  expected: { pvSymbol: string | null };
}

const fixtures: VideoFixture[] = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "videos.sample.json"), "utf8"),
);

describe("parseMeetingSymbol (real titles from the metadata dump)", () => {
  it("derives the same symbol stored for each real video", () => {
    for (const fx of fixtures) {
      expect({
        title: fx.title,
        symbol: parseMeetingSymbol(fx.title, fx.category, fx.date),
      }).toEqual({ title: fx.title, symbol: fx.expected.pvSymbol });
    }
  });

  it("derived at least one SC and one committee symbol from the sample", () => {
    const symbols = fixtures
      .map((f) => f.expected.pvSymbol)
      .filter((s): s is string => s != null);
    expect(symbols.some((s) => s.startsWith("S/PV."))).toBe(true);
    expect(symbols.some((s) => s.startsWith("A/C."))).toBe(true);
  });

  // Patterns the metadata sample doesn't cover (no HRC/ES/ECOSOC rows): use
  // representative real titles from the parser's own documented examples.
  it("handles HRC / emergency-special / ECOSOC patterns", () => {
    expect(
      parseMeetingSymbol(
        "29th Meeting - 61st Session of Human Rights Council",
        "Human Rights Council",
      ),
    ).toBe("A/HRC/61/SR.29");

    // The ES session number must follow the "emergency special" token for the
    // parser to pick it up (it scans forward from that token).
    expect(
      parseMeetingSymbol(
        "Emergency special session - 10th emergency special session, 23rd plenary meeting",
        "General Assembly",
      ),
    ).toBe("A/ES-10/PV.23");

    expect(
      parseMeetingSymbol(
        "10th meeting - Economic and Social Council",
        "Economic and Social Council",
        "2024-05-01",
      ),
    ).toBe("E/2024/SR.10");
  });

  it("returns null for non-meeting titles", () => {
    expect(parseMeetingSymbol("Press conference on Sudan", "Other")).toBeNull();
  });
});

describe("getPVDocumentUrl", () => {
  it("builds a documents.un.org access URL with the encoded symbol", () => {
    const url = getPVDocumentUrl("S/PV.10100");
    expect(url).toContain("documents.un.org");
    expect(url).toContain(encodeURIComponent("S/PV.10100"));
  });
});
