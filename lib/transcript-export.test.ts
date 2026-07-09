import { describe, expect, it } from "vitest";
import {
  buildExportHeaderRtf,
  buildExportHeaderText,
  buildExportHeaderVtt,
  buildExportMetaFields,
  escapeRtf,
  type ExportMetaInput,
} from "./transcript-export";

const LABELS = {
  date: "Date",
  language: "Language",
  transcript: "Transcript",
  json: "JSON",
  aiAgents: "Information for AI Agents",
};

const DISCLAIMER = "Not an official record of the United Nations.";

const base: ExportMetaInput = {
  title: "The situation in the Middle East",
  category: "Security Council",
  date: "15 June 2026, 10:00",
  language: "English",
  transcriptUrl: "https://transcripts.un.org/en/sc/9748",
  labels: LABELS,
};

describe("buildExportMetaFields", () => {
  it("emits date, language and transcript for downloadable files", () => {
    expect(buildExportMetaFields(base).map((f) => f.label)).toEqual([
      "Date",
      "Language",
      "Transcript",
    ]);
  });

  it("appends the agent-facing links only when supplied", () => {
    const fields = buildExportMetaFields({
      ...base,
      jsonUrl: "https://transcripts.un.org/en/sc/9748.json",
      llmsUrl: "https://transcripts.un.org/llms.txt",
    });
    expect(fields.map((f) => f.label)).toEqual([
      "Date",
      "Language",
      "Transcript",
      "JSON",
      "Information for AI Agents",
    ]);
  });

  it("drops empty fields rather than rendering a bare label", () => {
    // The data API serves not-yet-transcribed meetings, which have no language.
    const fields = buildExportMetaFields({ ...base, language: "", date: "" });
    expect(fields.map((f) => f.label)).toEqual(["Transcript"]);
  });

  it("linkifies URL-valued fields only", () => {
    const fields = buildExportMetaFields(base);
    expect(fields.find((f) => f.label === "Date")?.href).toBeUndefined();
    expect(fields.find((f) => f.label === "Transcript")?.href).toBe(
      base.transcriptUrl,
    );
  });
});

describe("buildExportHeaderText", () => {
  it("renders title, category, fields, disclaimer, then a rule", () => {
    expect(buildExportHeaderText(base, DISCLAIMER)).toBe(
      "The situation in the Middle East\n" +
        "Security Council\n" +
        "Date: 15 June 2026, 10:00\n" +
        "Language: English\n" +
        "Transcript: https://transcripts.un.org/en/sc/9748\n" +
        `${DISCLAIMER}\n\n---\n\n`,
    );
  });

  it("omits the subtitle line when the meeting has no category", () => {
    const text = buildExportHeaderText({ ...base, category: null }, DISCLAIMER);
    expect(text.split("\n")[1]).toBe("Date: 15 June 2026, 10:00");
  });

  it("uses the caller's labels, so a localized page exports localized labels", () => {
    const text = buildExportHeaderText(
      {
        ...base,
        language: "Français",
        labels: { ...LABELS, date: "Date", language: "Langue" },
      },
      DISCLAIMER,
    );
    expect(text).toContain("Langue: Français");
  });
});

describe("buildExportHeaderVtt", () => {
  it("puts the metadata in a NOTE block so it never renders on screen", () => {
    expect(buildExportHeaderVtt(base, DISCLAIMER)).toBe(
      "WEBVTT\n\n" +
        "NOTE\n" +
        "The situation in the Middle East\n" +
        "Security Council\n" +
        "Date: 15 June 2026, 10:00\n" +
        "Language: English\n" +
        "Transcript: https://transcripts.un.org/en/sc/9748\n\n" +
        `NOTE\n${DISCLAIMER}\n\n`,
    );
  });

  it("collapses embedded newlines, which would otherwise terminate the NOTE", () => {
    const vtt = buildExportHeaderVtt(
      { ...base, title: "Line one\n\nLine two" },
      DISCLAIMER,
    );
    expect(vtt).toContain("NOTE\nLine one Line two\n");
    // Exactly two blank-line-terminated NOTE blocks, no stray ones.
    expect(vtt.match(/^NOTE$/gm)).toHaveLength(2);
  });
});

describe("escapeRtf", () => {
  it("escapes RTF control characters", () => {
    expect(escapeRtf("a\\b{c}d")).toBe("a\\\\b\\{c\\}d");
  });

  it("escapes non-ASCII below 0x8000 as a positive code unit", () => {
    expect(escapeRtf("é")).toBe("\\u233?");
    expect(escapeRtf("一")).toBe("\\u19968?");
  });

  it("wraps code units above 0x7FFF negative, as the RTF spec requires", () => {
    // U+8005 (者) = 32773, which overflows a signed 16-bit int.
    expect(escapeRtf("者")).toBe("\\u-32763?");
  });

  it("leaves ASCII untouched", () => {
    expect(escapeRtf("Security Council 9748")).toBe("Security Council 9748");
  });
});

describe("buildExportHeaderRtf", () => {
  const rtf = buildExportHeaderRtf(base, DISCLAIMER);

  it("declares a font and colour table before using \\f0 and \\cf2", () => {
    expect(rtf).toContain("{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}");
    expect(rtf).toContain("{\\colortbl;");
    expect(rtf.indexOf("\\colortbl")).toBeLessThan(rtf.indexOf("\\cf2"));
  });

  it("sets the title as a 16pt bold heading", () => {
    expect(rtf).toContain(
      "\\pard\\sa120\\f0\\fs32\\b The situation in the Middle East\\b0\\par",
    );
  });

  it("makes the transcript URL a real Word hyperlink", () => {
    expect(rtf).toContain(
      '{\\field{\\*\\fldinst HYPERLINK "https://transcripts.un.org/en/sc/9748"}',
    );
  });

  it("leaves the document unclosed for the caller to append the body", () => {
    const opens = (rtf.match(/(?<!\\)\{/g) || []).length;
    const closes = (rtf.match(/(?<!\\)\}/g) || []).length;
    expect(opens - closes).toBe(1);
  });
});
