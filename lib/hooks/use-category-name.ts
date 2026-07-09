"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Resolves a WebTV category ("Security Council", "Press Conferences") to its
 * localized name. The `schedule.categoryNames` catalog is keyed on the English
 * canonical value and only exists in the five non-English locales — English is
 * the identity — so `t.has()` guards both the English case and any category
 * WebTV starts emitting before we've harvested a translation for it.
 *
 * Used for the schedule table's filter, the meeting page's category pill, and
 * the subtitle line of every transcript export.
 */
export function useCategoryName(): (category: string) => string {
  const t = useTranslations("schedule.categoryNames");
  return useCallback(
    (category: string): string =>
      category && t.has(category) ? t(category) : category,
    [t],
  );
}
