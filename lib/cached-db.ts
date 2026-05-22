import { unstable_cache } from "next/cache";
import {
  getAllTranscriptedEntries,
  getAvailableDates,
  getFilterOptions,
} from "@/lib/db";

export const getCachedTranscriptedEntries = unstable_cache(
  getAllTranscriptedEntries,
  ["transcripted-entries"],
  { revalidate: 60 },
);

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
