import { NextRequest, NextResponse } from 'next/server';
import { getScheduleVideos, getVideoMetadata } from '@/lib/un-api';
import { getTranscriptId } from '@/lib/transcript-cache';
import { getSpeakerMapping } from '@/lib/speakers';
import { getCountryName } from '@/lib/country-lookup';

function extractKalturaId(assetId: string): string | null {
  let match = assetId.match(/\(([^)]+)\)/);
  if (match) return match[1];
  
  match = assetId.match(/\/id\/([^/]+)/);
  if (match) return match[1];
  
  if (assetId.match(/^1_[a-z0-9]+$/i)) {
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
  
  return null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const decodedId = decodeURIComponent(id);
    
    // Get video info
    const videos = await getScheduleVideos(90);
    const video = videos.find(v => v.id === decodedId);

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const kalturaId = extractKalturaId(video.id);
    
    if (!kalturaId) {
      return NextResponse.json({ error: 'Unable to extract video ID' }, { status: 400 });
    }

    // Get video metadata
    const metadata = await getVideoMetadata(video.id);

    // Get Kaltura entry ID for transcript lookup
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
          responseProfile: { type: 1, fields: 'id' },
        },
        apiVersion: '3.3.0',
        format: 1,
        ks: '',
        clientTag: 'html5:v3.17.30',
        partnerId: 2503451,
      }),
    });

    if (!apiResponse.ok) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        error: 'Failed to query Kaltura API'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    const apiData = await apiResponse.json();
    const entryId = apiData[1]?.objects?.[0]?.id;
    
    if (!entryId) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        error: 'No entry found'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    // Check for cached transcript
    const cachedTranscriptId = await getTranscriptId(entryId);
    
    if (!cachedTranscriptId) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        message: 'No transcript available'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    // Fetch transcript from AssemblyAI
    const detailResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${cachedTranscriptId}`, {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
    });
    
    if (!detailResponse.ok) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        error: 'Failed to fetch transcript'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    const detail = await detailResponse.json();
    
    if (detail.status !== 'completed') {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: {
          status: detail.status,
          transcriptId: cachedTranscriptId
        },
        message: 'Transcript not completed'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    // Fetch paragraphs
    const paragraphsResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${cachedTranscriptId}/paragraphs`, {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
    });
    
    const paragraphsData = paragraphsResponse.ok ? await paragraphsResponse.json() : null;
    const paragraphs = paragraphsData?.paragraphs || [];

    // Get speaker mappings
    const speakerMappings = await getSpeakerMapping(cachedTranscriptId) || {};

    // Load country names for affiliations
    const countryNames = new Map<string, string>();
    const iso3Codes = new Set<string>();
    Object.values(speakerMappings).forEach((info: any) => {
      if (info.affiliation && info.affiliation.length === 3) {
        iso3Codes.add(info.affiliation);
      }
    });
    
    for (const code of iso3Codes) {
      const name = await getCountryName(code);
      if (name) {
        countryNames.set(code, name);
      }
    }

    // Build transcript with speaker info
    const transcriptParagraphs = paragraphs.map((para: any, index: number) => {
      const info = speakerMappings[index.toString()];
      
      return {
        paragraph_number: index + 1,
        text: para.text,
        start: para.start / 1000, // Convert to seconds
        end: para.end / 1000,
        speaker: {
          name: info?.name || null,
          affiliation: info?.affiliation || null,
          affiliation_full: info?.affiliation ? (countryNames.get(info.affiliation) || info.affiliation) : null,
          group: info?.group || null,
          function: info?.function || null,
        },
        words: para.words.map((word: any) => ({
          text: word.text,
          start: word.start / 1000,
          end: word.end / 1000,
          confidence: word.confidence,
        })),
      };
    });

    const response = NextResponse.json({
      video: {
        id: video.id,
        kaltura_id: kalturaId,
        title: video.title,
        clean_title: video.cleanTitle,
        url: video.url,
        date: video.date,
        scheduled_time: video.scheduledTime,
        status: video.status,
        duration: video.duration,
        category: video.category,
        body: video.body,
        event_code: video.eventCode,
        event_type: video.eventType,
        session_number: video.sessionNumber,
        part_number: video.partNumber,
      },
      metadata: {
        summary: metadata.summary,
        description: metadata.description,
        categories: metadata.categories,
        geographic_subject: metadata.geographicSubject,
        subject_topical: metadata.subjectTopical,
        corporate_name: metadata.corporateName,
        speaker_affiliation: metadata.speakerAffiliation,
        related_documents: metadata.relatedDocuments,
      },
      transcript: {
        transcript_id: cachedTranscriptId,
        language: detail.language_code,
        paragraphs: transcriptParagraphs,
      },
    });
    
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    return response;
    
  } catch (error) {
    console.error('JSON API error:', error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    return response;
  }
}

