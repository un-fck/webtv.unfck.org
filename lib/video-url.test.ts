import { describe, it, expect } from "vitest";
import { videoUrl } from "@/lib/video-url";

describe("videoUrl", () => {
  it("returns the citation slug for pv_part = 1", () => {
    expect(
      videoUrl({
        pv_symbol: "S/PV.10175",
        pv_part: 1,
        asset_id: "k1o/k1o43lgs4z",
      }),
    ).toBe("sc/10175");
  });

  it("suffixes /N for pv_part > 1", () => {
    expect(
      videoUrl({
        pv_symbol: "S/PV.10175",
        pv_part: 2,
        asset_id: "k12/k12izw4wu2",
      }),
    ).toBe("sc/10175/2");
    expect(
      videoUrl({
        pv_symbol: "A/79/PV.21",
        pv_part: 3,
        asset_id: "x",
      }),
    ).toBe("ga/79/21/3");
  });

  it("falls back to asset/ when no pv_symbol", () => {
    expect(
      videoUrl({
        pv_symbol: null,
        pv_part: null,
        asset_id: "k1o/k1o43lgs4z",
      }),
    ).toBe("asset/k1o/k1o43lgs4z");
  });

  it("falls back to asset/ when pv_part is null even with symbol set", () => {
    // Defensive: shouldn't happen post-migration thanks to the CHECK
    // constraint, but the function still degrades gracefully.
    expect(
      videoUrl({
        pv_symbol: "S/PV.10175",
        pv_part: null,
        asset_id: "k1o/k1o43lgs4z",
      }),
    ).toBe("asset/k1o/k1o43lgs4z");
  });

  it("falls back to asset/ for unknown symbol shapes", () => {
    expect(
      videoUrl({
        pv_symbol: "S/2024/123", // a resolution, not a PV
        pv_part: 1,
        asset_id: "k1o/k1o43lgs4z",
      }),
    ).toBe("asset/k1o/k1o43lgs4z");
  });
});
