/**
 * Provider utilities — re-exports shared audio helpers from gemini-utils
 * and adds provider-specific helpers.
 */
export { downloadAudioToTemp } from "../gemini-utils";

/** Format milliseconds as HH:MM:SS */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
