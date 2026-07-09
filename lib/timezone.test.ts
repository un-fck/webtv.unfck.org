import { describe, expect, it } from "vitest";
import { formatDateForMetadata, formatMeetingDate } from "./timezone";

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

// Meta descriptions interpolate this into a sentence ("Réunion (X), {date}.").
// It used to call toLocaleDateString directly and so missed the UN house-style
// rules that formatAbsoluteDate encodes.
describe("formatDateForMetadata", () => {
  // Noon UTC, so the calendar day is the same in every plausible server zone.
  // (`videos.date` is a Postgres DATE, which pg parses to *server-local*
  // midnight — hence the formatter renders it back in the server's zone.)
  const iso = "2025-11-04T12:00:00.000Z";

  it("uses UN English day-month-year order, not Intl's en-US default", () => {
    expect(formatDateForMetadata(iso, "en")).toBe("4 November 2025");
  });

  it("strips Russian Intl's trailing ' г.', which would double the sentence period", () => {
    const out = formatDateForMetadata(iso, "ru");
    expect(out).toBe("4 ноября 2025");
    expect(`${out}.`).not.toContain("..");
  });

  it("uses the UN dual Arabic month names, not CLDR's single name", () => {
    // UN house style is "تشرين الثاني/نوفمبر", CLDR gives only "نوفمبر".
    expect(formatDateForMetadata(iso, "ar")).toContain("تشرين الثاني/نوفمبر");
  });

  it("always includes the year, even in the current year", () => {
    const y = new Date().getFullYear();
    expect(formatDateForMetadata(`${y}-06-15T12:00:00.000Z`, "en")).toBe(
      `15 June ${y}`,
    );
  });

  it("returns the raw input for an unparseable date", () => {
    expect(formatDateForMetadata("not-a-date", "en")).toBe("not-a-date");
  });
});
