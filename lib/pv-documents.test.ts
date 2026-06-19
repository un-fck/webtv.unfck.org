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

  describe("treaty bodies", () => {
    // One real title per acronym, taken from the production data sample.
    const TB_CASES: Array<[string, string]> = [
      [
        "2264th Meeting, 84th Session, Committee against Torture (CAT)",
        "CAT/C/SR.2264",
      ],
      [
        "3225th Meeting, 117th Session, Committee on the Elimination of Racial Discrimination (CERD)",
        "CERD/C/SR.3225",
      ],
      ["4100th Meeting, 140th Session, Human Rights Committee (CCPR)", "CCPR/C/SR.4100"],
      [
        "1900th Meeting, 88th Session, Committee on the Elimination of Discrimination against Women (CEDAW)",
        "CEDAW/C/SR.1900",
      ],
      ["2700th Meeting, 95th Session, Committee on the Rights of the Child (CRC)", "CRC/C/SR.2700"],
      [
        "650th Meeting, 30th Session, Committee on the Rights of Persons with Disabilities (CRPD)",
        "CRPD/C/SR.650",
      ],
      [
        "100th Meeting, 75th Session, Committee on Economic, Social and Cultural Rights (CESCR)",
        "E/C.12/SR.100",
      ],
      [
        "500th Meeting, 38th Session, Committee on Migrant Workers (CMW)",
        "CMW/C/SR.500",
      ],
      [
        "400th Meeting, 28th Session, Committee on Enforced Disappearances (CED)",
        "CED/C/SR.400",
      ],
      [
        "200th Meeting, 45th Session, Subcommittee on Prevention of Torture (SPT)",
        "CAT/OP/SR.200",
      ],
    ];

    it.each(TB_CASES)("%s → %s", (title, expected) => {
      expect(parseMeetingSymbol(title, "Human Rights Treaty Bodies")).toBe(
        expected,
      );
    });

    it("ignores trailing-(X) titles for non-treaty-body acronyms", () => {
      // A title that happens to end "(X)" but isn't a known acronym must not
      // resolve to a treaty-body symbol.
      expect(
        parseMeetingSymbol(
          "1st Meeting, 1st Session, Some Other Committee (XYZ)",
          "Other",
        ),
      ).toBeNull();
    });

    it("ignores treaty-body-shaped titles without the meeting/session prefix", () => {
      // Chairpersons-of-treaty-bodies meetings have the prefix but no acronym
      // in parens at end — explicitly out of scope.
      expect(
        parseMeetingSymbol(
          "10th Meeting, 38th Session - Chairpersons of the Human Rights Treaty Bodies",
          "Human Rights Treaty Bodies",
        ),
      ).toBeNull();
    });
  });

  describe("daily press briefings", () => {
    it("recognises the SG Spokesperson daily briefing", () => {
      expect(
        parseMeetingSymbol(
          "Daily Press Briefing by the Spokesperson of the Secretary-General",
          "Press Conferences",
          "2026-06-19",
        ),
      ).toBe("BRIEFING/SG/2026-06-19");
    });

    it("recognises the topic-prefix SG variant", () => {
      expect(
        parseMeetingSymbol(
          "Sudan, Lebanon, Occupied Palestinian Territory & other topics - Daily Press Briefing",
          "Press Conferences",
          "2026-06-18",
        ),
      ).toBe("BRIEFING/SG/2026-06-18");
    });

    it("recognises the joint SG/PGA daily briefing as SG", () => {
      // The Spokesperson of the SG is the host; PGA appears alongside but
      // doesn't change the citation.
      expect(
        parseMeetingSymbol(
          "Daily Press Briefing by the Spokesperson of the Secretary-General & the President of the General Assembly",
          "Press Conferences",
          "2026-02-23",
        ),
      ).toBe("BRIEFING/SG/2026-02-23");
    });

    it("recognises PGA Spokesperson briefings", () => {
      expect(
        parseMeetingSymbol(
          "Upcoming Meetings Schedule & other topics - PGA Spokesperson's Briefing",
          "Press Conferences",
          "2026-05-18",
        ),
      ).toBe("BRIEFING/PGA/2026-05-18");
    });

    it("recognises UN Geneva press briefings", () => {
      expect(
        parseMeetingSymbol(
          "UN Geneva Press Briefing: UNHCR, UNICEF, WHO, IFRC, UNDIR",
          "Press Conferences",
          "2026-06-16",
        ),
      ).toBe("BRIEFING/GENEVA/2026-06-16");
    });

    it("returns null when videoDate is missing", () => {
      expect(
        parseMeetingSymbol(
          "Daily Press Briefing by the Spokesperson of the Secretary-General",
          "Press Conferences",
        ),
      ).toBeNull();
    });

    it("does not match unrelated press conferences", () => {
      expect(
        parseMeetingSymbol(
          "Press Conference: IAEA Director General Rafael Grossi",
          "Press Conferences",
          "2026-06-18",
        ),
      ).toBeNull();
    });
  });
});

describe("getPVDocumentUrl", () => {
  it("builds a documents.un.org access URL with the encoded symbol", () => {
    const url = getPVDocumentUrl("S/PV.10100");
    expect(url).toContain("documents.un.org");
    expect(url).toContain(encodeURIComponent("S/PV.10100"));
  });
});
