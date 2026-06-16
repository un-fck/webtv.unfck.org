// UN Web TV timestamps have broken timezone offsets.
// Their own JS strips the offset and treats the wall-clock digits as UTC.
// We do the same everywhere.
export function parseUNTimestamp(timestamp: string): Date {
  return new Date(timestamp.slice(0, 19) + "Z");
}

export const DEFAULT_TIMEZONE = "America/New_York";
export const BROWSER_TIMEZONE = "browser";

export type TimezoneOption = {
  value: string;
  label: string;
};

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getTimezoneOptions(): TimezoneOption[] {
  const browser = getBrowserTimezone();
  const options: TimezoneOption[] = [
    { value: DEFAULT_TIMEZONE, label: formatTzLabel(DEFAULT_TIMEZONE) },
  ];

  if (browser !== DEFAULT_TIMEZONE) {
    options.push({ value: BROWSER_TIMEZONE, label: formatTzLabel(browser) });
  }

  return options;
}

function formatTzLabel(tz: string): string {
  const now = new Date();
  // "en-US" hardcoded here because the timezone *name* (PST, GMT, EST, …) is
  // a stable abbreviation that's not really localized in UN usage. The label
  // is only ever shown inside the timezone picker dropdown.
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;

  const city = tz.split("/").pop()!.replace(/_/g, " ");
  return short ? `${city} (${short})` : city;
}

export function resolveTimezone(value: string): string {
  return value === BROWSER_TIMEZONE ? getBrowserTimezone() : value;
}

