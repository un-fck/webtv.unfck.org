/**
 * Conversion between UN document symbols and URL slugs.
 *
 *   S/PV.9748      ↔  sc/9748
 *   A/79/PV.21     ↔  ga/79/21
 *   A/ES-11/PV.23  ↔  ga/es11/23
 *   A/C.1/79/PV.7  ↔  ga/c1/79/7
 *   A/C.3/79/SR.5  ↔  ga/c3/79/5
 *   A/HRC/58/SR.59 ↔  hrc/58/59
 *   E/2024/SR.10   ↔  ecosoc/2024/10
 *
 * Multi-part recordings of the same meeting are addressed with a trailing
 * `/N` (e.g. `sc/9748/2`), where N is the chronological ordinal within the
 * symbol's cluster — see the `pv_part` column on `videos`. Part 1 has no
 * suffix.
 *
 * See docs/official-transcripts.md for which organs use PV vs SR.
 */

/** Derive a URL slug from a PV/SR document symbol. */
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

export interface ParsedCitationSlug {
  /** The PV symbol (verbatim record). Always returned. */
  pvSymbol: string;
  /**
   * The SR (summary record) symbol where applicable — GA committees 2–6,
   * HRC, ECOSOC use SR rather than PV in their official record series.
   */
  srSymbol?: string;
  /** Chronological ordinal within the symbol's cluster; defaults to 1. */
  pvPart: number;
}

/**
 * Parse a citation slug back into a document symbol + part ordinal.
 *
 * Accepts an optional trailing `/N` (N ≥ 2) to address parts after the first.
 * Returns null for non-citation slugs (e.g. `asset/...`).
 */
export function symbolFromSlug(slug: string): ParsedCitationSlug | null {
  const segs = slug.split("/");

  // Optional trailing "/N" — only consumed when the prefix's canonical
  // segment count is exceeded by exactly one. Without this guard, /sc/10175
  // would be misread as prefix=sc + part=10175 instead of meeting 10175.
  let pvPart = 1;
  const canonical = canonicalSegmentCount(segs[0], segs[1]);
  if (
    canonical !== null &&
    segs.length === canonical + 1 &&
    /^\d+$/.test(segs[segs.length - 1])
  ) {
    pvPart = parseInt(segs[segs.length - 1], 10);
    segs.pop();
  }

  // sc/NNNN → S/PV.NNNN
  if (segs[0] === "sc" && segs.length === 2 && /^\d+$/.test(segs[1])) {
    return { pvSymbol: `S/PV.${segs[1]}`, pvPart };
  }

  // ga/esNN/NN → A/ES-NN/PV.NN
  if (
    segs[0] === "ga" &&
    segs.length === 3 &&
    /^es\d+$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    const esNum = segs[1].slice(2);
    return { pvSymbol: `A/ES-${esNum}/PV.${segs[2]}`, pvPart };
  }

  // ga/cN/NN/NN → A/C.N/NN/PV.NN or SR.NN
  if (
    segs[0] === "ga" &&
    segs.length === 4 &&
    /^c[1-6]$/.test(segs[1]) &&
    /^\d+$/.test(segs[2]) &&
    /^\d+$/.test(segs[3])
  ) {
    const comNum = segs[1].slice(1);
    if (comNum === "1") {
      return { pvSymbol: `A/C.1/${segs[2]}/PV.${segs[3]}`, pvPart };
    }
    return {
      pvSymbol: `A/C.${comNum}/${segs[2]}/PV.${segs[3]}`,
      srSymbol: `A/C.${comNum}/${segs[2]}/SR.${segs[3]}`,
      pvPart,
    };
  }

  // ga/NN/NN → A/NN/PV.NN
  if (
    segs[0] === "ga" &&
    segs.length === 3 &&
    /^\d+$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    return { pvSymbol: `A/${segs[1]}/PV.${segs[2]}`, pvPart };
  }

  // hrc/NN/NN → A/HRC/NN/SR.NN
  if (
    segs[0] === "hrc" &&
    segs.length === 3 &&
    /^\d+$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    return {
      pvSymbol: `A/HRC/${segs[1]}/PV.${segs[2]}`,
      srSymbol: `A/HRC/${segs[1]}/SR.${segs[2]}`,
      pvPart,
    };
  }

  // ecosoc/YYYY/NN → E/YYYY/SR.NN
  if (
    segs[0] === "ecosoc" &&
    segs.length === 3 &&
    /^\d{4}$/.test(segs[1]) &&
    /^\d+$/.test(segs[2])
  ) {
    return {
      pvSymbol: `E/${segs[1]}/PV.${segs[2]}`,
      srSymbol: `E/${segs[1]}/SR.${segs[2]}`,
      pvPart,
    };
  }

  return null;
}

/** Number of segments a citation slug of a given prefix has without `/N`. */
function canonicalSegmentCount(
  prefix: string,
  second: string | undefined,
): number | null {
  if (prefix === "sc") return 2;
  if (prefix === "ga" && second && /^es\d+$/.test(second)) return 3;
  if (prefix === "ga" && second && /^c[1-6]$/.test(second)) return 4;
  if (prefix === "ga") return 3;
  if (prefix === "hrc") return 3;
  if (prefix === "ecosoc") return 3;
  return null;
}
