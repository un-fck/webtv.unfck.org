import { describe, expect, it } from "vitest";
import { formatMeetingDate } from "./timezone";

const ctx = {
  timezone: "America/New_York",
  locale: "en",
  relative: { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" },
};

// The "omit the year in the current year" shortcut is a schedule-table
// convenience; anything archived (an exported .txt/.rtf/.xlsx header) must
// carry the year or the file is undatable a year later.
describe("formatMeetingDate year option", () => {
  const thisYear = new Date().getFullYear();
  const inCurrentYear = `${thisYear}-06-15`;

  it("omits the current year by default", () => {
    const out = formatMeetingDate(inCurrentYear, ctx, {
      weekday: "none",
      relative: "off",
    });
    expect(out).toBe("15 June");
  });

  it("includes the current year when year is 'always'", () => {
    const out = formatMeetingDate(inCurrentYear, ctx, {
      weekday: "none",
      relative: "off",
      year: "always",
    });
    expect(out).toBe(`15 June ${thisYear}`);
  });

  it("still shows the year for other years under either setting", () => {
    for (const year of ["auto", "always"] as const) {
      expect(
        formatMeetingDate("2019-06-15", ctx, {
          weekday: "none",
          relative: "off",
          year,
        }),
      ).toBe("15 June 2019");
    }
  });
});
