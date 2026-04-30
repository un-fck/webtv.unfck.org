import type { SpeakerInfo } from "@/lib/db";

export type { SpeakerInfo, SpeakerMapping } from "@/lib/db";
export { getSpeakerMapping, setSpeakerMapping } from "@/lib/db";

export interface FormattedSpeakerInfo {
  name: string | null;
  affiliation: string | null;
  affiliation_full: string | null;
  group: string | null;
  function: string | null;
}

export function formatSpeakerInfo(
  info: SpeakerInfo | undefined,
  countryNames?: Map<string, string>,
): FormattedSpeakerInfo {
  if (!info) {
    return {
      name: null,
      affiliation: null,
      affiliation_full: null,
      group: null,
      function: null,
    };
  }

  return {
    name: info.name || null,
    affiliation: info.affiliation || null,
    affiliation_full: info.affiliation
      ? countryNames?.get(info.affiliation) || info.affiliation
      : null,
    group: info.group || null,
    function: info.function || null,
  };
}
