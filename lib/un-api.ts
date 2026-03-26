import { getVideoByAssetId, saveVideo, type VideoRecord } from "./turso";
import { resolveEntryId } from "./kaltura-helpers";

export interface Video {
  id: string;
  url: string;
  title: string;
  cleanTitle: string;
  category: string;
  duration: string;
  date: string;
  scheduledTime: string | null;
  status: "finished" | "live" | "scheduled";
  eventCode: string | null;
  eventType: string | null;
  body: string | null; // UN body (committee, council, assembly, etc.)
  sessionNumber: string | null;
  partNumber: number | null;
  hasTranscript: boolean;
}

function extractTextContent(html: string): string {
  const text = html
    .replace(/<[^>]*>/g, "")
    .trim()
    .replace(/\s+/g, " ");
  // Decode HTML entities
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function videoToRecord(
  video: Video,
): Omit<VideoRecord, "created_at" | "updated_at"> {
  // Parse duration: can be "HH:MM:SS" or "XX min" format, convert to seconds
  let durationSeconds: number | null = null;
  if (video.duration) {
    if (video.duration.includes(":")) {
      // HH:MM:SS format
      const [hours, minutes, seconds] = video.duration.split(":").map(Number);
      durationSeconds = hours * 3600 + minutes * 60 + seconds;
    } else {
      // "XX min" format - extract number and convert to seconds
      const minutes = parseInt(video.duration.replace(/[^\d]/g, ""));
      durationSeconds = minutes * 60;
    }
  }

  return {
    asset_id: video.id,
    entry_id: null, // Will be resolved later
    title: video.title,
    clean_title: video.cleanTitle,
    date: video.date,
    scheduled_time: video.scheduledTime,
    duration: durationSeconds,
    url: video.url,
    body: video.body,
    category: video.category,
    event_code: video.eventCode,
    event_type: video.eventType,
    session_number: video.sessionNumber,
    part_number: video.partNumber !== null ? String(video.partNumber) : null,
    last_seen: new Date().toISOString().split("T")[0],
  };
}

function recordToVideo(record: VideoRecord, hasTranscript: boolean): Video {
  // Convert duration from seconds to HH:MM:SS for status calculation
  const durationSeconds = record.duration || 0;
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  const durationHMS = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Calculate status based on scheduled time and duration
  const status = calculateStatus(record.scheduled_time, durationHMS);

  return {
    id: record.asset_id,
    url: record.url,
    title: record.title,
    cleanTitle: record.clean_title || record.title,
    category: record.category || "",
    duration: durationHMS, // Already formatted as HH:MM:SS
    date: record.date,
    scheduledTime: record.scheduled_time,
    status,
    eventCode: record.event_code,
    eventType: record.event_type,
    body: record.body,
    sessionNumber: record.session_number,
    partNumber:
      record.part_number !== null ? parseInt(record.part_number) : null,
    hasTranscript,
  };
}

function calculateStatus(
  scheduledTime: string | null,
  duration: string,
): "finished" | "live" | "scheduled" {
  if (!scheduledTime) return "finished";

  // UN Web TV has broken timezone data in their ISO timestamps.
  // Their workaround: slice off timezone, treat as UTC, then convert to local time.
  // Source: https://webtv.un.org/sites/default/files/js/js_dA57f4jZ0sYpTuwvbXRb5Fns6GZvR5BtfWCN9UflmWI.js
  // Code: `const date_time=node.textContent.slice(0,19); let time=luxon.DateTime.fromISO(date_time,{'zone':'UTC'});`
  // Example: "2025-10-15T16:00:00-04:00" becomes "2025-10-15T16:00:00" treated as UTC
  // This is absolutely fucked up, but we need to match their display to avoid user confusion.
  const dateTimeWithoutTz = scheduledTime.slice(0, 19); // Remove timezone offset
  const startTime = new Date(dateTimeWithoutTz + "Z"); // Append 'Z' to treat as UTC

  const now = new Date();

  // Parse duration (format: HH:MM:SS)
  const [hours, minutes, seconds] = duration.split(":").map(Number);
  const durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  const endTime = new Date(startTime.getTime() + durationMs);

  if (now < startTime) {
    return "scheduled";
  } else if (now >= startTime && now <= endTime) {
    return "live";
  } else {
    return "finished";
  }
}

function decodeEventCode(code: string): string {
  const eventTypes: Record<string, string> = {
    EM: "Event - Ministerial",
    GO: "Global Occasion",
    IM: "Interactive Meeting",
    WD: "Water Dialogue",
    SD: "Strategic Dialogue",
    ST: "Strategic Session",
    YM: "Youth Meeting",
  };

  const prefix = code.substring(0, 2);
  return eventTypes[prefix] || `Event ${code}`;
}

function cleanTitle(
  title: string,
  metadata: {
    eventCode: string | null;
    body: string | null;
    sessionNumber: string | null;
    partNumber: number | null;
  },
): string {
  let cleaned = title;

  // Remove event code prefix only
  if (metadata.eventCode) {
    cleaned = cleaned.replace(
      new RegExp(`^${metadata.eventCode}\\s*-\\s*`),
      "",
    );
  }

  return cleaned.trim();
}

function extractMetadataFromTitle(title: string, category?: string) {
  const metadata = {
    eventCode: null as string | null,
    eventType: null as string | null,
    body: null as string | null,
    sessionNumber: null as string | null,
    partNumber: null as number | null,
  };

  // Extract event code (e.g., "EM07", "GO19")
  const eventCodeMatch = title.match(/^([A-Z]{2}\d{2})\s*-\s*/);
  if (eventCodeMatch) {
    metadata.eventCode = eventCodeMatch[1];
    metadata.eventType = decodeEventCode(eventCodeMatch[1]);
  }

  // Extract committee (First, Second, Third, Fourth, Fifth, Sixth)
  const committeeMatch = title.match(
    /(First|Second|Third|Fourth|Fifth|Sixth) Committee/,
  );
  if (committeeMatch) {
    metadata.body = committeeMatch[0];
  }

  // If no committee found, check category for councils/assemblies
  if (!metadata.body && category) {
    const councilMatch = category.match(
      /General Assembly|Security Council|Economic and Social Council|Trusteeship Council/i,
    );
    if (councilMatch) {
      metadata.body = councilMatch[0];
    }
  }

  // Extract session number (e.g., "9th plenary meeting", "80th session")
  const sessionMatch = title.match(
    /(\d+)(?:st|nd|rd|th) (?:plenary meeting|session)/,
  );
  if (sessionMatch) metadata.sessionNumber = sessionMatch[0];

  // Extract part number
  const partMatch = title.match(/\(Part (\d+)\)/i);
  if (partMatch) metadata.partNumber = parseInt(partMatch[1]);

  return metadata;
}

async function fetchVideosForDate(date: string): Promise<Video[]> {
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86400000));
  const revalidate = date >= today ? 300 : date === yesterday ? 3600 : 86400;

  const response = await fetch(`https://webtv.un.org/en/schedule/${date}`, {
    next: { revalidate },
  });

  const html = await response.text();
  const videos: Video[] = [];
  const seen = new Set<string>();

  // First, extract all timezone divs with their node IDs
  const timezoneMap = new Map<string, string>();
  const timezonePattern =
    /<div class="d-none mediaun-timezone" data-nid="(\d+)">([^<]+)<\/div>/g;
  for (const match of html.matchAll(timezonePattern)) {
    const [, nid, timestamp] = match;
    timezoneMap.set(nid, timestamp);
  }

  const videoBlockPattern =
    /<h6[^>]*class="text-primary"[^>]*>([^<]+)<\/h6>[\s\S]*?<h4[^>]*>[\s\S]*?href="\/en\/asset\/([^"]+)"[^>]*>[\s\S]*?<div class="field__item">([^<]+)<\/div>/g;

  for (const match of html.matchAll(videoBlockPattern)) {
    const [, category, assetId, title] = match;

    if (seen.has(assetId)) continue;
    seen.add(assetId);

    // Check for live badge - this is more reliable than calculated status
    const matchIndex = match.index!;
    const contextWindow = html.substring(
      Math.max(0, matchIndex - 500),
      matchIndex + 1000,
    );
    const isLiveBadge = /<span class="badge[^"]*"[^>]*>Live<\/span>/i.test(
      contextWindow,
    );

    // Extract duration
    const durationPattern = new RegExp(
      `<span class="badge[^"]*">(\\d{2}:\\d{2}:\\d{2})<\\/span>[\\s\\S]{0,500}?href="\\/en\\/asset\\/${assetId.replace(/\//g, "\\/")}"`,
    );
    const durationMatch = html.match(durationPattern);

    // Extract scheduled time by finding the closest preceding timezone div
    const precedingHtml = html.substring(
      Math.max(0, matchIndex - 3000),
      matchIndex,
    );

    // Find all data-nid occurrences and take the last one (closest to our match)
    const nidMatches = Array.from(precedingHtml.matchAll(/data-nid="(\d+)"/g));
    const lastNidMatch =
      nidMatches.length > 0 ? nidMatches[nidMatches.length - 1] : null;
    const scheduledTime =
      lastNidMatch && timezoneMap.has(lastNidMatch[1])
        ? timezoneMap.get(lastNidMatch[1])!
        : null;

    // Extract metadata from title and category
    const rawTitle = extractTextContent(title);
    const categoryText = extractTextContent(category);
    const titleMetadata = extractMetadataFromTitle(rawTitle, categoryText);
    const titleCleaned = cleanTitle(rawTitle, titleMetadata);

    const duration = durationMatch?.[1] || "00:00:00";
    const status = isLiveBadge
      ? "live"
      : calculateStatus(scheduledTime, duration);

    videos.push({
      id: assetId,
      url: `https://webtv.un.org/en/asset/${assetId}`,
      title: rawTitle,
      cleanTitle: titleCleaned,
      category: categoryText,
      duration,
      date,
      scheduledTime,
      status,
      ...titleMetadata,
      hasTranscript: false, // Will be updated later
    });
  }

  return videos;
}

