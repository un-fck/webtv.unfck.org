import { slugFromSymbol } from "./meeting-slug";

/**
 * The path (no leading slash, no locale prefix) at which a video is rendered.
 *
 * Derived purely from columns — no cached `slug` in the database. Citation
 * form when a UN document symbol is known, opaque asset-permalink otherwise.
 *
 *   pv_symbol=S/PV.10175, pv_part=1 → "sc/10175"
 *   pv_symbol=S/PV.10175, pv_part=2 → "sc/10175/2"
 *   pv_symbol=null,       …          → "asset/<asset_id>"
 *
 * The `asset/...` form mirrors `webtv.un.org/{locale}/asset/{asset_id}`, so
 * swapping the host on a WebTV URL lands on the corresponding transcript
 * page.
 */
export function videoUrl(v: {
  pv_symbol: string | null;
  pv_part: number | null;
  asset_id: string;
}): string {
  if (v.pv_symbol && v.pv_part) {
    const base = slugFromSymbol(v.pv_symbol);
    if (base) return v.pv_part > 1 ? `${base}/${v.pv_part}` : base;
  }
  return `asset/${v.asset_id}`;
}
