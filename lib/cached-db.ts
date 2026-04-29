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

export const getCachedAvailableDates = unstable_cache(
  (daysBack: number) => getAvailableDates(daysBack),
  ["available-dates"],
  { revalidate: 60 },
);

export const getCachedFilterOptions = unstable_cache(
  (daysBack: number) => getFilterOptions(daysBack),
  ["filter-options"],
  { revalidate: 60 },
);
