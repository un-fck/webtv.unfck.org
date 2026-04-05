// Initial page load only fetches recent videos. Historical search uses /api/search (Turso).
export const scheduleLookbackDays = 14;

// Gemini pricing — verify at https://ai.google.dev/gemini-api/docs/pricing
// gemini-3-flash-preview (as of 2026-03-17; update when GA pricing is published)
export const GEMINI_RATE_CARD_VERSION = '2026-03-17';
export type GeminiModelPricing = {
  inputPerM: number;        // USD per 1M input tokens
  outputPerM: number;       // USD per 1M output tokens
  thinkingPerM: number;     // USD per 1M thinking tokens (same as output for flash)
};
export const GEMINI_MODEL_PRICING: Record<string, GeminiModelPricing> = {
  // Flash family — low-cost, fast
  'gemini-3-flash-preview': { inputPerM: 0.15, outputPerM: 0.60, thinkingPerM: 0.60 },
  'gemini-2.5-flash-preview': { inputPerM: 0.15, outputPerM: 0.60, thinkingPerM: 0.60 },
  'gemini-2.0-flash': { inputPerM: 0.10, outputPerM: 0.40, thinkingPerM: 0.40 },
};
