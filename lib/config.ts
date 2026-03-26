// Initial page load only fetches recent videos. Historical search uses /api/search (Turso).
export const scheduleLookbackDays = 14;

// Update this snapshot whenever pricing assumptions are revised.
export const ASSEMBLYAI_RATE_CARD_VERSION = "2026-02-12";
export const ASSEMBLYAI_BASE_RATE_PER_HOUR_USD = 0.15;
export const ASSEMBLYAI_FEATURE_RATES_PER_HOUR_USD: Record<string, number> = {};