export async function getVideoById(
  videoId: string,
  maxDaysBack: number = 30,
): Promise<Video | null> {
  // Step 1: Check Turso cache first (instant lookup)
  try {
    const cached = await getVideoByAssetId(videoId);
    if (cached) {
      // Check if it has a transcript
      const { getAllTranscriptedEntries } = await import("./turso");
      const transcriptedEntries = await getAllTranscriptedEntries();
      const hasTranscript = cached.entry_id
        ? transcriptedEntries.includes(cached.entry_id)
        : false;

      return recordToVideo(cached, hasTranscript);
    }
  } catch (error) {
    console.warn("Turso cache lookup failed:", error);
    // Continue to fallback
  }

  // Step 2: Fallback - search backwards from today
  // Most videos will be recent, so this is much faster than loading all 365 days
  const today = new Date();

  for (let i = -1; i < maxDaysBack; i++) {
    // Start with tomorrow (-1)
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = formatDate(date);

    const videos = await fetchVideosForDate(dateStr);
    const video = videos.find((v) => v.id === videoId);

    if (video) {
      // Save to cache for next time
      try {
        await saveVideo(videoToRecord(video));
      } catch (error) {
        console.warn("Failed to cache video:", error);
      }
      return video;
    }
  }

  return null;
}

export async function getScheduleVideos(
  days: number = 7,
  useCacheFirst: boolean = true,
): Promise<Video[]> {
  let allVideos: Video[] = [];
  const recentDaysToAlwaysScrape = 3; // Always scrape last 3 days for new videos

  // Step 1: Try Turso cache if enabled (but always scrape recent days)
  if (useCacheFirst) {
    try {
      const { getRecentVideos } = await import("./turso");
      const cachedRecords = await getRecentVideos(days);

      if (cachedRecords.length > 0) {
        console.log(`Loaded ${cachedRecords.length} videos from cache`);
        const { getAllTranscriptedEntries } = await import("./turso");
        const transcriptedEntries = await getAllTranscriptedEntries();
        const transcriptedSet = new Set(transcriptedEntries);

        allVideos = cachedRecords.map((record) =>
          recordToVideo(
            record,
            record.entry_id ? transcriptedSet.has(record.entry_id) : false,
          ),
        );

        // Always scrape recent days to catch new videos
        const recentDates: string[] = [];
        const today = new Date();

        // Fetch tomorrow's videos
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        recentDates.push(formatDate(tomorrow));

        // Fetch last N days
        for (let i = 0; i < recentDaysToAlwaysScrape; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          recentDates.push(formatDate(date));
        }

        console.log(
          `Scraping ${recentDates.length} recent days for new videos`,
        );
        const recentResults = await Promise.all(
          recentDates.map(fetchVideosForDate),
        );
        const recentVideos = recentResults.flat();

        // Merge with cached videos (recent videos take precedence)
        const videoMap = new Map(allVideos.map((v) => [v.id, v]));
        for (const video of recentVideos) {
          videoMap.set(video.id, video);
        }
        allVideos = Array.from(videoMap.values());

        // Resolve entry IDs and save new videos to cache
        const entryIdResolutions = await Promise.all(
          recentVideos.map(async (video) => {
            const entryId = await resolveEntryId(video.id);

            if (entryId) {
              const record = videoToRecord(video);
              record.entry_id = entryId;
              saveVideo(record).catch((err) =>
                console.warn("Failed to cache video:", video.id, err),
              );
            } else {
              saveVideo(videoToRecord(video)).catch((err) =>
                console.warn("Failed to cache video:", video.id, err),
              );
            }

            return { videoId: video.id, entryId };
          }),
        );

        // Update hasTranscript for all videos
        const entryIdMap = new Map(
          entryIdResolutions.map((r) => [r.videoId, r.entryId]),
        );
        allVideos.forEach((video) => {
          const entryId = entryIdMap.get(video.id);
          if (entryId) {
            video.hasTranscript = transcriptedSet.has(entryId);
          }
        });

        // Sort by date descending
        return allVideos.sort((a, b) => b.date.localeCompare(a.date));
      }
    } catch (error) {
      console.warn("Cache lookup failed, falling back to scraping:", error);
    }
  }

  // Step 2: Fallback - scrape from UN Web TV
  const dates: string[] = [];
  const today = new Date();

  // Fetch tomorrow's videos
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  dates.push(formatDate(tomorrow));

  // Fetch videos from the past N days
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(formatDate(date));
  }

  // Fetch all dates in parallel
  const results = await Promise.all(dates.map(fetchVideosForDate));
  allVideos = results.flat();

  // Remove duplicates by ID
  const uniqueVideos = Array.from(
    new Map(allVideos.map((v) => [v.id, v])).values(),
  );

  // Resolve entry IDs and save to cache (in parallel, but use cache first)
  // This will use cached entry IDs when available, only calling Kaltura API for new videos
  const entryIdResolutions = await Promise.all(
    uniqueVideos.map(async (video) => {
      const entryId = await resolveEntryId(video.id);

      // Save video with resolved entry_id to cache (background)
      if (entryId) {
        const record = videoToRecord(video);
        record.entry_id = entryId;
        saveVideo(record).catch((err) =>
          console.warn("Failed to cache video:", video.id, err),
        );
      } else {
        // Save without entry_id
        saveVideo(videoToRecord(video)).catch((err) =>
          console.warn("Failed to cache video:", video.id, err),
        );
      }

      return { videoId: video.id, entryId };
    }),
  );

  // Check which videos have transcripts
  try {
    const { getAllTranscriptedEntries } = await import("@/lib/turso");
    const transcriptedEntryIds = await getAllTranscriptedEntries();
    const transcriptedSet = new Set(transcriptedEntryIds);

    // Map entry IDs to videos
    const entryIdMap = new Map(
      entryIdResolutions.map((r) => [r.videoId, r.entryId]),
    );

    uniqueVideos.forEach((video) => {
      const entryId = entryIdMap.get(video.id);
      video.hasTranscript = entryId ? transcriptedSet.has(entryId) : false;
    });
  } catch (err) {
    console.log("Failed to check transcripts from Turso:", err);
    // Set all to false on error
    uniqueVideos.forEach((video) => {
      video.hasTranscript = false;
    });
  }

  // Sort by date descending (newest first)
  return uniqueVideos.sort((a, b) => b.date.localeCompare(a.date));
}

