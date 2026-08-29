import type { TranscriptLanguageInfo, VideoRecord } from "@/lib/db";
import {
  getTranscriptLanguagesByKalturaId,
  getVideoByAssetId,
  getVideoByKalturaId,
  getVideosByEntryId,
} from "@/lib/db";
import {
  parseTranscriptIdentifier,
  TranscriptIdentifierError,
} from "@/lib/transcript-identifier";
import type {
  AvailabilityDependencies,
  ParsedTranscriptIdentifier,
  TranscriptAvailabilityMatch,
  TranscriptAvailabilityResponse,
  TranscriptAvailabilityStatus,
  TranscriptIdentifierInput,
} from "@/lib/transcript-availability-types";
import { videoUrl } from "@/lib/video-url";

export { parseTranscriptIdentifier, TranscriptIdentifierError };
export type * from "@/lib/transcript-availability-types";

const PROCESSING_STATUSES = new Set([
  "scheduled",
  "transcribing",
  "identifying_speakers",
  "analyzing_topics",
  "interrupted",
]);

const DEFAULT_DEPENDENCIES: AvailabilityDependencies = {
  getVideoByAssetId,
  getVideoByKalturaId,
  getVideosByEntryId,
  getTranscriptLanguagesByKalturaId,
};

export async function resolveTranscriptAvailability(
  input: TranscriptIdentifierInput,
  options: { locale: string; baseUrl: string },
  dependencies: AvailabilityDependencies = DEFAULT_DEPENDENCIES,
): Promise<TranscriptAvailabilityResponse> {
  const query = parseTranscriptIdentifier(input);
  const records = await resolveRecords(query, dependencies);
  const matches = await Promise.all(
    records.map((record) => buildMatch(record, options, dependencies)),
  );
  matches.sort(compareMatches);
  return buildResponse(query, matches, options);
}

async function resolveRecords(
  query: ParsedTranscriptIdentifier,
  dependencies: AvailabilityDependencies,
): Promise<VideoRecord[]> {
  if (query.type === "assetId") {
    return compact([await dependencies.getVideoByAssetId(query.value)]);
  }
  if (query.type === "entryId") {
    return deduplicate(await dependencies.getVideosByEntryId(query.value));
  }
  const direct = await dependencies.getVideoByKalturaId(query.value);
  if (direct) return [direct];
  return deduplicate(await dependencies.getVideosByEntryId(query.value));
}

async function buildMatch(
  record: VideoRecord,
  options: { locale: string; baseUrl: string },
  dependencies: AvailabilityDependencies,
): Promise<TranscriptAvailabilityMatch> {
  const infos = await dependencies.getTranscriptLanguagesByKalturaId(
    record.kaltura_id,
  );
  const visibleInfos = record.removed_at ? [] : infos;
  const pageUrl = buildPageUrl(record, options);
  return {
    ...recordIdentity(record),
    pageUrl,
    jsonUrl: `${pageUrl}.json`,
    generationUrl: pageUrl,
    status: availabilityStatus(record, visibleInfos),
    languages: serializeLanguages(visibleInfos),
  };
}

function recordIdentity(record: VideoRecord) {
  return {
    assetId: record.asset_id,
    kalturaId: record.kaltura_id,
    entryId: record.entry_id,
    removed: record.removed_at !== null,
    pvSymbol: record.pv_symbol,
    pvPart: record.pv_part,
  };
}

function serializeLanguages(infos: TranscriptLanguageInfo[]) {
  return infos
    .filter(
      (info): info is TranscriptLanguageInfo & { language_code: string } =>
        info.language_code !== null,
    )
    .map((info) => ({
      language: info.language_code,
      status: info.transcription_status,
      transcriptId: info.transcript_id,
    }));
}

function availabilityStatus(
  record: VideoRecord,
  infos: TranscriptLanguageInfo[],
): TranscriptAvailabilityStatus {
  if (record.removed_at) return "removed";
  if (infos.some((info) => info.transcription_status === "completed")) {
    return "available";
  }
  const processing = infos.some((info) =>
    PROCESSING_STATUSES.has(info.transcription_status),
  );
  return processing ? "processing" : "unavailable";
}

function buildResponse(
  query: ParsedTranscriptIdentifier,
  matches: TranscriptAvailabilityMatch[],
  options: { locale: string; baseUrl: string },
): TranscriptAvailabilityResponse {
  const localeRoot = `${trimTrailingSlash(options.baseUrl)}/${options.locale}`;
  return {
    query,
    generationUrl: matches.length === 1 ? matches[0].generationUrl : localeRoot,
    matches,
  };
}

function buildPageUrl(
  record: VideoRecord,
  options: { locale: string; baseUrl: string },
): string {
  return `${trimTrailingSlash(options.baseUrl)}/${options.locale}/${videoUrl(record)}`;
}

function compact(records: Array<VideoRecord | null>): VideoRecord[] {
  return records.filter((record): record is VideoRecord => record !== null);
}

function deduplicate(records: VideoRecord[]): VideoRecord[] {
  return [
    ...new Map(records.map((record) => [record.asset_id, record])).values(),
  ];
}

function compareMatches(
  left: TranscriptAvailabilityMatch,
  right: TranscriptAvailabilityMatch,
): number {
  return (
    (left.pvPart ?? Number.MAX_SAFE_INTEGER) -
      (right.pvPart ?? Number.MAX_SAFE_INTEGER) ||
    left.assetId.localeCompare(right.assetId)
  );
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
