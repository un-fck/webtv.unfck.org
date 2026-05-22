import { describe, it, expect } from "vitest";
import { findReferences } from "@/lib/pv-reference-linking";

describe("findReferences", () => {
  it("links resolution references with year", () => {
    const refs = findReferences(
      "Recalling resolution 2231 (2015), the Council",
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].label).toBe("resolution 2231 (2015)");
    expect(refs[0].url).toBe("https://undocs.org/S/RES/2231(2015)");
  });

  it("links document symbols across organs", () => {
    const refs = findReferences(
      "See S/PV.10124 and A/RES/79/1 and E/2024/SR.10 and A/C.1/79/PV.7.",
    );
    const labels = refs.map((r) => r.label);
    expect(labels).toContain("S/PV.10124");
    expect(labels).toContain("A/RES/79/1");
    expect(labels).toContain("E/2024/SR.10");
    expect(labels).toContain("A/C.1/79/PV.7");
    for (const r of refs) {
      expect(r.url).toBe(`https://undocs.org/${r.label}`);
    }
  });

  it("returns matches sorted by position with no overlaps", () => {
    const refs = findReferences("A/79/L.1 then S/2026/8 then A/ES-11/PV.23");
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < refs.length; i++) {
      expect(refs[i].start).toBeGreaterThanOrEqual(refs[i - 1].end);
    }
  });

  it("returns nothing for plain prose", () => {
    expect(findReferences("The representative thanked the President.")).toEqual(
      [],
    );
  });
});
