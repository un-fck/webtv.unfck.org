import { describe, it, expect } from "vitest";
import { KALTURA_STATUS_DELETED } from "./kaltura-helpers";
import {
  classifyWebtv,
  classifyKaltura,
  predictRemoval,
  type Liveness,
} from "./removed-videos";

describe("classifyWebtv", () => {
  it("treats only an explicit 404 as gone", () => {
    expect(classifyWebtv(404)).toBe("gone");
  });
  it("treats 2xx as live", () => {
    expect(classifyWebtv(200)).toBe("live");
    expect(classifyWebtv(204)).toBe("live");
  });
  it("treats everything ambiguous as unknown (never acts)", () => {
    // 403 (WAF), 5xx, 3xx, and 0 (network error) must not trigger a removal.
    expect(classifyWebtv(403)).toBe("unknown");
    expect(classifyWebtv(500)).toBe("unknown");
    expect(classifyWebtv(503)).toBe("unknown");
    expect(classifyWebtv(302)).toBe("unknown");
    expect(classifyWebtv(0)).toBe("unknown");
  });
});

describe("classifyKaltura", () => {
  it("treats status 3 (DELETED) as gone", () => {
    expect(classifyKaltura(KALTURA_STATUS_DELETED)).toBe("gone");
  });
  it("treats any other returned status as live", () => {
    expect(classifyKaltura(2)).toBe("live"); // READY
    expect(classifyKaltura(1)).toBe("live");
  });
  it("treats an entry the batch didn't return as unknown", () => {
    expect(classifyKaltura(undefined)).toBe("unknown");
  });
});

describe("predictRemoval", () => {
  const clean = { kaltura_deleted_at: null, webtv_unpublished_at: null };
  const webtvGone = { kaltura_deleted_at: null, webtv_unpublished_at: new Date() };
  const kalturaGone = { kaltura_deleted_at: new Date(), webtv_unpublished_at: null };
  const sig = (webtv: Liveness, kaltura: Liveness) => ({ webtv, kaltura });

  it("removes a clean row when either source is gone", () => {
    expect(predictRemoval(clean, sig("gone", "unknown"))).toBe("removed");
    expect(predictRemoval(clean, sig("unknown", "gone"))).toBe("removed");
  });

  it("is a noop when the gone source is already flagged", () => {
    expect(predictRemoval(webtvGone, sig("gone", "unknown"))).toBe("noop");
    expect(predictRemoval(kalturaGone, sig("unknown", "gone"))).toBe("noop");
  });

  it("restores when a flagged source reports live again", () => {
    expect(predictRemoval(webtvGone, sig("live", "unknown"))).toBe("restored");
    expect(predictRemoval(kalturaGone, sig("unknown", "live"))).toBe("restored");
  });

  it("never acts on unknown/unknown", () => {
    expect(predictRemoval(clean, sig("unknown", "unknown"))).toBe("noop");
    expect(predictRemoval(webtvGone, sig("unknown", "unknown"))).toBe("noop");
  });

  it("prefers 'removed' when one source removes while the other restores", () => {
    // WebTV 404 (new) while Kaltura came back live on a row it had flagged.
    expect(predictRemoval(kalturaGone, sig("gone", "live"))).toBe("removed");
  });

  it("does not restore a source that live-reports but was never flagged", () => {
    expect(predictRemoval(clean, sig("live", "live"))).toBe("noop");
  });
});
