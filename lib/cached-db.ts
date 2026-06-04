import { unstable_cache } from "next/cache";
import {
  getAllTranscriptedEntries,
  getAvailableDates,
  getFilterOptions,
  getTranscriptedEntriesByLanguage,
} from "@/lib/db";

export const getCachedTranscriptedEntries = unstable_cache(
  getAllTranscriptedEntries,
  ["transcripted-entries"],
  { revalidate: 60 },
);

// Per-language transcript-entry cache used for the two-tier T badge — see
// `recordToVideo` in lib/un-api.ts and `DocChips` in components/transcript-table.tsx.
export const getCachedTranscriptedEntriesByLanguage = (language: string) =>
  unstable_cache(
    getTranscriptedEntriesByLanguage,
    ["transcripted-entries-by-language", language],
    { revalidate: 60 },
  )(language);

// `unstable_cache` hashes the arguments into the key internally, but we also
// list `daysBack` explicitly in keyParts so cache entries are introspectable
// and distinct per argument (and targetable by `revalidateTag`).
export const getCachedAvailableDates = (daysBack: number) =>
  unstable_cache(getAvailableDates, ["available-dates", String(daysBack)], {
    revalidate: 60,
  })(daysBack);

export const getCachedFilterOptions = (daysBack: number) =>
  unstable_cache(getFilterOptions, ["filter-options", String(daysBack)], {
    revalidate: 60,
  })(daysBack);
