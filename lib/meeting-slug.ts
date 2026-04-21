/**
 * Human-readable meeting slug system.
 *
 * Converts UN document symbols (S/PV.9748, A/79/PV.21, etc.) to URL-friendly
 * slugs (sc/9748, ga/79/21) and back. Meetings without symbols fall back to
 * a date/title-based slug.
 *
 * See docs/official-transcripts.md for symbol patterns.
 */

/**
 * Derive a URL slug from a PV/SR document symbol.
 *
 * Examples:
 *   S/PV.9748         → sc/9748
 *   A/79/PV.21        → ga/79/21
 *   A/ES-11/PV.23     → ga/es11/23
 *   A/C.1/79/PV.7     → ga/c1/79/7
 *   A/C.3/79/SR.5     → ga/c3/79/5
 *   A/HRC/58/SR.59    → hrc/58/59
 *   E/2024/SR.10      → ecosoc/2024/10
 */
export function slugFromSymbol(symbol: string): string | null {
  // Security Council: S/PV.NNNN
  const sc = symbol.match(/^S\/PV\.(\d+)$/);
  if (sc) return `sc/${sc[1]}`;

  // GA Emergency Special Session: A/ES-NN/PV.NN
  const gaEs = symbol.match(/^A\/ES-(\d+)\/PV\.(\d+)$/);
  if (gaEs) return `ga/es${gaEs[1]}/${gaEs[2]}`;

  // GA Committee: A/C.N/NN/PV.NN or A/C.N/NN/SR.NN
  const gaCom = symbol.match(/^A\/C\.(\d)\/(\d+)\/(?:PV|SR)\.(\d+)$/);
  if (gaCom) return `ga/c${gaCom[1]}/${gaCom[2]}/${gaCom[3]}`;

  // GA Plenary: A/NN/PV.NN
  const ga = symbol.match(/^A\/(\d+)\/PV\.(\d+)$/);
  if (ga) return `ga/${ga[1]}/${ga[2]}`;

  // Human Rights Council: A/HRC/NN/SR.NN
  const hrc = symbol.match(/^A\/HRC\/(\d+)\/SR\.(\d+)$/);
  if (hrc) return `hrc/${hrc[1]}/${hrc[2]}`;

  // ECOSOC: E/YYYY/SR.NN
  const ecosoc = symbol.match(/^E\/(\d{4})\/SR\.(\d+)$/);
  if (ecosoc) return `ecosoc/${ecosoc[1]}/${ecosoc[2]}`;

  return null;
}

/**
 * Reconstruct a PV/SR symbol from a URL slug.
 *
 * Returns both pvSymbol and srSymbol where applicable (e.g. GA committees 2-6
 * use SR records, not PV).
 */
export function symbolFromSlug(
  slug: string,
): { pvSymbol: string; srSymbol?: string } | null {
  const parts = slug.split("/");

  // sc/NNNN → S/PV.NNNN
  if (parts[0] === "sc" && parts.length === 2 && /^\d+$/.test(parts[1])) {
    return { pvSymbol: `S/PV.${parts[1]}` };
  }

  // ga/esNN/NN → A/ES-NN/PV.NN
  if (
    parts[0] === "ga" &&
    parts.length === 3 &&
    /^es\d+$/.test(parts[1]) &&
    /^\d+$/.test(parts[2])
  ) {
    const esNum = parts[1].slice(2);
    return { pvSymbol: `A/ES-${esNum}/PV.${parts[2]}` };
  }

  // ga/cN/NN/NN → A/C.N/NN/PV.NN or SR.NN
  if (
    parts[0] === "ga" &&
    parts.length === 4 &&
    /^c[1-6]$/.test(parts[1]) &&
    /^\d+$/.test(parts[2]) &&
    /^\d+$/.test(parts[3])
  ) {
    const comNum = parts[1].slice(1);
    if (comNum === "1") {
      return { pvSymbol: `A/C.1/${parts[2]}/PV.${parts[3]}` };
    }
    return {
      pvSymbol: `A/C.${comNum}/${parts[2]}/PV.${parts[3]}`,
      srSymbol: `A/C.${comNum}/${parts[2]}/SR.${parts[3]}`,
    };
  }

  // ga/NN/NN → A/NN/PV.NN
  if (
    parts[0] === "ga" &&
    parts.length === 3 &&
    /^\d+$/.test(parts[1]) &&
    /^\d+$/.test(parts[2])
  ) {
    return { pvSymbol: `A/${parts[1]}/PV.${parts[2]}` };
  }

  // hrc/NN/NN → A/HRC/NN/SR.NN
  if (
    parts[0] === "hrc" &&
    parts.length === 3 &&
    /^\d+$/.test(parts[1]) &&
    /^\d+$/.test(parts[2])
  ) {
    return {
      pvSymbol: `A/HRC/${parts[1]}/PV.${parts[2]}`,
      srSymbol: `A/HRC/${parts[1]}/SR.${parts[2]}`,
    };
  }

  // ecosoc/YYYY/NN → E/YYYY/SR.NN
  if (
    parts[0] === "ecosoc" &&
    parts.length === 3 &&
    /^\d{4}$/.test(parts[1]) &&
    /^\d+$/.test(parts[2])
  ) {
    return {
      pvSymbol: `E/${parts[1]}/PV.${parts[2]}`,
      srSymbol: `E/${parts[1]}/SR.${parts[2]}`,
    };
  }

  return null;
}

/**
 * Generate a slug for a video record.
 *
 * Priority:
 * 1. From pv_symbol if present (human-readable meeting slug)
 * 2. Fallback to asset_id (the UN Web TV ID)
 *
 * Multi-part meetings append "-part-N" when part_number > 1.
 */
export function meetingSlugFromVideo(video: {
  pv_symbol: string | null;
  part_number: string | null;
  asset_id: string;
}): string {
  let slug: string;

  if (video.pv_symbol) {
    const symbolSlug = slugFromSymbol(video.pv_symbol);
    slug = symbolSlug ?? `meeting/${video.asset_id}`;
  } else {
    slug = `meeting/${video.asset_id}`;
  }

  // Append part suffix for multi-part meetings
  const partNum = video.part_number ? parseInt(video.part_number) : null;
  if (partNum && partNum > 1) {
    slug += `-part-${partNum}`;
  }

  return slug;
}
