// Helper to get Kaltura audio download URL for a given ID
async function getKalturaDownloadUrl(kalturaId: string): Promise<string | null> {
  try {
    const apiResponse = await fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '1': {
          service: 'session',
          action: 'startWidgetSession',
          widgetId: '_2503451',
        },
        '2': {
          service: 'baseEntry',
          action: 'list',
          ks: '{1:result:ks}',
          filter: { redirectFromEntryId: kalturaId },
          responseProfile: {
            type: 1,
            fields: 'id',
          },
        },
        apiVersion: '3.3.0',
        format: 1,
        ks: '',
        clientTag: 'html5:v3.17.30',
        partnerId: 2503451,
      }),
    });

    if (!apiResponse.ok) return null;
    const apiData = await apiResponse.json();
    const entryId = apiData[1]?.objects?.[0]?.id;
    
    if (!entryId) return null;
    
    // Request English audio track (flavorParamId 100)
    return `https://cdnapisec.kaltura.com/p/2503451/sp/0/playManifest/entryId/${entryId}/format/download/protocol/https/flavorParamIds/100`;
  } catch {
    return null;
  }
}

function extractKalturaId(assetId: string): string | null {
  // Handle formats like k1a/k1a7f1gn3l → 1_a7f1gn3l
  const kMatch = assetId.match(/k1([a-z0-9])\/k1([a-z0-9]+)/i);
  if (kMatch) {
    return `1_${kMatch[2]}`;
  }
  
  // Handle format like k12/k1251fzd6n → 1_251fzd6n
  const k12Match = assetId.match(/k1(\d+)\/k1(.+)/i);
  if (k12Match) {
    return `1_${k12Match[2]}`;
  }
  
  return null;
}

export interface Video {
  id: string;
  url: string;
  title: string;
  cleanTitle: string;
  category: string;
  duration: string;
  date: string;
  scheduledTime: string | null;
  status: 'finished' | 'live' | 'scheduled';
  eventCode: string | null;
  eventType: string | null;
  body: string | null; // UN body (committee, council, assembly, etc.)
  sessionNumber: string | null;
  partNumber: number | null;
  hasTranscript: boolean;
}

