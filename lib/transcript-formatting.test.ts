import { describe, it, expect } from "vitest";
import { formatTimecode, formatSpeakerText } from "@/lib/transcript-formatting";
import type { SpeakerMapping } from "@/lib/speakers";

describe("formatTimecode", () => {
  it("formats M:SS under an hour and H:MM:SS past it", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(3661)).toBe("1:01:01");
  });

  it("returns empty string for missing/NaN input", () => {
    expect(formatTimecode(null)).toBe("");
    expect(formatTimecode(undefined)).toBe("");
    expect(formatTimecode(NaN)).toBe("");
  });
});

describe("formatSpeakerText", () => {
  const mapping: SpeakerMapping = {
    "0": {
      name: "Ms. DiCarlo",
      function: "USG",
      affiliation: "UN",
      group: null,
    },
    "1": {
      name: null,
      function: "Representative",
      affiliation: "FRA",
      group: null,
    },
    "2": { name: null, function: null, affiliation: null, group: null },
  };
  const countryNames = new Map([["FRA", "France"]]);

  it("joins affiliation, group, function, name with separators", () => {
    expect(formatSpeakerText(0, mapping, countryNames)).toBe(
      "UN · USG · Ms. DiCarlo",
    );
  });

  it("expands country codes and drops the default 'representative' function", () => {
    expect(formatSpeakerText(1, mapping, countryNames)).toBe("France");
  });

  it("falls back to Speaker N when unknown", () => {
    expect(formatSpeakerText(2, mapping, countryNames)).toBe("Speaker 3");
    expect(formatSpeakerText(9, mapping, countryNames)).toBe("Speaker 10");
    expect(formatSpeakerText(undefined, mapping, countryNames)).toBe("Speaker");
  });
});
