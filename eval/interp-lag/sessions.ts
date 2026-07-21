/**
 * Study corpus for the interpretation-lag analysis.
 *
 * Every meeting here has a `floor` (original-audio) track plus at least two
 * interpreted language tracks already transcribed in the production DB.
 *
 * The floor transcripts in the DB are NOT usable: all of these predate the
 * 2026-07-10 switch to Speechmatics Melia, so their floor track came from
 * Gemini, whose timestamps drift by tens of seconds and occasionally exceed
 * the video duration entirely (S/PV.10168's floor emits onsets at 8085 s in a
 * 4898 s video). `fetch-floor.ts` re-transcribes the floor with Melia into a
 * local cache; the interpreted tracks are read from the DB as-is.
 */

export interface StudySession {
  kalturaId: string;
  /** PV symbol where the meeting has one — null for briefings/press events. */
  pvSymbol: string | null;
  /** Duration in seconds, from webtv.videos. */
  durationS: number;
  /** Interpreted tracks available in the DB (floor excluded). */
  targets: string[];
  label: string;
}

export const STUDY_SESSIONS: StudySession[] = [
  {
    kalturaId: "1_0fnw1w4w",
    pvSymbol: "S/PV.10156",
    durationS: 552,
    targets: ["en", "zh"],
    label: "SC 10156",
  },
  {
    kalturaId: "1_lhisz3xb",
    pvSymbol: "S/PV.10161",
    durationS: 1499,
    targets: ["ar", "en", "es", "fr", "zh"],
    label: "SC 10161",
  },
  {
    kalturaId: "1_siluxlip",
    pvSymbol: null,
    durationS: 1774,
    targets: ["en", "fr", "ru"],
    label: "SG briefing 2026-06-01",
  },
  {
    kalturaId: "1_wnc53hq3",
    pvSymbol: null,
    durationS: 4567,
    targets: ["en", "es", "ru"],
    label: "untitled 4567s",
  },
  {
    kalturaId: "1_trgoqogf",
    pvSymbol: "S/PV.10168",
    durationS: 4898,
    targets: ["en", "fr", "ru", "zh"],
    label: "SC 10168",
  },
  {
    kalturaId: "1_tpv5f4f4",
    pvSymbol: null,
    durationS: 6271,
    targets: ["en", "fr", "zh"],
    label: "untitled 6271s",
  },
  {
    kalturaId: "1_pkzo8mxp",
    pvSymbol: null,
    durationS: 8963,
    targets: ["en", "es", "fr"],
    label: "untitled 8963s",
  },
];

/** Total floor audio to re-transcribe, in hours. */
export const TOTAL_FLOOR_HOURS =
  STUDY_SESSIONS.reduce((a, s) => a + s.durationS, 0) / 3600;
