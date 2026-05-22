import { describe, it, expect } from "vitest";
import {
  fmtHHMMSS,
  parseHHMMSSToSeconds,
  parseHHMMSSToMs,
  extractJsonObject,
} from "@/lib/gemini-utils";

describe("timestamp parsing", () => {
  it("parses HH:MM:SS and MM:SS to seconds", () => {
    expect(parseHHMMSSToSeconds("01:02:03")).toBe(3723);
    expect(parseHHMMSSToSeconds("02:03")).toBe(123);
    expect(parseHHMMSSToSeconds("")).toBe(0);
  });

  it("parses to milliseconds and handles fractional seconds", () => {
    expect(parseHHMMSSToMs("00:00:01")).toBe(1000);
    expect(parseHHMMSSToMs("01:00:00")).toBe(3_600_000);
    expect(parseHHMMSSToMs("00:00:01.5")).toBe(1500);
    expect(parseHHMMSSToMs("")).toBe(0);
  });

  it("formats seconds as zero-padded HH:MM:SS", () => {
    expect(fmtHHMMSS(0)).toBe("00:00:00");
    expect(fmtHHMMSS(3723)).toBe("01:02:03");
    expect(fmtHHMMSS(59)).toBe("00:00:59");
  });

  it("round-trips fmt ∘ parse for whole seconds", () => {
    for (const s of [0, 1, 59, 60, 3599, 3600, 7384]) {
      expect(parseHHMMSSToSeconds(fmtHHMMSS(s))).toBe(s);
    }
  });
});

describe("extractJsonObject", () => {
  it("extracts the first balanced top-level object from chatty model output", () => {
    const text = 'Sure! Here you go:\n```json\n{"a":1,"b":{"c":2}}\n```\nDone.';
    expect(extractJsonObject(text)).toBe('{"a":1,"b":{"c":2}}');
  });

  it("handles nested braces and stops at the matching close", () => {
    const text = 'prefix {"x":{"y":[1,2]}} {"second":true}';
    expect(extractJsonObject(text)).toBe('{"x":{"y":[1,2]}}');
  });

  it("throws when there is no object or it is unterminated", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
    expect(() => extractJsonObject('{"a":1')).toThrow();
  });
});
