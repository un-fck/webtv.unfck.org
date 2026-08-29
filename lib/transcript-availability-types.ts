import type {
  TranscriptLanguageInfo,
  getTranscriptLanguagesByKalturaId,
  getVideoByAssetId,
  getVideoByKalturaId,
  getVideosByEntryId,
} from "@/lib/db";

export type TranscriptIdentifierType = "assetId" | "kalturaId" | "entryId";

export interface TranscriptIdentifierInput {
  assetId?: string;
  webtvUrl?: string;
  kalturaId?: string;
  entryId?: string;
}

export interface ParsedTranscriptIdentifier {
  type: TranscriptIdentifierType;
  value: string;
}

export type TranscriptAvailabilityStatus =
  "available" | "processing" | "unavailable" | "removed";

export interface TranscriptAvailabilityLanguage {
  language: string;
  status: TranscriptLanguageInfo["transcription_status"];
  transcriptId: string;
}

export interface TranscriptAvailabilityMatch {
  assetId: string;
  kalturaId: string;
  entryId: string | null;
  removed: boolean;
  pvSymbol: string | null;
  pvPart: number | null;
  pageUrl: string;
  jsonUrl: string;
  generationUrl: string;
  status: TranscriptAvailabilityStatus;
  languages: TranscriptAvailabilityLanguage[];
}

export interface TranscriptAvailabilityResponse {
  query: ParsedTranscriptIdentifier;
  generationUrl: string;
  matches: TranscriptAvailabilityMatch[];
}

export interface AvailabilityDependencies {
  getVideoByAssetId: typeof getVideoByAssetId;
  getVideoByKalturaId: typeof getVideoByKalturaId;
  getVideosByEntryId: typeof getVideosByEntryId;
  getTranscriptLanguagesByKalturaId: typeof getTranscriptLanguagesByKalturaId;
}
