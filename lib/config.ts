// Lookback window for the schedule view (note: app/page.tsx currently uses DAYS_BACK = 365 directly).
// Historical search beyond this window goes through /api/videos with `q` set (PostgreSQL FTS).
export const scheduleLookbackDays = 14;

// Canonical transcript disclaimer, shipped on machine-readable surfaces
// (JSON API responses, notification emails). UI surfaces and exports use the
// localized message-catalog keys (`transcript.panel.transcriptDisclaimer` /
// `exportDisclaimer`), which carry this same wording per locale; the homepage
// (`home.disclaimer`) is the only other phrasing variant.
export const TRANSCRIPT_DISCLAIMER =
  "Automatically generated transcript — may contain errors. Not an official United Nations record.";
