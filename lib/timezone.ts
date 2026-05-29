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

export function formatMeetingTime(timestamp: string, timezone: string): string {
  const date = parseUNTimestamp(timestamp);
  const tz = resolveTimezone(timezone);
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

export function formatMeetingDate(
  dateOrTimestamp: string,
  timezone: string,
  options: { shortWeekday?: boolean } = {},
): string {
  const tz = resolveTimezone(timezone);
  const date =
    dateOrTimestamp.length > 10
      ? parseUNTimestamp(dateOrTimestamp)
      : new Date(dateOrTimestamp + "T12:00:00Z");

  const now = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const todayStr = fmt(now);
  const dateStr = fmt(date);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dateStr === todayStr) return "Today";
  if (dateStr === fmt(tomorrow)) return "Tomorrow";
  if (dateStr === fmt(yesterday)) return "Yesterday";

  const currentYear = now.toLocaleDateString("en-US", {
    timeZone: tz,
    year: "numeric",
  });
  const dateYear = date.toLocaleDateString("en-US", {
    timeZone: tz,
    year: "numeric",
  });
  return date.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: options.shortWeekday ? "short" : "long",
    month: "short",
    day: "numeric",
    ...(dateYear !== currentYear ? { year: "numeric" } : {}),
  });
}

// True when the given date/timestamp falls strictly after "today" in the
// given timezone (i.e. tomorrow or later).
export function isFutureDay(
  dateOrTimestamp: string,
  timezone: string,
): boolean {
  const tz = resolveTimezone(timezone);
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
  timezone: string,
): string {
  if (!scheduledTime) return formatMeetingDate(date, timezone);
  return `${formatMeetingDate(scheduledTime, timezone)} ${formatMeetingTime(scheduledTime, timezone)}`;
}
