import { getVideoMetadata } from "../../lib/un-api";

export interface ResolvedSession {
  symbol: string;
  method: "relatedDocuments" | "titleParsing";
}

/** Try to resolve a UN document symbol from a video's metadata */
export async function resolveSymbol(
  assetId: string,
): Promise<ResolvedSession | null> {
  const metadata = await getVideoMetadata(assetId);

  // Strategy 1: Check relatedDocuments for PV document links
  for (const doc of metadata.relatedDocuments) {
    const symbolMatch =
      doc.url.match(/[SA]\/(?:\d+\/)?PV\.\d+/) ||
      doc.title.match(/[SA]\/(?:\d+\/)?PV\.\d+/);
    if (symbolMatch) {
      return { symbol: symbolMatch[0], method: "relatedDocuments" };
    }
  }

  // Strategy 2: Parse symbol from title patterns
  // Fetch the video page to get the title
  try {
    const res = await fetch(`https://webtv.un.org/en/asset/${assetId}`);
    if (!res.ok) return null;
    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<div class="field__item">([^<]+)<\/div>/);
    const title = titleMatch?.[1] || "";

    // Extract category
    const categoryMatch = html.match(
      /<h6[^>]*class="text-primary"[^>]*>([^<]+)<\/h6>/,
    );
    const category = categoryMatch?.[1]?.trim() || "";

    // Security Council: "10103rd meeting" → S/PV.10103
    const scMeetingMatch = title.match(/(\d+)(?:st|nd|rd|th)\s+meeting/);
    if (scMeetingMatch && /security council/i.test(category)) {
      return { symbol: `S/PV.${scMeetingMatch[1]}`, method: "titleParsing" };
    }

    // General Assembly: "80th session, 7th plenary meeting" → A/80/PV.7
    const gaMatch = title.match(/(\d+)(?:st|nd|rd|th)\s+session/);
    const plenaryMatch = title.match(
      /(\d+)(?:st|nd|rd|th)\s+plenary\s+meeting/,
    );
    if (gaMatch && plenaryMatch && /general assembly/i.test(category)) {
      return {
        symbol: `A/${gaMatch[1]}/PV.${plenaryMatch[1]}`,
        method: "titleParsing",
      };
    }
  } catch {
    // Ignore fetch errors
  }

  return null;
}
