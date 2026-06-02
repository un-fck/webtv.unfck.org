"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useTimezone } from "@/lib/hooks/use-timezone";
import {
  formatMeetingDate as formatMeetingDateCore,
  formatMeetingDateTime as formatMeetingDateTimeCore,
  formatMeetingTime as formatMeetingTimeCore,
  isFutureDay as isFutureDayCore,
} from "@/lib/timezone";

/**
 * Single source of truth for date/time formatting in client components.
 * Pulls locale from `useLocale()` and timezone from the timezone context, and
 * resolves the localized "Today / Tomorrow / Yesterday" strings from the
 * `schedule` namespace once per render.
 *
 * Usage:
 *   const { formatMeetingDate, formatMeetingTime } = useMeetingFormat();
 *   formatMeetingDate(video.date)
 *   formatMeetingTime(video.scheduledTime)
 */
export function useMeetingFormat() {
  const { timezone } = useTimezone();
  const locale = useLocale();
  const t = useTranslations("schedule");

  return useMemo(() => {
    const relative = {
      today: t("today"),
      tomorrow: t("tomorrow"),
      yesterday: t("yesterday"),
    };
    const ctx = { timezone, locale, relative };
    return {
      formatMeetingDate: (
        dateOrTimestamp: string,
        options?: { shortWeekday?: boolean },
      ) => formatMeetingDateCore(dateOrTimestamp, ctx, options),
      formatMeetingTime: (timestamp: string) =>
        formatMeetingTimeCore(timestamp, { timezone, locale }),
      formatMeetingDateTime: (scheduledTime: string | null, date: string) =>
        formatMeetingDateTimeCore(scheduledTime, date, ctx),
      isFutureDay: (dateOrTimestamp: string) =>
        isFutureDayCore(dateOrTimestamp, { timezone }),
    };
  }, [timezone, locale, t]);
}
