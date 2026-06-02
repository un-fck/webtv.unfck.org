"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Returns a function that resolves a language code (or "floor") to its
 * localized display name. Powers the audio language picker and any other
 * surface that shows a language to the user.
 *
 * Unknown codes fall back to the upper-cased code so the UI never breaks.
 */
export function useLanguageDisplayName(): (code: string) => string {
  const t = useTranslations("languages");
  return useCallback(
    (code: string) => {
      const k = code.toLowerCase();
      // next-intl will throw on missing keys; suppress to allow unknown codes.
      try {
        if (["floor", "en", "fr", "es", "ar", "zh", "ru"].includes(k)) {
          return t(k as "floor" | "en" | "fr" | "es" | "ar" | "zh" | "ru");
        }
      } catch {}
      return code.toUpperCase();
    },
    [t],
  );
}
