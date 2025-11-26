import { NextRequest, NextResponse } from 'next/server';
import { getVideoById, getVideoMetadata } from '@/lib/un-api';
import { getTranscript } from '@/lib/turso';
import { getSpeakerMapping, SpeakerInfo, formatSpeakerInfo } from '@/lib/speakers';
import { getCountryName } from '@/lib/country-lookup';
import { resolveEntryId } from '@/lib/kaltura-helpers';
import { extractKalturaId } from '@/lib/kaltura';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const decodedId = decodeURIComponent(id);
    
    // Get video info - search backwards from today (fast for recent videos)
    const video = await getVideoById(decodedId);

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Extract Kaltura ID for response
    const kalturaId = extractKalturaId(video.id);

    // Get video metadata
    const metadata = await getVideoMetadata(video.id);

    // Resolve entry ID (checks cache first, then Kaltura API)
    const entryId = await resolveEntryId(video.id);
    
    if (!entryId) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        error: 'Unable to resolve video entry ID'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    // Check Turso for transcript
    const transcript = await getTranscript(entryId);
    
    if (!transcript) {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: null,
        message: 'No transcript available'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    if (transcript.status !== 'completed') {
      const response = NextResponse.json({
        video,
        metadata,
        transcript: {
          status: transcript.status,
          transcriptId: transcript.transcript_id
        },
        message: 'Transcript not completed'
      });
      response.headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    }

    // Get speaker mappings
    const speakerMappings = await getSpeakerMapping(transcript.transcript_id) || {};

    // Load country names for affiliations
    const countryNames = new Map<string, string>();
    const iso3Codes = new Set<string>();
    Object.values(speakerMappings).forEach((info: SpeakerInfo) => {
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

    const topics = transcript.content.topics || {};
    const un80Topics = transcript.content.un80_topics || {};

    const transcriptData = transcript.content.statements.map((stmt, index: number) => {
      const info = speakerMappings[index.toString()];
      
      return {
        statement_number: index + 1,
        paragraphs: stmt.paragraphs.map(para => ({
          sentences: para.sentences.map(sent => ({
            text: sent.text,
            start: sent.start / 1000,
            end: sent.end / 1000,
            topics: sent.topic_keys?.map(key => ({
              key,
              label: topics[key]?.label || key,
              description: topics[key]?.description || '',
            })) || [],
            un80_topics: sent.un80_topic_keys?.map(key => ({
              key,
              label: un80Topics[key]?.label || un80Topics[key]?.key || key,
              description: un80Topics[key]?.description || '',
            })) || [],
          })),
        })),
        speaker: formatSpeakerInfo(info, countryNames),
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
        transcript_id: transcript.transcript_id,
        language: transcript.language_code,
        data: transcriptData,
        topics: Object.values(topics).map(t => ({
          key: t.key,
          label: t.label,
          description: t.description,
        })),
        un80_topics: Object.values(un80Topics).map(t => ({
          key: t.key,
          label: t.label,
          description: t.description,
        })),
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

