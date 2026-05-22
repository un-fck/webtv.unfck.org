/**
 * Pure formatting helpers for transcript rendering, extracted from
 * transcription-panel.tsx so they can be unit-tested in isolation.
 */
import type { SpeakerMapping } from "@/lib/speakers";

/** Format a duration in seconds as `M:SS` (or `H:MM:SS` past an hour). */
export function formatTimecode(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Build a human-readable speaker label from the resolved speaker mapping,
 * expanding ISO country codes via `countryNames` when available. Falls back to
 * `Speaker N` when the speaker is unknown.
 */
export function formatSpeakerText(
  statementIndex: number | undefined,
  speakerMappings: SpeakerMapping,
  countryNames: Map<string, string>,
): string {
  if (statementIndex === undefined) return "Speaker";
  const info = speakerMappings[statementIndex.toString()];
  if (
    !info ||
    (!info.affiliation && !info.group && !info.function && !info.name)
  ) {
    return `Speaker ${statementIndex + 1}`;
  }
  const parts: string[] = [];
  if (info.affiliation)
    parts.push(countryNames.get(info.affiliation) || info.affiliation);
  if (info.group) parts.push(info.group);
  if (info.function && info.function.toLowerCase() !== "representative")
    parts.push(info.function);
  if (info.name) parts.push(info.name);
  return parts.join(" · ");
}
