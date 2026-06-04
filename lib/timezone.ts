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

export function formatMeetingDate(
  dateOrTimestamp: string,
  ctx: MeetingFormatContext,
  options: { shortWeekday?: boolean } = {},
): string {
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

  if (dateStr === todayStr) return ctx.relative.today;
  if (dateStr === isoDay(tomorrow)) return ctx.relative.tomorrow;
  if (dateStr === isoDay(yesterday)) return ctx.relative.yesterday;

  const currentYear = now.toLocaleDateString("en-CA", {
    timeZone: tz,
    year: "numeric",
  });
  const dateYear = date.toLocaleDateString("en-CA", {
    timeZone: tz,
    year: "numeric",
  });
  const formatted = date.toLocaleDateString(ctx.locale, {
    timeZone: tz,
    weekday: options.shortWeekday ? "short" : "long",
    month: "short",
    day: "numeric",
    ...(dateYear !== currentYear ? { year: "numeric" } : {}),
  });
  // Intl emits lowercase weekday names in French/Spanish/Italian by spec
  // (`mardi 2 juin`), but in our day-section headings we want sentence case
  // (`Mardi 2 juin`). `toLocaleUpperCase(locale)` is a no-op for scripts
  // without case (Arabic, Chinese) and matches the user's "Aujourd'hui /
  // Today / Hoy" translations which are already capitalized.
  return formatted.charAt(0).toLocaleUpperCase(ctx.locale) + formatted.slice(1);
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
  return `${formatMeetingDate(scheduledTime, ctx)} ${formatMeetingTime(scheduledTime, ctx)}`;
}