function extractTextContent(html: string): string {
  const text = html.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
  // Decode HTML entities
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function calculateStatus(scheduledTime: string | null, duration: string): 'finished' | 'live' | 'scheduled' {
  if (!scheduledTime) return 'finished';
  
  // UN Web TV has broken timezone data in their ISO timestamps.
  // Their workaround: slice off timezone, treat as UTC, then convert to local time.
  // Source: https://webtv.un.org/sites/default/files/js/js_dA57f4jZ0sYpTuwvbXRb5Fns6GZvR5BtfWCN9UflmWI.js
  // Code: `const date_time=node.textContent.slice(0,19); let time=luxon.DateTime.fromISO(date_time,{'zone':'UTC'});`
  // Example: "2025-10-15T16:00:00-04:00" becomes "2025-10-15T16:00:00" treated as UTC
  // This is absolutely fucked up, but we need to match their display to avoid user confusion.
  const dateTimeWithoutTz = scheduledTime.slice(0, 19); // Remove timezone offset
  const startTime = new Date(dateTimeWithoutTz + 'Z'); // Append 'Z' to treat as UTC
  
  const now = new Date();
  
  // Parse duration (format: HH:MM:SS)
  const [hours, minutes, seconds] = duration.split(':').map(Number);
  const durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  const endTime = new Date(startTime.getTime() + durationMs);
  
  if (now < startTime) {
    return 'scheduled';
  } else if (now >= startTime && now <= endTime) {
    return 'live';
  } else {
    return 'finished';
  }
}

function decodeEventCode(code: string): string {
  const eventTypes: Record<string, string> = {
    'EM': 'Event - Ministerial',
    'GO': 'Global Occasion',
    'IM': 'Interactive Meeting',
    'WD': 'Water Dialogue',
    'SD': 'Strategic Dialogue',
    'ST': 'Strategic Session',
    'YM': 'Youth Meeting',
  };
  
  const prefix = code.substring(0, 2);
  return eventTypes[prefix] || `Event ${code}`;
}

function cleanTitle(title: string, metadata: {
  eventCode: string | null;
  body: string | null;
  sessionNumber: string | null;
  partNumber: number | null;
}): string {
  let cleaned = title;
  
  // Remove event code prefix only
  if (metadata.eventCode) {
    cleaned = cleaned.replace(new RegExp(`^${metadata.eventCode}\\s*-\\s*`), '');
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
  const committeeMatch = title.match(/(First|Second|Third|Fourth|Fifth|Sixth) Committee/);
  if (committeeMatch) {
    metadata.body = committeeMatch[0];
  }
  
  // If no committee found, check category for councils/assemblies
  if (!metadata.body && category) {
    const councilMatch = category.match(/General Assembly|Security Council|Economic and Social Council|Trusteeship Council/i);
    if (councilMatch) {
      metadata.body = councilMatch[0];
    }
  }

  // Extract session number (e.g., "9th plenary meeting", "80th session")
  const sessionMatch = title.match(/(\d+)(?:st|nd|rd|th) (?:plenary meeting|session)/);
  if (sessionMatch) metadata.sessionNumber = sessionMatch[0];

  // Extract part number
  const partMatch = title.match(/\(Part (\d+)\)/i);
  if (partMatch) metadata.partNumber = parseInt(partMatch[1]);

  return metadata;
}

async function fetchVideosForDate(date: string): Promise<Video[]> {
  const response = await fetch(`https://webtv.un.org/en/schedule/${date}`, {
    next: { revalidate: 300 }
  });
  
  const html = await response.text();
  const videos: Video[] = [];
  const seen = new Set<string>();
  
  // First, extract all timezone divs with their node IDs
  const timezoneMap = new Map<string, string>();
  const timezonePattern = /<div class="d-none mediaun-timezone" data-nid="(\d+)">([^<]+)<\/div>/g;
  for (const match of html.matchAll(timezonePattern)) {
    const [, nid, timestamp] = match;
    timezoneMap.set(nid, timestamp);
  }
  
  const videoBlockPattern = /<h6[^>]*>([^<]+)<\/h6>[\s\S]*?<h4[^>]*>[\s\S]*?href="\/en\/asset\/([^"]+)"[^>]*>[\s\S]*?<div class="field__item">([^<]+)<\/div>/g;
  
  for (const match of html.matchAll(videoBlockPattern)) {
    const [fullMatch, category, assetId, title] = match;
    
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    
    // Extract duration
    const durationPattern = new RegExp(`<span class="badge[^"]*">(\\d{2}:\\d{2}:\\d{2})<\\/span>[\\s\\S]{0,500}?href="\\/en\\/asset\\/${assetId.replace(/\//g, '\\/')}"`);
    const durationMatch = html.match(durationPattern);
    
    // Extract scheduled time by finding the closest preceding timezone div
    // Look backwards from the current match position
    const matchIndex = html.indexOf(fullMatch);
    const precedingHtml = html.substring(Math.max(0, matchIndex - 2000), matchIndex);
    
    // Find all data-nid occurrences and take the last one (closest to our match)
    const nidMatches = Array.from(precedingHtml.matchAll(/data-nid="(\d+)"/g));
    const lastNidMatch = nidMatches.length > 0 ? nidMatches[nidMatches.length - 1] : null;
    const scheduledTime = lastNidMatch && timezoneMap.has(lastNidMatch[1]) ? timezoneMap.get(lastNidMatch[1])! : null;
    
    // Extract metadata from title and category
    const rawTitle = extractTextContent(title);
    const categoryText = extractTextContent(category);
    const titleMetadata = extractMetadataFromTitle(rawTitle, categoryText);
    const titleCleaned = cleanTitle(rawTitle, titleMetadata);
    
    const duration = durationMatch?.[1] || '00:00:00';
    const status = calculateStatus(scheduledTime, duration);
    
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

export async function getScheduleVideos(days: number = 7): Promise<Video[]> {
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
  const allVideos = results.flat();
  
  // Remove duplicates by ID
  const uniqueVideos = Array.from(
    new Map(allVideos.map(v => [v.id, v])).values()
  );
  
  // Check AssemblyAI for transcripts
  try {
    // Fetch AssemblyAI transcript list
    const listResponse = await fetch('https://api.assemblyai.com/v2/transcript?limit=100', {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const transcribedUrls = new Set(
        listData.transcripts
          ?.filter((t: { status: string; audio_url: string }) => t.status === 'completed')
          .map((t: { status: string; audio_url: string }) => t.audio_url)
      );

      // Get download URLs for all videos in parallel
      await Promise.all(
        uniqueVideos.map(async (video) => {
          const kalturaId = extractKalturaId(video.id);
          if (kalturaId) {
            const downloadUrl = await getKalturaDownloadUrl(kalturaId);
            video.hasTranscript = downloadUrl ? transcribedUrls.has(downloadUrl) : false;
          } else {
            video.hasTranscript = false;
          }
        })
      );
    }
  } catch (err) {
    console.log('Failed to check AssemblyAI transcripts:', err);
  }
  
  // Sort by date descending (newest first)
  return uniqueVideos.sort((a, b) => b.date.localeCompare(a.date));
}