// `YYYY-MM-DD` for `dateOrTimestamp` rendered in the given timezone. Used both
// by display formatters (for "Today / Tomorrow / Yesterday" day-equality
// checks) and for filename prefixes — so a meeting whose `scheduled_time`
// straddles UTC midnight still renders on the same calendar day everywhere.
export function meetingIsoDay(
  dateOrTimestamp: string,
  ctx: { timezone: string },
): string {
  const tz = resolveTimezone(ctx.timezone);
  const date =
    dateOrTimestamp.length > 10
      ? parseUNTimestamp(dateOrTimestamp)
      : new Date(dateOrTimestamp + "T12:00:00Z");
  return date.toLocaleDateString("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ── Localized formatting ────────────────────────────────────────────────
//
// The functions below take an explicit locale + relative-day strings so they
// stay pure (no React / next-intl dependency). The client hook
// `useMeetingFormat()` in lib/hooks/use-meeting-format.ts is the standard
// caller — it pulls locale from useLocale() and the relative strings from
// the schedule.{today,tomorrow,yesterday} message keys. Server-side callers
// can use these directly with explicit args.

export type RelativeDayStrings = {
  today: string;
  tomorrow: string;
  yesterday: string;
};

export type MeetingFormatContext = {
  timezone: string;
  locale: string;
  relative: RelativeDayStrings;
};

export function formatMeetingTime(
  timestamp: string,
  ctx: { timezone: string; locale: string },
): string {
  const date = parseUNTimestamp(timestamp);
  const tz = resolveTimezone(ctx.timezone);
  return date.toLocaleTimeString(ctx.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    hourCycle: "h23",
  });
}

// UN house-style Arabic month names: Levantine name slash Western-Latinate
// name (e.g. "حزيران/يونيه" for June). Intl.DateTimeFormat cannot produce
// this dual form — see https://news.un.org/ar/ datelines for the convention.
const UN_ARABIC_MONTHS = [
  "كانون الثاني/يناير",
  "شباط/فبراير",
  "آذار/مارس",
  "نيسان/أبريل",
  "أيار/مايو",
  "حزيران/يونيه",
  "تموز/يوليه",
  "آب/أغسطس",
  "أيلول/سبتمبر",
  "تشرين الأول/أكتوبر",
  "تشرين الثاني/نوفمبر",
  "كانون الأول/ديسمبر",
];

// Locale-appropriate comma between relative label and absolute date.
function relativeComma(locale: string): string {
  if (locale.startsWith("ar")) return "، ";
  if (locale.startsWith("zh") || locale.startsWith("ja")) return "，";
  return ", ";
}

export function formatMeetingDate(
  dateOrTimestamp: string,
  ctx: MeetingFormatContext,
  options: {
    weekday?: "long" | "short" | "none";
    // "alone"  → return relative label by itself for today/±1 (default)
    // "prefix" → return "Today, 15 June" for today/±1, else absolute alone
    // "off"    → never use relative; always return the absolute date
    relative?: "alone" | "prefix" | "off";
  } = {},
): string {
  const { weekday = "long", relative = "alone" } = options;
  const tz = resolveTimezone(ctx.timezone);
  const date =
    dateOrTimestamp.length > 10
      ? parseUNTimestamp(dateOrTimestamp)
      : new Date(dateOrTimestamp + "T12:00:00Z");

  const now = new Date();
  // For day-equality comparison we want a stable ISO-like format regardless of
  // user locale — keep "en-CA" hardcoded so this is direction-of-time logic,
  // not display.
  const isoDay = (d: Date) =>
    d.toLocaleDateString("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const todayStr = isoDay(now);
  const dateStr = isoDay(date);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let relativeLabel: string | null = null;
  if (relative !== "off") {
    if (dateStr === todayStr) relativeLabel = ctx.relative.today;
    else if (dateStr === isoDay(tomorrow)) relativeLabel = ctx.relative.tomorrow;
    else if (dateStr === isoDay(yesterday))
      relativeLabel = ctx.relative.yesterday;
  }

  if (relativeLabel && relative === "alone") return relativeLabel;

  if (relativeLabel && relative === "prefix") {
    // When prefixing "Today / Yesterday / Tomorrow", drop the weekday from
    // the absolute portion — the relative label already conveys it, and
    // "Today, Sunday, 15 June" reads with one comma too many.
    const absoluteNoWeekday = formatAbsoluteDate(
      date,
      tz,
      ctx.locale,
      "none",
      now,
    );
    return `${relativeLabel}${relativeComma(ctx.locale)}${absoluteNoWeekday}`;
  }

  const absolute = formatAbsoluteDate(date, tz, ctx.locale, weekday, now);

  // Intl emits lowercase weekday names in French/Spanish/Italian by spec
  // (`mardi 2 juin`); in day-section headings we want sentence case
  // (`Mardi 2 juin`). `toLocaleUpperCase(locale)` is a no-op for scripts
  // without case (Arabic, Chinese).
  return absolute.charAt(0).toLocaleUpperCase(ctx.locale) + absolute.slice(1);
}

function formatAbsoluteDate(
  date: Date,
  tz: string,
  locale: string,
  weekday: "long" | "short" | "none",
  now: Date,
): string {
  const currentYear = now.toLocaleDateString("en-CA", {
    timeZone: tz,
    year: "numeric",
  });
  const dateYear = date.toLocaleDateString("en-CA", {
    timeZone: tz,
    year: "numeric",
  });
  const showYear = dateYear !== currentYear;

  // Arabic uses UN dual-named months; Intl can't produce that form.
  if (locale.startsWith("ar")) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .reduce<Record<string, string>>((acc, p) => {
        acc[p.type] = p.value;
        return acc;
      }, {});
    const day = String(Number(parts.day));
    const month = UN_ARABIC_MONTHS[Number(parts.month) - 1];
    const wd =
      weekday === "none"
        ? ""
        : new Intl.DateTimeFormat("ar", { timeZone: tz, weekday }).format(
            date,
          ) + "، ";
    return `${wd}${day} ${month}${showYear ? ` ${dateYear}` : ""}`;
  }

  // Chinese: CLDR runs date and weekday together with no separator
  // ("3月9日星期一"); UN zh style inserts a space ("3月9日 星期一").
  if (locale.startsWith("zh")) {
    const datePart = date.toLocaleDateString(locale, {
      timeZone: tz,
      month: "long",
      day: "numeric",
      ...(showYear ? { year: "numeric" } : {}),
    });
    if (weekday === "none") return datePart;
    const wd = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday }).format(
      date,
    );
    return `${datePart} ${wd}`;
  }

  // UN English style is day-month-year ("15 June 2025"), which matches en-GB
  // rather than Intl's en-US default ("June 15, 2025").
  const intlLocale = locale === "en" ? "en-GB" : locale;

  const formatted = date.toLocaleDateString(intlLocale, {
    timeZone: tz,
    ...(weekday !== "none" ? { weekday } : {}),
    month: "long",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });

  // English: en-GB Intl emits "Monday 9 March" (no comma) but "Tuesday,
  // 4 November 2025" (with comma) — inconsistent. UN English style uses the
  // comma in both cases (per UN Journal); inject it after the weekday.
  if (locale === "en" && weekday !== "none" && !formatted.includes(",")) {
    return formatted.replace(/^(\S+)\s/, "$1, ");
  }

  // Russian Intl appends " г." (год = year); UN datelines omit it.
  if (locale.startsWith("ru")) {
    return formatted.replace(/\s*г\.?\s*$/u, "");
  }
  return formatted;
}

// True when the given date/timestamp falls strictly after "today" in the
// given timezone (i.e. tomorrow or later). Locale-agnostic.
export function isFutureDay(
  dateOrTimestamp: string,
  ctx: { timezone: string },
): boolean {
  const tz = resolveTimezone(ctx.timezone);
  const date =
    dateOrTimestamp.length > 10
      ? parseUNTimestamp(dateOrTimestamp)
      : new Date(dateOrTimestamp + "T12:00:00Z");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  return fmt(date) > fmt(new Date());
}

export function formatMeetingDateTime(
  scheduledTime: string | null,
  date: string,
  ctx: MeetingFormatContext,
): string {
  if (!scheduledTime) return formatMeetingDate(date, ctx);
  return `${formatMeetingDate(scheduledTime, ctx)}${relativeComma(ctx.locale)}${formatMeetingTime(scheduledTime, ctx)}`;
}