export interface VideoMetadata {
  summary: string | null;
  description: string | null;
  categories: string[];
  relatedDocuments: Array<{ title: string; url: string }>;
  geographicSubject: string[];
  subjectTopical: string[];
  corporateName: string[];
  speakerAffiliation: string[];
}

export async function getVideoMetadata(
  assetId: string,
): Promise<VideoMetadata> {
  try {
    const response = await fetch(`https://webtv.un.org/en/asset/${assetId}`, {
      next: { revalidate: 3600 }, // 1 hour cache
    });

    if (!response.ok) {
      return createEmptyMetadata();
    }

    const html = await response.text();

    return {
      summary: extractSummary(html),
      description: extractDescription(html),
      categories: extractCategories(html),
      relatedDocuments: extractRelatedDocuments(html),
      geographicSubject: extractFieldItems(html, "Geographic Subject"),
      subjectTopical: extractFieldItems(html, "Subject Topical"),
      corporateName: extractFieldItems(html, "Corporate Name"),
      speakerAffiliation: extractFieldItems(html, "Speaker Affiliation"),
    };
  } catch {
    return createEmptyMetadata();
  }
}

function createEmptyMetadata(): VideoMetadata {
  return {
    summary: null,
    description: null,
    categories: [],
    relatedDocuments: [],
    geographicSubject: [],
    subjectTopical: [],
    corporateName: [],
    speakerAffiliation: [],
  };
}

