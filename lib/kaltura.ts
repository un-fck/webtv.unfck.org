// UN Web TV's Kaltura account. Single source of truth — if the UN ever rotates
// these, change them here only.
export const KALTURA_PARTNER_ID = 2503451;
export const KALTURA_WIDGET_ID = `_${KALTURA_PARTNER_ID}`;
// Player UI config used for embeds (matches the one wired in video-page-client).
export const KALTURA_UICONF_ID = 49754663;

/** Still frame from a Kaltura entry at a given second (used as a video poster). */
export function kalturaThumbnailUrl(
  entryId: string,
  vidSec: number,
  width = 480,
): string {
  return `https://cdnapisec.kaltura.com/p/${KALTURA_PARTNER_ID}/thumbnail/entry_id/${entryId}/width/${width}/vid_sec/${Math.max(0, Math.floor(vidSec))}`;
}

export function extractKalturaId(assetId: string): string | null {
  if (!assetId) return null;

  let match = assetId.match(/\(([^)]+)\)/);
  if (match) return match[1];

  match = assetId.match(/\/id\/([^/]+)/);
  if (match) return match[1];

  if (/^1_[a-z0-9]+$/i.test(assetId)) {
    return assetId;
  }

  match = assetId.match(/\/k1(\w+)$/);
  if (match) {
    return `1_${match[1]}`;
  }

  match = assetId.match(/^k1(\w+)$/);
  if (match) {
    return `1_${match[1]}`;
  }

  match = assetId.match(/k1([a-z0-9])\/k1([a-z0-9]+)/i);
  if (match) {
    return `1_${match[2]}`;
  }

  match = assetId.match(/k1(\d+)\/k1(.+)/i);
  if (match) {
    return `1_${match[2]}`;
  }

  return null;
}

/** Subset of Kaltura's flavorAsset fields that flavor selection relies on. */
export interface KalturaFlavor {
  flavorParamsId?: number;
  language?: string;
  tags?: string;
  status?: number;
  isDefault?: boolean;
}

/** Audio-only flavors matching a Kaltura language name (case-insensitive). */
export function audioFlavorsForLanguage(
  flavors: KalturaFlavor[],
  language: string,
): KalturaFlavor[] {
  return flavors.filter(
    (f) =>
      f.language?.toLowerCase() === language.toLowerCase() &&
      f.tags?.includes("audio_only"),
  );
}

/**
 * The flavor whose file is actually downloadable: status 2 = READY. After the
 * live→VOD flip Kaltura assembles each track's file asynchronously (typically
 * 15-60 min for UN meetings); until then flavors are missing or non-ready and
 * their download URLs 404. Prefers the entry's default flavor among ready
 * ones. Returns undefined when nothing is ready — callers must treat that as
 * "audio not available yet", not fall back to a non-ready flavor.
 */
export function pickReadyAudioFlavor(
  candidates: KalturaFlavor[],
): KalturaFlavor | undefined {
  return (
    candidates.find((f) => f.status === 2 && f.isDefault) ||
    candidates.find((f) => f.status === 2)
  );
}
