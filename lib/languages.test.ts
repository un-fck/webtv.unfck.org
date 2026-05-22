import { describe, it, expect } from "vitest";
import {
  UN_LANGUAGES,
  bcp47ToKalturaName,
  kalturaNameToBcp47,
  getLanguageDisplayName,
  getLanguageFullName,
} from "@/lib/languages";

describe("languages", () => {
  it("round-trips every known language with a kaltura name", () => {
    for (const lang of UN_LANGUAGES) {
      if (!lang.kalturaName) continue;
      expect(bcp47ToKalturaName(lang.code)).toBe(lang.kalturaName);
      // Kaltura name maps back to the same BCP-47 code (case-insensitive)
      expect(kalturaNameToBcp47(lang.kalturaName)).toBe(lang.code);
      expect(kalturaNameToBcp47(lang.kalturaName.toUpperCase())).toBe(
        lang.code,
      );
    }
  });

  it("falls back for unknown inputs", () => {
    expect(bcp47ToKalturaName("xx")).toBe("english");
    expect(kalturaNameToBcp47("klingon")).toBe("floor");
    expect(getLanguageDisplayName("xx")).toBe("XX");
  });

  it("treats floor as the original language for prompts", () => {
    expect(getLanguageFullName("floor")).toBe("the original language");
    expect(getLanguageFullName("en")).toBe("English");
    expect(getLanguageFullName("xx")).toBe("the original language");
  });
});
