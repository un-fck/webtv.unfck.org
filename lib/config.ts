// Lookback window for the schedule view (note: app/page.tsx currently uses DAYS_BACK = 365 directly).
// Historical search beyond this window goes through /api/videos with `q` set (PostgreSQL FTS).
export const scheduleLookbackDays = 14;

// Canonical transcript disclaimer, shipped on machine-readable surfaces
// (JSON API responses, notification emails). UI surfaces and exports use the
// localized message-catalog keys (`transcript.panel.transcriptDisclaimer` /
// `exportDisclaimer`), which carry this same wording per locale; the homepage
// (`home.disclaimer`) is the only other phrasing variant.
export const TRANSCRIPT_DISCLAIMER =
  "Transcripts available through this tool are created by using automatic speech recognition and are not official records nor official documents of the United Nations. Official records and official documents are available on the Official Document System of the United Nations.";
