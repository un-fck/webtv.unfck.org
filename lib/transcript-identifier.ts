import type {
  ParsedTranscriptIdentifier,
  TranscriptIdentifierInput,
} from "@/lib/transcript-availability-types";

const KALTURA_ID = /^1_[a-z0-9]+$/i;

export class TranscriptIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptIdentifierError";
  }
}

export function parseTranscriptIdentifier(
  input: TranscriptIdentifierInput,
): ParsedTranscriptIdentifier {
  const provided = Object.entries(input).filter(
    ([, value]) => typeof value === "string" && value.trim().length > 0,
  );
  if (provided.length !== 1) {
    throw identifierError(
      "Provide exactly one of assetId, webtvUrl, kalturaId, or entryId.",
    );
  }
  return parseProvidedIdentifier(
    provided[0] as [keyof TranscriptIdentifierInput, string],
  );
}

function parseProvidedIdentifier([name, raw]: [
  keyof TranscriptIdentifierInput,
  string,
]): ParsedTranscriptIdentifier {
  const value = raw.trim();
  if (name === "webtvUrl") {
    return { type: "assetId", value: assetIdFromWebtvUrl(value) };
  }
  if (name === "assetId") {
    return { type: "assetId", value: validateAssetId(value) };
  }
  if (!KALTURA_ID.test(value)) {
    throw identifierError(`${name} must be a Kaltura ID such as 1_abcdefgh.`);
  }
  return { type: name, value };
}

function assetIdFromWebtvUrl(value: string): string {
  const url = parseWebtvUrl(value);
  const segments = url.pathname.split("/").filter(Boolean);
  const assetIndex = segments.indexOf("asset");
  if (assetIndex < 0 || assetIndex === segments.length - 1) {
    throw identifierError("webtvUrl must contain an /asset/{assetId} path.");
  }
  return validateAssetId(
    segments
      .slice(assetIndex + 1)
      .map(decodeWebtvSegment)
      .join("/"),
  );
}

function parseWebtvUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw identifierError("webtvUrl must be a valid UN Web TV asset URL.");
  }
  const validHost = ["webtv.un.org", "www.webtv.un.org"].includes(url.hostname);
  if (url.protocol !== "https:" || !validHost) {
    throw identifierError("webtvUrl must use the https://webtv.un.org origin.");
  }
  return url;
}

function decodeWebtvSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw identifierError("webtvUrl contains malformed path encoding.");
  }
}

function validateAssetId(value: string): string {
  const invalid = value.split("/").some(isInvalidAssetSegment);
  if (invalid) throw identifierError("assetId is malformed.");
  return value;
}

function isInvalidAssetSegment(segment: string): boolean {
  return (
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    !/^[a-z0-9_()-]+$/i.test(segment)
  );
}

function identifierError(message: string): TranscriptIdentifierError {
  return new TranscriptIdentifierError(message);
}