function extractSummary(html: string): string | null {
  const match = html.match(
    /<div class="h4 field__label">Summary<\/div>[\s\S]*?<div class="smt-content"[^>]*>([\s\S]*?)<\/div>/,
  );
  if (!match) return null;
  return extractTextContent(match[1]);
}

function extractDescription(html: string): string | null {
  const match = html.match(
    /<div class="h4 field__label">Description<\/div>[\s\S]*?<div class="smt-content"[^>]*>([\s\S]*?)<\/div>/,
  );
  if (!match) return null;
  return extractTextContent(match[1]);
}

function extractCategories(html: string): string[] {
  const match = html.match(
    /<div class="small text-muted field__label">Categories<\/div>[\s\S]*?<div class="field__item">([\s\S]*?)<\/div>/,
  );
  if (!match) return [];

  // Extract just the link text, not the "/" separators
  const links = [...match[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
  return links.map(([, text]) => extractTextContent(text));
}

function extractRelatedDocuments(
  html: string,
): Array<{ title: string; url: string }> {
  const match = html.match(
    /<div class="h4 field__label">Related Sites and Documents<\/div>([\s\S]*?)(?=<div\s+class="(?:block|pb-3|border-|col-)|$)/,
  );
  if (!match) return [];

  const links = [...match[1].matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)];
  return links.map(([, url, title]) => ({
    title: extractTextContent(title),
    url,
  }));
}

function extractFieldItems(html: string, fieldLabel: string): string[] {
  const pattern = new RegExp(
    `<div class="small text-muted field__label">${fieldLabel}<\\/div>([\\s\\S]*?)(?=<\\/div>\\s*<\\/div>\\s*<div class="(?:pb-3|block)|$)`,
    "i",
  );
  const match = html.match(pattern);
  if (!match) return [];

  // Extract text from <a> tags
  const links = [...match[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
  return links.map(([, text]) => extractTextContent(text));
}
